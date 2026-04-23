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

  async getBlocks(canvasId: string): Promise<CanvasBlock[]> {
    const client = await this.createClient();
    try {
      const result = await client.callTool({ name: 'get_canvas_blocks', arguments: { canvas_id: canvasId } });
      const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '[]';
      return JSON.parse(text) as CanvasBlock[];
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
      return JSON.parse(text) as BlockMutationResult;
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
      return JSON.parse(text) as BlockMutationResult;
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
      return JSON.parse(text) as BlockMutationResult;
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
      return JSON.parse(text) as BlockMutationResult;
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
        results.push({ name: call.name, result: JSON.parse(text) });
      }
      return results;
    } finally {
      await client.close();
    }
  }
}
