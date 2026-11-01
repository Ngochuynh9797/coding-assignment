import type { Decimal } from 'decimal.js';
import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { decimalTransformer } from '@infra/database/decimal.transformer';
import { Exercise } from '@modules/catalog/entities/exercise.entity';

// The *SetId columns are logical references without a relation: this table is derived data (see SCHEMA.md).
@Entity({ name: 'daily_exercise_bests' })
export class DailyExerciseBest {
  @PrimaryColumn({ name: 'user_id', type: 'text' })
  userId!: string;

  @PrimaryColumn({ name: 'exercise_id', type: 'int' })
  exerciseId!: number;

  @PrimaryColumn({ name: 'performed_on', type: 'date' })
  performedOn!: string;

  @ManyToOne(() => Exercise)
  @JoinColumn({ name: 'exercise_id' })
  exercise!: Exercise;

  @Column({
    name: 'best_weight_kg',
    type: 'numeric',
    precision: 10,
    scale: 4,
    transformer: decimalTransformer,
  })
  bestWeightKg!: Decimal;

  @Column({ name: 'best_weight_set_id', type: 'uuid' })
  bestWeightSetId!: string;

  @Column({
    name: 'best_volume_kg',
    type: 'numeric',
    precision: 12,
    scale: 4,
    transformer: decimalTransformer,
  })
  bestVolumeKg!: Decimal;

  @Column({ name: 'best_volume_set_id', type: 'uuid' })
  bestVolumeSetId!: string;

  @Column({
    name: 'best_e1rm_kg',
    type: 'numeric',
    precision: 10,
    scale: 4,
    transformer: decimalTransformer,
  })
  bestE1rmKg!: Decimal;

  @Column({ name: 'best_e1rm_set_id', type: 'uuid' })
  bestE1rmSetId!: string;
}
