# API Contract

This is the contract the implementation is reviewed against. If the code needs to differ, this file is changed first, in the same commit.

## Conventions

- **Base path:** `/api/v1`. All paths below are relative to it.
- **Content type:** `application/json` for request and response bodies. Request bodies are limited to 1 MB.
- **User:** `userId` is a path parameter matching `^[A-Za-z0-9_-]{1,64}$`. There is no authentication; user identity is owned by another service.
- **Request id:** every response carries an `x-request-id` header. A client may send its own `x-request-id` (up to 128 characters) and it is reused; otherwise a UUID is generated. Error bodies repeat it as `requestId`.
- **Dates:** calendar dates in the user's local timezone, formatted `YYYY-MM-DD`, and must be real dates (`2026-02-30` is rejected). Ranges (`from`/`to`) are inclusive.
- **Weights:** request weights are JSON numbers (a string such as `"100"` is rejected) with at most 4 decimal places. Original weights are returned exactly as entered; converted and derived values are rounded to 2 decimal places.
- **Unknown fields** in a body or query string are rejected with `VALIDATION_ERROR`.

### Units

| Code | Accepted aliases |
|---|---|
| `kg` | `kgs`, `kilogram`, `kilograms` |
| `lb` | `lbs`, `pound`, `pounds` |

Unit input is case- and whitespace-insensitive (`" LBS "` is accepted as `lb`). Any other value is rejected with `VALIDATION_ERROR`, and the message lists the supported codes.

The `unit` query parameter controls output units:

| Endpoint | `unit` omitted | `unit` given |
|---|---|---|
| History | Each set keeps its original `weight`/`unit`, no `converted` field | Each set also gets `converted` in that unit |
| Personal records | Each record uses the unit of the set that achieved it | All records use that unit |
| PR comparison | Defaults to `kg` (both periods must share a unit for the delta to make sense) | Both periods and the delta use that unit |

### Response envelope

Successful responses wrap the payload in `data`. List endpoints with pagination add `pageInfo`. `meta` carries non-error information such as an empty-result message.

**Empty results are not errors:** they return `200` with `data: []` (or `null` records) and a human-readable `meta.message`.

### Errors

Every error uses the same shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      { "field": "entries[0].sets[1].unit", "issue": "Unsupported unit 'stn'. Supported units: kg, lb" }
    ]
  },
  "requestId": "6f1c2a9e-3b7d-4e58-a1c4-9d2f0e8b7a63"
}
```

- `field` is a path into the request: body fields as `entries[2].sets[0].reps`, query parameters by name (`from`), headers as `headers.idempotency-key`.
- `details` lists **every** problem found, not only the first one. It is `[]` when there is nothing field-specific to report.
- 5xx responses never include stack traces or database messages.

| Code | HTTP | When |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Invalid body, query, path parameter or header (includes unsupported unit, invalid date, weight above the kg limit, malformed JSON) |
| `UNKNOWN_EXERCISE` | 400 | `POST` body has an `exerciseName` that is not in the catalog |
| `INVALID_CURSOR` | 400 | The pagination cursor is malformed or has been tampered with |
| `EXERCISE_NOT_FOUND` | 404 | PR or PR comparison requested for an exercise that is not in the catalog |
| `NOT_FOUND` | 404 | The route does not exist |
| `CONFLICT` | 409 | A database constraint (unique or foreign key) was violated and the endpoint has no more specific error for it |
| `IDEMPOTENCY_KEY_REUSED` | 422 | The same `Idempotency-Key` was sent with a different body |
| `INTERNAL_ERROR` | 500 | Unexpected error |
| `SERVICE_UNAVAILABLE` | 503 | `GET /health` when the database is not reachable |

---

## `POST /users/:userId/workouts`

Logs one or more workout entries in a single atomic operation: either every entry is saved or none is.

### Headers

| Header | Required | Rules |
|---|---|---|
| `Idempotency-Key` | No | 1–255 printable ASCII characters (`^[\x21-\x7E]{1,255}$`) |

### Body

| Field | Type | Rules |
|---|---|---|
| `entries` | array | 1–100 items |
| `entries[].date` | string | `YYYY-MM-DD`, at most one day after the current UTC date |
| `entries[].exerciseName` | string | 1–100 characters; must match a catalog exercise (case- and whitespace-insensitive) |
| `entries[].sets` | array | 1–50 items; array order is the set order (`setIndex` = position + 1) |
| `entries[].sets[].reps` | integer | 1–1000 |
| `entries[].sets[].weight` | number | `>= 0` (0 = bodyweight), at most 4 decimal places; after conversion must be `<= 1000` kg |
| `entries[].sets[].unit` | string | Supported unit code or alias |

The same exercise may appear in several entries, including on the same date.

### Example

```http
POST /api/v1/users/user_123/workouts
Content-Type: application/json
Idempotency-Key: 3c9b1f0a-log-2026-10-31

{
  "entries": [
    {
      "date": "2026-10-31",
      "exerciseName": "Bench Press",
      "sets": [
        { "reps": 5, "weight": 225, "unit": "lb" },
        { "reps": 3, "weight": 235, "unit": "LBS" }
      ]
    },
    {
      "date": "2026-10-31",
      "exerciseName": "back squat",
      "sets": [{ "reps": 5, "weight": 140, "unit": "kg" }]
    }
  ]
}
```

`201 Created`

```json
{
  "data": {
    "entries": [
      {
        "id": "019a3f2e-7c41-7d3a-9b2e-5f1c8a6d4e21",
        "date": "2026-10-31",
        "exercise": { "id": 1, "name": "Bench Press" },
        "sets": [
          { "id": "019a3f2e-7c41-7d3a-9b2e-5f1c8a6d4e22", "setIndex": 1, "reps": 5, "weight": 225, "unit": "lb", "weightKg": 102.06 },
          { "id": "019a3f2e-7c41-7d3a-9b2e-5f1c8a6d4e23", "setIndex": 2, "reps": 3, "weight": 235, "unit": "lb", "weightKg": 106.59 }
        ]
      },
      {
        "id": "019a3f2e-7c41-7d3a-9b2e-5f1c8a6d4e24",
        "date": "2026-10-31",
        "exercise": { "id": 7, "name": "Back Squat" },
        "sets": [
          { "id": "019a3f2e-7c41-7d3a-9b2e-5f1c8a6d4e25", "setIndex": 1, "reps": 5, "weight": 140, "unit": "kg", "weightKg": 140 }
        ]
      }
    ]
  }
}
```

`exercise.name` is the catalog's display name, whatever casing the request used. `unit` is the normalized code.

### Idempotency

- With an `Idempotency-Key`, the first request is processed normally and its response is stored. A retry with the same key and the same body returns the stored status and body unchanged, with the header `Idempotent-Replayed: true`, and nothing is written again.
- Bodies are compared after validation and normalization, so different key order or `"LBS"` vs `"lb"` count as the same body. The same key with a different body → `422 IDEMPOTENCY_KEY_REUSED`.
- If two requests with the same key arrive at the same time, the second waits for the first and then receives the replay.
- If the first request fails (for example `UNKNOWN_EXERCISE`), nothing is stored for the key, so the client can retry with the same key and a corrected body.
- Keys are currently kept indefinitely: reusing an old key replays its response (same body) or returns `422` (different body). Use a fresh random key (e.g. a UUID) per logical request.

### Errors

`VALIDATION_ERROR` (400), `UNKNOWN_EXERCISE` (400), `IDEMPOTENCY_KEY_REUSED` (422).

Unknown exercise names are all reported at once:

```json
{
  "error": {
    "code": "UNKNOWN_EXERCISE",
    "message": "One or more exercises are not in the catalog. Use GET /api/v1/exercises to find valid names.",
    "details": [
      { "field": "entries[2].exerciseName", "issue": "Unknown exercise 'Bech Press'" }
    ]
  },
  "requestId": "6f1c2a9e-3b7d-4e58-a1c4-9d2f0e8b7a63"
}
```

A weight above the limit after conversion:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      { "field": "entries[0].sets[0].weight", "issue": "exceeds maximum of 1000 kg" }
    ]
  },
  "requestId": "6f1c2a9e-3b7d-4e58-a1c4-9d2f0e8b7a63"
}
```

---

## `GET /users/:userId/workouts`

Workout history, newest first, with cursor-based pagination.

### Query parameters

| Param | Required | Rules |
|---|---|---|
| `exercise` | No | 1–100 characters. Partial, case- and whitespace-insensitive match on the exercise name; `%` and `_` match literally |
| `muscleGroup` | No | Muscle group code, `^[a-z_]{1,50}$` (e.g. `chest`) |
| `from` | No | `YYYY-MM-DD`, inclusive |
| `to` | No | `YYYY-MM-DD`, inclusive; `from` must be on or before `to` |
| `unit` | No | Supported unit; adds `converted` to every set |
| `limit` | No | Integer 1–100, default `20` |
| `cursor` | No | `pageInfo.nextCursor` from the previous page (opaque, up to 200 characters) |

`exercise` and `muscleGroup` can be combined (an entry must match both). A `muscleGroup` code that does not exist returns an empty result, not an error.

Entries are ordered by `date` descending; entries on the same date are ordered newest-logged first. The order is stable across pages.

### Example

```http
GET /api/v1/users/user_123/workouts?exercise=press&from=2026-10-01&to=2026-10-31&unit=kg&limit=1
```

`200 OK`

```json
{
  "data": [
    {
      "id": "019a3f2e-7c41-7d3a-9b2e-5f1c8a6d4e21",
      "date": "2026-10-31",
      "exercise": { "id": 1, "name": "Bench Press" },
      "sets": [
        { "setIndex": 1, "reps": 5, "weight": 225, "unit": "lb", "converted": { "weight": 102.06, "unit": "kg" } },
        { "setIndex": 2, "reps": 3, "weight": 235, "unit": "lb", "converted": { "weight": 106.59, "unit": "kg" } }
      ],
      "loggedAt": "2026-10-31T10:15:00.000Z"
    }
  ],
  "pageInfo": { "nextCursor": "eyJ2IjoxLCJkIjoiMjAyNi0xMC0zMSIsImlkIjoiMDE5YTNmMmUtN2M0MS03ZDNhLTliMmUtNWYxYzhhNmQ0ZTIxIn0", "hasMore": true },
  "meta": {}
}
```

- Without `unit`, sets have no `converted` field.
- When `unit` equals the set's original unit, `converted.weight` is exactly the original weight.
- `exercise.name` is the current display name in the catalog.
- `loggedAt` is when the entry was recorded (UTC).

Empty result:

```json
{
  "data": [],
  "pageInfo": { "nextCursor": null, "hasMore": false },
  "meta": { "message": "No workouts found for the given filters" }
}
```

### Errors

`VALIDATION_ERROR` (400, including `from` after `to`), `INVALID_CURSOR` (400).

---

## `GET /users/:userId/personal-records`

Personal records for one exercise, optionally within a date range.

| Record | Meaning |
|---|---|
| `maxWeight` | Heaviest single set |
| `maxVolume` | Highest `reps × weight` in a single set |
| `bestEstimated1RM` | Highest Epley estimate `weight × (1 + reps / 30)` of a single set (applied as-is, also for `reps = 1`) |

When the same best value was achieved on several days, the earliest day is returned.

### Query parameters

| Param | Required | Rules |
|---|---|---|
| `exercise` | Yes | Exact exercise name, case- and whitespace-insensitive |
| `from` | No | `YYYY-MM-DD`, inclusive |
| `to` | No | `YYYY-MM-DD`, inclusive; `from` must be on or before `to` |
| `unit` | No | Supported unit; default is the unit of the set that achieved each record |

### Example

```http
GET /api/v1/users/user_123/personal-records?exercise=Bench%20Press
```

`200 OK`

```json
{
  "data": {
    "exercise": { "id": 1, "name": "Bench Press" },
    "range": { "from": null, "to": null },
    "records": {
      "maxWeight":        { "value": 225,    "unit": "lb", "weight": 225, "reps": 3,  "achievedOn": "2026-10-12", "setId": "019a1b44-0e2f-7a10-8c3d-2b6e9f1a0c11" },
      "maxVolume":        { "value": 2000,   "unit": "lb", "weight": 200, "reps": 10, "achievedOn": "2026-10-20", "setId": "019a2c80-5d13-7b42-9e7a-4c1d8b2f3e55" },
      "bestEstimated1RM": { "value": 266.67, "unit": "lb", "weight": 200, "reps": 10, "achievedOn": "2026-10-20", "setId": "019a2c80-5d13-7b42-9e7a-4c1d8b2f3e55" }
    }
  },
  "meta": {}
}
```

- `value` is the record in `unit`. `weight` and `reps` describe the set that achieved it, with `weight` in the same `unit`. `maxVolume.value` is total load (`reps × weight`).
- `range` echoes the requested `from`/`to` (`null` when omitted).
- A record whose best value is `0` (bodyweight only) is `null`.

The exercise exists but has no weighted sets in the range (`200`, not `404`):

```json
{
  "data": {
    "exercise": { "id": 1, "name": "Bench Press" },
    "range": { "from": "2026-09-01", "to": "2026-09-30" },
    "records": { "maxWeight": null, "maxVolume": null, "bestEstimated1RM": null }
  },
  "meta": { "message": "No weighted sets for this exercise in the given range" }
}
```

### Errors

`VALIDATION_ERROR` (400), `EXERCISE_NOT_FOUND` (404, the exercise is not in the catalog).

---

## `GET /users/:userId/personal-records/compare`

Compares personal records for one exercise between two periods, e.g. "this month vs last month".

### Query parameters

Common:

| Param | Required | Rules |
|---|---|---|
| `exercise` | Yes | Exact exercise name, case- and whitespace-insensitive |
| `unit` | No | Supported unit, default `kg` |

Plus **exactly one** of the following forms. Mixing them, or sending an incomplete custom form, is a `VALIDATION_ERROR`.

**Preset form**

| Param | Required | Rules |
|---|---|---|
| `period` | Yes | `week`, `month` or `year` |
| `tz` | No | IANA timezone (e.g. `Asia/Ho_Chi_Minh`), default `UTC` |
| `anchor` | No | `YYYY-MM-DD`, default today in `tz` |

`current` is the whole period containing `anchor` (weeks start on Monday); `previous` is the period immediately before it. Periods are computed in `tz`, never in the server's timezone.

**Custom form**

| Param | Required | Rules |
|---|---|---|
| `baseFrom`, `baseTo` | Yes | Inclusive range returned as `current` |
| `compareFrom`, `compareTo` | Yes | Inclusive range returned as `previous` |

Each `*From` must be on or before its `*To`.

### Example

```http
GET /api/v1/users/user_123/personal-records/compare?exercise=Bench%20Press&period=month&tz=Asia/Ho_Chi_Minh&anchor=2026-11-15
```

`200 OK`

```json
{
  "data": {
    "exercise": { "id": 1, "name": "Bench Press" },
    "unit": "kg",
    "current": {
      "range": { "from": "2026-11-01", "to": "2026-11-30" },
      "records": {
        "maxWeight":        { "value": 105,    "unit": "kg", "weight": 105, "reps": 3,  "achievedOn": "2026-11-10", "setId": "019a6d10-2b3c-7e4f-8a1b-0c2d3e4f5a61" },
        "maxVolume":        { "value": 900,    "unit": "kg", "weight": 90,  "reps": 10, "achievedOn": "2026-11-05", "setId": "019a5f21-4c5d-7a6b-9c7d-1e2f3a4b5c72" },
        "bestEstimated1RM": { "value": 120,    "unit": "kg", "weight": 90,  "reps": 10, "achievedOn": "2026-11-05", "setId": "019a5f21-4c5d-7a6b-9c7d-1e2f3a4b5c72" }
      }
    },
    "previous": {
      "range": { "from": "2026-10-01", "to": "2026-10-31" },
      "records": {
        "maxWeight":        { "value": 102.5,  "unit": "kg", "weight": 102.5, "reps": 3, "achievedOn": "2026-10-12", "setId": "019a1b44-0e2f-7a10-8c3d-2b6e9f1a0c11" },
        "maxVolume":        { "value": 900,    "unit": "kg", "weight": 90,    "reps": 10, "achievedOn": "2026-10-20", "setId": "019a2c80-5d13-7b42-9e7a-4c1d8b2f3e55" },
        "bestEstimated1RM": { "value": 120,    "unit": "kg", "weight": 90,    "reps": 10, "achievedOn": "2026-10-20", "setId": "019a2c80-5d13-7b42-9e7a-4c1d8b2f3e55" }
      }
    },
    "delta": {
      "maxWeight":        { "absolute": 2.5, "percent": 2.4, "improved": true },
      "maxVolume":        { "absolute": 0,   "percent": 0,   "improved": false },
      "bestEstimated1RM": { "absolute": 0,   "percent": 0,   "improved": false }
    }
  },
  "meta": {}
}
```

`records` has the same shape as in `GET /personal-records`. Delta per record:

| `current` | `previous` | `absolute` | `percent` | `improved` |
|---|---|---|---|---|
| value | value | `current − previous` (in `unit`) | `(current − previous) / previous × 100`, 1 decimal place | `current > previous` |
| value | `null` | `null` | `null` | `true` |
| `null` | value | `null` | `null` | `false` |
| `null` | `null` | `null` | `null` | `null` |

When both periods have no weighted sets, all records are `null` and `meta.message` is `"No weighted sets for this exercise in either period"`.

### Errors

`VALIDATION_ERROR` (400, including invalid `tz` and mixed/incomplete forms), `EXERCISE_NOT_FOUND` (404).

---

## `GET /exercises`

The exercise catalog. Logging only accepts names from this list.

### Query parameters

| Param | Required | Rules |
|---|---|---|
| `search` | No | 1–100 characters, not blank. Partial, case- and whitespace-insensitive match on the name; `%` and `_` match literally |
| `muscleGroup` | No | Muscle group code, `^[a-z_]{1,50}$` (e.g. `chest`) |

### Example

```http
GET /api/v1/exercises?search=bench&muscleGroup=chest
```

`200 OK`

```json
{
  "data": [
    { "id": 1, "name": "Bench Press", "muscleGroups": ["chest", "shoulders", "triceps"] },
    { "id": 4, "name": "Close-Grip Bench Press", "muscleGroups": ["chest", "triceps"] },
    { "id": 3, "name": "Incline Bench Press", "muscleGroups": ["chest", "shoulders", "triceps"] }
  ]
}
```

- Sorted by `name`. Not paginated: the catalog is small and admin-managed.
- An exercise may have no muscle groups (`[]`).
- A `muscleGroup` code that does not exist returns `data: []`.

### Errors

`VALIDATION_ERROR` (400).

---

## `GET /health`

Liveness and database connectivity, used by the Docker healthcheck.

```http
GET /api/v1/health
```

`200 OK`

```json
{ "status": "ok", "db": "up" }
```

Database not reachable → `503`:

```json
{
  "error": { "code": "SERVICE_UNAVAILABLE", "message": "Database is not reachable", "details": [] },
  "requestId": "6f1c2a9e-3b7d-4e58-a1c4-9d2f0e8b7a63"
}
```
