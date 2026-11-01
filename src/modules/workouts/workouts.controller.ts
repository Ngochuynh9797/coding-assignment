import { Body, Controller, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { IdempotencyKeyHeader } from '@infra/idempotency/idempotency-key.header';
import { LogWorkoutsDto } from './dto/log-workouts.dto';
import { UserIdParam } from './dto/user-id.param';
import { WorkoutsService } from './workouts.service';

@Controller('users/:userId/workouts')
export class WorkoutsController {
  constructor(private readonly workouts: WorkoutsService) {}

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
}
