# AI log

Record of cases where the AI was wrong, suboptimal, or had a suggestion rejected. Only real incidents; source material for `AI_WORKFLOW.md`.

Types:
- `wrong`: incorrect claim or code (would cause a bug or a false statement)
- `suboptimal`: works, but has a real cost (performance, maintainability)
- `rejected`: a valid option that was deliberately not chosen

## Template

```markdown
### <short title>
- **Date:** YYYY-MM-DD
- **Task:** T<phase>.<n> or Design
- **Type:** wrong | suboptimal | rejected
- **AI proposed:** what the AI suggested or wrote
- **Detected by:** review / test / EXPLAIN / reading docs / ...
- **Fix:** what was done instead
- **Commit:** <hash> <message>
```

---

## Design phase

### "Index-only scan" claim for the PR query
- **Date:** TODO: bổ sung
- **Task:** Design (`docs/SCHEMA.md`, indexes)
- **Type:** wrong
- **AI proposed:** Described the PR query on `daily_exercise_bests` as served by an index-only scan, although the query selects columns that were not in the index's `INCLUDE` list, so the heap must be read.
- **Detected by:** TODO: bổ sung
- **Fix:** Claim removed. The index section now states that the PR query reads the heap and why that is cheap (rows per `(user, exercise)` are bounded by training days); see also the `INCLUDE` entry below.
- **Commit:** T0.2 `docs: add database schema, API contract and task specs`

### FK on `best_*_set_id` blocks cascading deletes of sets
- **Date:** TODO: bổ sung
- **Task:** Design (`docs/SCHEMA.md`, `daily_exercise_bests`)
- **Type:** wrong
- **AI proposed:** Foreign keys from `daily_exercise_bests.best_*_set_id` to `workout_sets.id`. These would block the `ON DELETE CASCADE` from `workout_entries` to `workout_sets`.
- **Detected by:** TODO: bổ sung
- **Fix:** The `*_set_id` columns are logical references without FKs. The table is derived data, kept consistent by the write flow and the rebuild job; if deletion is added later, the affected day is recomputed.
- **Commit:** T0.2 `docs: add database schema, API contract and task specs`

### `INCLUDE` columns that every upsert changes
- **Date:** TODO: bổ sung
- **Task:** Design (`docs/SCHEMA.md`, indexes)
- **Type:** suboptimal
- **AI proposed:** Adding the `best_*` columns to the primary key index of `daily_exercise_bests` via `INCLUDE`. Those columns change on every upsert, so each update must also write the index and cannot be a HOT update.
- **Detected by:** TODO: bổ sung
- **Fix:** `daily_bests_pk` has no `INCLUDE` columns; the PR query reads the heap.
- **Commit:** T0.2 `docs: add database schema, API contract and task specs`

### Auto-creating exercises on first use
- **Date:** TODO: bổ sung
- **Task:** Design (`docs/SCHEMA.md`, exercise catalog)
- **Type:** rejected
- **AI proposed:** Get-or-create an exercise row when a log request contains an unseen `exerciseName`.
- **Detected by:** TODO: bổ sung
- **Fix:** Curated, admin-managed catalog seeded from `config/exercise-metadata.json`. Unknown names are rejected with `400 UNKNOWN_EXERCISE` listing every unknown field; clients discover valid names via `GET /exercises`. This also removes the get-or-create race from the write flow.
- **Commit:** T0.2 `docs: add database schema, API contract and task specs`

### Unit round-trip test passes with a wrong factor
- **Date:** TODO: bổ sung
- **Task:** Design (T2.1 spec, unit tests)
- **Type:** wrong
- **AI proposed:** Testing unit conversion with a round trip (`kg → lb → kg ≈ original`). The round trip returns the original value for any factor, so the test passes even when `kgPerUnit` is wrong.
- **Detected by:** TODO: bổ sung
- **Fix:** Each registry entry carries a `reference: { value, kg }`; tests check `toStoredKg(reference.value, code) = reference.kg` for every unit, plus fixed known values (e.g. 225 lb → 102.0583 kg). Round-trip is not used as the main test.
- **Commit:** T0.2 `docs: add database schema, API contract and task specs`

### Float arithmetic makes `PrCalculator` disagree with stored values
- **Date:** TODO: bổ sung
- **Task:** Design (T2.2 spec, PR calculation)
- **Type:** wrong
- **AI proposed:** Computing volume and Epley 1RM with JavaScript `number` (`weight * (1 + reps / 30)`). The result drifts from what PostgreSQL stores in `NUMERIC` columns, so incremental bests, the rebuild job and tie detection can disagree.
- **Detected by:** TODO: bổ sung
- **Fix:** All weight arithmetic uses `Decimal`; results are rounded to the column scale (4 decimal places, half-up). Epley is computed as `weightKg × (30 + reps) / 30` to avoid truncating `1/30`.
- **Commit:** T0.2 `docs: add database schema, API contract and task specs`
