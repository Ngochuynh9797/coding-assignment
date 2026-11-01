import { Module } from '@nestjs/common';
import { IdempotencyModule } from '@infra/idempotency/idempotency.module';
import { CatalogModule } from '@modules/catalog/catalog.module';
import { PersonalRecordsModule } from '@modules/personal-records/personal-records.module';
import { UnitsModule } from '@shared/units/units.module';
import { WorkoutsController } from './workouts.controller';
import { WorkoutsRepository } from './workouts.repository';
import { WorkoutsService } from './workouts.service';

@Module({
  imports: [CatalogModule, PersonalRecordsModule, IdempotencyModule, UnitsModule],
  controllers: [WorkoutsController],
  providers: [WorkoutsService, WorkoutsRepository],
})
export class WorkoutsModule {}
