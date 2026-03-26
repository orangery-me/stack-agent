import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiChatSession, AiChatSessionSchema } from './schemas/ai-chat-session.schema';
import { AiChatMessage, AiChatMessageSchema } from './schemas/ai-chat-message.schema';
import { AiChatSessionService } from './ai-chat-session.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AiChatSession.name, schema: AiChatSessionSchema },
      { name: AiChatMessage.name, schema: AiChatMessageSchema },
    ]),
  ],
  providers: [AiChatSessionService],
  exports: [AiChatSessionService],
})
export class AiChatModule {}
