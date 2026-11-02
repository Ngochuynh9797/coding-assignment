import { Controller, Get, Param, Query } from '@nestjs/common';
import { UserIdParam } from '@shared/validation/user-id.param';
import { CompareQuery } from './dto/compare.query';
import { PersonalRecordsQuery } from './dto/personal-records.query';
import type { PersonalRecordsResponse } from './mappers/pr.mapper';
import { type CompareResponse, PersonalRecordsService } from './personal-records.service';

@Controller('users/:userId/personal-records')
export class PersonalRecordsController {
  constructor(private readonly personalRecords: PersonalRecordsService) {}

  @Get()
  get(
    @Param() { userId }: UserIdParam,
    @Query() query: PersonalRecordsQuery,
  ): Promise<PersonalRecordsResponse> {
    return this.personalRecords.getRecords(userId, query);
  }

  @Get('compare')
  compare(
    @Param() { userId }: UserIdParam,
    @Query() query: CompareQuery,
  ): Promise<CompareResponse> {
    return this.personalRecords.compare(userId, query);
  }
}
