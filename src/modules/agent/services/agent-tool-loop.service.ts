import { Injectable } from '@nestjs/common';
import { McpClientService } from '../../mcp-client/mcp-client.service';
import { AiProvider, AiProviderMessage, ToolCall, ToolDefinition } from '../ai-providers/ai-provider.interface';

export interface AgentLoopAction {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: string;
}

export interface AgentToolLoopResult {
  content: string;
  actions: AgentLoopAction[];
  observations: Array<{ tool: string; arguments: Record<string, unknown>; result: unknown }>;
  stoppedByLimit?: boolean;
}

export interface AgentToolLoopInput {
  provider: AiProvider;
  messages: AiProviderMessage[];
  tools: ToolDefinition[];
  model?: string;
  temperature?: number;
  responseFormat?: 'json_object';
  maxRounds?: number;
  normalizeToolArguments?: (name: string, args: Record<string, unknown>) => Record<string, unknown>;
  executeTool?: (name: string, args: Record<string, unknown>) => Promise<unknown>;
}

@Injectable()
export class AgentToolLoopService {
  constructor(private readonly mcpClient: McpClientService) {}

  async run(input: AgentToolLoopInput): Promise<AgentToolLoopResult> {
    if (!input.provider.chatWithTools) {
      return {
        content: 'The current provider does not support tool-calling mode.',
        actions: [],
        observations: [],
      };
    }

    const maxRounds = input.maxRounds ?? 8;
    const toolHistory: AiProviderMessage[] = [...input.messages];
    const observations: Array<{ tool: string; arguments: Record<string, unknown>; result: unknown }> = [];

    for (let round = 0; round < maxRounds; round++) {
      const result = await input.provider.chatWithTools(toolHistory, input.tools, {
        model: input.model,
        temperature: input.temperature ?? 0.2,
        responseFormat: input.responseFormat,
      });

      const toolCalls = result.toolCalls ?? [];
      if (toolCalls.length === 0) {
        return {
          content: result.content?.trim() ?? '',
          actions: [],
          observations,
        };
      }

      const normalizedCalls = toolCalls.map((toolCall) => ({
        ...toolCall,
        arguments: this.normalizeArguments(toolCall, input),
      }));

      if (normalizedCalls.some((toolCall) => this.requiresConfirmation(toolCall.name, input.tools))) {
        return {
          content: result.content?.trim() ?? '',
          actions: normalizedCalls.map((toolCall, index) => this.toPendingAction(toolCall, index)),
          observations,
        };
      }

      const roundObservations = [];
      for (const toolCall of normalizedCalls) {
        const toolResult = await this.executeTool(toolCall.name, toolCall.arguments, input);
        const observation = {
          tool: toolCall.name,
          arguments: toolCall.arguments,
          result: toolResult,
        };
        observations.push(observation);
        roundObservations.push(observation);
      }

      toolHistory.push({
        role: 'assistant',
        content: `Tool calls requested:\n${JSON.stringify(
          normalizedCalls.map((toolCall) => ({
            tool: toolCall.name,
            arguments: toolCall.arguments,
          })),
          null,
          2
        )}`,
      });
      toolHistory.push({
        role: 'user',
        content:
          `Tool execution observations:\n${JSON.stringify(roundObservations, null, 2)}\n\n` +
          `Use these observations to continue. If enough data is available, provide the final answer. ` +
          `Only call another tool if more data is truly required.`,
      });
    }

    return {
      content: 'I stopped because the tool loop reached its safety limit. Please narrow the request and try again.',
      actions: [],
      observations,
      stoppedByLimit: true,
    };
  }

  private normalizeArguments(
    toolCall: ToolCall,
    input: AgentToolLoopInput
  ): Record<string, unknown> {
    const rawArgs = toolCall.arguments && typeof toolCall.arguments === 'object' ? toolCall.arguments : {};
    return input.normalizeToolArguments ? input.normalizeToolArguments(toolCall.name, rawArgs) : rawArgs;
  }

  private requiresConfirmation(name: string, tools: ToolDefinition[]): boolean {
    const tool = tools.find((candidate) => candidate.name === name);
    if (typeof tool?.requireConfirmation === 'boolean') {
      return tool.requireConfirmation;
    }
    return this.mcpClient.getFallbackToolPolicy(name).requireConfirmation;
  }

  private async executeTool(
    name: string,
    args: Record<string, unknown>,
    input: AgentToolLoopInput
  ): Promise<unknown> {
    if (input.executeTool) {
      return input.executeTool(name, args);
    }
    return this.mcpClient.callTool(name, args);
  }

  private toPendingAction(toolCall: ToolCall, index: number): AgentLoopAction {
    return {
      id: toolCall.id || `${Date.now()}-${index}`,
      name: toolCall.name,
      arguments: toolCall.arguments ?? {},
      status: 'pending',
    };
  }
}
