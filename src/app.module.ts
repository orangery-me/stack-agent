import { ClassSerializerInterceptor, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { KeepAliveModule } from './modules/keep-alive/keep-alive.module';
import { AgentModule } from './modules/agent/agent.module';
import * as Joi from 'joi';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      validationSchema: Joi.object({
        // gRPC server port for this service
        GRPC_PORT: Joi.number().default(50052),

        // Features
        ENABLE_CORS: Joi.boolean().default(true),

        // Keep-alive
        KEEP_ALIVE_ENABLED: Joi.boolean().default(true),
        KEEP_ALIVE_INTERVAL: Joi.number().default(30),

        // AI provider: 'openai' | 'gemini'. OpenAI requires OPENAI_API_KEY, Gemini requires GEMINI_API_KEY
        AI_PROVIDER: Joi.string().valid('openai', 'gemini').default('openai'),
        OPENAI_MODEL: Joi.string().default('gpt-4'),
        GEMINI_MODEL: Joi.string().default('gemini-pro'),

        // Optional
        LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
        TZ: Joi.string().default('Asia/Ho_Chi_Minh'),
      }),
    }),
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
