import { AiProvider } from '../ai-providers/ai-provider.interface';

export type AgentProviderName = 'openai' | 'gemini';

export interface AiProviderRegistry {
  openai: AiProvider;
  gemini: AiProvider;
}

export interface AskAgentInput {
  message: string;
  provider?: string;
  model?: string;
  /** If provided, messages from this session will be used as context */
  sessionId?: string;
}

export interface CanvasWriteInput {
  canvasId: string;
  canvasContent: string;
  userRequest: string;
  provider?: string;
  model?: string;
}

export interface CanvasSessionPreviewInput {
  canvasId: string;
  canvasContent: string;
  userRequest: string;
  provider?: string;
  model?: string;
  sessionId: string;
}

export interface AskAgentOutput {
  response: string;
}

export interface AskAgentStreamChunk {
  chunk: string;
  done: boolean;
}
