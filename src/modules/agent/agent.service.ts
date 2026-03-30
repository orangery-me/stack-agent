import { Inject, Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { AiProvider, AiProviderMessage } from './ai-providers/ai-provider.interface';
import { AiChatSessionService } from '../ai-chat/ai-chat-session.service';

export const AI_PROVIDER_TOKEN = 'AI_PROVIDER';
export const AI_PROVIDER_REGISTRY = 'AI_PROVIDER_REGISTRY';

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
  canvasContent: string;
  userRequest: string;
  provider?: string;
  model?: string;
}

export interface AskAgentOutput {
  response: string;
}

export interface AskAgentStreamChunk {
  chunk: string;
  done: boolean;
}

@Injectable()
export class AgentService {
  constructor(
    @Inject(AI_PROVIDER_REGISTRY)
    private readonly providerRegistry: AiProviderRegistry,
    private readonly config: ConfigService,
    private readonly aiChatSessionService: AiChatSessionService,
  ) {}

  private resolveProvider(providerName?: string): { provider: AiProvider; name: AgentProviderName } {
    const defaultProvider = this.config.get<string>('AI_PROVIDER', 'openai') as AgentProviderName;
    const name = ((providerName ?? defaultProvider) as AgentProviderName);
    const provider = this.providerRegistry[name];
    if (!provider) {
      throw new Error(`Unknown provider: "${providerName}". Use "openai" or "gemini".`);
    }
    return { provider, name };
  }

  async askAgent(input: AskAgentInput): Promise<AskAgentOutput> {
    const { provider } = this.resolveProvider(input.provider);

    let messages: AiProviderMessage[];
    if (input.sessionId) {
      messages = await this.aiChatSessionService.buildContextMessages(input.sessionId);
      // Append the new user message (not yet saved — it was saved before calling this)
      if (messages.length === 0 || messages[messages.length - 1]?.content !== input.message) {
        messages.push({ role: 'user', content: input.message });
      }
    } else {
      messages = [{ role: 'user', content: input.message }];
    }

    const result = await provider.chat(messages, {
      model: input.model,
      temperature: 0.7,
      maxToken: 2048,
    });

    const lastMessage = result[result.length - 1];
    const response = lastMessage?.role === 'assistant' || lastMessage?.role === 'model' ? lastMessage.content : '';

    return { response: response || '(No response from AI)' };
  }

  canvasWriteStream(input: CanvasWriteInput): Observable<AskAgentStreamChunk> {
    return new Observable(subscriber => {
      const { provider } = this.resolveProvider(input.provider);

      if (!provider.chatStream) {
        subscriber.error(new Error('Provider does not support streaming.'));
        return;
      }

      const canvasContext = input.canvasContent?.trim()
        ? `Dưới đây là nội dung hiện tại của canvas:\n---\n${input.canvasContent}\n---\n`
        : 'Canvas hiện tại còn trống.\n';

      const systemContent =
        `Bạn là AI writing assistant tích hợp trong canvas editor. ` +
        canvasContext +
        `Hãy viết nội dung bổ sung theo yêu cầu của user. ` +
        `Trả về plain text, không dùng markdown heading, không thêm lời dẫn hay giải thích — chỉ trả về nội dung cần thêm vào.`;

      const messages: AiProviderMessage[] = [
        { role: 'system', content: systemContent },
        { role: 'user', content: input.userRequest },
      ];

      const emitter = provider.chatStream!(messages, {
        model: input.model,
        temperature: 0.7,
      });

      const onToken = (token: string) => subscriber.next({ chunk: token, done: false });
      const onEnd = () => {
        subscriber.next({ chunk: '', done: true });
        subscriber.complete();
      };
      const onError = (err: Error) => subscriber.error(err);

      emitter.on('token', onToken);
      emitter.on('end', onEnd);
      emitter.on('error', onError);

      subscriber.add(() => {
        emitter.removeListener('token', onToken);
        emitter.removeListener('end', onEnd);
        emitter.removeListener('error', onError);
      });
    });
  }

  askAgentStream(input: AskAgentInput): Observable<AskAgentStreamChunk> {
    return new Observable(subscriber => {
      const { provider } = this.resolveProvider(input.provider);

      if (!provider.chatStream) {
        subscriber.error(new Error(`Provider does not support streaming.`));
        return;
      }

      (async () => {
        let messages: AiProviderMessage[];
        if (input.sessionId) {
          messages = await this.aiChatSessionService.buildContextMessages(input.sessionId);
          if (messages.length === 0 || messages[messages.length - 1]?.content !== input.message) {
            messages.push({ role: 'user', content: input.message });
          }
        } else {
          messages = [{ role: 'user', content: input.message }];
        }

        const emitter = provider.chatStream!(messages, {
          model: input.model,
          temperature: 0.7,
        });

        const onToken = (token: string) => subscriber.next({ chunk: token, done: false });
        const onEnd = () => {
          subscriber.next({ chunk: '', done: true });
          subscriber.complete();
        };
        const onError = (err: Error) => subscriber.error(err);

        emitter.on('token', onToken);
        emitter.on('end', onEnd);
        emitter.on('error', onError);

        subscriber.add(() => {
          emitter.removeListener('token', onToken);
          emitter.removeListener('end', onEnd);
          emitter.removeListener('error', onError);
        });
      })().catch(err => subscriber.error(err));
    });
  }
}
