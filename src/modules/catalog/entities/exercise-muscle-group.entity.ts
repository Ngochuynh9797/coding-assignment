import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Exercise } from './exercise.entity';
import { MuscleGroup } from './muscle-group.entity';

@Entity({ name: 'exercise_muscle_groups' })
export class ExerciseMuscleGroup {
  @PrimaryColumn({ name: 'exercise_id', type: 'int' })
  exerciseId!: number;

  @PrimaryColumn({ name: 'muscle_group_id', type: 'int' })
  muscleGroupId!: number;

  @ManyToOne(() => Exercise, (exercise) => exercise.muscleGroupLinks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'exercise_id' })
  exercise!: Exercise;

  @ManyToOne(() => MuscleGroup, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'muscle_group_id' })
  muscleGroup!: MuscleGroup;
}
