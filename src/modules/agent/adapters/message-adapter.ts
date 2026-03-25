import { AiProviderMessage, AiProviderOptions } from '../ai-providers/ai-provider.interface';

export interface MessageAdapter<Req = any, Res = any> {
  toRequest(messages: AiProviderMessage[], options?: AiProviderOptions): Req;

  fromResponse(response: Res): string;
}
