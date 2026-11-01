import { Logger } from '@nestjs/common';
import { parseEnv } from '@config/env.validation';
import { createDataSource } from '@infra/database/data-source';
import { isUserId, USER_ID_RULE } from '@shared/validation/is-user-id';
import { DailyBestsRebuilder } from './daily-bests-rebuilder.service';
import { DailyBestsWriter } from './daily-bests.writer';

const USER_ARG = '--user=';

const logger = new Logger('RebuildDailyBests');

function parseArgs(args: string[]): { userId?: string } {
  const unknown = args.filter((arg) => !arg.startsWith(USER_ARG));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown arguments: ${unknown.join(' ')}. Usage: rebuild:bests [-- --user=<id>]`,
    );
  }
  const arg = args.find((a) => a.startsWith(USER_ARG));
  if (arg === undefined) {
    return {};
  }
  const userId = arg.slice(USER_ARG.length);
  if (!isUserId(userId)) {
    throw new Error(`Invalid --user '${userId}': ${USER_ID_RULE}`);
  }
  return { userId };
}

async function main(): Promise<void> {
  const config = parseEnv(process.env);
  const { userId } = parseArgs(process.argv.slice(2));
  const dataSource = await createDataSource(config).initialize();
  try {
    const result = await new DailyBestsRebuilder(dataSource, new DailyBestsWriter()).rebuild(
      userId,
    );
    logger.log(
      `Rebuilt ${result.rows} daily best rows for ${result.users} user(s) in ${result.durationMs} ms`,
    );
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
