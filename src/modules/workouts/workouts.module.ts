import { Module } from '@nestjs/common';
import { IdempotencyModule } from '@infra/idempotency/idempotency.module';
import { CatalogModule } from '@modules/catalog/catalog.module';
import { PersonalRecordsModule } from '@modules/personal-records/personal-records.module';
import { UnitsModule } from '@shared/units/units.module';
import { WorkoutHistoryRepository } from './history/workout-history.repository';
import { WorkoutHistoryService } from './history/workout-history.service';
import { LogWorkoutsRepository } from './log-workouts/log-workouts.repository';
import { LogWorkoutsService } from './log-workouts/log-workouts.service';
import { WorkoutsController } from './workouts.controller';

@Module({
  imports: [CatalogModule, PersonalRecordsModule, IdempotencyModule, UnitsModule],
  controllers: [WorkoutsController],
  providers: [
    LogWorkoutsService,
    LogWorkoutsRepository,
    WorkoutHistoryService,
    WorkoutHistoryRepository,
  ],
})
export class WorkoutsModule {}
