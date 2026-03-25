import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class KeepAliveService {
  private readonly logger = new Logger(KeepAliveService.name);
  private counter = 0;
  private readonly nodeEnv: string;
  private readonly keepAliveEnabled: boolean;

  constructor(private readonly configService: ConfigService) {
    this.nodeEnv = this.configService.get<string>('NODE_ENV') || 'development';
    this.keepAliveEnabled = this.configService.get<boolean>('KEEP_ALIVE_ENABLED', true);

    this.logger.log(`Keep-alive service initialized - Environment: ${this.nodeEnv}, Enabled: ${this.keepAliveEnabled}`);

    if (this.nodeEnv === 'development') {
      this.logger.warn('Keep-alive cron job is disabled in development environment');
    }
  }

  @Cron('*/30 * * * * *') // Run every 30 seconds
  handleKeepAlive() {
    // Only run in staging or production environments
    if (this.nodeEnv === 'development' || !this.keepAliveEnabled) {
      return;
    }
    this.counter++;
    const timestamp = new Date().toISOString();

    // Create a simple action to prevent system sleep
    // This creates a temporary file and deletes it immediately
    const tempDir = path.join(process.cwd(), 'temp');
    const tempFile = path.join(tempDir, `keep-alive-${Date.now()}.tmp`);

    try {
      // Ensure temp directory exists
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // Write a temporary file
      fs.writeFileSync(tempFile, `Keep alive activity at ${timestamp} - Count: ${this.counter}`);

      // Immediately delete the file
      fs.unlinkSync(tempFile);

      this.logger.log(`Keep-alive task executed at ${timestamp} - Count: ${this.counter}`);

      // Perform a simple database ping or other lightweight operation
      this.performLightweightTask();
    } catch (error) {
      this.logger.error(`Keep-alive task failed: ${error.message}`);
    }
  }

  private performLightweightTask() {
    // Perform a simple calculation to keep CPU active
    const startTime = Date.now();
    let sum = 0;
    for (let i = 0; i < 1000; i++) {
      sum += Math.random();
    }
    const endTime = Date.now();

    this.logger.debug(`Lightweight task completed in ${endTime - startTime}ms - Sum: ${sum.toFixed(2)}`);
  }

  getKeepAliveStats() {
    const isActive = this.nodeEnv !== 'development' && this.keepAliveEnabled;

    return {
      message: isActive ? 'Keep-alive service is running' : 'Keep-alive service is disabled',
      environment: this.nodeEnv,
      enabled: this.keepAliveEnabled,
      active: isActive,
      executionCount: this.counter,
      lastExecuted: this.counter > 0 ? new Date().toISOString() : 'Never (disabled in development)',
      interval: '30 seconds',
      note:
        this.nodeEnv === 'development'
          ? 'Cron job is disabled in development to prevent unnecessary resource usage'
          : 'Cron job is active to prevent system sleep',
    };
  }
}
