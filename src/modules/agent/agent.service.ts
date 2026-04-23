import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AgentCanvasService } from './services/agent-canvas.service';
import { AgentChatService } from './services/agent-chat.service';
import {
  AskAgentInput,
  AskAgentOutput,
  AskAgentStreamChunk,
  CanvasSessionPreviewInput,
  CanvasWriteInput,
} from './shared/agent.types';

@Injectable()
export class AgentService {
  constructor(
    private readonly chatService: AgentChatService,
    private readonly canvasService: AgentCanvasService
  ) {}

  askAgent(input: AskAgentInput): Promise<AskAgentOutput> {
    return this.chatService.askAgent(input);
  }

  askAgentStream(input: AskAgentInput): Observable<AskAgentStreamChunk> {
    return this.chatService.askAgentStream(input);
  }

  canvasWriteStream(input: CanvasWriteInput): Observable<AskAgentStreamChunk> {
    return this.canvasService.canvasWriteStream(input);
  }

  canvasSessionPreviewStream(input: CanvasSessionPreviewInput): Observable<AskAgentStreamChunk> {
    return this.canvasService.canvasSessionPreviewStream(input);
  }

  applyCanvasAction(name: string, args: Record<string, unknown>): Promise<unknown> {
    return this.canvasService.applyCanvasAction(name, args);
  }

  canvasWriteStreamLegacy(input: CanvasWriteInput): Observable<AskAgentStreamChunk> {
    return this.canvasService.canvasWriteStreamLegacy(input);
  }
}

export {
  AskAgentInput,
  AskAgentOutput,
  AskAgentStreamChunk,
  CanvasSessionPreviewInput,
  CanvasWriteInput,
} from './shared/agent.types';
