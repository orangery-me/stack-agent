import { Controller } from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { AgentService } from './agent.service';

interface AskAgentRequest {
  message: string;
  provider?: string;
  model?: string;
}

interface AskAgentResponse {
  response: string;
}

@Controller()
export class AgentGrpcController {
  constructor(private readonly agentService: AgentService) {}

  @GrpcMethod('AgentService', 'AskAgent')
  async askAgent(data: AskAgentRequest): Promise<AskAgentResponse> {
    if (!data?.message?.trim()) {
      throw new RpcException({
        code: GrpcStatus.INVALID_ARGUMENT,
        message: 'message is required',
      });
    }

    try {
      const result = await this.agentService.askAgent({
        message: data.message.trim(),
        provider: data.provider?.trim() || undefined,
        model: data.model?.trim() || undefined,
      });
      return { response: result.response ?? '' };
    } catch (err: any) {
      console.error('Agent request failed:', err);
      const message = err?.message ?? 'Agent request failed';
      throw new RpcException({
        code: GrpcStatus.INTERNAL,
        message,
      });
    }
  }
}
