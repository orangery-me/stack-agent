import axios from 'axios';
import { EventEmitter } from 'events';
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

    const url = 'https://api.openai.com/v1/responses';

    const payload = {
      model: options?.model ?? this.model,
      input: messages.map((m) => ({
        role: m.role,
        content: [
          {
            type: 'text',
            text: m.content,
          },
        ],
      })),

      stream: false,
    };

    const { data } = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    const content = data?.output?.[0]?.content?.[0]?.text || '';

    return [
      ...messages,
      {
        role: 'assistant' as const,
        content,
      },
    ];
  }

  chatStream(messages: AiProviderMessage[], options: AiProviderOptions): NodeJS.EventEmitter {
    const emitter = new EventEmitter();

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      process.nextTick(() => emitter.emit('error', new Error('Key API is not configured')));
      return emitter;
    }

    const url = 'https://api.openai.com/v1/responses';

    const payload = {
      model: options?.model ?? this.model,
      input: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      stream: true,
    };

    (async () => {
      try {
        const response = await axios.post(url, payload, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          responseType: 'stream',
        });

        let buffer = '';

        response.data.on('data', (raw: Buffer) => {
          buffer += raw.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;

            const jsonStr = trimmed.slice(6).trim();

            if (jsonStr === '[DONE]') {
              emitter.emit('end');
              return;
            }

            try {
              const parsed = JSON.parse(jsonStr);

              if (parsed.type === 'response.output_text.delta') {
                emitter.emit('token', parsed.delta);
              }

              if (parsed.type === 'response.completed') {
                emitter.emit('end');
              }
            } catch (e) {
              console.error('Parse error:', e);
            }
          }
        });

        response.data.on('end', () => emitter.emit('end'));
        response.data.on('error', (err: Error) => emitter.emit('error', err));
      } catch (err: any) {
        emitter.emit('error', err);
      }
    })();

    return emitter;
  }
}
