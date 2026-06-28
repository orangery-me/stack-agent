import { AiProvider } from '../ai-providers/ai-provider.interface';

export type AgentProviderName = 'openai' | 'gemini' | 'deepseek';

export interface AiProviderRegistry {
  openai: AiProvider;
  gemini: AiProvider;
  deepseek: AiProvider;
}

export interface AskAgentInput {
  message: string;
  provider?: string;
  model?: string;
  /** If provided, messages from this session will be used as context */
  sessionId?: string;
  userId?: string;
  workspaceId?: string;
  channelId?: string;
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
  mode?: string;
  selectedContext?: string;
}

export interface AskAgentOutput {
  response: string;
}

export interface AskAgentStreamChunk {
  chunk: string;
  done: boolean;
}

export interface TaskSessionPreviewInput {
  userId: string;
  sessionId: string;
  workspaceId: string;
  channelId?: string;
  taskListId?: string;
  canvasId?: string;
  canvasContent?: string;
  canvasTitle?: string;
  sourceCanvasUrl?: string;
  overallDueDate?: string;
  timezone?: string;
  userRequest: string;
  provider?: string;
  model?: string;
}

export interface TaskApplyActionInput {
  userId: string;
  workspaceId: string;
  channelId?: string;
  taskListId?: string;
  actionName: string;
  actionArgs: Record<string, unknown>;
}

export interface TaskApplyActionStreamInput extends TaskApplyActionInput {
  sessionId: string;
  canvasId?: string;
  canvasContent?: string;
  canvasTitle?: string;
  sourceCanvasUrl?: string;
  overallDueDate?: string;
  timezone?: string;
  provider?: string;
  model?: string;
}
