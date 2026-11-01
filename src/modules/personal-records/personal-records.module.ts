import { Module } from '@nestjs/common';
import { DailyBestsWriter } from './daily-bests.writer';

@Module({
  providers: [DailyBestsWriter],
  exports: [DailyBestsWriter],
})
export class PersonalRecordsModule {}
