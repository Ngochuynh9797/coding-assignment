# Performance

Measured on 2026-11-02 against a user with **50 000 workout entries** (~200 000 sets), next to 200 other users, to check the requirement "endpoints must perform well with 50,000+ workout entries per user". Every number below comes from `npm run perf:explain`; nothing was edited by hand.

**Result:** every measured endpoint path stays under **2.5 ms p95** (target: 50 ms). The deep history page (after 40 000 entries) costs the same as the first page, which confirms the keyset pagination. No query sorts more than a few hundred rows, so the LATERAL k-way merge kept in reserve for the muscle-group filter (T5.2) is **not needed**.

## Environment

| | |
|---|---|
| CPU | AMD Ryzen 5 PRO 6650U, 12 threads (laptop) |
| RAM | 14.4 GiB |
| PostgreSQL | 18.6 in Docker (`postgres:18` from `docker-compose.yml`), default settings: `shared_buffers = 128MB`, `work_mem = 4MB`, `effective_cache_size = 4GB`, `random_page_cost = 4` |
| Node.js | 22.15.1 |
| Client | the script, on the same machine (localhost → Docker) |

## Dataset

Produced by `scripts/seed-large.ts` (fixed random seed, so every run produces the same data):

| | |
|---|---|
| `perf-user` | 50 000 entries over 5 years (2021-11-01 → 2026-10-31), ~27 entries per day, 3–5 sets each (199 715 sets) |
| Exercise mix | 40 catalog exercises with a skewed (1/rank) distribution: Bench Press alone is 23.6% of entries, chest exercises together 35.5%, core 2.8% |
| Units | 20.1% of sets entered in a non-base unit from the registry |
| Background | 200 users × 2 000 entries (1–4 entries on about every other day) |
| Totals | 450 009 entries, 1 799 447 sets, 393 810 `daily_exercise_bests` rows |
| Size (with indexes) | `workout_entries` 120 MB, `workout_sets` 276 MB, `daily_exercise_bests` 76 MB |

Rows are inserted with `INSERT … SELECT FROM unnest(...)` in batches of 5 000 entries; then `daily_exercise_bests` is rebuilt with the production rebuild job and `VACUUM (ANALYZE)` runs, so the planner has real statistics. Seeding takes ~50 s.

## Method

- Each scenario calls the **real service** (`WorkoutHistoryService.getHistory`, `PersonalRecordsService.getRecords` / `compare`) with the repositories and query builders the API uses, so the SQL is exactly what the API sends. HTTP, validation and JSON serialization are excluded: these are database-level timings plus TypeORM and `pg` overhead.
- 3 warm-up runs, then 20 measured runs; p50 and p95 by nearest rank.
- One more run captures every SQL statement (TypeORM logger) and runs `EXPLAIN (ANALYZE, BUFFERS)` on it with the same parameters.
- The deep-page cursor is reached by following `nextCursor` (keyset), never with `OFFSET`.

## Results

| # | Scenario | Queries | p50 | p95 | DB execution (sum, EXPLAIN) |
|---|---|---|---|---|---|
| 1 | History, first page (`limit=20`), no filter | 2 | 1.02 ms | 1.15 ms | 0.06 ms |
| 2 | History, page 2 001 (after 40 000 entries) | 2 | 1.14 ms | 1.55 ms | 0.07 ms |
| 3 | History, `exercise=press` (11 exercises) | 3 | 1.47 ms | 1.94 ms | 0.08 ms |
| 4 | History, `muscleGroup=chest` | 3 | 1.57 ms | 1.97 ms | 0.10 ms |
| 4b | History, `muscleGroup=core` (rare, ~3% of entries) | 3 | 1.54 ms | 2.13 ms | 0.20 ms |
| 5 | Personal records, all time, Bench Press | 2 | 1.98 ms | 2.24 ms | 1.24 ms |
| 6 | Compare `period=month`, anchor 2026-10-15, Bench Press | 3 | 1.49 ms | 1.78 ms | 0.15 ms |

Scenario 4b is not in the task's list; it was added to check the muscle-group decision with a filter that matches few entries (see below). The run before this one gave the same figures within ±0.3 ms.

All buffers were `shared hit` (`read=0`): the data was in cache. These are warm-cache, single-client numbers; they do not show behaviour under concurrent load or with a cold cache.

## Query plans (abridged)

**1–2. History, no filter.** Both pages use the same plan; only the cursor condition differs.

```
Limit (rows=21)
  -> Nested Loop
       -> Index Scan using entries_user_date on workout_entries e   (rows=21)
            Index Cond: user_id = 'perf-user'
                   [page 2 001: AND ROW(performed_on, id) < ROW('2022-10-25', '01a19a2f-…')]
       -> Memoize -> Index Scan using exercises_pkey on exercises x
Buffers: shared hit=30 (page 2 001: 28)     Execution: 0.04 ms (page 2 001: 0.05 ms)
---
Index Scan using sets_entry on workout_sets   (rows=79, entry_id = ANY(20 ids))   Execution: 0.02 ms
```

The index scan starts at the cursor and reads 21 rows whatever the page depth: page 2 001 reads 28 buffers against 30 for page 1.

**3. `exercise=press`.** The name filter is resolved on the catalog first (`Seq Scan on exercises`, 66 rows, 0.01 ms → 11 ids). The entries query then scans `entries_user_date` backwards and filters by `exercise_id = ANY(11 ids)`: 21 rows returned, 36 rows skipped, 15 buffers, 0.04 ms.

**4. `muscleGroup=chest`.** Same shape: catalog lookup (10 ids for chest, 0.03 ms), then `entries_user_date` backwards with a filter: 21 rows returned, 44 skipped, 14 buffers, 0.04 ms. No sort.

**4b. `muscleGroup=core`.** Same plan (6 ids, 1 412 matching entries); because core exercises are rarer, the scan skips 666 rows to find 21: 25 buffers, 0.11 ms.

**5. Personal records, all time.** One statement, three `ORDER BY … LIMIT 1` branches (one per metric) joined to `workout_sets` for the winning sets:

```
Nested Loop (rows=3)
  -> Append
       -> Limit -> Sort (top-N heapsort, Sort Key: best_weight_kg DESC, performed_on)
            -> Bitmap Heap Scan on daily_exercise_bests   (rows=1823, heap blocks=30)
                 -> Bitmap Index Scan on daily_bests_pk   (user_id, exercise_id)
       -> (same for best_volume_kg, best_e1rm_kg)
  -> Index Scan using workout_sets_pkey (3 rows)
Buffers: shared hit=138     Execution: 1.23 ms
```

Each branch reads all 1 823 days on which Bench Press was logged (the read model has one row per day, not per set: 11 793 Bench Press entries collapse to 1 823 rows) and keeps the top one with a top-N heapsort. Cost grows with the number of *training days* for that exercise, not with the number of entries or sets.

**6. Compare month.** Two of the same statement (current and previous month, run in parallel by the service), each a range scan on `daily_bests_pk`: 31 and 30 rows per branch, 24 buffers, 0.08 ms and 0.06 ms.

## Decision: LATERAL k-way merge for the muscle-group filter

The fallback described in T5.2 (rewrite `exercise_id = ANY(ids)` as `unnest(ids) CROSS JOIN LATERAL (… ORDER BY … LIMIT n+1)`) was to be implemented only if query 4 had to sort more than 10 000 rows or missed the 50 ms target. It does neither, so it was **not implemented**.

The planner picks the cheaper of two plans from the statistics of the concrete ids (the API binds them as a literal array, so each request gets a custom plan):

- **Common filter** (chest, `press`): walk `entries_user_date` in `(performed_on, id)` order and stop after `limit + 1` matches. No sort; a few dozen rows read.
- **Rare filter**: when the ids match few entries, it switches to `entries_user_exercise_date` and sorts what it found. Checked by hand with `EXPLAIN ANALYZE` on the same SQL: `muscleGroup=full_body` (6 ids, 323 matching entries) → bitmap scan + top-N heapsort of 323 rows, 1.97 ms; ids the user never logged → index scan returning 0 rows, 0.21 ms.

The expensive case for the k-way merge would be a filter that matches tens of thousands of entries that are *all old*, so the date-ordered walk reads far before finding matches while the planner still prefers it. That data shape was not produced by this dataset. Re-run `perf:explain` if the data or the indexes change.

## Reproduce

```bash
docker compose up -d db
cp .env.example .env              # set DATABASE_URL to the db port (DB_HOST_PORT, default 5432)
npm run migration:run
npm run seed:catalog
npm run seed:large                # ~50 s; re-runnable, only replaces the perf-* users' data
npm run perf:explain > perf.md    # environment, timings and full EXPLAIN output per query
```
