import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { KeepAliveService } from './keep-alive.service';

@ApiTags('keep-alive')
@Controller('keep-alive')
export class KeepAliveController {
  constructor(private readonly keepAliveService: KeepAliveService) {}

  @Get('status')
  @ApiOperation({ summary: 'Kiểm tra trạng thái dịch vụ keep-alive' })
  @ApiResponse({
    status: 200,
    description: 'Trạng thái dịch vụ keep-alive',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Keep-alive service is running' },
        environment: { type: 'string', example: 'development' },
        enabled: { type: 'boolean', example: true },
        active: { type: 'boolean', example: false },
        executionCount: { type: 'number', example: 0 },
        lastExecuted: { type: 'string', example: 'Never (disabled in development)' },
        interval: { type: 'string', example: '30 seconds' },
        note: { type: 'string', example: 'Cron job is disabled in development to prevent unnecessary resource usage' },
      },
    },
  })
  getKeepAliveStatus() {
    return this.keepAliveService.getKeepAliveStats();
  }
}
