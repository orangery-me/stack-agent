import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AiChatMessageDocument = AiChatMessage & Document;

export type MessageRole = 'user' | 'assistant' | 'system';

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'ai_chat_messages' })
export class AiChatMessage {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  sessionId: Types.ObjectId;

  @Prop({ required: true, enum: ['user', 'assistant', 'system'] })
  role: MessageRole;

  @Prop({ required: true })
  content: string;
}

export const AiChatMessageSchema = SchemaFactory.createForClass(AiChatMessage);

AiChatMessageSchema.index({ sessionId: 1, createdAt: 1 });
