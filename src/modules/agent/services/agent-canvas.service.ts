import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AiChatSessionService } from '../../ai-chat/ai-chat-session.service';
import { CanvasBlockMutation, CanvasSuggestion, McpClientService } from '../../mcp-client/mcp-client.service';
import { AiProviderMessage, ToolDefinition } from '../ai-providers/ai-provider.interface';
import {
  buildCanvasLegacyWritePrompt,
  buildCanvasSummaryPrompt,
  buildCanvasSessionPreviewPrompt,
  buildCanvasWriteSystemPrompt,
} from '../prompts/agent-canvas.prompts';
import { AskAgentStreamChunk, CanvasSessionPreviewInput, CanvasWriteInput } from '../shared/agent.types';
import { createAsyncStream, pipeTextEmitterToSubscriber } from '../utils/agent-stream.utils';
import { AgentProviderService } from './agent-provider.service';

interface ParsedCanvasAction {
  id?: string;
  name: string;
  arguments?: Record<string, unknown>;
  status?: string;
}

type NormalizedCanvasAction = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: string;
};

const CANVAS_TOOLS: ToolDefinition[] = [
  {
    name: 'edit_canvas_blocks',
    description:
      'Create durable pending canvas edit suggestions using stable block IDs. The user will review and accept/reject each suggestion.',
    parameters: {
      type: 'object',
      properties: {
        canvas_id: { type: 'string', description: 'The canvas document ID' },
        mutations: {
          type: 'array',
          description:
            'Ordered mutations. Target existing blocks only by block_id/target_block_id from get_canvas_blocks; never by index.',
          items: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                enum: ['replace_text', 'replace_block', 'insert_before', 'insert_after', 'delete_block'],
              },
              block_id: { type: 'string', description: 'Existing block ID for replace/delete' },
              target_block_id: {
                type: 'string',
                description: 'Optional anchor block ID for insert; omit it for document start/end depending on action',
              },
              new_text: { type: 'string', description: 'Full replacement text for replace_text' },
              new_block: {
                type: 'object',
                properties: {
                  id: { type: 'string', description: 'Optional new stable block ID' },
                  type: {
                    type: 'string',
                    enum: ['paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote', 'codeBlock'],
                  },
                  content: { type: 'string', description: 'Plain text block content' },
                },
              },
            },
            required: ['action'],
          },
        },
      },
      required: ['canvas_id', 'mutations'],
    },
  },
];

@Injectable()
export class AgentCanvasService {
  constructor(
    private readonly providerService: AgentProviderService,
    private readonly aiChatSessionService: AiChatSessionService,
    private readonly mcpClient: McpClientService
  ) {}

  canvasWriteStream(input: CanvasWriteInput): Observable<AskAgentStreamChunk> {
    return createAsyncStream(async (subscriber) => {
      const { provider } = this.providerService.resolveProvider(input.provider);

      if (!provider.chatWithTools) {
        subscriber.next({
          chunk: '[fallback] Provider does not support tool calling, using streaming text mode.\n',
          done: false,
        });

        const legacySubscription = this.canvasWriteStreamLegacy(input).subscribe(subscriber);
        subscriber.add(legacySubscription);
        return;
      }

      subscriber.next({ chunk: 'Reading canvas structure...', done: false });
      const blocksJson = await this.buildCanvasSnapshot(input.canvasId, input.canvasContent, 'canvasWriteStream');

      const messages: AiProviderMessage[] = [
        {
          role: 'system',
          content: buildCanvasWriteSystemPrompt({
            canvasId: input.canvasId,
            blocksJson,
          }),
        },
        { role: 'user', content: input.userRequest },
      ];

      subscriber.next({ chunk: 'AI is analyzing the request...', done: false });

      const maxToolRounds = 10;
      const toolHistory: AiProviderMessage[] = [...messages];

      for (let round = 0; round < maxToolRounds; round++) {
        let result = await provider.chatWithTools(toolHistory, CANVAS_TOOLS, {
          model: input.model,
          temperature: 0.3,
        });

        if (round === 0 && !result.toolCalls?.length) {
          const firstContent = result.content?.trim() ?? '';
          toolHistory.push({
            role: 'assistant',
            content: firstContent || 'No tool call was made.',
          });
          toolHistory.push({
            role: 'user',
            content:
              'You responded without calling edit_canvas_blocks. If the user requested a canvas edit, call edit_canvas_blocks now using block IDs from the canvas JSON. Do not apologize or chat.',
          });
          result = await provider.chatWithTools(toolHistory, CANVAS_TOOLS, {
            model: input.model,
            temperature: 0.1,
          });
          if (!result.toolCalls?.length && !result.content?.trim() && firstContent) {
            result = { content: firstContent };
          }
        }

        if (!result.toolCalls?.length) {
          if (result.content) {
            subscriber.next({ chunk: `\n${result.content}`, done: false });
          }
          break;
        }

        for (const toolCall of result.toolCalls) {
          subscriber.next({
            chunk: `[tool] ${toolCall.name}(${JSON.stringify(toolCall.arguments)})`,
            done: false,
          });

          try {
            const toolResult = await this.executeCanvasTool(toolCall.name, toolCall.arguments ?? {});
            toolHistory.push({
              role: 'assistant',
              content: `Tool call: ${toolCall.name}\nArguments: ${JSON.stringify(toolCall.arguments)}\nResult: ${JSON.stringify(toolResult)}`,
            });
            subscriber.next({ chunk: ' ✓', done: false });
          } catch (error: any) {
            const message = error?.message ?? 'Tool execution failed';
            toolHistory.push({
              role: 'assistant',
              content: `Tool call: ${toolCall.name} failed: ${message}`,
            });
            subscriber.next({ chunk: ` ✗ ${message}`, done: false });
          }
        }

        toolHistory.push({
          role: 'user',
          content: 'Continue if there are more changes, or confirm completion.',
        });
      }

      subscriber.next({ chunk: '', done: true });
      subscriber.complete();
    });
  }

  canvasSessionPreviewStream(input: CanvasSessionPreviewInput): Observable<AskAgentStreamChunk> {
    return createAsyncStream(async (subscriber) => {
      const { provider } = this.providerService.resolveProvider(input.provider);

      if (!provider.chatWithTools) {
        subscriber.next(this.createEventChunk('status', { message: 'Provider does not support tool-calling mode.' }));
        subscriber.next(
          this.createEventChunk('assistant', {
            content:
              'The current provider does not support the action proposal mode for canvas. Please change provider/model.',
          })
        );
        subscriber.next({ chunk: '', done: true });
        subscriber.complete();
        return;
      }

      subscriber.next(this.createEventChunk('status', { message: 'Reading canvas structure...' }));
      const blocksJson = await this.buildCanvasSnapshot(
        input.canvasId,
        input.canvasContent,
        'canvasSessionPreviewStream'
      );

      if (input.mode === 'summary') {
        const messages: AiProviderMessage[] = [
          {
            role: 'system',
            content: buildCanvasSummaryPrompt({
              canvasId: input.canvasId,
              blocksJson,
            }),
          },
          { role: 'user', content: this.buildUserRequestWithSelectedContext(input.userRequest, input.selectedContext) },
        ];

        subscriber.next(this.createEventChunk('status', { message: 'AI is summarizing the canvas...' }));
        const result = await provider.chat(messages, {
          model: input.model,
          temperature: 0.2,
          maxToken: 2048,
        });
        const lastMessage = result[result.length - 1];
        const content =
          lastMessage?.role === 'assistant' || lastMessage?.role === 'model'
            ? lastMessage.content
            : 'I could not generate a summary for this canvas.';
        subscriber.next(this.createEventChunk('assistant', { content }));
        subscriber.next({ chunk: '', done: true });
        subscriber.complete();
        return;
      }

      const history = await this.aiChatSessionService.buildContextMessages(input.sessionId);
      const historyWithoutTail = history.slice(0, Math.max(history.length - 1, 0));
      const messages: AiProviderMessage[] = [
        {
          role: 'system',
          content: buildCanvasSessionPreviewPrompt({
            canvasId: input.canvasId,
            blocksJson,
          }),
        },
        ...historyWithoutTail
          .filter((message) => message.role !== 'system')
          .map((message) => ({
            ...message,
            content: message.role === 'assistant' ? this.stripActionTrace(message.content) : message.content,
          })),
        { role: 'user', content: this.buildUserRequestWithSelectedContext(input.userRequest, input.selectedContext) },
      ];

      subscriber.next(this.createEventChunk('status', { message: 'AI is analyzing the request...' }));

      let result = await provider.chatWithTools(messages, CANVAS_TOOLS, {
        model: input.model,
        temperature: 0.2,
      });

      if (!result.toolCalls?.length) {
        const firstContent = result.content?.trim() ?? '';
        subscriber.next(this.createEventChunk('status', { message: 'AI is preparing concrete canvas edits...' }));
        result = await provider.chatWithTools(
          [
            ...messages,
            { role: 'assistant', content: firstContent || 'No tool call was made.' },
            {
              role: 'user',
              content:
                'You responded without calling edit_canvas_blocks. If the user requested any canvas edit or correction, call edit_canvas_blocks now using exact block IDs. Do not apologize or chat.',
            },
          ],
          CANVAS_TOOLS,
          {
            model: input.model,
            temperature: 0.1,
          },
        );
        if (!result.toolCalls?.length && !result.content?.trim() && firstContent) {
          result = { content: firstContent };
        }
      }

      const fallbackParsed = this.extractActionsFromContent(result.content);
      const actionSeed =
        result.toolCalls && result.toolCalls.length > 0
          ? await Promise.all(
              result.toolCalls.map(async (toolCall, index) => {
                const actionId = `${Date.now()}-${index}`;
                const args = {
                  ...(toolCall.arguments ?? {}),
                  canvas_id: input.canvasId,
                };
                const toolResult = await this.executeCanvasTool(toolCall.name, args, {
                  messageId: input.sessionId,
                  actionId,
                });
                const suggestions = this.extractSuggestions(toolResult);
                return {
                  id: actionId,
                  name: toolCall.name,
                  arguments: {
                    ...(toolCall.arguments ?? {}),
                    canvas_id: input.canvasId,
                    suggestions,
                  },
                  status: suggestions.length > 0 ? 'pending' : 'failed',
                };
              })
            )
          : fallbackParsed.actions;

      const actions = actionSeed
        .map((action, index) => ({
          id: action.id || `${Date.now()}-${index}`,
          name: action.name,
          arguments: action.arguments ?? {},
          status: action.status || 'pending',
        }))
        .filter((action) => this.isValidCanvasEditAction(action));

      if (actions.length > 0) {
        subscriber.next(this.createEventChunk('actions', { actions }));
      }

      const rawAiText = this.stripActionTrace(fallbackParsed.summary || result.content || '');
      const summary =
        actions.length > 0
          ? rawAiText
            ? `${rawAiText}\n\nI have prepared ${actions.length} proposed change(s). Please review and Accept/Reject.`
            : `I have prepared ${actions.length} proposed change(s). Please review and Accept/Reject.`
          : rawAiText || 'I did not find any changes that are suitable to propose on this canvas.';

      subscriber.next(this.createEventChunk('assistant', { content: summary }));
      subscriber.next({ chunk: '', done: true });
      subscriber.complete();
    });
  }

  async applyCanvasAction(name: string, args: Record<string, unknown>): Promise<unknown> {
    return this.executeCanvasTool(name, args);
  }

  canvasWriteStreamLegacy(input: CanvasWriteInput): Observable<AskAgentStreamChunk> {
    return createAsyncStream(async (subscriber) => {
      const { provider } = this.providerService.resolveProvider(input.provider);

      if (!provider.chatStream) {
        subscriber.error(new Error('Provider does not support streaming.'));
        return;
      }

      const messages: AiProviderMessage[] = [
        {
          role: 'system',
          content: buildCanvasLegacyWritePrompt(input.canvasContent),
        },
        { role: 'user', content: input.userRequest },
      ];

      const emitter = provider.chatStream(messages, {
        model: input.model,
        temperature: 0.7,
      });

      pipeTextEmitterToSubscriber(emitter, subscriber);
    });
  }

  private createEventChunk(type: string, payload: Record<string, unknown>): AskAgentStreamChunk {
    return {
      chunk: JSON.stringify({ type, ...payload }),
      done: false,
    };
  }

  private buildUserRequestWithSelectedContext(userRequest: string, selectedContext?: string): string {
    const context = selectedContext?.trim();
    if (!context) return userRequest;

    return [
      userRequest,
      '',
      'Selected canvas text context:',
      '---',
      context,
      '---',
      'Use the selected text as the primary context for this request. Do not quote it back unless necessary.',
    ].join('\n');
  }

  private async buildCanvasSnapshot(canvasId: string, fallbackContent: string, contextLabel: string): Promise<string> {
    try {
      const blocks = await this.mcpClient.getBlocks(canvasId);
      if (blocks.length > 0) {
        return JSON.stringify(blocks, null, 2);
      }
    } catch (error) {
      console.warn(`[${contextLabel}] MCP getBlocks failed:`, error);
    }

    return fallbackContent?.trim() ? fallbackContent : '(empty canvas)';
  }

  private stripActionTrace(content: string): string {
    const marker = '\n[ACTIONS]\n';
    const exactMarkerIndex = content.indexOf(marker);
    if (exactMarkerIndex >= 0) {
      return content.slice(0, exactMarkerIndex).trim();
    }

    const looseMarkerIndex = content.indexOf('[ACTIONS]');
    if (looseMarkerIndex >= 0) {
      return content.slice(0, looseMarkerIndex).trim();
    }

    return content.trim();
  }

  private extractActionsFromContent(content?: string): {
    summary: string;
    actions: NormalizedCanvasAction[];
  } {
    const rawContent = content?.trim() ?? '';
    if (!rawContent) {
      return { summary: '', actions: [] };
    }

    const marker = '[ACTIONS]';
    const markerIndex = rawContent.indexOf(marker);
    if (markerIndex < 0) {
      return { summary: rawContent, actions: [] };
    }

    const summary = rawContent.slice(0, markerIndex).trim();
    const rawJson = rawContent.slice(markerIndex + marker.length).trim();

    if (!rawJson) {
      return { summary, actions: [] };
    }

    try {
      const parsed = JSON.parse(rawJson) as unknown;
      if (!Array.isArray(parsed)) {
        return { summary: rawContent, actions: [] };
      }

      return {
        summary,
        actions: parsed
          .map((item, index) => this.normalizeParsedAction(item as ParsedCanvasAction, index))
          .filter((item): item is NormalizedCanvasAction => item !== null),
      };
    } catch {
      return { summary: rawContent, actions: [] };
    }
  }

  private normalizeParsedAction(action: ParsedCanvasAction, fallbackIndex: number): NormalizedCanvasAction | null {
    if (!action?.name || typeof action.name !== 'string') {
      return null;
    }

    const rawArguments = action.arguments;
    const normalizedArguments =
      rawArguments && typeof rawArguments === 'object' && !Array.isArray(rawArguments) ? rawArguments : {};

    return {
      id: typeof action.id === 'string' && action.id.trim() ? action.id : `${Date.now()}-${fallbackIndex}`,
      name: action.name,
      arguments: normalizedArguments,
      status: typeof action.status === 'string' && action.status.trim() ? action.status : 'pending',
    };
  }

  private isValidCanvasEditAction(action: NormalizedCanvasAction): boolean {
    if (action.name !== 'edit_canvas_blocks') return false;
    const mutations = action.arguments?.mutations;
    return Array.isArray(mutations) && mutations.length > 0;
  }

  private extractSuggestions(result: unknown): CanvasSuggestion[] {
    if (!result || typeof result !== 'object') return [];
    const suggestions = (result as { suggestions?: unknown }).suggestions;
    return Array.isArray(suggestions) ? (suggestions as CanvasSuggestion[]) : [];
  }

  private async executeCanvasTool(
    name: string,
    args: Record<string, unknown>,
    options: { messageId?: string; actionId?: string } = {}
  ): Promise<unknown> {
    const canvasId = args['canvas_id'] as string;

    switch (name) {
      case 'edit_canvas_blocks':
        return this.mcpClient.editCanvasBlocks(canvasId, ((args['mutations'] as any[]) ?? []) as CanvasBlockMutation[], options);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }
}
