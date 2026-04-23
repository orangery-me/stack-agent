import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AiChatSessionService } from '../../ai-chat/ai-chat-session.service';
import { AiProviderMessage } from '../ai-providers/ai-provider.interface';
import { AskAgentInput, AskAgentOutput, AskAgentStreamChunk } from '../shared/agent.types';
import { createAsyncStream, pipeTextEmitterToSubscriber } from '../utils/agent-stream.utils';
import { AgentProviderService } from './agent-provider.service';

@Injectable()
export class AgentChatService {
  constructor(
    private readonly providerService: AgentProviderService,
    private readonly aiChatSessionService: AiChatSessionService
  ) {}

  async askAgent(input: AskAgentInput): Promise<AskAgentOutput> {
    const { provider } = this.providerService.resolveProvider(input.provider);
    const messages = await this.buildMessages(input);

    const result = await provider.chat(messages, {
      model: input.model,
      temperature: 0.7,
      maxToken: 2048,
    });

    const lastMessage = result[result.length - 1];
    const response = lastMessage?.role === 'assistant' || lastMessage?.role === 'model' ? lastMessage.content : '';

    return { response: response || '(No response from AI)' };
  }

  askAgentStream(input: AskAgentInput): Observable<AskAgentStreamChunk> {
    return createAsyncStream(async (subscriber) => {
      const { provider } = this.providerService.resolveProvider(input.provider);

      if (!provider.chatStream) {
        subscriber.error(new Error('Provider does not support streaming.'));
        return;
      }

      const messages = await this.buildMessages(input);
      const emitter = provider.chatStream(messages, {
        model: input.model,
        temperature: 0.7,
      });

      pipeTextEmitterToSubscriber(emitter, subscriber);
    });
  }

  private async buildMessages(input: AskAgentInput): Promise<AiProviderMessage[]> {
    if (!input.sessionId) {
      return [{ role: 'user', content: input.message }];
    }

    const messages = await this.aiChatSessionService.buildContextMessages(input.sessionId);
    const lastMessage = messages[messages.length - 1];

    if (!lastMessage || lastMessage.content !== input.message) {
      messages.push({ role: 'user', content: input.message });
    }

    return messages;
  }
}
