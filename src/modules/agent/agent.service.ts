import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProvider, AiProviderMessage } from './ai-providers/ai-provider.interface';

export const AI_PROVIDER_TOKEN = 'AI_PROVIDER';
export const AI_PROVIDER_REGISTRY = 'AI_PROVIDER_REGISTRY';

export type AgentProviderName = 'openai' | 'gemini';

export interface AiProviderRegistry {
  openai: AiProvider;
  gemini: AiProvider;
}

export interface AskAgentInput {
  message: string;
  provider?: string;
  model?: string;
}

export interface AskAgentOutput {
  response: string;
}

@Injectable()
export class AgentService {
  constructor(
    @Inject(AI_PROVIDER_REGISTRY)
    private readonly providerRegistry: AiProviderRegistry,
    private readonly config: ConfigService
  ) {}

  async askAgent(input: AskAgentInput): Promise<AskAgentOutput> {
    const defaultProvider = this.config.get<string>('AI_PROVIDER', 'openai') as AgentProviderName;
    const providerName = (input.provider ?? defaultProvider) as AgentProviderName;
    const provider = this.providerRegistry[providerName];
    if (!provider) {
      throw new Error(`Unknown provider: ${input.provider}. Use "openai" or "gemini".`);
    }

    const messages: AiProviderMessage[] = [{ role: 'user', content: input.message }];

    const result = await provider.chat(messages, {
      model: input.model,
      temperature: 0.7,
      maxToken: 2048,
    });

    const lastMessage = result[result.length - 1];
    const response = lastMessage?.role === 'assistant' || lastMessage?.role === 'model' ? lastMessage.content : '';

    return { response: response || '(No response from AI)' };
  }
}
