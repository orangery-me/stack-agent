import { Controller } from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { Observable } from 'rxjs';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { AgentService } from './agent.service';
import { AskAgentStreamChunk } from './shared/agent.types';
import { AiChatSessionService } from '../ai-chat/ai-chat-session.service';

// ---- Request/Response interfaces matching the proto ----

interface AskAgentRequest {
  message: string;
  provider?: string;
  model?: string;
}

interface AskAgentResponse {
  response: string;
}

interface UserRequest {
  userId: string;
}

interface CreateSessionRequest {
  userId: string;
  title?: string;
}

interface UpdateSessionRequest {
  userId: string;
  sessionId: string;
  title: string;
}

interface GetSessionMessagesRequest {
  userId: string;
  sessionId: string;
  page?: number;
  size?: number;
}

interface SendMessageRequest {
  userId: string;
  sessionId: string;
  message: string;
  provider?: string;
  model?: string;
}

interface CanvasWriteRequest {
  canvasId?: string;
  canvasContent: string;
  userRequest: string;
  provider?: string;
  model?: string;
}

interface CanvasSessionMessageRequest {
  userId: string;
  sessionId: string;
  canvasId?: string;
  canvasContent?: string;
  message: string;
  provider?: string;
  model?: string;
}

interface CanvasApplyActionRequest {
  canvasId?: string;
  actionName?: string;
  actionArgsJson?: string;
}

// ---- Controller ----

@Controller()
export class AgentGrpcController {
  constructor(
    private readonly agentService: AgentService,
    private readonly sessionService: AiChatSessionService
  ) {}

  // ---- Legacy ----

  @GrpcMethod('AgentService', 'AskAgent')
  async askAgent(data: AskAgentRequest): Promise<AskAgentResponse> {
    if (!data?.message?.trim()) {
      throw new RpcException({ code: GrpcStatus.INVALID_ARGUMENT, message: 'message is required' });
    }
    try {
      const result = await this.agentService.askAgent({
        message: data.message.trim(),
        provider: data.provider?.trim() || undefined,
        model: data.model?.trim() || undefined,
      });
      return { response: result.response ?? '' };
    } catch (err: any) {
      console.error('Agent request failed:', err);
      throw new RpcException({ code: GrpcStatus.INTERNAL, message: err?.message ?? 'Agent request failed' });
    }
  }

  @GrpcMethod('AgentService', 'AskAgentStream')
  askAgentStream(data: AskAgentRequest): Observable<AskAgentStreamChunk> {
    if (!data?.message?.trim()) {
      throw new RpcException({ code: GrpcStatus.INVALID_ARGUMENT, message: 'message is required' });
    }
    return this.agentService.askAgentStream({
      message: data.message.trim(),
      provider: data.provider?.trim() || undefined,
      model: data.model?.trim() || undefined,
    });
  }

  // ---- Session management ----

  @GrpcMethod('AgentService', 'GetOrCreateActiveSession')
  async getOrCreateActiveSession(data: UserRequest) {
    this.requireUserId(data.userId);
    try {
      const session = await this.sessionService.getOrCreateActiveSession(data.userId);
      return this.sessionService.serializeSession(session);
    } catch (err: any) {
      throw new RpcException({ code: GrpcStatus.INTERNAL, message: err?.message });
    }
  }

  @GrpcMethod('AgentService', 'ListSessions')
  async listSessions(data: UserRequest) {
    this.requireUserId(data.userId);
    try {
      const sessions = await this.sessionService.listSessions(data.userId);
      return { sessions: sessions.map((s) => this.sessionService.serializeSession(s)) };
    } catch (err: any) {
      throw new RpcException({ code: GrpcStatus.INTERNAL, message: err?.message });
    }
  }

  @GrpcMethod('AgentService', 'UpdateSession')
  async updateSession(data: UpdateSessionRequest) {
    this.requireUserId(data.userId);
    this.requireSessionId(data.sessionId);
    if (!data.title?.trim()) {
      throw new RpcException({ code: GrpcStatus.INVALID_ARGUMENT, message: 'title is required' });
    }
    const session = await this.sessionService.updateSessionTitle(data.userId, data.sessionId, data.title);
    if (!session) {
      throw new RpcException({ code: GrpcStatus.NOT_FOUND, message: 'Session not found' });
    }
    return this.sessionService.serializeSession(session);
  }

  @GrpcMethod('AgentService', 'CreateSession')
  async createSession(data: CreateSessionRequest) {
    this.requireUserId(data.userId);
    try {
      const session = await this.sessionService.createSession(data.userId, data.title);
      return this.sessionService.serializeSession(session);
    } catch (err: any) {
      throw new RpcException({ code: GrpcStatus.INTERNAL, message: err?.message });
    }
  }

  // ---- Messages ----

  @GrpcMethod('AgentService', 'GetSessionMessages')
  async getSessionMessages(data: GetSessionMessagesRequest) {
    this.requireUserId(data.userId);
    if (!data.sessionId) {
      throw new RpcException({ code: GrpcStatus.INVALID_ARGUMENT, message: 'sessionId is required' });
    }
    const session = await this.sessionService.getSessionForUser(data.userId, data.sessionId);
    if (!session) {
      throw new RpcException({ code: GrpcStatus.NOT_FOUND, message: 'Session not found' });
    }
    const result = await this.sessionService.getMessages(data.sessionId, data.page || 1, data.size || 50);
    return {
      messages: result.messages.map((m) => this.sessionService.serializeMessage(m)),
      total: result.total,
      hasMore: result.hasMore,
    };
  }

  // ---- Send with session context ----

  @GrpcMethod('AgentService', 'SendMessage')
  async sendMessage(data: SendMessageRequest) {
    this.requireUserId(data.userId);
    this.requireSessionId(data.sessionId);
    if (!data.message?.trim()) {
      throw new RpcException({ code: GrpcStatus.INVALID_ARGUMENT, message: 'message is required' });
    }

    const session = await this.sessionService.getSessionForUser(data.userId, data.sessionId);
    if (!session) {
      throw new RpcException({ code: GrpcStatus.NOT_FOUND, message: 'Session not found' });
    }

    try {
      await this.sessionService.appendUserMessage(data.sessionId, data.message.trim());

      const result = await this.agentService.askAgent({
        message: data.message.trim(),
        provider: data.provider?.trim() || undefined,
        model: data.model?.trim() || undefined,
        sessionId: data.sessionId,
      });

      const assistantMsg = await this.sessionService.appendAssistantMessage(data.sessionId, result.response);

      return {
        response: result.response,
        assistantMessage: this.sessionService.serializeMessage(assistantMsg),
      };
    } catch (err: any) {
      console.error('SendMessage failed:', err);
      throw new RpcException({ code: GrpcStatus.INTERNAL, message: err?.message });
    }
  }

  @GrpcMethod('AgentService', 'SendMessageStream')
  sendMessageStream(data: SendMessageRequest): Observable<AskAgentStreamChunk> {
    this.requireUserId(data.userId);
    this.requireSessionId(data.sessionId);
    if (!data.message?.trim()) {
      throw new RpcException({ code: GrpcStatus.INVALID_ARGUMENT, message: 'message is required' });
    }

    return new Observable((subscriber) => {
      (async () => {
        const session = await this.sessionService.getSessionForUser(data.userId, data.sessionId);
        if (!session) {
          subscriber.error(new RpcException({ code: GrpcStatus.NOT_FOUND, message: 'Session not found' }));
          return;
        }

        // Persist the user message
        await this.sessionService.appendUserMessage(data.sessionId, data.message.trim());

        let fullResponse = '';

        const stream$ = this.agentService.askAgentStream({
          message: data.message.trim(),
          provider: data.provider?.trim() || undefined,
          model: data.model?.trim() || undefined,
          sessionId: data.sessionId,
        });

        stream$.subscribe({
          next: (chunk) => {
            if (!chunk.done) {
              fullResponse += chunk.chunk;
            }
            subscriber.next(chunk);
          },
          complete: async () => {
            // Persist the final assistant reply
            if (fullResponse) {
              await this.sessionService.appendAssistantMessage(data.sessionId, fullResponse).catch(console.error);
            }
            subscriber.complete();
          },
          error: (err) => subscriber.error(err),
        });
      })().catch((err) => subscriber.error(err));
    });
  }

  // ---- Canvas Write ----

  @GrpcMethod('AgentService', 'CanvasWrite')
  canvasWrite(data: CanvasWriteRequest): Observable<AskAgentStreamChunk> {
    if (!data?.userRequest?.trim()) {
      throw new RpcException({ code: GrpcStatus.INVALID_ARGUMENT, message: 'userRequest is required' });
    }
    if (!data?.canvasId?.trim()) {
      throw new RpcException({ code: GrpcStatus.INVALID_ARGUMENT, message: 'canvasId is required' });
    }
    return this.agentService.canvasWriteStream({
      canvasId: data.canvasId.trim(),
      canvasContent: data.canvasContent ?? '',
      userRequest: data.userRequest.trim(),
      provider: data.provider?.trim() || undefined,
      model: data.model?.trim() || undefined,
    });
  }

  @GrpcMethod('AgentService', 'CanvasSessionMessageStream')
  canvasSessionMessageStream(data: CanvasSessionMessageRequest): Observable<AskAgentStreamChunk> {
    this.requireUserId(data.userId);
    this.requireSessionId(data.sessionId);
    if (!data?.message?.trim()) {
      throw new RpcException({ code: GrpcStatus.INVALID_ARGUMENT, message: 'message is required' });
    }
    if (!data?.canvasId?.trim()) {
      throw new RpcException({ code: GrpcStatus.INVALID_ARGUMENT, message: 'canvasId is required' });
    }

    return new Observable((subscriber) => {
      (async () => {
        const session = await this.sessionService.getSessionForUser(data.userId, data.sessionId);
        if (!session) {
          subscriber.error(new RpcException({ code: GrpcStatus.NOT_FOUND, message: 'Session not found' }));
          return;
        }

        await this.sessionService.appendUserMessage(data.sessionId, data.message.trim());
        let assistantSummary = '';
        let actionTrace = '';

        const stream$ = this.agentService.canvasSessionPreviewStream({
          canvasId: data.canvasId.trim(),
          canvasContent: data.canvasContent ?? '',
          userRequest: data.message.trim(),
          provider: data.provider?.trim() || undefined,
          model: data.model?.trim() || undefined,
          sessionId: data.sessionId,
        });

        stream$.subscribe({
          next: (chunk) => {
            if (!chunk.done && chunk.chunk) {
              try {
                const payload = JSON.parse(chunk.chunk) as { type?: string; content?: string; actions?: unknown[] };
                if (payload.type === 'assistant' && payload.content) {
                  assistantSummary += payload.content;
                } else if (payload.type === 'actions' && payload.actions) {
                  actionTrace = JSON.stringify(payload.actions);
                }
              } catch {
                // Ignore non-json event payloads
              }
            }
            subscriber.next(chunk);
          },
          complete: async () => {
            const finalMessage =
              assistantSummary.trim() || 'I did not find any changes that are suitable to propose on this canvas.';
            const traceSuffix = actionTrace ? `\n\n[ACTIONS]\n${actionTrace}` : '';
            await this.sessionService
              .appendAssistantMessage(data.sessionId, `${finalMessage}${traceSuffix}`)
              .catch(console.error);
            subscriber.complete();
          },
          error: (err) => subscriber.error(err),
        });
      })().catch((err) => subscriber.error(err));
    });
  }

  @GrpcMethod('AgentService', 'CanvasApplyAction')
  async canvasApplyAction(data: CanvasApplyActionRequest) {
    if (!data?.canvasId?.trim()) {
      throw new RpcException({ code: GrpcStatus.INVALID_ARGUMENT, message: 'canvasId is required' });
    }
    if (!data?.actionName?.trim()) {
      throw new RpcException({ code: GrpcStatus.INVALID_ARGUMENT, message: 'actionName is required' });
    }

    try {
      const parsedArgs = data.actionArgsJson?.trim() ? JSON.parse(data.actionArgsJson) : {};
      const args = {
        ...(parsedArgs as Record<string, unknown>),
        canvas_id: data.canvasId.trim(),
      };
      const result = await this.agentService.applyCanvasAction(data.actionName.trim(), args);
      return {
        ok: true,
        resultJson: JSON.stringify(result),
        error: '',
      };
    } catch (err: any) {
      return {
        ok: false,
        resultJson: '',
        error: err?.message ?? 'Failed to apply action',
      };
    }
  }

  // ---- Helpers ----

  private requireUserId(userId: string) {
    if (!userId?.trim()) {
      throw new RpcException({ code: GrpcStatus.INVALID_ARGUMENT, message: 'userId is required' });
    }
  }

  private requireSessionId(sessionId: string) {
    if (!sessionId?.trim()) {
      throw new RpcException({ code: GrpcStatus.INVALID_ARGUMENT, message: 'sessionId is required' });
    }
  }
}
