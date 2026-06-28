import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AiChatSessionService } from '../../ai-chat/ai-chat-session.service';
import { AiProviderMessage } from '../ai-providers/ai-provider.interface';
import { GENERAL_AGENT_SYSTEM_PROMPT } from '../prompts/agent-chat.prompts';
import { AskAgentInput, AskAgentOutput, AskAgentStreamChunk } from '../shared/agent.types';
import { createAsyncStream, pipeTextEmitterToSubscriber } from '../utils/agent-stream.utils';
import { AgentCoordinationService } from './agent-coordination.service';
import { AgentProviderService } from './agent-provider.service';

@Injectable()
export class AgentChatService {
  constructor(
    private readonly providerService: AgentProviderService,
    private readonly aiChatSessionService: AiChatSessionService,
    private readonly coordinationService: AgentCoordinationService
  ) {}

  async askAgent(input: AskAgentInput): Promise<AskAgentOutput> {
    const { provider } = this.providerService.resolveProvider(input.provider);
    if (this.coordinationService.shouldHandle(input)) {
      const response = await this.coordinationService.ask(input);
      return { response };
    }

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

      if (this.coordinationService.shouldHandle(input)) {
        const coordination$ = this.coordinationService.stream(input);
        coordination$.subscribe({
          next: (chunk) => subscriber.next(chunk),
          complete: () => subscriber.complete(),
          error: (error) => subscriber.error(error),
        });
        return;
      }

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
    const systemMessage: AiProviderMessage = {
      role: 'system',
      content: GENERAL_AGENT_SYSTEM_PROMPT,
    };

    if (!input.sessionId) {
      return [systemMessage, { role: 'user', content: input.message }];
    }

    const messages = (await this.aiChatSessionService.buildContextMessages(input.sessionId)).filter(
      (message) => message.role !== 'system'
    );
    const lastMessage = messages[messages.length - 1];

    if (!lastMessage || lastMessage.content !== input.message) {
      messages.push({ role: 'user', content: input.message });
    }

    return [systemMessage, ...messages];
  }
}
