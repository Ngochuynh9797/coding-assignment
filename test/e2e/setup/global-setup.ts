// moduleNameMapper does not apply to globalSetup, so the @config/@infra aliases are resolved here.
import 'tsconfig-paths/register';
import { resolve } from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { parseEnv } from '@config/env.validation';
import { createDataSource } from '@infra/database/data-source';
import { readCatalogMetadata, seedCatalog } from '../../../src/seeds/catalog/catalog.seeder';

declare global {
  var __PG_CONTAINER__: StartedPostgreSqlContainer | undefined;
}

export default async function globalSetup(): Promise<void> {
  const container = await new PostgreSqlContainer('postgres:18').start();
  globalThis.__PG_CONTAINER__ = container;

  // Test files run in this process (--runInBand) and read their config from process.env.
  process.env.DATABASE_URL = container.getConnectionUri();
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'fatal';

  const metadata = await readCatalogMetadata(
    resolve(__dirname, '../../../config/exercise-metadata.json'),
  );
  const dataSource = await createDataSource(parseEnv(process.env)).initialize();
  try {
    await dataSource.runMigrations({ transaction: 'each' });
    await seedCatalog(dataSource, metadata);
  } finally {
    await dataSource.destroy();
  }
}
