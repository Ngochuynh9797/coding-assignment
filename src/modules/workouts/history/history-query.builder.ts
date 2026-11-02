import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import type { HistoryCursor } from '@shared/pagination/cursor';

export interface HistoryPageParams {
  userId: string;
  // null = no exercise filter. An empty list never reaches the query: the service returns early.
  exerciseIds: number[] | null;
  from?: string;
  to?: string;
  cursor?: HistoryCursor;
  limit: number;
}

export interface HistoryEntryRawRow {
  id: string;
  exercise_id: number;
  display_name: string;
  performed_on: string;
  created_at: Date;
}

// Conditions are added only when their filter is present: a generic `(:x IS NULL OR ...)` form makes
// the planner pick one plan for every combination. Tables are referenced by name so the SQL can be
// rendered (and unit-tested) without entity metadata.
export function buildHistoryPageQuery<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  params: HistoryPageParams,
): SelectQueryBuilder<T> {
  qb.select('e.id', 'id')
    .addSelect('e.exercise_id', 'exercise_id')
    .addSelect('x.display_name', 'display_name')
    .addSelect('e.performed_on', 'performed_on')
    .addSelect('e.created_at', 'created_at')
    .from('workout_entries', 'e')
    .innerJoin('exercises', 'x', 'x.id = e.exercise_id')
    .where('e.user_id = :userId', { userId: params.userId });
  if (params.exerciseIds !== null) {
    qb.andWhere('e.exercise_id = ANY(CAST(:exerciseIds AS int[]))', {
      exerciseIds: params.exerciseIds,
    });
  }
  if (params.from !== undefined) {
    qb.andWhere('e.performed_on >= :from', { from: params.from });
  }
  if (params.to !== undefined) {
    qb.andWhere('e.performed_on <= :to', { to: params.to });
  }
  if (params.cursor !== undefined) {
    // One row comparison, so the index range scan continues from the cursor in (date, id) order.
    qb.andWhere('(e.performed_on, e.id) < (CAST(:cursorDate AS date), CAST(:cursorId AS uuid))', {
      cursorDate: params.cursor.performedOn,
      cursorId: params.cursor.id,
    });
  }
  // One extra row tells whether another page exists, without COUNT(*).
  return qb
    .orderBy('e.performed_on', 'DESC')
    .addOrderBy('e.id', 'DESC')
    .limit(params.limit + 1);
}
