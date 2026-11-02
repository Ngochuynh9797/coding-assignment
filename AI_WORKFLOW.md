# AI Workflow

## Tools and what they were used for

**Claude Code** (CLI, VS Code extension) was the only AI tool, used in every phase:

| Activity | How the AI was used | What I decided or did myself |
|---|---|---|
| Architecture & schema | Drafted `docs/SCHEMA.md`, `docs/API.md` and the per-phase specs in `docs/tasks/`; asked to critique its own design in 3 review rounds | Curated catalog instead of free-text exercises, PostgreSQL over MongoDB, read model for PRs, every scope cut (no update/delete, no auth) |
| Coding | Wrote most of the code, one task at a time from the spec, in plan mode first | Approved or rejected each plan; required Repository/QueryBuilder over raw SQL; requested the review refactors |
| Testing | Wrote unit tests first for the calculation logic, then the e2e suite | Chose the expected values to check against (hand-computed, not copied from the implementation) and asked for mutation checks on suspicious tests |
| Debugging | Investigated failures from `tsc`, Jest, `curl` smoke tests and container logs | Ran the manual checks that found the bugs unit tests could not (request id, image contents) |
| Docs | Drafted README, PERFORMANCE.md and this file | Every number and claim checked against the code, a query or a command output before committing |

## Where the AI was wrong or suboptimal

The AI was corrected many more times than listed here; these four shaped the project the most.

**1. Muscle groups as a single table (design).**
- *AI proposed:* one `exercise_muscle_groups` table storing each exercise's muscle group as a value, with no list of groups, so typos (`chest` / `Chest`) become new groups and renaming a group rewrites every row.
- *Fix:* a `muscle_groups` table (`code` UNIQUE, `name`) plus a join table `exercise_muscle_groups (exercise_id, muscle_group_id)` with foreign keys on both sides: a many-to-many mapping kept as data, with the seed rejecting unknown codes. → `docs/SCHEMA.md`.

**2. Folder structure without layers (Phase 1).**
- *AI proposed:* no `modules/` folder, with `config` and `common` at the same level as `workouts` and `personal-records`, so nothing separated cross-cutting code from features.
- *Fix:* `config/`, `common/`, `shared/`, `infrastructure/`, `health/` beside `modules/{catalog,workouts,personal-records}`, with the layer rules in CLAUDE.md enforced by ESLint `import/no-restricted-paths`. → `CLAUDE.md` § Layers, `eslint.config.mjs`.

**3. Covering index that would have cost every write (design).**
- *AI proposed:* the `best_*` columns in the `INCLUDE` list of the `daily_exercise_bests` primary key for an "index-only scan". The claim was wrong (the query reads other columns too), and since every upsert changes those columns, no update could be HOT.
- *Fix:* no `INCLUDE` and `fillfactor = 90`, so upserts stay HOT; the PR query reads the heap, at most one row per training day. → `docs/SCHEMA.md` § Indexes.

**4. `BIGSERIAL` ids for workout data (design).**
- *AI proposed:* `BIGSERIAL` primary keys for `workout_entries` and `workout_sets`, which exposes sequential, guessable ids that reveal how many workouts exist.
- *Fix:* UUIDv7 ids (PostgreSQL 18 `uuidv7()` default, generated in the application by the bulk log so sets and bests can reference them without `RETURNING`). UUIDv7 is time-ordered, so B-tree inserts stay append-mostly and same-day entries still paginate in logging order; the catalog tables keep `SERIAL`. → `docs/SCHEMA.md` § Design decisions.

## Suggestions I rejected

**Auto-creating exercises on first use (design).** The AI's first design did get-or-create on an unseen `exerciseName`. Rejected: it fills the catalog with typos and duplicates (`Bench press`, `Bench Pres`), needs invented rules for unmanaged exercises, and adds a get-or-create race to the write path. Chosen instead: an admin-curated catalog, `400 UNKNOWN_EXERCISE` listing every unknown name, and `GET /exercises` for discovery. → `docs/SCHEMA.md` § Assumption.

**In-process cron to purge idempotency keys (Phase 4).** The AI implemented the design-phase spec's hourly `@nestjs/schedule` job deleting expired keys in batches. Rejected in review as over-engineering for this scope: a new dependency, a background job on every replica, SQL verified only by hand, and not required by the assignment. Removed; keys are kept indefinitely, and SCHEMA.md "What would change at scale" describes the cleanup to add (`pg_cron` or a scheduled job, or partitioning by `created_at`).

## Prompting strategy

- **Rules file:** [`CLAUDE.md`](CLAUDE.md) holds the stack, the layer rules and an explicit *Forbidden* list (no float weights, no `OFFSET`, no hardcoded units, no server-timezone dates, raw SQL only in listed places). It was tightened whenever a review found a new class of mistake.
- **Spec per task as context:** each phase has a spec in [`docs/tasks/`](docs/tasks/) with scope, files, tests and a "risks to check in AI code" section, reviewed before coding. `docs/SCHEMA.md` and `docs/API.md` are the sources of truth; CLAUDE.md tells the AI to stop and ask when code would diverge from them, and to update the doc in the same commit when a change is agreed.
- **Plan mode first:** every task started with a plan (files, tests, open questions) that I approved or corrected before any code was written. Several spec errors were caught at this step, such as raw SQL in the Phase 4 and 6 specs that CLAUDE.md forbids.
- **Small steps:** one task at a time, tests run after each one.

## How I reviewed AI code

- **Read every diff** before committing, against the spec and CLAUDE.md, not only the test result.
- **Test-first for calculations** (units, PR metrics, periods), with expected values computed by hand, so a test cannot simply mirror the implementation (a wrong expected value in the T2.2 spec was caught this way).
- **Manual checks against the real stack** (`curl`, `EXPLAIN`, `node_modules` inside the image) for what unit tests mock away (a missing request id on body-parser errors; estimated rather than measured figures in PERFORMANCE.md).
- **AI review of AI code, verified by hand:** before submission, `/code-review` ran over `src`, `scripts` and `test` with a different model (Claude Sonnet) from the one that wrote the code, so the review did not share the author's blind spots.
