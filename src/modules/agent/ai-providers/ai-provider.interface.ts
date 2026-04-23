export interface AiProviderMessage {
  role: 'system' | 'user' | 'assistant' | 'model';
  content: string;
}

export interface AiProviderOptions {
  model?: string;
  temperature?: number;
  maxToken?: number;
  stream?: boolean;
}

/** JSON Schema-compatible parameter definition for a single tool property. */
export interface ToolParameterSchema {
  type: string;
  description?: string;
  enum?: string[];
  items?: ToolParameterSchema;
}

/** A single tool that the AI can call. */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameterSchema>;
    required?: string[];
  };
}

/** A tool call returned by the AI. */
export interface ToolCall {
  /** Provider-assigned call ID (used to correlate results). */
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** Result of a chatWithTools call. Exactly one of content/toolCalls will be set. */
export interface ChatWithToolsResult {
  /** Plain text response when the AI decides not to call any tools. */
  content?: string;
  /** One or more tool calls the AI wants to execute. */
  toolCalls?: ToolCall[];
}

export interface AiProvider {
  readonly name: string;
  readonly model: string;

  chat(messages: AiProviderMessage[], options: AiProviderOptions): Promise<AiProviderMessage[]>;
  chatStream?(messages: AiProviderMessage[], options: AiProviderOptions): NodeJS.EventEmitter;

  /**
   * Send messages along with tool definitions and let the AI decide whether to
   * return a plain reply or request one or more tool calls.
   */
  chatWithTools?(
    messages: AiProviderMessage[],
    tools: ToolDefinition[],
    options: AiProviderOptions
  ): Promise<ChatWithToolsResult>;
}
