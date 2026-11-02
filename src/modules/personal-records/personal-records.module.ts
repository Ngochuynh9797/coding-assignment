import { Module } from '@nestjs/common';
import { CatalogModule } from '@modules/catalog/catalog.module';
import { UnitsModule } from '@shared/units/units.module';
import { DailyBestsRepository } from './daily-bests/daily-bests.repository';
import { DailyBestsWriter } from './daily-bests/daily-bests.writer';
import { PersonalRecordsController } from './personal-records.controller';
import { PersonalRecordsService } from './personal-records.service';

@Module({
  imports: [CatalogModule, UnitsModule],
  controllers: [PersonalRecordsController],
  providers: [DailyBestsWriter, DailyBestsRepository, PersonalRecordsService],
  exports: [DailyBestsWriter],
})
export class PersonalRecordsModule {}
