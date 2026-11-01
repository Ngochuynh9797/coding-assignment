import { DataSource } from 'typeorm';
import type { PostgresDataSourceOptions } from 'typeorm/driver/postgres/PostgresDataSourceOptions';
import type { AppConfig } from '@config/env.validation';
import { Init1793491200000 } from './migrations/0001-init';

export interface DataSourceSettings {
  // Only the API sets it: migrations and the seeder may legitimately run longer.
  statementTimeoutMs?: number;
}

export function buildDataSourceOptions(
  config: AppConfig,
  settings: DataSourceSettings = {},
): PostgresDataSourceOptions {
  return {
    type: 'postgres',
    url: config.DATABASE_URL,
    poolSize: config.DB_POOL_MAX,
    entities: [],
    synchronize: false,
    migrationsRun: false,
    migrations: [Init1793491200000],
    extra: {
      connectionTimeoutMillis: 5_000,
      ...(settings.statementTimeoutMs !== undefined && {
        statement_timeout: settings.statementTimeoutMs,
      }),
    },
  };
}

export function createDataSource(config: AppConfig, settings?: DataSourceSettings): DataSource {
  return new DataSource(buildDataSourceOptions(config, settings));
}
