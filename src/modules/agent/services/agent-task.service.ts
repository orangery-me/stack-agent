import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AiChatSessionService } from '../../ai-chat/ai-chat-session.service';
import { McpClientService } from '../../mcp-client/mcp-client.service';
import { AiProviderMessage, ToolDefinition } from '../ai-providers/ai-provider.interface';
import { buildTaskSessionPreviewPrompt } from '../prompts/agent-task.prompts';
import { AskAgentStreamChunk, TaskApplyActionInput, TaskSessionPreviewInput } from '../shared/agent.types';
import { createAsyncStream } from '../utils/agent-stream.utils';
import { AgentProviderService } from './agent-provider.service';

interface ParsedTaskAction {
  id?: string;
  name: string;
  arguments?: Record<string, unknown>;
  status?: string;
}

type NormalizedTaskAction = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: string;
};

const TASK_TOOLS: ToolDefinition[] = [
  {
    name: 'create_task',
    description: 'Create a single task in a task list.',
    parameters: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        task_list_id: { type: 'string', description: 'Task list ID' },
        acting_user_id: { type: 'string', description: 'Acting user ID' },
        title: { type: 'string', description: 'Task title' },
        description: { type: 'string', description: 'Task description' },
        status: { type: 'string', enum: ['todo', 'in_progress', 'done'], description: 'Task status' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'Task priority' },
        due_date: { type: 'string', description: 'Due date in ISO 8601 format' },
        assignee_ids: { type: 'array', items: { type: 'string' }, description: 'Workspace member IDs' },
      },
      required: ['workspace_id', 'task_list_id', 'acting_user_id', 'title'],
    },
  },
  {
    name: 'create_tasks_batch',
    description: 'Create multiple tasks in one request.',
    parameters: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        task_list_id: { type: 'string', description: 'Task list ID' },
        acting_user_id: { type: 'string', description: 'Acting user ID' },
        tasks: {
          type: 'array',
          items: {
            type: 'object',
          },
          description: 'Array of tasks with title/description/status/priority/due_date/assignee_ids',
        },
      },
      required: ['workspace_id', 'task_list_id', 'acting_user_id', 'tasks'],
    },
  },
  {
    name: 'list_task_lists',
    description: 'List task lists that the acting user can target.',
    parameters: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        acting_user_id: { type: 'string', description: 'Acting user ID' },
        channel_id: { type: 'string', description: 'Optional channel ID' },
      },
      required: ['workspace_id', 'acting_user_id'],
    },
  },
  {
    name: 'search_workspace_members',
    description: 'Search workspace members by name/email for assignee resolution.',
    parameters: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        acting_user_id: { type: 'string', description: 'Acting user ID' },
        query: { type: 'string', description: 'Search query' },
        channel_id: { type: 'string', description: 'Optional channel ID' },
        limit: { type: 'number', description: 'Result limit' },
      },
      required: ['workspace_id', 'acting_user_id', 'query'],
    },
  },
];

@Injectable()
export class AgentTaskService {
  constructor(
    private readonly providerService: AgentProviderService,
    private readonly aiChatSessionService: AiChatSessionService,
    private readonly mcpClient: McpClientService,
  ) {}

  taskSessionPreviewStream(input: TaskSessionPreviewInput): Observable<AskAgentStreamChunk> {
    return createAsyncStream(async (subscriber) => {
      const { provider } = this.providerService.resolveProvider(input.provider);
      if (!provider.chatWithTools) {
        subscriber.next(this.createEventChunk('status', { message: 'Provider does not support tool-calling mode.' }));
        subscriber.next(
          this.createEventChunk('assistant', {
            content: 'The current provider does not support task action proposal mode.',
          }),
        );
        subscriber.next({ chunk: '', done: true });
        subscriber.complete();
        return;
      }

      let canvasBlocksJson = '';
      if (input.canvasId) {
        subscriber.next(this.createEventChunk('status', { message: 'Reading canvas context...' }));
        try {
          const blocks = await this.mcpClient.getBlocks(input.canvasId);
          canvasBlocksJson = blocks.length ? JSON.stringify(blocks, null, 2) : '';
        } catch {
          canvasBlocksJson = input.canvasContent?.trim() || '';
        }
      } else if (input.canvasContent?.trim()) {
        canvasBlocksJson = input.canvasContent.trim();
      }

      const history = await this.aiChatSessionService.buildContextMessages(input.sessionId);
      const historyWithoutTail = history.slice(0, Math.max(history.length - 1, 0));
      const messages: AiProviderMessage[] = [
        {
          role: 'system',
          content: buildTaskSessionPreviewPrompt({
            workspaceId: input.workspaceId,
            channelId: input.channelId,
            taskListId: input.taskListId,
            canvasId: input.canvasId,
            canvasBlocksJson,
          }),
        },
        ...historyWithoutTail
          .filter((message) => message.role !== 'system')
          .map((message) => ({
            ...message,
            content: this.stripActionTrace(message.content),
          })),
        { role: 'user', content: input.userRequest },
      ];

      subscriber.next(this.createEventChunk('status', { message: 'AI is analyzing task request...' }));
      const result = await provider.chatWithTools(messages, TASK_TOOLS, {
        model: input.model,
        temperature: 0.2,
      });

      const fallbackParsed = this.extractActionsFromContent(result.content);
      const actionSeed =
        result.toolCalls && result.toolCalls.length > 0
          ? result.toolCalls.map((toolCall, index) => ({
              id: `${Date.now()}-${index}`,
              name: toolCall.name,
              arguments: toolCall.arguments ?? {},
              status: 'pending',
            }))
          : fallbackParsed.actions;

      const actions = actionSeed.map((action, index) => ({
        id: action.id || `${Date.now()}-${index}`,
        name: action.name,
        arguments: this.normalizeActionArguments(action.arguments ?? {}, input),
        status: action.status || 'pending',
      }));

      if (actions.length > 0) {
        subscriber.next(this.createEventChunk('actions', { actions }));
      }

      const summary =
        this.stripActionTrace(fallbackParsed.summary || result.content || '') ||
        (actions.length > 0
          ? `I prepared ${actions.length} proposed task action(s). Review and accept what you want to execute.`
          : 'I could not produce concrete task actions from this request.');

      subscriber.next(this.createEventChunk('assistant', { content: summary }));
      subscriber.next({ chunk: '', done: true });
      subscriber.complete();
    });
  }

  async applyTaskAction(input: TaskApplyActionInput): Promise<unknown> {
    const args = this.normalizeActionArguments(input.actionArgs, input);
    switch (input.actionName) {
      case 'create_task':
        return this.mcpClient.createTask(args as any);
      case 'create_tasks_batch':
        return this.mcpClient.createTasksBatch(args as any);
      case 'list_task_lists':
        return this.mcpClient.listTaskLists(args as any);
      case 'search_workspace_members':
        return this.mcpClient.searchWorkspaceMembers(args as any);
      default:
        throw new Error(`Unknown task action: ${input.actionName}`);
    }
  }

  private normalizeActionArguments(
    rawArgs: Record<string, unknown>,
    input: { workspaceId: string; userId: string; channelId?: string; taskListId?: string },
  ): Record<string, unknown> {
    return {
      ...rawArgs,
      workspace_id: rawArgs.workspace_id ?? input.workspaceId,
      acting_user_id: rawArgs.acting_user_id ?? input.userId,
      channel_id: rawArgs.channel_id ?? input.channelId,
      task_list_id: rawArgs.task_list_id ?? input.taskListId,
    };
  }

  private createEventChunk(type: string, payload: Record<string, unknown>): AskAgentStreamChunk {
    return {
      chunk: JSON.stringify({ type, ...payload }),
      done: false,
    };
  }

  private stripActionTrace(content: string): string {
    const marker = '\n[ACTIONS]\n';
    const exactMarkerIndex = content.indexOf(marker);
    if (exactMarkerIndex >= 0) {
      return content.slice(0, exactMarkerIndex).trim();
    }
    const looseMarkerIndex = content.indexOf('[ACTIONS]');
    if (looseMarkerIndex >= 0) {
      return content.slice(0, looseMarkerIndex).trim();
    }
    return content.trim();
  }

  private extractActionsFromContent(content?: string): { summary: string; actions: NormalizedTaskAction[] } {
    const rawContent = content?.trim() ?? '';
    if (!rawContent) return { summary: '', actions: [] };
    const marker = '[ACTIONS]';
    const markerIndex = rawContent.indexOf(marker);
    if (markerIndex < 0) return { summary: rawContent, actions: [] };

    const summary = rawContent.slice(0, markerIndex).trim();
    const rawJson = rawContent.slice(markerIndex + marker.length).trim();
    if (!rawJson) return { summary, actions: [] };

    try {
      const parsed = JSON.parse(rawJson) as unknown;
      if (!Array.isArray(parsed)) return { summary: rawContent, actions: [] };
      return {
        summary,
        actions: parsed
          .map((item, index) => this.normalizeParsedAction(item as ParsedTaskAction, index))
          .filter((item): item is NormalizedTaskAction => item !== null),
      };
    } catch {
      return { summary: rawContent, actions: [] };
    }
  }

  private normalizeParsedAction(action: ParsedTaskAction, fallbackIndex: number): NormalizedTaskAction | null {
    if (!action?.name || typeof action.name !== 'string') return null;
    const rawArguments = action.arguments;
    const normalizedArguments =
      rawArguments && typeof rawArguments === 'object' && !Array.isArray(rawArguments) ? rawArguments : {};
    return {
      id: typeof action.id === 'string' && action.id.trim() ? action.id : `${Date.now()}-${fallbackIndex}`,
      name: action.name,
      arguments: normalizedArguments,
      status: typeof action.status === 'string' && action.status.trim() ? action.status : 'pending',
    };
  }
}

