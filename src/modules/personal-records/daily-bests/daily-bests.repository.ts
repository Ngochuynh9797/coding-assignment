import { Injectable } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { DataSource } from 'typeorm';

export const PR_METRICS = ['maxWeight', 'maxVolume', 'bestEstimated1RM'] as const;

export type PrMetric = (typeof PR_METRICS)[number];

export interface RecordRow {
  performedOn: string;
  valueKg: Decimal;
  setId: string;
  reps: number;
  weight: Decimal;
  unit: string;
  weightKg: Decimal;
}

export type RecordRows = Map<PrMetric, RecordRow | null>;

export interface RecordRange {
  from?: string;
  to?: string;
}

interface RecordRawRow {
  metric: PrMetric;
  performed_on: string;
  value_kg: string;
  set_id: string;
  reps: number;
  weight: string;
  unit: string;
  weight_kg: string;
}

const METRIC_COLUMNS: Record<PrMetric, { value: string; setId: string }> = {
  maxWeight: { value: 'best_weight_kg', setId: 'best_weight_set_id' },
  maxVolume: { value: 'best_volume_kg', setId: 'best_volume_set_id' },
  bestEstimated1RM: { value: 'best_e1rm_kg', setId: 'best_e1rm_set_id' },
};

@Injectable()
export class DailyBestsRepository {
  constructor(private readonly dataSource: DataSource) {}

  // One round-trip for all three metrics. QueryBuilder has no UNION, so each branch is rendered by its
  // own QueryBuilder and wrapped in parentheses (otherwise ORDER BY ... LIMIT 1 would apply to the
  // whole union); the parameters are bound once on the outer query.
  // workout_sets is joined for the winning set's reps and original weight/unit. The *_set_id columns
  // have no FK: if deleting sets is ever added, a dangling id would silently drop that metric here.
  async findRecords(
    userId: string,
    exerciseId: number,
    range: RecordRange = {},
  ): Promise<RecordRows> {
    const branches = PR_METRICS.map((metric) => `(${this.branchQuery(metric, range)})`);
    const params: Record<string, unknown> = { userId, exerciseId };
    for (const metric of PR_METRICS) {
      params[metric] = metric;
    }
    if (range.from !== undefined) {
      params.from = range.from;
    }
    if (range.to !== undefined) {
      params.to = range.to;
    }

    const raw = await this.dataSource
      .createQueryBuilder()
      .addCommonTableExpression(branches.join(' UNION ALL '), 'bests')
      .select('b.metric', 'metric')
      .addSelect('b.performed_on', 'performed_on')
      .addSelect('b.value_kg', 'value_kg')
      .addSelect('s.id', 'set_id')
      .addSelect('s.reps', 'reps')
      .addSelect('s.weight', 'weight')
      .addSelect('s.unit', 'unit')
      .addSelect('s.weight_kg', 'weight_kg')
      .from('bests', 'b')
      .innerJoin('workout_sets', 's', 's.id = b.set_id')
      .setParameters(params)
      .getRawMany<RecordRawRow>();

    const rows: RecordRows = new Map(PR_METRICS.map((metric) => [metric, null]));
    for (const row of raw) {
      rows.set(row.metric, {
        performedOn: row.performed_on,
        valueKg: new Decimal(row.value_kg),
        setId: row.set_id,
        reps: row.reps,
        weight: new Decimal(row.weight),
        unit: row.unit,
        weightKg: new Decimal(row.weight_kg),
      });
    }
    return rows;
  }

  // Range scan on daily_bests_pk (user_id, exercise_id, performed_on); earliest day wins a tie.
  private branchQuery(metric: PrMetric, range: RecordRange): string {
    const { value, setId } = METRIC_COLUMNS[metric];
    const qb = this.dataSource
      .createQueryBuilder()
      .select(`CAST(:${metric} AS text)`, 'metric')
      .addSelect('d.performed_on', 'performed_on')
      .addSelect(`d.${value}`, 'value_kg')
      .addSelect(`d.${setId}`, 'set_id')
      .from('daily_exercise_bests', 'd')
      .where('d.user_id = :userId')
      .andWhere('d.exercise_id = :exerciseId');
    if (range.from !== undefined) {
      qb.andWhere('d.performed_on >= :from');
    }
    if (range.to !== undefined) {
      qb.andWhere('d.performed_on <= :to');
    }
    return qb.orderBy(`d.${value}`, 'DESC').addOrderBy('d.performed_on', 'ASC').limit(1).getQuery();
  }
}
