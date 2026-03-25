import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const host = configService.get<string>('DB_POSTGRE_HOST');
        const port = configService.get<number>('DB_POSTGRE_PORT');
        const username = configService.get<string>('DB_POSTGRE_USERNAME');
        const database = configService.get<string>('DB_POSTGRE_DATABASE');
        const nodeEnv = configService.get<string>('NODE_ENV');

        // Log DB info at startup to verify correct connection
        // (chỉ log trong development để tránh lộ thông tin ở môi trường production)
        if (nodeEnv === 'development') {
          // eslint-disable-next-line no-console
          console.log(
            `[DatabaseModule] Connecting to Postgres database "${database}" as "${username}" at ${host}:${port}`
          );
        }

        return {
          type: 'postgres',
          host,
          port,
          username,
          password: configService.get<string>('DB_POSTGRE_PASSWORD'),
          database,
          autoLoadEntities: true,
          synchronize: nodeEnv === 'development', // Only in development
          logging: nodeEnv === 'development',
        };
      },
    }),
  ],
})
export class DatabaseModule {}
