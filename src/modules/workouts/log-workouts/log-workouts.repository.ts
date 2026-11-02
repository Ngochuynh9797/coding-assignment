import { Injectable } from '@nestjs/common';
import type { Decimal } from 'decimal.js';
import type { EntityManager } from 'typeorm';
import { WorkoutEntry } from '../entities/workout-entry.entity';
import { WorkoutSet } from '../entities/workout-set.entity';

export interface NewEntry {
  id: string;
  userId: string;
  exerciseId: number;
  performedOn: string;
}

export interface NewSet {
  id: string;
  entryId: string;
  setIndex: number;
  reps: number;
  weight: Decimal;
  unit: string;
  weightKg: Decimal;
}

@Injectable()
export class LogWorkoutsRepository {
  // One multi-row INSERT per table. Ids are assigned by the caller, so nothing is read back
  // (updateEntity(false) drops RETURNING). At the DTO limits (100 entries × 50 sets) the sets insert
  // binds 35k parameters, below PostgreSQL's 65535; raising those limits requires chunking here.
  async insertEntriesAndSets(
    tx: EntityManager,
    entries: NewEntry[],
    sets: NewSet[],
  ): Promise<void> {
    await tx
      .createQueryBuilder()
      .insert()
      .into(WorkoutEntry)
      .values(entries)
      .updateEntity(false)
      .execute();
    await tx
      .createQueryBuilder()
      .insert()
      .into(WorkoutSet)
      .values(sets)
      .updateEntity(false)
      .execute();
  }
}
