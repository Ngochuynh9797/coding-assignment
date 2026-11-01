import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogRepository } from './catalog.repository';
import { CatalogService } from './catalog.service';
import { Exercise } from './entities/exercise.entity';
import { ExerciseMuscleGroup } from './entities/exercise-muscle-group.entity';
import { ExercisesController } from './exercises.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Exercise, ExerciseMuscleGroup])],
  controllers: [ExercisesController],
  providers: [CatalogRepository, CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
