import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AiChatSessionDocument = AiChatSession & Document;

@Schema({ timestamps: true, collection: 'ai_chat_sessions' })
export class AiChatSession {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ default: 'New chat' })
  title: string;

  @Prop({ default: true, index: true })
  isActive: boolean;

  @Prop({ default: null })
  archivedAt: Date | null;
}

export const AiChatSessionSchema = SchemaFactory.createForClass(AiChatSession);

// Partial unique index: only one active session per user at a time
AiChatSessionSchema.index(
  { userId: 1, isActive: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);
