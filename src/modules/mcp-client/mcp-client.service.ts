import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export interface CanvasBlock {
  index: number;
  type: string;
  text: string;
}

export interface BlockMutationResult {
  ok: boolean;
  blocks: CanvasBlock[];
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

@Injectable()
export class McpClientService {
  private readonly mcpUrl: string;

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

  async insertBlock(
    canvasId: string,
    content: string,
    type = 'paragraph',
    afterIndex?: number,
  ): Promise<BlockMutationResult> {
    const client = await this.createClient();
    try {
      const args: Record<string, unknown> = { canvas_id: canvasId, content, type };
      if (afterIndex !== undefined) args['after_index'] = afterIndex;
      const result = await client.callTool({ name: 'insert_canvas_block', arguments: args });
      const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '{}';
      return this.parseToolText<BlockMutationResult>(text, '{}');
    } finally {
      await client.close();
    }
  }

  async updateBlock(canvasId: string, index: number, content: string): Promise<BlockMutationResult> {
    const client = await this.createClient();
    try {
      const result = await client.callTool({
        name: 'update_canvas_block',
        arguments: { canvas_id: canvasId, index, content },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '{}';
      return this.parseToolText<BlockMutationResult>(text, '{}');
    } finally {
      await client.close();
    }
  }

  async deleteBlock(canvasId: string, index: number): Promise<BlockMutationResult> {
    const client = await this.createClient();
    try {
      const result = await client.callTool({
        name: 'delete_canvas_block',
        arguments: { canvas_id: canvasId, index },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '{}';
      return this.parseToolText<BlockMutationResult>(text, '{}');
    } finally {
      await client.close();
    }
  }

  async reorderBlocks(canvasId: string, fromIndex: number, toIndex: number): Promise<BlockMutationResult> {
    const client = await this.createClient();
    try {
      const result = await client.callTool({
        name: 'reorder_canvas_blocks',
        arguments: { canvas_id: canvasId, from_index: fromIndex, to_index: toIndex },
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
