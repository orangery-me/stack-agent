import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AiChatSessionService } from '../../ai-chat/ai-chat-session.service';
import { McpClientService } from '../../mcp-client/mcp-client.service';
import { AiProviderMessage, ToolDefinition } from '../ai-providers/ai-provider.interface';
import { GENERAL_AGENT_SYSTEM_PROMPT } from '../prompts/agent-chat.prompts';
import { AskAgentInput, AskAgentStreamChunk } from '../shared/agent.types';
import { createAsyncStream } from '../utils/agent-stream.utils';
import { parseJsonObject } from '../utils/agent-json.utils';
import { AgentProviderService } from './agent-provider.service';
import { AgentToolLoopService } from './agent-tool-loop.service';

interface StructuredAssistantResponse {
  answer: string;
  suggested_actions: Array<Record<string, unknown>>;
  actions: Array<Record<string, unknown>>;
}

const COORDINATION_TOOLS: ToolDefinition[] = [
  {
    name: 'query_tasks',
    requireConfirmation: false,
    description: 'Query tasks in a channel for workload/progress analysis. Returns task data with assignee information.',
    parameters: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        channel_id: { type: 'string', description: 'Channel ID to analyze' },
        status: { type: 'string', enum: ['todo', 'in_progress', 'done'], description: 'Optional task status filter' },
        is_overdue: { type: 'boolean', description: 'Only return non-done tasks past due date' },
      },
      required: ['workspace_id', 'channel_id'],
    },
  },
  {
    name: 'search_workspace_members',
    requireConfirmation: false,
    description: 'Search workspace members by name/email for mention resolution.',
    parameters: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        query: { type: 'string', description: 'Search query by name/email' },
        channel_id: { type: 'string', description: 'Optional channel ID to only search channel members' },
        limit: { type: 'number', description: 'Result limit' },
      },
      required: ['workspace_id', 'query'],
    },
  },
  {
    name: 'send_channel_message',
    requireConfirmation: true,
    description:
      'Send a Markdown text message to a channel as the acting user. Requires user confirmation. Use mentions only after resolving users with search_workspace_members.',
    parameters: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        channel_id: { type: 'string', description: 'Channel ID' },
        message: { type: 'string', description: 'Message content to send to channel' },
        mentions: {
          type: 'array',
          description:
            'Resolved users to mention. Use only values returned by search_workspace_members. Message must contain matching @name or @email tokens.',
          items: { type: 'object' },
        },
      },
      required: ['workspace_id', 'channel_id', 'message'],
    },
  },
];

@Injectable()
export class AgentCoordinationService {
  constructor(
    private readonly providerService: AgentProviderService,
    private readonly aiChatSessionService: AiChatSessionService,
    private readonly mcpClient: McpClientService,
    private readonly toolLoop: AgentToolLoopService
  ) {}

  shouldHandle(input: AskAgentInput): boolean {
    if (!input.workspaceId || !input.channelId || !input.userId) return false;
    const text = input.message.toLowerCase();
    return [
      'task',
      'todo',
      'to-do',
      'tiến độ',
      'tien do',
      'tổng hợp',
      'tong hop',
      'workload',
      'due',
      'deadline',
      'trễ',
      'tre',
      'overdue',
      'nhắc',
      'nhac',
      'remind',
      'thông báo',
      'thong bao',
      'notify',
    ].some((keyword) => text.includes(keyword));
  }

  async ask(input: AskAgentInput): Promise<string> {
    const result = await this.buildStructuredResponse(input);
    return this.stringifyResponse(result);
  }

  stream(input: AskAgentInput): Observable<AskAgentStreamChunk> {
    return createAsyncStream(async (subscriber) => {
      const result = await this.buildStructuredResponse(input);

      subscriber.next(this.createEventChunk('assistant', { content: result.answer }));
      if (result.actions.length > 0) {
        subscriber.next(this.createEventChunk('actions', { actions: result.actions }));
      }
      subscriber.next({ chunk: '', done: true });
      subscriber.complete();
    });
  }

  private async buildStructuredResponse(input: AskAgentInput): Promise<StructuredAssistantResponse> {
    if (!input.workspaceId || !input.channelId || !input.userId) {
      return {
        answer: 'There is not enough workspace/channel context to handle this request.',
        suggested_actions: [],
        actions: [],
      };
    }

    const { provider } = this.providerService.resolveProvider(input.provider);
    const messages = await this.buildMessages(input);

    messages.push({
      role: 'user',
      content:
        `Use query_tasks when task data is needed. The backend will execute read-only query tools automatically.\n` +
        `If the user asks to notify/remind/send a channel message, call send_channel_message; it will be returned as a reviewable action for user confirmation.\n` +
        `If the message should tag a user, call search_workspace_members first and include exact mentions from the tool result. Do not invent user IDs.\n` +
        `send_channel_message.message supports Markdown. Use readable Markdown formatting and include matching @name or @email tokens for mentions.\n` +
        `Always return final visible output as JSON with fields answer, suggested_actions, and actions. Current timestamp: ${new Date().toISOString()}.`,
    });

    let result: { content?: string; actions: Array<Record<string, any>> };
    if (provider.chatWithTools) {
      result = await this.toolLoop.run({
        provider,
        messages,
        tools: COORDINATION_TOOLS,
        model: input.model,
        temperature: 0.2,
        responseFormat: 'json_object',
        normalizeToolArguments: (_name, args) => this.normalizeToolArguments(args, input),
        executeTool: (name, args) => this.executeCoordinationTool(name, args),
      });
    } else {
      const chatResult = await provider.chat(messages, {
        model: input.model,
        temperature: 0.2,
        maxToken: 2048,
        responseFormat: 'json_object',
      });
      const lastMessage = chatResult[chatResult.length - 1];
      result = {
        content: lastMessage?.role === 'assistant' || lastMessage?.role === 'model' ? lastMessage.content : '',
        actions: [],
      };
    }

    const normalized = this.normalizeStructuredResponse(result.content ?? '');
    if (result.actions.length > 0) {
      normalized.actions = result.actions.map((action) => ({
        ...action,
        label: this.defaultActionLabel(action.name),
      }));
    }
    return normalized;
  }

  private async buildMessages(input: AskAgentInput): Promise<AiProviderMessage[]> {
    const systemMessage: AiProviderMessage = {
      role: 'system',
      content: GENERAL_AGENT_SYSTEM_PROMPT,
    };

    if (!input.sessionId) {
      return [systemMessage, { role: 'user', content: input.message }];
    }

    const messages = (await this.aiChatSessionService.buildContextMessages(input.sessionId)).filter(
      (message) => message.role !== 'system'
    );
    const lastMessage = messages[messages.length - 1];

    if (!lastMessage || lastMessage.content !== input.message) {
      messages.push({ role: 'user', content: input.message });
    }

    return [systemMessage, ...messages];
  }

  private normalizeStructuredResponse(content: string): StructuredAssistantResponse {
    const parsed = parseJsonObject(content);
    if (!parsed) {
      return { answer: content || 'No response from AI.', suggested_actions: [], actions: [] };
    }

    const answer = String(parsed.answer ?? '').trim() || 'No response from AI.';
    const suggestedActions = this.normalizeSuggestedActions(parsed.suggested_actions);
    const actions = [
      ...this.normalizeReviewableActions(parsed.actions),
      ...this.convertSideEffectSuggestions(suggestedActions, answer),
    ];

    return {
      answer,
      suggested_actions: suggestedActions.filter((action) => action.tool_intent !== 'send_channel_message'),
      actions,
    };
  }

  private normalizeSuggestedActions(value: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(value)) return [];
    return value.filter((action): action is Record<string, unknown> => Boolean(action) && typeof action === 'object');
  }

  private normalizeReviewableActions(value: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(value)) return [];
    return value
      .filter((action): action is Record<string, unknown> => Boolean(action) && typeof action === 'object')
      .filter((action) => typeof action.name === 'string')
      .map((action, index) => ({
        id: typeof action.id === 'string' && action.id.trim() ? action.id : `coordination-${Date.now()}-${index}`,
        label: typeof action.label === 'string' ? action.label : this.defaultActionLabel(action.name),
        name: action.name,
        arguments:
          action.arguments && typeof action.arguments === 'object' && !Array.isArray(action.arguments)
            ? action.arguments
            : {},
        status: typeof action.status === 'string' ? action.status : 'pending',
      }));
  }

  private convertSideEffectSuggestions(
    suggestedActions: Array<Record<string, unknown>>,
    answer: string
  ): Array<Record<string, unknown>> {
    return suggestedActions
      .filter((action) => action.tool_intent === 'send_channel_message')
      .map((action, index) => ({
        id: `send-channel-message-${Date.now()}-${index}`,
        name: 'send_channel_message',
        label: typeof action.label === 'string' ? action.label : 'Send reminder to channel',
        arguments: {
          message:
            typeof action.message === 'string' && action.message.trim()
              ? action.message.trim()
              : typeof action.prompt_to_trigger === 'string' && action.prompt_to_trigger.trim()
                ? action.prompt_to_trigger.trim()
                : answer,
          ...(Array.isArray(action.mentions) ? { mentions: action.mentions } : {}),
        },
        status: 'pending',
      }));
  }

  private defaultActionLabel(name: unknown): string {
    return name === 'send_channel_message' ? 'Send reminder to channel' : String(name || 'Action');
  }

  private normalizeToolArguments(rawArgs: Record<string, unknown>, input: AskAgentInput): Record<string, unknown> {
    return {
      ...rawArgs,
      workspace_id: input.workspaceId,
      channel_id: input.channelId ?? rawArgs.channel_id,
      acting_user_id: input.userId,
    };
  }

  private async executeCoordinationTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'query_tasks':
        return this.mcpClient.queryTasks(args as any);
      case 'search_workspace_members':
        return this.mcpClient.searchWorkspaceMembers(args as any);
      case 'send_channel_message':
        return this.mcpClient.sendChannelMessage(args as any);
      default:
        return this.mcpClient.callTool(name, args);
    }
  }

  private stringifyResponse(result: StructuredAssistantResponse): string {
    const body = JSON.stringify(
      {
        answer: result.answer,
        suggested_actions: result.suggested_actions,
      },
      null,
      2
    );
    return result.actions.length > 0 ? `${body}\n\n[ACTIONS]\n${JSON.stringify(result.actions)}` : body;
  }

  private createEventChunk(type: string, payload: Record<string, unknown>): AskAgentStreamChunk {
    return {
      chunk: JSON.stringify({ type, ...payload }),
      done: false,
    };
  }
}
