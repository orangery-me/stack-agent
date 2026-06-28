import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export interface McpToolPolicy {
  name: string;
  requireConfirmation: boolean;
}

export interface CanvasBlock {
  id: string;
  index: number;
  type: string;
  text: string;
}

export interface BlockMutationResult {
  ok: boolean;
  blocks?: CanvasBlock[];
  appliedMutationCount?: number;
  suggestions?: CanvasSuggestion[];
  createdSuggestionCount?: number;
}

export type CanvasBlockMutation =
  | { action: 'replace_text'; block_id: string; new_text: string }
  | { action: 'replace_block'; block_id: string; new_block: NewCanvasBlock }
  | { action: 'insert_before' | 'insert_after'; target_block_id?: string | null; new_block: NewCanvasBlock }
  | { action: 'delete_block'; block_id: string }
  | { action: 'move_after'; block_id: string; target_block_id?: string | null };

export interface NewCanvasBlock {
  id?: string;
  type?: string;
  content?: string;
  text?: string;
}

export interface CanvasSuggestion {
  id: string;
  canvasId: string;
  messageId: string;
  actionId?: string | null;
  blockId?: string | null;
  targetBlockId?: string | null;
  action: 'replace_text' | 'replace_block' | 'insert_after' | 'insert_before' | 'delete_block';
  payload: Record<string, unknown>;
  status: 'pending' | 'applying' | 'accepted' | 'rejected' | 'failed';
  error?: string | null;
  createdBy: 'ai' | 'agent';
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskPayload extends Record<string, unknown> {
  workspace_id: string;
  task_list_id: string;
  acting_user_id: string;
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  due_date?: string;
  assignee_ids?: string[];
}

export interface QueryTasksPayload extends Record<string, unknown> {
  workspace_id: string;
  channel_id: string;
  acting_user_id: string;
  status?: string;
  is_overdue?: boolean;
}

export interface SendChannelMessagePayload extends Record<string, unknown> {
  workspace_id: string;
  channel_id: string;
  acting_user_id: string;
  message: string;
  mentions?: Array<{
    userId?: string;
    workspaceMemberId?: string;
    name?: string;
    email?: string;
  }>;
}

export interface ListTasksPayload extends Record<string, unknown> {
  workspace_id: string;
  task_list_id: string;
  acting_user_id: string;
  status?: string;
  priority?: string;
  assignee_id?: string;
  page?: number;
  size?: number;
}

@Injectable()
export class McpClientService {
  private readonly mcpUrl: string;
  private readonly fallbackToolPolicies = new Map<string, boolean>([
    ['get_canvas_blocks', false],
    ['list_task_lists', false],
    ['list_tasks', false],
    ['search_workspace_members', false],
    ['query_tasks', false],
    ['create_task', true],
    ['create_tasks_batch', true],
    ['create_task_list_with_tasks', true],
    ['send_channel_message', true],
    ['edit_canvas_blocks', true],
  ]);

  constructor(private readonly config: ConfigService) {
    const rawUrl = this.config.get<string>('MCP_URL', 'http://127.0.0.1:8105/api/mcp');
    this.mcpUrl = this.normalizeLoopbackUrl(rawUrl);
  }

  private normalizeLoopbackUrl(url: string): string {
    try {
      const parsed = new URL(url);
      if (parsed.hostname === 'localhost') {
        parsed.hostname = '127.0.0.1';
      }
      return parsed.toString();
    } catch {
      return url;
    }
  }

  /**
   * Create a fresh stateless MCP client for a single operation batch.
   * Caller is responsible for closing it after use.
   */
  private async createClient(): Promise<Client> {
    const client = new Client({ name: 'stack-agent', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(this.mcpUrl));
    await client.connect(transport);
    return client;
  }

  private parseToolText<T>(text: string, fallback: string): T {
    const raw = text ?? fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      // MCP can return plain-text validation/runtime errors.
      // Surface the original message instead of a generic JSON parse error.
      throw new Error(raw);
    }
  }

  async getBlocks(canvasId: string): Promise<CanvasBlock[]> {
    const client = await this.createClient();
    try {
      const result = await client.callTool({ name: 'get_canvas_blocks', arguments: { canvas_id: canvasId } });
      const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '[]';
      return this.parseToolText<CanvasBlock[]>(text, '[]');
    } finally {
      await client.close();
    }
  }

  async editCanvasBlocks(
    canvasId: string,
    mutations: CanvasBlockMutation[],
    options: { messageId?: string; actionId?: string } = {}
  ): Promise<BlockMutationResult> {
    const client = await this.createClient();
    try {
      const result = await client.callTool({
        name: 'edit_canvas_blocks',
        arguments: {
          canvas_id: canvasId,
          mutations,
          ...(options.messageId ? { message_id: options.messageId } : {}),
          ...(options.actionId ? { action_id: options.actionId } : {}),
        },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '{}';
      return this.parseToolText<BlockMutationResult>(text, '{}');
    } finally {
      await client.close();
    }
  }

  async createTask(payload: CreateTaskPayload): Promise<unknown> {
    const client = await this.createClient();
    try {
      const result = await client.callTool({ name: 'create_task', arguments: payload as Record<string, unknown> });
      const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '{}';
      return this.parseToolText<unknown>(text, '{}');
    } finally {
      await client.close();
    }
  }

  async createTasksBatch(payload: {
    workspace_id: string;
    task_list_id: string;
    acting_user_id: string;
    tasks: Array<Omit<CreateTaskPayload, 'workspace_id' | 'task_list_id' | 'acting_user_id'>>;
  }): Promise<unknown> {
    const client = await this.createClient();
    try {
      const result = await client.callTool({
        name: 'create_tasks_batch',
        arguments: payload as Record<string, unknown>,
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '[]';
      return this.parseToolText<unknown>(text, '[]');
    } finally {
      await client.close();
    }
  }

  async createTaskListWithTasks(payload: {
    workspace_id: string;
    channel_id: string;
    acting_user_id: string;
    list_name: string;
    source_canvas_id?: string;
    source_canvas_title?: string;
    source_canvas_url?: string;
    overall_due_date?: string;
    default_assignee?: 'creator';
    tasks: Array<Omit<CreateTaskPayload, 'workspace_id' | 'task_list_id' | 'acting_user_id'>>;
  }): Promise<unknown> {
    const client = await this.createClient();
    try {
      const result = await client.callTool({
        name: 'create_task_list_with_tasks',
        arguments: payload as Record<string, unknown>,
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '{}';
      return this.parseToolText<unknown>(text, '{}');
    } finally {
      await client.close();
    }
  }

  async listTaskLists(payload: {
    workspace_id: string;
    acting_user_id: string;
    channel_id?: string;
  }): Promise<unknown[]> {
    const client = await this.createClient();
    try {
      const result = await client.callTool({ name: 'list_task_lists', arguments: payload as Record<string, unknown> });
      const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '[]';
      return this.parseToolText<unknown[]>(text, '[]');
    } finally {
      await client.close();
    }
  }

  async listTasks(payload: ListTasksPayload): Promise<unknown> {
    const client = await this.createClient();
    try {
      const result = await client.callTool({ name: 'list_tasks', arguments: payload });
      const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '{}';
      return this.parseToolText<unknown>(text, '{}');
    } finally {
      await client.close();
    }
  }

  async searchWorkspaceMembers(payload: {
    workspace_id: string;
    acting_user_id: string;
    query: string;
    channel_id?: string;
    limit?: number;
  }): Promise<unknown[]> {
    const client = await this.createClient();
    try {
      const result = await client.callTool({
        name: 'search_workspace_members',
        arguments: payload as Record<string, unknown>,
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '[]';
      return this.parseToolText<unknown[]>(text, '[]');
    } finally {
      await client.close();
    }
  }

  async queryTasks(payload: QueryTasksPayload): Promise<unknown[]> {
    const client = await this.createClient();
    try {
      const result = await client.callTool({ name: 'query_tasks', arguments: payload });
      const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '[]';
      return this.parseToolText<unknown[]>(text, '[]');
    } finally {
      await client.close();
    }
  }

  async sendChannelMessage(payload: SendChannelMessagePayload): Promise<unknown> {
    const client = await this.createClient();
    try {
      const result = await client.callTool({ name: 'send_channel_message', arguments: payload });
      const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '{}';
      return this.parseToolText<unknown>(text, '{}');
    } finally {
      await client.close();
    }
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const client = await this.createClient();
    try {
      const result = await client.callTool({ name, arguments: args });
      const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? 'null';
      return this.parseToolText<unknown>(text, 'null');
    } finally {
      await client.close();
    }
  }

  async listToolsWithPolicy(): Promise<McpToolPolicy[]> {
    const client = await this.createClient();
    try {
      const result = await client.listTools();
      return (result.tools ?? []).map((tool: any) => {
        const metaPolicy = tool?._meta?.stack?.require_confirmation;
        const requireConfirmation =
          typeof metaPolicy === 'boolean'
            ? metaPolicy
            : (this.fallbackToolPolicies.get(tool.name) ?? true);
        return { name: tool.name, requireConfirmation };
      });
    } finally {
      await client.close();
    }
  }

  getFallbackToolPolicy(name: string): McpToolPolicy {
    return {
      name,
      requireConfirmation: this.fallbackToolPolicies.get(name) ?? true,
    };
  }

  /**
   * Execute a batch of tool calls sequentially and return all results.
   * More efficient than creating separate clients per call.
   */
  async executeBatch(
    calls: Array<{ name: string; arguments: Record<string, unknown> }>,
  ): Promise<Array<{ name: string; result: unknown }>> {
    const client = await this.createClient();
    try {
      const results: Array<{ name: string; result: unknown }> = [];
      for (const call of calls) {
        const result = await client.callTool({ name: call.name, arguments: call.arguments });
        const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? 'null';
        results.push({ name: call.name, result: this.parseToolText<unknown>(text, 'null') });
      }
      return results;
    } finally {
      await client.close();
    }
  }
}
