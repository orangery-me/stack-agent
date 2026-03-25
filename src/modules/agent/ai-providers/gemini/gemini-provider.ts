import axios from 'axios';
import { AiProvider, AiProviderMessage, AiProviderOptions } from '../ai-provider.interface';
import { GeminiAdapter } from '../../adapters/gemini/gemini-adapter';

export class GeminiProvider implements AiProvider {
  readonly name = 'gemini';
  readonly model: string;

  private adapter = new GeminiAdapter();

  constructor(model: string) {
    this.model = model;
  }

  async chat(messages: AiProviderMessage[], options: AiProviderOptions) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('Key API is not configured');

    const baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
    const model = options?.model ?? this.model;

    const url = `${baseUrl}/${model}:generateContent?key=${apiKey}`;

    const payload = this.adapter.toRequest(messages, options);

    const { data } = await axios.post(url, payload);

    const content = this.adapter.fromResponse(data);

    return [...messages, { role: 'model' as const, content }];
  }
}
