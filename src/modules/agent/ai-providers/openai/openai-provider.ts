import axios from 'axios';
import { AiProvider, AiProviderMessage, AiProviderOptions } from '../ai-provider.interface';
import { OpenaiAdapter } from '../../adapters/openai/openai-adapter';

export class OpenaiProvider implements AiProvider {
  readonly name = 'openai';
  readonly model: string;

  private adapter = new OpenaiAdapter();

  constructor(model: string) {
    this.model = model;
  }

  async chat(messages: AiProviderMessage[], options: AiProviderOptions) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('Key API is not configured');

    const url = 'https://api.openai.com/v1/chat/completions';

    const payload = {
      model: options?.model ?? this.model,
      ...this.adapter.toRequest(messages, options),
    };

    const { data } = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    const content = this.adapter.fromResponse(data);

    return [...messages, { role: 'assistant' as const, content }];
  }
}
