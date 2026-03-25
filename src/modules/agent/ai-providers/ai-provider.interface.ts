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

export interface AiProvider {
  readonly name: string;
  readonly model: string;

  chat(messages: AiProviderMessage[], options: AiProviderOptions): Promise<AiProviderMessage[]>;
}
