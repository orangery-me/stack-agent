import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AgentService, AI_PROVIDER_REGISTRY, AiProviderRegistry } from './agent.service';
import { AgentGrpcController } from './agent-grpc.controller';
import { OpenaiProvider } from './ai-providers/openai/openai-provider';
import { GeminiProvider } from './ai-providers/gemini/gemini-provider';
import { AiChatModule } from '../ai-chat/ai-chat.module';

@Module({
  imports: [ConfigModule, AiChatModule],
  controllers: [AgentGrpcController],
  providers: [
    AgentService,
    {
      provide: 'OPENAI_PROVIDER',
      useFactory: (config: ConfigService) => {
        const model = config.get<string>('OPENAI_MODEL', 'gpt-5.3-codex');
        return new OpenaiProvider(model);
      },
      inject: [ConfigService],
    },
    {
      provide: 'GEMINI_PROVIDER',
      useFactory: (config: ConfigService) => {
        const model = config.get<string>('GEMINI_MODEL', 'gemini-pro');
        return new GeminiProvider(model);
      },
      inject: [ConfigService],
    },
    {
      provide: AI_PROVIDER_REGISTRY,
      useFactory: (openai: OpenaiProvider, gemini: GeminiProvider): AiProviderRegistry => ({
        openai,
        gemini,
      }),
      inject: ['OPENAI_PROVIDER', 'GEMINI_PROVIDER'],
    },
  ],
  exports: [AgentService],
})
export class AgentModule {}
