import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
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
  OpenAiResponseData,
  OpenAiResponseMessage,
  OpenAiToolMessage,
  OpenAiOutputMessageItem,
  OpenAiFunctionCallItem,
  OpenAiStreamEvent,
} from '../../models/openai-model';

export class OpenaiProvider implements AiProvider {
  readonly name = 'openai';
  readonly model: string;
  private readonly baseUrl = 'https://api.openai.com/v1';
  private readonly responsesPath = '/responses';

  constructor(model: string) {
    this.model = model;
  }

  /**
   *  Chat in default mode.
   */
  async chat(messages: AiProviderMessage[], options: AiProviderOptions) {
    const data = await this.requestResponses<OpenAiResponseData>({
      model: this.resolveModel(options),
      input: this.buildChatInput(messages),
      ...(options?.responseFormat === 'json_object' ? { text: { format: { type: 'json_object' } } } : {}),
      stream: false,
    });

    const content = this.extractOutputText(data);

    return [
      ...messages,
      {
        role: 'assistant' as const,
        content,
      },
    ];
  }

  /**
   *  Chat in stream mode.
   */
  chatStream(messages: AiProviderMessage[], options: AiProviderOptions): NodeJS.EventEmitter {
    const emitter = new EventEmitter();

    (async () => {
      try {
        const response = await this.requestResponses<NodeJS.ReadableStream>(
          {
            model: this.resolveModel(options),
            input: this.buildStreamInput(messages),
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
   * Uses the OpenAI Chat Completions API with function calling support.
   */
  async chatWithTools(
    messages: AiProviderMessage[],
    tools: ToolDefinition[],
    options: AiProviderOptions
  ): Promise<ChatWithToolsResult> {
    try {
      const data = await this.requestResponses<OpenAiResponseData>({
        model: this.resolveModel(options),
        input: this.buildToolInput(messages),
        tools: this.buildToolDefinitions(tools),
        tool_choice: 'auto',
        ...(options?.responseFormat === 'json_object' ? { text: { format: { type: 'json_object' } } } : {}),
        stream: false,
      });

      const toolCalls = this.extractToolCalls(data);
      if (toolCalls.length > 0) {
        return { toolCalls };
      }

      return { content: this.extractOutputText(data) };
    } catch (err: any) {
      const status = err?.response?.status;
      const details =
        typeof err?.response?.data === 'string' ? err.response.data : JSON.stringify(err?.response?.data ?? {});
      throw new Error(`OpenAI tool calling failed${status ? ` (${status})` : ''}: ${details}`);
    }
  }

  private resolveModel(options?: AiProviderOptions): string {
    return options?.model ?? this.model;
  }

  private getApiKey(): string {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('Key API is not configured');
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

  private async requestResponses<T>(payload: Record<string, unknown>, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.createClient().post<T>(this.responsesPath, payload, config);
    return response.data;
  }

  private buildChatInput(messages: AiProviderMessage[]): OpenAiResponseMessage[] {
    return messages.map((message) => ({
      role: message.role,
      content: [
        {
          type: 'text',
          text: message.content,
        },
      ],
    }));
  }

  private buildStreamInput(messages: AiProviderMessage[]): Array<{ role: string; content: string }> {
    return messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));
  }

  private buildToolInput(messages: AiProviderMessage[]): OpenAiToolMessage[] {
    return messages.map((message) => {
      const role = message.role === 'model' ? 'assistant' : message.role;
      const baseMessage: OpenAiToolMessage = {
        type: 'message',
        role,
        status: 'completed',
        content: [
          {
            type: role === 'assistant' ? 'output_text' : 'input_text',
            text: message.content,
          },
        ],
      };

      if (role === 'assistant') {
        baseMessage.phase = 'final_answer';
      }

      return baseMessage;
    });
  }

  private buildToolDefinitions(tools: ToolDefinition[]) {
    return tools.map((tool) => ({
      type: 'function' as const,
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      strict: false,
    }));
  }

  private extractOutputText(data: OpenAiResponseData): string {
    if (typeof data?.output_text === 'string' && data.output_text.trim()) {
      return data.output_text;
    }

    const output = Array.isArray(data?.output) ? data.output : [];

    return output
      .filter((item): item is OpenAiOutputMessageItem => item?.type === 'message')
      .flatMap((item) => item.content ?? [])
      .filter((item) => item.type === 'output_text')
      .map((item) => item.text ?? '')
      .join('');
  }

  private extractToolCalls(data: OpenAiResponseData): ToolCall[] {
    const output = Array.isArray(data?.output) ? data.output : [];

    return output
      .filter((item): item is OpenAiFunctionCallItem => item?.type === 'function_call')
      .map((toolCall) => ({
        id: toolCall.call_id ?? toolCall.id ?? toolCall.name,
        name: toolCall.name,
        arguments: this.parseToolArguments(toolCall.arguments),
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
      const event = JSON.parse(payload) as OpenAiStreamEvent;

      if (event.type === 'response.output_text.delta' && event.delta) {
        emitter.emit('token', event.delta);
      }

      if (event.type === 'response.completed') {
        emitter.emit('end');
      }
    } catch (error) {
      console.error('OpenAI stream parse error:', error);
    }
  }
}
