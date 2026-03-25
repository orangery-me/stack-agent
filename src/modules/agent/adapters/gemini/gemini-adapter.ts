import { AiProviderMessage, AiProviderOptions } from '../../ai-providers/ai-provider.interface';
import { MessageAdapter } from '../message-adapter';

export class GeminiAdapter implements MessageAdapter<any, any> {
  toRequest(messages: AiProviderMessage[], options?: AiProviderOptions) {
    return {
      contents: messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : m.role,
        parts: [{ text: m.content }],
      })),
      generationConfig: {
        temperature: options?.temperature ?? 0.7,
        maxOutputTokens: options?.maxToken,
      },
    };
  }

  fromResponse(response: any): string {
    return response?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  }
}
