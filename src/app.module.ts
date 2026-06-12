import { ClassSerializerInterceptor, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { KeepAliveModule } from './modules/keep-alive/keep-alive.module';
import { AgentModule } from './modules/agent/agent.module';
import { MongoModule } from './config/mongo.module';
import { AiChatModule } from './modules/ai-chat/ai-chat.module';
import * as Joi from 'joi';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        // gRPC server port for this service
        GRPC_PORT: Joi.number().default(50052),

        // Node environment
        NODE_ENV: Joi.string().valid('development', 'staging', 'production').default('development'),

        // MongoDB
        MONGODB_URI: Joi.string().required(),

        // Features
        ENABLE_CORS: Joi.boolean().default(true),

        // Keep-alive
        KEEP_ALIVE_ENABLED: Joi.boolean().default(true),
        KEEP_ALIVE_INTERVAL: Joi.number().default(30),

        // AI provider: 'openai' | 'gemini' | 'deepseek'. Each requires its own API key.
        AI_PROVIDER: Joi.string().valid('openai', 'gemini', 'deepseek').default('deepseek'),
        OPENAI_MODEL: Joi.string().default('gpt-5.3-codex'),
        GEMINI_MODEL: Joi.string().default('gemini-pro'),
        DEEPSEEK_MODEL: Joi.string().default('deepseek-v4-pro'),

        // MCP server URL (stack-api/mcp endpoint)
        MCP_URL: Joi.string().default('http://127.0.0.1:8105/api/mcp'),

        // Optional
        LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
        TZ: Joi.string().default('Asia/Ho_Chi_Minh'),
      }),
    }),
    MongoModule,
    AiChatModule,
    KeepAliveModule,
    AgentModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: ClassSerializerInterceptor,
    },
  ],
})
export class AppModule {}
