import axios from 'axios';
import {
  AiProvider,
  AiProviderMessage,
  AiProviderOptions,
  ToolDefinition,
  ToolCall,
  ChatWithToolsResult,
} from '../ai-provider.interface';
import {
  GeminiContentMessage,
  GeminiFunctionDeclaration,
  GeminiResponseData,
  GeminiResponsePart,
  GeminiRole,
  GeminiSystemInstruction,
} from '../../models/gemini-model';

export class GeminiProvider implements AiProvider {
  readonly name = 'gemini';
  readonly model: string;
  private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';

  constructor(model: string) {
    this.model = model;
  }

  async chat(messages: AiProviderMessage[], options: AiProviderOptions) {
    const data = await this.requestGenerateContent<GeminiResponseData>(
      this.buildChatPayload(messages, options),
      options
    );
    const content = this.extractTextContent(data);

    return [...messages, { role: 'model' as const, content }];
  }

  /**
   * Uses the Gemini generateContent API with functionDeclarations for tool calling.
   */
  async chatWithTools(
    messages: AiProviderMessage[],
    tools: ToolDefinition[],
    options: AiProviderOptions
  ): Promise<ChatWithToolsResult> {
    const data = await this.requestGenerateContent<GeminiResponseData>(
      this.buildToolPayload(messages, tools, options),
      options
    );

    const toolCalls = this.extractToolCalls(data);
    if (toolCalls.length > 0) {
      return { toolCalls };
    }

    return { content: this.extractTextContent(data) };
  }

  private resolveModel(options?: AiProviderOptions): string {
    return options?.model ?? this.model;
  }

  private getApiKey(): string {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('Key API is not configured');
    }

    return apiKey;
  }

  private buildUrl(options?: AiProviderOptions): string {
    return `${this.baseUrl}/${this.resolveModel(options)}:generateContent?key=${this.getApiKey()}`;
  }

  private async requestGenerateContent<T>(payload: Record<string, unknown>, options?: AiProviderOptions): Promise<T> {
    const response = await axios.post<T>(this.buildUrl(options), payload);
    return response.data;
  }

  private buildChatPayload(messages: AiProviderMessage[], options: AiProviderOptions): Record<string, unknown> {
    return this.buildBasePayload(messages, options);
  }

  private buildToolPayload(
    messages: AiProviderMessage[],
    tools: ToolDefinition[],
    options: AiProviderOptions
  ): Record<string, unknown> {
    return {
      ...this.buildBasePayload(messages, options),
      tools: [{ functionDeclarations: this.buildFunctionDeclarations(tools) }],
    };
  }

  private buildBasePayload(messages: AiProviderMessage[], options: AiProviderOptions): Record<string, unknown> {
    const systemInstruction = this.buildSystemInstruction(messages);

    const payload: Record<string, unknown> = {
      contents: this.buildConversationContents(messages),
      generationConfig: this.buildGenerationConfig(options),
    };

    if (systemInstruction) {
      payload['systemInstruction'] = systemInstruction;
    }

    return payload;
  }

  private buildConversationContents(messages: AiProviderMessage[]): GeminiContentMessage[] {
    return messages
      .filter((message) => message.role !== 'system')
      .map((message) => ({
        role: this.mapRole(message.role),
        parts: [{ text: message.content }],
      }));
  }

  private buildSystemInstruction(messages: AiProviderMessage[]): GeminiSystemInstruction | undefined {
    const systemMessages = messages.filter((message) => message.role === 'system');
    if (systemMessages.length === 0) {
      return undefined;
    }

    return {
      parts: systemMessages.map((message) => ({ text: message.content })),
    };
  }

  private buildGenerationConfig(options: AiProviderOptions): Record<string, unknown> {
    const config: Record<string, unknown> = {
      temperature: options?.temperature ?? 0.7,
    };

    if (options?.maxToken) {
      config['maxOutputTokens'] = options.maxToken;
    }

    return config;
  }

  private buildFunctionDeclarations(tools: ToolDefinition[]): GeminiFunctionDeclaration[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }

  private mapRole(role: AiProviderMessage['role']): GeminiRole {
    return role === 'assistant' || role === 'model' ? 'model' : 'user';
  }

  private extractTextContent(data: GeminiResponseData): string {
    const parts = this.getResponseParts(data);
    const textParts = parts.filter((part) => typeof part.text === 'string').map((part) => part.text ?? '');

    return textParts.join('');
  }

  private extractToolCalls(data: GeminiResponseData): ToolCall[] {
    const parts = this.getResponseParts(data);
    const requestTimestamp = Date.now();

    return parts
      .filter((part): part is GeminiResponsePart & { functionCall: NonNullable<GeminiResponsePart['functionCall']> } =>
        Boolean(part.functionCall)
      )
      .map((part, index) => {
        return {
          id: `gemini-${requestTimestamp}-${index}`,
          name: part.functionCall.name,
          arguments: part.functionCall.args ?? {},
        };
      });
  }

  private getResponseParts(data: GeminiResponseData): GeminiResponsePart[] {
    return data?.candidates?.[0]?.content?.parts ?? [];
  }
}
