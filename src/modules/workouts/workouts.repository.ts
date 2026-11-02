import { Injectable } from '@nestjs/common';
import type { Decimal } from 'decimal.js';
import { DataSource, type EntityManager, In } from 'typeorm';
import { encodeCursor } from '@shared/pagination/cursor';
import { WorkoutEntry } from './entities/workout-entry.entity';
import { WorkoutSet } from './entities/workout-set.entity';
import {
  buildHistoryPageQuery,
  type HistoryEntryRawRow,
  type HistoryPageParams,
} from './history-query.builder';

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

export interface HistoryEntryRow {
  id: string;
  exerciseId: number;
  exerciseName: string;
  performedOn: string;
  createdAt: Date;
}

export interface HistoryPage {
  entries: HistoryEntryRow[];
  hasMore: boolean;
  nextCursor: string | null;
}

export interface HistorySetRow {
  entryId: string;
  setIndex: number;
  reps: number;
  weight: Decimal;
  unit: string;
  weightKg: Decimal;
}

@Injectable()
export class WorkoutsRepository {
  constructor(private readonly dataSource: DataSource) {}

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

  async findHistoryPage(params: HistoryPageParams): Promise<HistoryPage> {
    const rows = await buildHistoryPageQuery(
      this.dataSource.createQueryBuilder(),
      params,
    ).getRawMany<HistoryEntryRawRow>();
    const hasMore = rows.length > params.limit;
    const entries = rows.slice(0, params.limit).map((row) => ({
      id: row.id,
      exerciseId: row.exercise_id,
      exerciseName: row.display_name,
      performedOn: row.performed_on,
      createdAt: row.created_at,
    }));
    const last = entries.at(-1);
    return {
      entries,
      hasMore,
      nextCursor:
        hasMore && last ? encodeCursor({ performedOn: last.performedOn, id: last.id }) : null,
    };
  }

  // One query for the whole page (no N+1); weight and weightKg come back as Decimal via the transformer.
  async findSetsByEntryIds(entryIds: string[]): Promise<HistorySetRow[]> {
    if (entryIds.length === 0) {
      return [];
    }
    return this.dataSource.getRepository(WorkoutSet).find({
      select: {
        entryId: true,
        setIndex: true,
        reps: true,
        weight: true,
        unit: true,
        weightKg: true,
      },
      where: { entryId: In(entryIds) },
      order: { entryId: 'ASC', setIndex: 'ASC' },
    });
  }
}
