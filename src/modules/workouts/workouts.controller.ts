import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { IdempotencyKeyHeader } from '@infra/idempotency/idempotency-key.header';
import { UserIdParam } from '@shared/validation/user-id.param';
import { HistoryQueryDto } from './dto/history.query';
import { LogWorkoutsDto } from './dto/log-workouts.dto';
import type { HistoryResponse } from './history.mapper';
import { WorkoutHistoryService } from './workout-history.service';
import { WorkoutsService } from './workouts.service';

@Controller('users/:userId/workouts')
export class WorkoutsController {
  constructor(
    private readonly workouts: WorkoutsService,
    private readonly history: WorkoutHistoryService,
  ) {}

  // The status is set per request: a replay returns the status stored with the original response.
  @Post()
  async log(
    @Param() { userId }: UserIdParam,
    @Body() body: LogWorkoutsDto,
    @IdempotencyKeyHeader() idempotencyKey: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<unknown> {
    const result = await this.workouts.logBulk(userId, body, idempotencyKey);
    res.status(result.status);
    if (result.replayed) {
      res.setHeader('Idempotent-Replayed', 'true');
    }
    return result.body;
  }

  @Get()
  list(
    @Param() { userId }: UserIdParam,
    @Query() query: HistoryQueryDto,
  ): Promise<HistoryResponse> {
    return this.history.getHistory(userId, query);
  }
}
