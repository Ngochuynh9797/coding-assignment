# Workout Logging API

> **Work in progress.** This README currently contains only the time estimate and assumptions, written before any implementation. Setup instructions, API documentation and design notes will be added when the implementation is complete.

## Time estimate

Written on 2026-11-01, before starting implementation.

| Phase | Scope | Estimate |
|---|---|---|
| 0 | Design & setup (estimate, schema, API contract, AI rules) | ~1h |
| 1 | Scaffold & production basics (NestJS layers, config, logging, error format, Docker) | ~2h |
| 2 | Pure domain + unit tests (units, PR calculator, normalization, dates, cursor) | ~1.5h |
| 3 | Database & exercise catalog (migration, seeder, `GET /exercises`) | ~1.5h |
| 4 | Log workout (bulk, idempotency, daily bests read model) | ~2h |
| 5 | History (filters, cursor pagination, unit conversion) | ~1.5h |
| 6 | Personal records (PR by range, period comparison with timezone) | ~1.5h |
| 7 | Integration tests, edge cases & performance | ~2h |
| 8 | Docs & final review | ~1.5h |
| | **Total** | **~14h** |

## Assumptions

- **Exercises are a curated catalog managed by an admin.** Users can only log exercises that exist in the catalog; unknown names are rejected with `400 UNKNOWN_EXERCISE`. In this project the catalog is seeded from a file.
- `date` is a calendar date in the user's local timezone (`YYYY-MM-DD`), stored as `DATE`.
- Volume and PRs are computed per set. Estimated 1RM uses exactly the Epley formula from the assignment (`weight × (1 + reps / 30)`), including when `reps = 1`.
- PR ties are resolved by picking the earliest date the value was achieved.
- No update or delete of workout entries (outside the assignment scope).
- Input limits: 1–100 entries per request, 1–50 sets per entry, reps 1–1000, `weight_kg ≤ 1000`.

Full details will be in the final README.
