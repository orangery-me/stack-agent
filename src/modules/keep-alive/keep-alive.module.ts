import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KeepAliveService } from './keep-alive.service';
import { KeepAliveController } from './keep-alive.controller';

@Module({
  imports: [ConfigModule],
  controllers: [KeepAliveController],
  providers: [KeepAliveService],
  exports: [KeepAliveService],
})
export class KeepAliveModule {}
