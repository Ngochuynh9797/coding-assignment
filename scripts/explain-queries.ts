import { cpus, release, totalmem } from 'node:os';
import { Logger } from '@nestjs/common';
import { DataSource, type Logger as TypeOrmLogger } from 'typeorm';
import { parseEnv } from '@config/env.validation';
import { buildDataSourceOptions } from '@infra/database/data-source';
import { CatalogRepository } from '@modules/catalog/catalog.repository';
import { CatalogService } from '@modules/catalog/catalog.service';
import { Exercise } from '@modules/catalog/entities/exercise.entity';
import { ExerciseMuscleGroup } from '@modules/catalog/entities/exercise-muscle-group.entity';
import { DailyBestsRepository } from '@modules/personal-records/daily-bests/daily-bests.repository';
import { PersonalRecordsService } from '@modules/personal-records/personal-records.service';
import type { HistoryQueryDto } from '@modules/workouts/history/history.query';
import { WorkoutEntry } from '@modules/workouts/entities/workout-entry.entity';
import { WorkoutSet } from '@modules/workouts/entities/workout-set.entity';
import { WorkoutHistoryService } from '@modules/workouts/history/workout-history.service';
import { WorkoutHistoryRepository } from '@modules/workouts/history/workout-history.repository';
import { UnitConverter } from '@shared/units/unit-converter';
import { BASE_UNIT_CODE, WEIGHT_UNITS } from '@shared/units/unit.registry';
import { PERF_USER } from './seed-large';

const WARMUP_RUNS = 3;
const MEASURED_RUNS = 20;
const PAGE_SIZE = 20;
const DEEP_PAGE = 2_000;
// Pages fetched per step while walking to the deep page; the walk itself is not measured.
const WALK_PAGE_SIZE = 100;
const TOP_EXERCISE = 'Bench Press';
const COMPARE_ANCHOR = '2026-10-15';

const logger = new Logger('ExplainQueries');

interface CapturedQuery {
  sql: string;
  parameters: unknown[];
}

// Records the SQL the services actually send, so EXPLAIN runs exactly what the API runs.
class CapturingLogger implements TypeOrmLogger {
  captured: CapturedQuery[] | null = null;

  logQuery(sql: string, parameters?: unknown[]): void {
    this.captured?.push({ sql, parameters: parameters ?? [] });
  }
  logQueryError(): void {}
  logQuerySlow(): void {}
  logSchemaBuild(): void {}
  logMigration(): void {}
  log(): void {}
}

interface PlanNode {
  'Node Type': string;
  'Index Name'?: string;
  'Relation Name'?: string;
  'Actual Rows': number;
  'Actual Loops': number;
  'Rows Removed by Filter'?: number;
  'Sort Method'?: string;
  'Shared Hit Blocks': number;
  'Shared Read Blocks': number;
  Plans?: PlanNode[];
}

interface ExplainJson {
  Plan: PlanNode;
  'Planning Time': number;
  'Execution Time': number;
}

interface QueryPlan {
  sql: string;
  executionMs: number;
  planningMs: number;
  sharedHit: number;
  sharedRead: number;
  scans: string[];
  sorts: string[];
  text: string;
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)]!;
}

function walkPlan(node: PlanNode, visit: (node: PlanNode) => void): void {
  visit(node);
  node.Plans?.forEach((child) => walkPlan(child, visit));
}

async function explain(dataSource: DataSource, query: CapturedQuery): Promise<QueryPlan> {
  const [json] = await dataSource.query<{ 'QUERY PLAN': ExplainJson[] }[]>(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query.sql}`,
    query.parameters,
  );
  const text = await dataSource.query<{ 'QUERY PLAN': string }[]>(
    `EXPLAIN (ANALYZE, BUFFERS) ${query.sql}`,
    query.parameters,
  );
  const plan = json!['QUERY PLAN'][0]!;
  const scans: string[] = [];
  const sorts: string[] = [];
  walkPlan(plan.Plan, (node) => {
    const rows = node['Actual Rows'] * node['Actual Loops'];
    if (node['Node Type'].includes('Scan')) {
      const target = node['Index Name'] ?? node['Relation Name'] ?? '';
      const removed = node['Rows Removed by Filter'] ?? 0;
      scans.push(
        `${node['Node Type']} ${target}: ${rows} rows${removed > 0 ? ` (+${removed} filtered out)` : ''}`,
      );
    }
    if (node['Node Type'].includes('Sort')) {
      sorts.push(`${node['Node Type']} ${node['Sort Method'] ?? ''}: ${rows} rows out`);
    }
  });
  return {
    sql: query.sql.replace(/\s+/g, ' ').trim(),
    executionMs: plan['Execution Time'],
    planningMs: plan['Planning Time'],
    sharedHit: plan.Plan['Shared Hit Blocks'],
    sharedRead: plan.Plan['Shared Read Blocks'],
    scans,
    sorts,
    text: text.map((row) => row['QUERY PLAN']).join('\n'),
  };
}

interface Scenario {
  name: string;
  run: () => Promise<unknown>;
}

async function measure(
  dataSource: DataSource,
  capture: CapturingLogger,
  scenario: Scenario,
): Promise<void> {
  for (let i = 0; i < WARMUP_RUNS; i++) {
    await scenario.run();
  }
  const timings: number[] = [];
  for (let i = 0; i < MEASURED_RUNS; i++) {
    const startedAt = performance.now();
    await scenario.run();
    timings.push(performance.now() - startedAt);
  }
  timings.sort((a, b) => a - b);

  capture.captured = [];
  await scenario.run();
  const queries = capture.captured;
  capture.captured = null;
  const plans: QueryPlan[] = [];
  for (const query of queries) {
    plans.push(await explain(dataSource, query));
  }

  const ms = (value: number) => value.toFixed(2);
  console.log(`\n## ${scenario.name}\n`);
  console.log(
    `End-to-end through the service (${MEASURED_RUNS} runs): p50 ${ms(percentile(timings, 0.5))} ms, ` +
      `p95 ${ms(percentile(timings, 0.95))} ms, max ${ms(timings.at(-1)!)} ms; ${queries.length} queries`,
  );
  for (const [i, plan] of plans.entries()) {
    console.log(
      `\n### Query ${i + 1}: execution ${ms(plan.executionMs)} ms, planning ${ms(plan.planningMs)} ms, ` +
        `buffers hit=${plan.sharedHit} read=${plan.sharedRead}`,
    );
    console.log(`- SQL: \`${plan.sql}\``);
    plan.scans.forEach((scan) => console.log(`- ${scan}`));
    plan.sorts.forEach((sort) => console.log(`- ${sort}`));
    console.log('\n```\n' + plan.text + '\n```');
  }
}

async function printEnvironment(dataSource: DataSource): Promise<void> {
  const setting = async (sql: string, params: string[] = []): Promise<string> => {
    const [row] = await dataSource.query<Record<string, string>[]>(sql, params);
    return Object.values(row!)[0]!;
  };
  const cpu = cpus();
  console.log('# Environment\n');
  console.log(`- CPU: ${cpu[0]?.model ?? 'unknown'} (${cpu.length} threads)`);
  console.log(`- RAM: ${(totalmem() / 1024 ** 3).toFixed(1)} GiB, kernel ${release()}`);
  console.log(`- Node.js ${process.version}`);
  console.log(`- ${await setting('SELECT version()')}`);
  for (const name of ['shared_buffers', 'work_mem', 'effective_cache_size', 'random_page_cost']) {
    console.log(`- ${name} = ${await setting('SELECT current_setting($1)', [name])}`);
  }
  const entries = dataSource.getRepository(WorkoutEntry);
  console.log(
    `- workout_entries: ${await entries.count()} total, ${await entries.countBy({ userId: PERF_USER })} for ${PERF_USER}`,
  );
  console.log(`- workout_sets: ${await dataSource.getRepository(WorkoutSet).count()}`);
  for (const table of ['workout_entries', 'workout_sets', 'daily_exercise_bests']) {
    const size = await setting('SELECT pg_size_pretty(pg_total_relation_size($1::regclass))', [
      table,
    ]);
    console.log(`- ${table} size with indexes: ${size}`);
  }
}

async function main(): Promise<void> {
  const capture = new CapturingLogger();
  const dataSource = await new DataSource({
    ...buildDataSourceOptions(parseEnv(process.env)),
    logging: ['query'],
    logger: capture,
  }).initialize();
  try {
    const converter = new UnitConverter(WEIGHT_UNITS);
    const catalog = new CatalogService(
      new CatalogRepository(
        dataSource.getRepository(Exercise),
        dataSource.getRepository(ExerciseMuscleGroup),
      ),
    );
    const history = new WorkoutHistoryService(
      catalog,
      new WorkoutHistoryRepository(dataSource),
      converter,
    );
    const records = new PersonalRecordsService(
      catalog,
      new DailyBestsRepository(dataSource),
      converter,
    );
    const getHistory = (query: Partial<HistoryQueryDto>) =>
      history.getHistory(PERF_USER, { limit: PAGE_SIZE, ...query });

    await printEnvironment(dataSource);

    // Keyset all the way: the deep cursor is reached by following nextCursor, never with OFFSET.
    let deepCursor: string | undefined;
    for (let seen = 0; seen < DEEP_PAGE * PAGE_SIZE; seen += WALK_PAGE_SIZE) {
      const page = await getHistory({
        limit: WALK_PAGE_SIZE,
        ...(deepCursor && { cursor: deepCursor }),
      });
      if (page.pageInfo.nextCursor === null) {
        throw new Error(
          `${PERF_USER} has fewer than ${DEEP_PAGE * PAGE_SIZE} entries; run seed:large`,
        );
      }
      deepCursor = page.pageInfo.nextCursor;
    }

    const scenarios: Scenario[] = [
      { name: '1. History, first page, no filter', run: () => getHistory({}) },
      {
        name: `2. History, page ${DEEP_PAGE + 1} (after ${DEEP_PAGE * PAGE_SIZE} entries)`,
        run: () => getHistory({ cursor: deepCursor! }),
      },
      { name: '3. History, exercise=press', run: () => getHistory({ exercise: 'press' }) },
      { name: '4. History, muscleGroup=chest', run: () => getHistory({ muscleGroup: 'chest' }) },
      // Not in the spec's list: chest matches ~40% of entries, so the date-ordered scan stops early.
      // A rare group spread over several exercises is the case a k-way merge would be for.
      {
        name: '4b. History, muscleGroup=core (rare)',
        run: () => getHistory({ muscleGroup: 'core' }),
      },
      {
        name: `5. Personal records, all time, ${TOP_EXERCISE}`,
        run: () => records.getRecords(PERF_USER, { exercise: TOP_EXERCISE }),
      },
      {
        name: `6. Compare, period=month, anchor=${COMPARE_ANCHOR}, ${TOP_EXERCISE}`,
        run: () =>
          records.compare(PERF_USER, {
            exercise: TOP_EXERCISE,
            unit: BASE_UNIT_CODE,
            period: 'month',
            tz: 'UTC',
            anchor: COMPARE_ANCHOR,
          }),
      },
    ];
    for (const scenario of scenarios) {
      await measure(dataSource, capture, scenario);
    }
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
