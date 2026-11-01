import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'muscle_groups' })
export class MuscleGroup {
  @PrimaryGeneratedColumn({ name: 'id' })
  id!: number;

  @Column({ name: 'code', type: 'text' })
  code!: string;

  @Column({ name: 'name', type: 'text' })
  name!: string;
}
