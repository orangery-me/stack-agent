import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AiChatSessionService } from '../../ai-chat/ai-chat-session.service';
import { McpClientService } from '../../mcp-client/mcp-client.service';
import { AiProviderMessage, ToolDefinition } from '../ai-providers/ai-provider.interface';
import { buildTaskSessionPreviewPrompt } from '../prompts/agent-task.prompts';
import {
  AskAgentStreamChunk,
  TaskApplyActionInput,
  TaskApplyActionStreamInput,
  TaskSessionPreviewInput,
} from '../shared/agent.types';
import { createAsyncStream } from '../utils/agent-stream.utils';
import { AgentProviderService } from './agent-provider.service';
import { AgentToolLoopService } from './agent-tool-loop.service';

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
    requireConfirmation: true,
    description: 'Create a single task in a task list.',
    parameters: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        task_list_id: { type: 'string', description: 'Task list ID' },
        title: { type: 'string', description: 'Task title' },
        description: { type: 'string', description: 'Task description' },
        status: { type: 'string', enum: ['todo', 'in_progress', 'done'], description: 'Task status' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'Task priority' },
        due_date: { type: 'string', description: 'Due date in ISO 8601 format' },
        assignee_ids: { type: 'array', items: { type: 'string' }, description: 'Workspace member IDs' },
      },
      required: ['workspace_id', 'task_list_id', 'title'],
    },
  },
  {
    name: 'create_tasks_batch',
    requireConfirmation: true,
    description: 'Create multiple tasks in one request.',
    parameters: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        task_list_id: { type: 'string', description: 'Task list ID' },
        tasks: {
          type: 'array',
          items: {
            type: 'object',
          },
          description: 'Array of tasks with title/description/status/priority/due_date/assignee_ids',
        },
      },
      required: ['workspace_id', 'task_list_id', 'tasks'],
    },
  },
  {
    name: 'create_task_list_with_tasks',
    requireConfirmation: true,
    description: 'Create a new task list and multiple tasks from a reviewed canvas task-generation action.',
    parameters: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        channel_id: { type: 'string', description: 'Channel ID' },
        list_name: { type: 'string', description: 'Task list name' },
        source_canvas_id: { type: 'string', description: 'Source canvas ID' },
        source_canvas_title: { type: 'string', description: 'Source canvas title' },
        source_canvas_url: { type: 'string', description: 'Source canvas URL' },
        overall_due_date: { type: 'string', description: 'Overall due date in ISO 8601 format' },
        default_assignee: {
          type: 'string',
          enum: ['creator'],
          description: 'Always assign generated tasks to creator',
        },
        tasks: {
          type: 'array',
          items: { type: 'object' },
          description: 'Array of tasks with title/description/status/priority/due_date',
        },
      },
      required: ['workspace_id', 'channel_id', 'list_name', 'tasks'],
    },
  },
  {
    name: 'list_task_lists',
    requireConfirmation: false,
    description: 'List task lists that the acting user can target.',
    parameters: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        channel_id: { type: 'string', description: 'Optional channel ID' },
      },
      required: ['workspace_id'],
    },
  },
  {
    name: 'list_tasks',
    requireConfirmation: false,
    description: 'List task items inside a task list with status, priority, due date, creator, and assignees.',
    parameters: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        task_list_id: { type: 'string', description: 'Task list ID' },
        status: { type: 'string', enum: ['todo', 'in_progress', 'done'], description: 'Optional task status filter' },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'urgent'],
          description: 'Optional priority filter',
        },
        assignee_id: { type: 'string', description: 'Optional workspace member ID filter' },
        page: { type: 'number', description: 'Page number' },
        size: { type: 'number', description: 'Page size' },
      },
      required: ['workspace_id', 'task_list_id'],
    },
  },
  {
    name: 'search_workspace_members',
    requireConfirmation: false,
    description: 'Search workspace members by name/email for assignee resolution.',
    parameters: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        query: { type: 'string', description: 'Search query' },
        channel_id: { type: 'string', description: 'Optional channel ID' },
        limit: { type: 'number', description: 'Result limit' },
      },
      required: ['workspace_id', 'query'],
    },
  },
  {
    name: 'query_tasks',
    requireConfirmation: false,
    description: 'Query tasks in a channel for workload/progress analysis.',
    parameters: {
      type: 'object',
      properties: {
        workspace_id: { type: 'string', description: 'Workspace ID' },
        channel_id: { type: 'string', description: 'Channel ID' },
        status: { type: 'string', enum: ['todo', 'in_progress', 'done'], description: 'Optional task status filter' },
        is_overdue: { type: 'boolean', description: 'Only return non-done tasks past due date' },
      },
      required: ['workspace_id', 'channel_id'],
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
        message: { type: 'string', description: 'Message content to send' },
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
export class AgentTaskService {
  constructor(
    private readonly providerService: AgentProviderService,
    private readonly aiChatSessionService: AiChatSessionService,
    private readonly mcpClient: McpClientService,
    private readonly toolLoop: AgentToolLoopService
  ) {}

  taskSessionPreviewStream(input: TaskSessionPreviewInput): Observable<AskAgentStreamChunk> {
    return createAsyncStream(async (subscriber) => {
      const { provider } = this.providerService.resolveProvider(input.provider);
      if (!provider.chatWithTools) {
        subscriber.next(this.createEventChunk('status', { message: 'Provider does not support tool-calling mode.' }));
        subscriber.next(
          this.createEventChunk('assistant', {
            content: 'The current provider does not support task action proposal mode.',
          })
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
            canvasTitle: input.canvasTitle,
            sourceCanvasUrl: input.sourceCanvasUrl,
            overallDueDate: input.overallDueDate,
            timezone: input.timezone,
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
      const result = await this.toolLoop.run({
        provider,
        messages,
        tools: TASK_TOOLS,
        model: input.model,
        temperature: 0.2,
        normalizeToolArguments: (name, args) => this.normalizeActionArguments(args, input),
        executeTool: (name, args) => this.executeTaskTool(name, args),
      });

      const fallbackParsed = this.extractActionsFromContent(result.content);
      const actionSeed =
        result.actions && result.actions.length > 0
          ? result.actions
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
    return this.executeTaskTool(input.actionName, args);
  }

  taskApplyActionStream(input: TaskApplyActionStreamInput): Observable<AskAgentStreamChunk> {
    return createAsyncStream(async (subscriber) => {
      const { provider } = this.providerService.resolveProvider(input.provider);
      if (!provider.chatWithTools) {
        subscriber.next(this.createEventChunk('status', { message: 'Provider does not support tool-calling mode.' }));
        subscriber.next({ chunk: '', done: true });
        subscriber.complete();
        return;
      }

      subscriber.next(this.createEventChunk('status', { message: 'Executing approved action...' }));
      const args = this.normalizeActionArguments(input.actionArgs, input);
      const actionResult = await this.executeTaskTool(input.actionName, args);

      const history = await this.aiChatSessionService.buildContextMessages(input.sessionId);
      const messages: AiProviderMessage[] = [
        {
          role: 'system',
          content: buildTaskSessionPreviewPrompt({
            workspaceId: input.workspaceId,
            channelId: input.channelId,
            taskListId: input.taskListId,
            canvasId: input.canvasId,
            canvasTitle: input.canvasTitle,
            sourceCanvasUrl: input.sourceCanvasUrl,
            overallDueDate: input.overallDueDate,
            timezone: input.timezone,
            canvasBlocksJson: input.canvasContent?.trim() || '',
          }),
        },
        ...history
          .filter((message) => message.role !== 'system')
          .map((message) => ({
            ...message,
            content: this.stripActionTrace(message.content),
          })),
        {
          role: 'user',
          content:
            `The user approved and the backend executed this action:\n` +
            `${JSON.stringify({ tool: input.actionName, arguments: args, result: actionResult }, null, 2)}\n\n` +
            `Continue the original request. If the action completed the request, provide a concise final answer. ` +
            `Only call another tool if more data is required.`,
        },
      ];

      subscriber.next(this.createEventChunk('status', { message: 'AI is continuing after the approved action...' }));
      const result = await this.toolLoop.run({
        provider,
        messages,
        tools: TASK_TOOLS,
        model: input.model,
        temperature: 0.2,
        normalizeToolArguments: (name, rawArgs) => this.normalizeActionArguments(rawArgs, input),
        executeTool: (name, rawArgs) => this.executeTaskTool(name, rawArgs),
      });

      if (result.actions.length > 0) {
        subscriber.next(this.createEventChunk('actions', { actions: result.actions }));
      }

      subscriber.next(
        this.createEventChunk('assistant', {
          content: result.content || 'The approved action was completed.',
        })
      );
      subscriber.next({ chunk: '', done: true });
      subscriber.complete();
    });
  }

  private async executeTaskTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'create_task':
        return this.mcpClient.createTask(args as any);
      case 'create_tasks_batch':
        return this.mcpClient.createTasksBatch(args as any);
      case 'create_task_list_with_tasks':
        return this.mcpClient.createTaskListWithTasks(args as any);
      case 'list_task_lists':
        return this.mcpClient.listTaskLists(args as any);
      case 'list_tasks':
        return this.mcpClient.listTasks(args as any);
      case 'search_workspace_members':
        return this.mcpClient.searchWorkspaceMembers(args as any);
      case 'query_tasks':
        return this.mcpClient.queryTasks(args as any);
      case 'send_channel_message':
        return this.mcpClient.sendChannelMessage(args as any);
      default:
        throw new Error(`Unknown task action: ${name}`);
    }
  }

  private normalizeActionArguments(
    rawArgs: Record<string, unknown>,
    input: {
      workspaceId: string;
      userId: string;
      channelId?: string;
      taskListId?: string;
      canvasId?: string;
      canvasTitle?: string;
      sourceCanvasUrl?: string;
      overallDueDate?: string;
    }
  ): Record<string, unknown> {
    return {
      ...rawArgs,
      workspace_id: input.workspaceId,
      acting_user_id: input.userId,
      channel_id: input.channelId ?? rawArgs.channel_id,
      task_list_id: input.taskListId ?? rawArgs.task_list_id,
      source_canvas_id: input.canvasId ?? rawArgs.source_canvas_id,
      source_canvas_title: input.canvasTitle ?? rawArgs.source_canvas_title,
      source_canvas_url: input.sourceCanvasUrl ?? rawArgs.source_canvas_url,
      overall_due_date: input.overallDueDate ?? rawArgs.overall_due_date,
      default_assignee: rawArgs.default_assignee ?? 'creator',
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
