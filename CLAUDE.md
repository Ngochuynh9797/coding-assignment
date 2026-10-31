# CLAUDE.md

## Project
Workout Logging API: NestJS + TypeScript, PostgreSQL 18, TypeORM with hand-written SQL migrations (no entities, no `synchronize`).

## Sources of truth
- `docs/SCHEMA.md`: tables, indexes, write flow, read flows
- `docs/API.md`: endpoint contract, error format, error codes
- `docs/tasks/`: spec per task (scope, files, tests, risks)

If the code you are about to write differs from these, **stop and ask**. Do not silently diverge. When a deviation is agreed, update the doc in the same commit.

## Layers
```
src/
  infrastructure/   config, logging, database, http, idempotency, health
  shared/           pure code: units, date, pagination, validation, errors
  modules/          catalog, workouts, personal-records
```
Import rules (enforced by `import/no-restricted-paths`):
- `infrastructure/` and `shared/` never import from `modules/`
- `shared/` never imports from `infrastructure/database` (no DB access in `shared/`)
- Modules depend one way only: `workouts → catalog`, `workouts → personal-records`, `personal-records → catalog`

## Forbidden
- `number` or float arithmetic for weights: use `Decimal`. Never compare `NUMERIC` values from `pg` as strings
- Offset pagination (`OFFSET`, `skip`): keyset cursor only
- PR formulas (volume, Epley) outside `PrCalculator`
- Hardcoded units (`'kg'`, `'lb'`, `@IsEnum([...])`, `if (unit === ...)`) outside the unit registry (tests excepted)
- Server timezone in date logic (`new Date('YYYY-MM-DD')`, `getMonth()`, ...): dates are `YYYY-MM-DD` strings; periods use the user's `tz`
- `useContainer` from class-validator
- Writes to `daily_exercise_bests` outside `DailyBestsWriter` and the rebuild job (T4.4)

## Conventions
- Conventional Commits; one task = one commit; fixes to AI mistakes go in a separate commit
- Unit tests: `*.spec.ts` next to the file under test. E2E tests: `test/e2e/`
- No comments explaining *what* the code does; comment only a non-obvious *why*
- Every error goes through `AppException` and the shared error format in `docs/API.md`
- Log AI mistakes and rejected suggestions in `notes/ai-log.md`

## Commands
- `npm run lint`
- `npm test`
- `npm run test:e2e` (requires Docker)
- `docker compose up --build`
