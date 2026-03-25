import { AiProviderMessage, AiProviderOptions } from '../../ai-providers/ai-provider.interface';
import { MessageAdapter } from '../message-adapter';

export class OpenaiAdapter implements MessageAdapter<any, any> {
  toRequest(messages: AiProviderMessage[], options?: AiProviderOptions) {
    return {
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxToken,
      stream: options?.stream ?? false,
    };
  }

  fromResponse(response: any): string {
    return response?.choices?.[0]?.message?.content ?? '';
  }
}
