import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { IdempotencyKeyHeader } from '@infra/idempotency/idempotency-key.header';
import { UserIdParam } from '@shared/validation/user-id.param';
import type { HistoryResponse } from './history/history.mapper';
import { HistoryQueryDto } from './history/history.query';
import { WorkoutHistoryService } from './history/workout-history.service';
import { LogWorkoutsDto } from './log-workouts/log-workouts.dto';
import { LogWorkoutsService } from './log-workouts/log-workouts.service';

@Controller('users/:userId/workouts')
export class WorkoutsController {
  constructor(
    private readonly logWorkouts: LogWorkoutsService,
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
    const result = await this.logWorkouts.logBulk(userId, body, idempotencyKey);
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
