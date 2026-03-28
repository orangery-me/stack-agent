import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AiChatSession, AiChatSessionDocument } from './schemas/ai-chat-session.schema';
import { AiChatMessage, AiChatMessageDocument, MessageRole } from './schemas/ai-chat-message.schema';
import { AiProviderMessage } from '../agent/ai-providers/ai-provider.interface';

const MAX_CONTEXT_MESSAGES = 50;

@Injectable()
export class AiChatSessionService {
  constructor(
    @InjectModel(AiChatSession.name)
    private readonly sessionModel: Model<AiChatSessionDocument>,

    @InjectModel(AiChatMessage.name)
    private readonly messageModel: Model<AiChatMessageDocument>
  ) {}

  async getOrCreateActiveSession(userId: string): Promise<AiChatSessionDocument> {
    const existing = await this.sessionModel.findOne({ userId, isActive: true }).exec();
    if (existing) return existing;

    return this.sessionModel.create({ userId, title: 'New chat', isActive: true });
  }

  async listSessions(userId: string): Promise<AiChatSessionDocument[]> {
    return this.sessionModel.find({ userId }).sort({ createdAt: -1 }).limit(50).exec();
  }

  async createSession(userId: string, title = 'New chat'): Promise<AiChatSessionDocument> {
    // Deactivate current active session
    await this.sessionModel.updateMany({ userId, isActive: true }, { isActive: false, archivedAt: new Date() });
    return this.sessionModel.create({ userId, title, isActive: true });
  }

  async getMessages(
    sessionId: string,
    page = 1,
    size = 50
  ): Promise<{ messages: AiChatMessageDocument[]; total: number; hasMore: boolean }> {
    const id = new Types.ObjectId(sessionId);
    const skip = (page - 1) * size;
    const [messages, total] = await Promise.all([
      this.messageModel.find({ sessionId: id }).sort({ createdAt: 1 }).skip(skip).limit(size).exec(),
      this.messageModel.countDocuments({ sessionId: id }),
    ]);
    return { messages, total, hasMore: skip + messages.length < total };
  }

  async appendUserMessage(sessionId: string, content: string): Promise<AiChatMessageDocument> {
    return this.messageModel.create({
      sessionId: new Types.ObjectId(sessionId),
      role: 'user',
      content,
    });
  }

  async appendAssistantMessage(sessionId: string, content: string): Promise<AiChatMessageDocument> {
    return this.messageModel.create({
      sessionId: new Types.ObjectId(sessionId),
      role: 'assistant',
      content,
    });
  }

  /**
   * Load last N messages as AiProviderMessage[] to pass as context to LLM.
   */
  async buildContextMessages(sessionId: string): Promise<AiProviderMessage[]> {
    const id = new Types.ObjectId(sessionId);
    const messages = await this.messageModel
      .find({ sessionId: id })
      .sort({ createdAt: -1 })
      .limit(MAX_CONTEXT_MESSAGES)
      .exec();

    // Reverse so oldest first for LLM context
    return messages.reverse().map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    }));
  }

  async getSessionForUser(userId: string, sessionId: string): Promise<AiChatSessionDocument | null> {
    return this.sessionModel.findOne({ _id: new Types.ObjectId(sessionId), userId }).exec();
  }

  async updateSessionTitle(userId: string, sessionId: string, title: string): Promise<AiChatSessionDocument | null> {
    return this.sessionModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(sessionId), userId },
        { title: title.trim().slice(0, 100) },
        { new: true }
      )
      .exec();
  }

  serializeSession(session: AiChatSessionDocument) {
    return {
      id: (session._id as Types.ObjectId).toHexString(),
      userId: session.userId,
      title: session.title,
      isActive: session.isActive,
      createdAt: (session as any).createdAt?.toISOString?.() ?? '',
      updatedAt: (session as any).updatedAt?.toISOString?.() ?? '',
    };
  }

  serializeMessage(msg: AiChatMessageDocument) {
    return {
      id: (msg._id as Types.ObjectId).toHexString(),
      sessionId: msg.sessionId.toHexString(),
      role: msg.role as MessageRole,
      content: msg.content,
      createdAt: (msg as any).createdAt?.toISOString?.() ?? '',
    };
  }
}
