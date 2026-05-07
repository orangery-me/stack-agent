import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AgentCanvasService } from './services/agent-canvas.service';
import { AgentChatService } from './services/agent-chat.service';
import { AgentProviderService } from './services/agent-provider.service';
import { AgentTaskService } from './services/agent-task.service';
import { AI_PROVIDER_REGISTRY } from './shared/agent.constants';
import { AgentService } from './agent.service';
import { AiProviderRegistry } from './shared/agent.types';
import { AgentGrpcController } from './agent-grpc.controller';
import { OpenaiProvider } from './ai-providers/openai/openai-provider';
import { GeminiProvider } from './ai-providers/gemini/gemini-provider';
import { AiChatModule } from '../ai-chat/ai-chat.module';
import { McpClientModule } from '../mcp-client/mcp-client.module';

@Module({
  imports: [ConfigModule, AiChatModule, McpClientModule],
  controllers: [AgentGrpcController],
  providers: [
    AgentService,
    AgentProviderService,
    AgentChatService,
    AgentCanvasService,
    AgentTaskService,
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
