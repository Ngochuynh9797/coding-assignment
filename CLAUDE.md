# CLAUDE.md

## Project
Workout Logging API: NestJS + TypeScript, PostgreSQL 18, TypeORM. The schema is owned by hand-written SQL migrations (no `synchronize`, no generated migrations); entities only map columns onto those tables, and data access goes through repositories / `EntityManager`, with QueryBuilder when the Repository API cannot express a query.

## Sources of truth
- `docs/SCHEMA.md`: tables, indexes, write flow, read flows
- `docs/API.md`: endpoint contract, error format, error codes
- `docs/tasks/`: spec per task (scope, files, tests, risks)

If the code you are about to write differs from these, **stop and ask**. Do not silently diverge. When a deviation is agreed, update the doc in the same commit.

## Layers
```
src/
  config/           env validation (zod) + ConfigModule
  common/           Nest cross-cutting, no business logic: filters, pipes, logging
  shared/           pure code: units, date, pagination, validation, errors
  infrastructure/   external systems: database, idempotency
  health/           GET /health
  modules/          catalog, workouts, personal-records
  seeds/            local/test data loaders run as standalone scripts (catalog seed)
```
Global filter and pipe are registered in `app.module.ts` (`APP_FILTER`, `APP_PIPE`).

Import rules (enforced by `import/no-restricted-paths`):
- `config/`, `common/`, `shared/`, `infrastructure/`, `health/` never import from `modules/`
- `shared/` never imports from `infrastructure/database` (no DB access in `shared/`)
- Nothing imports from `seeds/`; `seeds/` may import `modules/` and `infrastructure/`
- Modules depend one way only: `workouts → catalog`, `workouts → personal-records`, `personal-records → catalog`

## Forbidden
- `number` or float arithmetic for weights: use `Decimal`. Never compare `NUMERIC` values from `pg` as strings
- Offset pagination (`OFFSET`, `skip`): keyset cursor only
- PR formulas (volume, Epley) outside `PrCalculator`
- Hardcoded units (`'kg'`, `'lb'`, `@IsEnum([...])`, `if (unit === ...)`) outside the unit registry (tests excepted)
- Server timezone in date logic (`new Date('YYYY-MM-DD')`, `getMonth()`, ...): dates are `YYYY-MM-DD` strings; periods use the user's `tz`
- `useContainer` from class-validator
- Raw SQL via `query(...)` outside migrations, the `/health` ping and the `daily_exercise_bests` upsert in `DailyBestsWriter` (per-metric `GREATEST`/`CASE` that QueryBuilder's `orUpdate` cannot express): use entity repositories, or QueryBuilder (always with bound parameters)
- `synchronize: true` or `migration:generate`; entity columns without an explicit `name`; `NUMERIC` columns without `decimalTransformer`
- Writes to `daily_exercise_bests` outside `DailyBestsWriter` and the rebuild job (T4.4)

## Conventions
- Conventional Commits; one task = one commit; fixes to AI mistakes go in a separate commit
- Unit tests: `*.spec.ts` next to the file under test. E2E tests: `test/e2e/`
- No comments explaining *what* the code does; comment only a non-obvious *why*
- Every error returned to the client goes through `AppException` and the shared error format in `docs/API.md`. Invariant violations (bad registry at startup, unsupported unit reaching the converter) throw a plain `Error`, which the filter maps to `500 INTERNAL_ERROR`
- Log AI mistakes and rejected suggestions in `notes/ai-log.md`

## Commands
- `npm run lint`
- `npm test`
- `npm run test:e2e` (requires Docker)
- `docker compose up --build`
