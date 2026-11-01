import { Module } from '@nestjs/common';
import { IdempotencyCleanupJob } from './idempotency-cleanup.job';
import { IdempotencyService } from './idempotency.service';

@Module({
  providers: [IdempotencyService, IdempotencyCleanupJob],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}
