import { Logger } from '@nestjs/common';
import { parseEnv } from '@config/env.validation';
import { createDataSource } from './data-source';

const logger = new Logger('Migrate');

async function main(command: string | undefined): Promise<void> {
  if (command !== 'run' && command !== 'revert') {
    throw new Error(`Usage: migrate.js <run|revert> (got '${command ?? ''}')`);
  }
  const dataSource = await createDataSource(parseEnv(process.env)).initialize();
  try {
    if (command === 'run') {
      const applied = await dataSource.runMigrations({ transaction: 'each' });
      logger.log(
        applied.length === 0
          ? 'No pending migrations'
          : `Applied: ${applied.map((m) => m.name).join(', ')}`,
      );
    } else {
      await dataSource.undoLastMigration({ transaction: 'each' });
      logger.log('Reverted the last migration');
    }
  } finally {
    await dataSource.destroy();
  }
}

main(process.argv[2]).catch((error: unknown) => {
  logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
