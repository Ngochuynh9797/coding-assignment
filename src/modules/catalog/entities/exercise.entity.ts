import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ExerciseMuscleGroup } from './exercise-muscle-group.entity';

@Entity({ name: 'exercises' })
export class Exercise {
  @PrimaryGeneratedColumn({ name: 'id' })
  id!: number;

  @Column({ name: 'display_name', type: 'text' })
  displayName!: string;

  @Column({ name: 'name_key', type: 'text' })
  nameKey!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => ExerciseMuscleGroup, (link) => link.exercise)
  muscleGroupLinks!: ExerciseMuscleGroup[];
}
