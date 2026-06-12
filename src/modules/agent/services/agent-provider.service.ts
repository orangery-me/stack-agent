import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AI_PROVIDER_REGISTRY } from '../shared/agent.constants';
import { AiProvider } from '../ai-providers/ai-provider.interface';
import { AgentProviderName, AiProviderRegistry } from '../shared/agent.types';

@Injectable()
export class AgentProviderService {
  constructor(
    @Inject(AI_PROVIDER_REGISTRY)
    private readonly providerRegistry: AiProviderRegistry,
    private readonly config: ConfigService
  ) {}

  resolveProvider(providerName?: string): { provider: AiProvider; name: AgentProviderName } {
    const defaultProvider = this.config.get<string>('AI_PROVIDER', 'deepseek') as AgentProviderName;
    const name = (providerName ?? defaultProvider) as AgentProviderName;
    const provider = this.providerRegistry[name];

    if (!provider) {
      throw new Error(`Unknown provider: "${providerName}". Use "openai", "gemini", or "deepseek".`);
    }

    return { provider, name };
  }
}
