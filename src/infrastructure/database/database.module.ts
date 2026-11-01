import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_CONFIG } from '@config/config.module';
import type { AppConfig } from '@config/env.validation';
import { buildDataSourceOptions } from './data-source';

const APP_STATEMENT_TIMEOUT_MS = 10_000;

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        ...buildDataSourceOptions(config, { statementTimeoutMs: APP_STATEMENT_TIMEOUT_MS }),
        // The default (9 attempts, 3 s apart) hides a wrong DATABASE_URL for half a minute.
        retryAttempts: 3,
        retryDelay: 1_000,
      }),
    }),
  ],
})
export class DatabaseModule {}
