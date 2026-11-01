import type { Decimal } from 'decimal.js';
import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { decimalTransformer } from '@infra/database/decimal.transformer';
import { WorkoutEntry } from './workout-entry.entity';

@Entity({ name: 'workout_sets' })
export class WorkoutSet {
  @PrimaryColumn({ name: 'id', type: 'uuid' })
  id!: string;

  @Column({ name: 'entry_id', type: 'uuid' })
  entryId!: string;

  @ManyToOne(() => WorkoutEntry, (entry) => entry.sets, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'entry_id' })
  entry!: WorkoutEntry;

  @Column({ name: 'set_index', type: 'smallint' })
  setIndex!: number;

  @Column({ name: 'reps', type: 'int' })
  reps!: number;

  @Column({
    name: 'weight',
    type: 'numeric',
    precision: 10,
    scale: 4,
    transformer: decimalTransformer,
  })
  weight!: Decimal;

  @Column({ name: 'unit', type: 'text' })
  unit!: string;

  @Column({
    name: 'weight_kg',
    type: 'numeric',
    precision: 10,
    scale: 4,
    transformer: decimalTransformer,
  })
  weightKg!: Decimal;
}
