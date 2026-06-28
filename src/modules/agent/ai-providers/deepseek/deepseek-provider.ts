import axios, { AxiosInstance } from 'axios';
import { EventEmitter } from 'events';
import {
  AiProvider,
  AiProviderMessage,
  AiProviderOptions,
  ToolDefinition,
  ToolCall,
  ChatWithToolsResult,
} from '../ai-provider.interface';

import {
  DeepSeekMessage,
  DeepSeekResponseData,
  DeepSeekStreamChunk,
} from '../../models/deepseek-model';

export class DeepseekProvider implements AiProvider {
  readonly name = 'deepseek';
  readonly model: string;
  private readonly baseUrl = 'https://api.deepseek.com';

  constructor(model: string) {
    this.model = model;
  }

  /**
   * Chat in default (non-streaming) mode.
   */
  async chat(messages: AiProviderMessage[], options: AiProviderOptions) {
    const data = await this.requestChatCompletions<DeepSeekResponseData>({
      model: this.resolveModel(options),
      messages: this.buildMessages(messages),
      temperature: options?.temperature ?? 0.7,
      ...(options?.maxToken ? { max_tokens: options.maxToken } : {}),
      ...(options?.responseFormat === 'json_object' ? { response_format: { type: 'json_object' } } : {}),
      stream: false,
    });

    const content = this.extractContent(data);

    return [
      ...messages,
      {
        role: 'assistant' as const,
        content,
      },
    ];
  }

  /**
   * Chat in stream mode.
   */
  chatStream(messages: AiProviderMessage[], options: AiProviderOptions): NodeJS.EventEmitter {
    const emitter = new EventEmitter();

    (async () => {
      try {
        const response = await this.requestChatCompletions<NodeJS.ReadableStream>(
          {
            model: this.resolveModel(options),
            messages: this.buildMessages(messages),
            temperature: options?.temperature ?? 0.7,
            ...(options?.maxToken ? { max_tokens: options.maxToken } : {}),
            stream: true,
          },
          { responseType: 'stream' }
        );

        this.bindStreamEvents(response, emitter);
      } catch (err: any) {
        emitter.emit('error', err);
      }
    })();

    return emitter;
  }

  /**
   * Chat with tool/function calling support.
   * DeepSeek uses the OpenAI-compatible function calling format.
   */
  async chatWithTools(
    messages: AiProviderMessage[],
    tools: ToolDefinition[],
    options: AiProviderOptions
  ): Promise<ChatWithToolsResult> {
    try {
      const data = await this.requestChatCompletions<DeepSeekResponseData>({
        model: this.resolveModel(options),
        messages: this.buildMessages(messages),
        tools: this.buildToolDefinitions(tools),
        tool_choice: 'auto',
        temperature: options?.temperature ?? 0.7,
        ...(options?.maxToken ? { max_tokens: options.maxToken } : {}),
        ...(options?.responseFormat === 'json_object' ? { response_format: { type: 'json_object' } } : {}),
        stream: false,
      });

      const toolCalls = this.extractToolCalls(data);
      if (toolCalls.length > 0) {
        return { toolCalls };
      }

      return { content: this.extractContent(data) };
    } catch (err: any) {
      const status = err?.response?.status;
      const details =
        typeof err?.response?.data === 'string' ? err.response.data : JSON.stringify(err?.response?.data ?? {});
      throw new Error(`DeepSeek tool calling failed${status ? ` (${status})` : ''}: ${details}`);
    }
  }

  private resolveModel(options?: AiProviderOptions): string {
    return options?.model ?? this.model;
  }

  private getApiKey(): string {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error('DeepSeek API key is not configured');
    }

    return apiKey;
  }

  private createClient(): AxiosInstance {
    return axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${this.getApiKey()}`,
        'Content-Type': 'application/json',
      },
    });
  }

  private async requestChatCompletions<T>(
    payload: Record<string, unknown>,
    config?: Record<string, unknown>
  ): Promise<T> {
    const response = await this.createClient().post<T>('/chat/completions', payload, config);
    return response.data;
  }

  private buildMessages(messages: AiProviderMessage[]): DeepSeekMessage[] {
    return messages.map((message) => ({
      role: message.role === 'model' ? 'assistant' : message.role,
      content: message.content,
    })) as DeepSeekMessage[];
  }

  private buildToolDefinitions(tools: ToolDefinition[]) {
    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  private extractContent(data: DeepSeekResponseData): string {
    const choice = data?.choices?.[0];
    return choice?.message?.content ?? '';
  }

  private extractToolCalls(data: DeepSeekResponseData): ToolCall[] {
    const choice = data?.choices?.[0];
    const rawToolCalls = choice?.message?.tool_calls ?? [];

    return rawToolCalls.map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: this.parseToolArguments(tc.function.arguments),
    }));
  }

  private parseToolArguments(rawArguments?: string): Record<string, unknown> {
    if (!rawArguments) {
      return {};
    }

    try {
      return JSON.parse(rawArguments) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  private bindStreamEvents(stream: NodeJS.ReadableStream, emitter: EventEmitter): void {
    let buffer = '';

    stream.on('data', (raw: Buffer) => {
      buffer += raw.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        this.handleStreamLine(line, emitter);
      }
    });

    stream.on('end', () => emitter.emit('end'));
    stream.on('error', (error: Error) => emitter.emit('error', error));
  }

  private handleStreamLine(line: string, emitter: EventEmitter): void {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data: ')) {
      return;
    }

    const payload = trimmed.slice(6).trim();
    if (payload === '[DONE]') {
      emitter.emit('end');
      return;
    }

    try {
      const chunk = JSON.parse(payload) as DeepSeekStreamChunk;
      const delta = chunk.choices?.[0]?.delta;

      if (delta?.content) {
        emitter.emit('token', delta.content);
      }

      if (chunk.choices?.[0]?.finish_reason === 'stop') {
        emitter.emit('end');
      }
    } catch (error) {
      console.error('DeepSeek stream parse error:', error);
    }
  }
}
