import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { InjectAppConfig } from '@config/config.module';
import type { AppConfig } from '@config/env.validation';
import { IdempotencyKey } from './idempotency-key.entity';

// Small batches keep each DELETE short, so it never holds locks long enough to slow down logging.
const BATCH_SIZE = 5_000;
const MS_PER_HOUR = 3_600_000;

// An instant, not a calendar date: subtracting milliseconds does not depend on any timezone.
export function idempotencyCutoff(now: Date, ttlHours: number): Date {
  return new Date(now.getTime() - ttlHours * MS_PER_HOUR);
}

@Injectable()
export class IdempotencyCleanupJob {
  private readonly logger = new Logger(IdempotencyCleanupJob.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectAppConfig() private readonly config: AppConfig,
  ) {}

  // Safe to run on several replicas at once: each batch only deletes rows that still exist.
  @Cron(CronExpression.EVERY_HOUR)
  async run(): Promise<void> {
    try {
      const deleted = await this.purgeExpired(new Date());
      this.logger.log(`Deleted ${deleted} expired idempotency keys`);
    } catch (error) {
      this.logger.error(
        'Idempotency key cleanup failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async purgeExpired(now: Date): Promise<number> {
    const cutoff = idempotencyCutoff(now, this.config.IDEMPOTENCY_TTL_HOURS);
    const expiredBatch = this.dataSource
      .createQueryBuilder(IdempotencyKey, 'k')
      .select('k.ctid')
      .where('k.createdAt < :cutoff')
      .limit(BATCH_SIZE)
      .getQuery();
    let total = 0;
    for (;;) {
      const result = await this.dataSource
        .createQueryBuilder()
        .delete()
        .from(IdempotencyKey)
        .where(`ctid IN (${expiredBatch})`, { cutoff })
        .execute();
      const affected = result.affected ?? 0;
      total += affected;
      if (affected < BATCH_SIZE) {
        return total;
      }
    }
  }
}
