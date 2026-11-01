import { Controller, Get, Query } from '@nestjs/common';
import type { ExerciseWithGroups } from './catalog.repository';
import { CatalogService } from './catalog.service';
import { ListExercisesQuery } from './dto/list-exercises.query';

@Controller('exercises')
export class ExercisesController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  async list(@Query() query: ListExercisesQuery): Promise<{ data: ExerciseWithGroups[] }> {
    return { data: await this.catalog.list(query) };
  }
}
