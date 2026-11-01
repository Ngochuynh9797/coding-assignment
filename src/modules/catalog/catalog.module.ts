import { Module } from '@nestjs/common';
import { CatalogRepository } from './catalog.repository';
import { CatalogService } from './catalog.service';
import { ExercisesController } from './exercises.controller';

@Module({
  controllers: [ExercisesController],
  providers: [CatalogRepository, CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
