import { resolve } from 'node:path';
import { Logger } from '@nestjs/common';
import { parseEnv } from '@config/env.validation';
import { createDataSource } from '@infra/database/data-source';
import { readCatalogMetadata, seedCatalog } from './catalog.seeder';

const METADATA_PATH = resolve(process.cwd(), 'config/exercise-metadata.json');

const logger = new Logger('SeedCatalog');

async function main(): Promise<void> {
  const config = parseEnv(process.env);
  // Parsed before connecting: an invalid file must not write anything.
  const metadata = await readCatalogMetadata(METADATA_PATH);
  const dataSource = await createDataSource(config).initialize();
  try {
    const result = await seedCatalog(dataSource, metadata);
    logger.log(
      `Seeded ${result.muscleGroups} muscle groups, ${result.exercises} exercises, ${result.mappings} mappings`,
    );
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
