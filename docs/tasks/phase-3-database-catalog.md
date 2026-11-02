# Phase 3 — Database & catalog

**Ước lượng:** ~1.5h · **Phụ thuộc:** Phase 1, Phase 2 · **Trạng thái:** Xong

Migration đúng SCHEMA.md, seed catalog và module catalog để resolve/lọc exercise.

## Task trong phase

| Task | Tên | Ước lượng | Phụ thuộc | Commit |
|---|---|---|---|---|
| [T3.1](#T31) | Data source + migration 0001-init | 30m | T1.2 | `feat(db): add initial migration for catalog, workout log, daily bests and idempotency` |
| [T3.2](#T32) | Exercise catalog JSON + seeder | 30m | T3.1, T2.3 | `feat(catalog): add exercise metadata file and idempotent catalog seeder` |
| [T3.3](#T33) | Catalog module + GET /exercises | 30m | T3.2, T1.3 | `feat(catalog): add exercise resolution, filtering and GET /exercises` |

---

<a id="T31"></a>
## T3.1 — Data source + migration 0001-init

**Phase:** 3 · **Ước lượng:** 30m · **Phụ thuộc:** T1.2

### Mục tiêu
Hiện thực đúng `docs/SCHEMA.md` (tiêu chí "schema design, indexing strategy"). Migration viết SQL tay để kiểm soát chính xác kiểu dữ liệu, constraint và index.

### Phạm vi
**Làm**
- TypeORM `DataSource` (dùng chung cho app và CLI migration)
- `DatabaseModule` + helper transaction
- Migration `0001-init`
- Script `migrate` (chạy bởi service `migrate` trong docker compose, không nằm trong image)
- Nối DB check vào `GET /health` (dời từ T1.4): `SELECT 1` với timeout ngắn; OK → `200 { status: "ok", db: "up" }`; lỗi → `503 SERVICE_UNAVAILABLE` theo error format chung

**Không làm**
- Không dùng `synchronize`, không sinh migration từ entity: schema chỉ do migration SQL viết tay quản lý. Entity (cả 7 bảng) chỉ map cột vào bảng có sẵn; truy cập dữ liệu qua Repository/EntityManager, QueryBuilder khi Repository API không diễn đạt được; không dùng `query()` với SQL thuần ngoài migration và `/health`

### Files
- Tạo: `src/infrastructure/database/data-source.ts`, `src/infrastructure/database/database.module.ts`, `src/infrastructure/database/transaction.ts`, `src/infrastructure/database/migrations/0001-init.ts`, `src/infrastructure/database/migrate.ts`, `src/infrastructure/database/decimal.transformer.ts` (NUMERIC ↔ `Decimal`), entity: `src/modules/catalog/entities/*`, `src/modules/workouts/entities/*`, `src/modules/personal-records/entities/daily-exercise-best.entity.ts`, `src/infrastructure/idempotency/idempotency-key.entity.ts` (DataSource nạp entity bằng glob `*.entity` vì `infrastructure/` không được import `modules/`)
- Sửa: `docker-compose.yml` (service `migrate`), `package.json` (`migration:run`, `migration:revert`), `src/health/health.controller.ts`, `src/health/health.module.ts`

### Thiết kế chi tiết
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE muscle_groups (
  id   SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

CREATE TABLE exercises (
  id           SERIAL PRIMARY KEY,
  display_name TEXT NOT NULL,
  name_key     TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT exercises_name_key_uq UNIQUE (name_key)
);
CREATE INDEX exercises_name_key_trgm ON exercises USING GIN (name_key gin_trgm_ops);

CREATE TABLE exercise_muscle_groups (
  exercise_id     INT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  muscle_group_id INT NOT NULL REFERENCES muscle_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (exercise_id, muscle_group_id)
);
CREATE INDEX emg_muscle_group ON exercise_muscle_groups (muscle_group_id, exercise_id);

CREATE TABLE workout_entries (
  id           UUID PRIMARY KEY DEFAULT uuidv7(),
  user_id      TEXT NOT NULL,
  exercise_id  INT  NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
  performed_on DATE NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX entries_user_date          ON workout_entries (user_id, performed_on DESC, id DESC);
CREATE INDEX entries_user_exercise_date ON workout_entries (user_id, exercise_id, performed_on DESC, id DESC);

CREATE TABLE workout_sets (
  id        UUID PRIMARY KEY DEFAULT uuidv7(),
  entry_id  UUID NOT NULL REFERENCES workout_entries(id) ON DELETE CASCADE,
  set_index SMALLINT NOT NULL,
  reps      INT NOT NULL CHECK (reps > 0),
  weight    NUMERIC(10,4) NOT NULL CHECK (weight >= 0),
  unit      TEXT NOT NULL,
  weight_kg NUMERIC(10,4) NOT NULL CHECK (weight_kg >= 0),
  CONSTRAINT sets_entry UNIQUE (entry_id, set_index)
);

CREATE TABLE daily_exercise_bests (
  user_id            TEXT NOT NULL,
  exercise_id        INT  NOT NULL REFERENCES exercises(id),
  performed_on       DATE NOT NULL,
  best_weight_kg     NUMERIC(10,4) NOT NULL,
  best_weight_set_id UUID NOT NULL,
  best_volume_kg     NUMERIC(12,4) NOT NULL,
  best_volume_set_id UUID NOT NULL,
  best_e1rm_kg       NUMERIC(10,4) NOT NULL,
  best_e1rm_set_id   UUID NOT NULL,
  CONSTRAINT daily_bests_pk PRIMARY KEY (user_id, exercise_id, performed_on)
) WITH (fillfactor = 90);

CREATE TABLE idempotency_keys (
  user_id         TEXT NOT NULL,
  key             TEXT NOT NULL,
  request_hash    TEXT NOT NULL,
  response_status SMALLINT,
  response        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);
CREATE INDEX idempotency_created_at ON idempotency_keys (created_at);
```
- `down()`: drop theo thứ tự ngược.
- `transaction.ts`: `runInTransaction(dataSource, fn: (q: QueryRunner|EntityManager) => Promise<T>)`, isolation mặc định `READ COMMITTED`.
- Pool: `max` lấy từ `DB_POOL_MAX`; `statement_timeout` 10s cho kết nối của app.
- Kiểm tra giới hạn số: `weight_kg ≤ 1000`, `reps ≤ 1000` → e1rm tối đa ≈ 34 334 (vừa `NUMERIC(10,4)`), volume tối đa 1 000 000 (vừa `NUMERIC(12,4)`).

### Tiêu chí hoàn thành
- [ ] `npm run migration:run` trên DB rỗng tạo đủ 7 bảng, 8 index như SCHEMA.md (`\di` khớp tên)
- [ ] `migration:revert` rồi `run` lại không lỗi
- [ ] `docker compose up` tự chạy migration
- [ ] `/health` trả `200 { status: "ok", db: "up" }`; dừng container `db` → `/health` trả 503 `SERVICE_UNAVAILABLE`

### Tests
- Kiểm tra thủ công bằng `psql` (`\d+` từng bảng). e2e ở Phase 7 chạy trên migration thật.

### Commit dự kiến
```
feat(db): add initial migration for catalog, workout log, daily bests and idempotency
```

### Rủi ro / điểm cần soi khi review code AI
- AI hay bật `synchronize: true` hoặc dùng migration sinh từ entity → sai kiểu (`float`), thiếu index DESC, thiếu tên constraint. Entity có thể khác migration mà không ai báo: tên cột phải khai báo `name` tường minh, cột NUMERIC phải qua `decimalTransformer`.
- `uuidv7()` chỉ có từ Postgres 18 → chạy nhầm image cũ sẽ lỗi ngay ở migration (đây là dấu hiệu tốt, không cần fallback).
- Đã chốt: `daily_exercise_bests` tạo `WITH (fillfactor = 90)` để upsert dễ là HOT update hơn (SCHEMA.md đã cập nhật).

---

<a id="T32"></a>
## T3.2 — Exercise catalog JSON + seeder

**Phase:** 3 · **Ước lượng:** 30m · **Phụ thuộc:** T3.1, T2.3

### Mục tiêu
Yêu cầu "exercise → muscle group mapping should be configurable (not hardcoded in business logic)". Catalog sống trong file dữ liệu + bảng; người chấm chạy `docker compose up` là có sẵn catalog để thử.

### Phạm vi
**Làm**
- `config/exercise-metadata.json` (~60 bài phổ biến)
- Seeder idempotent, chạy bởi service `seed-catalog` trong docker compose và trong e2e setup

**Không làm**
- Admin API (ngoài phạm vi)

### Files
- Tạo: `config/exercise-metadata.json`, `src/seeds/catalog/catalog.seeder.ts`, `src/seeds/catalog/catalog-metadata.schema.ts`, `src/seeds/catalog/seed-catalog.ts` (entry chạy độc lập). Seed là dữ liệu cho local/test nên nằm ở layer `seeds/`, tách khỏi logic nghiệp vụ của `modules/catalog` (không layer nào được import `seeds/`)
- Sửa: `docker-compose.yml` (service `seed-catalog`, chạy sau `migrate`), `package.json` (`seed:catalog`), `eslint.config.mjs` (cấm import `seeds/`)

### Thiết kế chi tiết
- Định dạng file:
  ```json
  {
    "muscleGroups": [{ "code": "chest", "name": "Chest" }, { "code": "triceps", "name": "Triceps" }],
    "exercises": [
      { "name": "Bench Press", "muscleGroups": ["chest", "triceps", "shoulders"] },
      { "name": "Farmer's Walk", "muscleGroups": [] }
    ]
  }
  ```
- Khoảng 12 muscle group (chest, back, shoulders, biceps, triceps, forearms, quads, hamstrings, glutes, calves, core, full_body) và ~60 exercise, gồm vài bài không có muscle group và vài bài trùng từ khóa (`Bench Press`, `Incline Bench Press`, `Close-Grip Bench Press`) để thử partial match.
- Validate file bằng zod trước khi ghi: code muscle group hợp lệ (`^[a-z_]+$`), exercise tham chiếu code không tồn tại → lỗi, 2 exercise có cùng `normalizeExerciseName` → lỗi.
- Ghi trong **1 transaction**:
  1. `manager.upsert(MuscleGroup, …, { conflictPaths: ['code'], skipUpdateIfNoValuesChanged: true })` (cập nhật `name`).
  2. `manager.upsert(Exercise, …, { conflictPaths: ['nameKey'], skipUpdateIfNoValuesChanged: true })` (cập nhật `display_name`; `updated_at = DEFAULT` chỉ khi giá trị thật sự đổi, nên chạy lại cho kết quả giống hệt).
  3. Với mỗi exercise có trong file: `delete(ExerciseMuscleGroup, { exerciseId: In(ids) })` rồi `insert` mapping mới (đồng bộ đúng theo file).
- Không xóa exercise không còn trong file (có thể đã có history, FK `RESTRICT`).
- Log số lượng muscle group / exercise / mapping đã ghi.

### Tiêu chí hoàn thành
- [ ] Chạy seeder 2 lần liên tiếp → kết quả giống hệt, không lỗi
- [ ] Bỏ 1 muscle group khỏi 1 exercise trong file rồi chạy lại → mapping đó bị xóa
- [ ] File lỗi (code không tồn tại / tên trùng sau normalize) → seeder dừng, không ghi gì

### Tests
- Unit `catalog-metadata.schema.spec.ts`: file mẫu hợp lệ; code không tồn tại; tên trùng sau normalize (`Bench Press` và `bench  press`).
- Seeder chạy thật được kiểm tra trong e2e setup (T7.1).

### Commit dự kiến
```
feat(catalog): add exercise metadata file and idempotent catalog seeder
```

### Rủi ro / điểm cần soi khi review code AI
- Đổi tên một bài trong file seed sẽ tạo exercise **mới** (upsert theo `name_key`), không phải đổi tên → ghi chú trong README.
- `name_key` phải sinh bằng đúng `normalizeExerciseName` dùng khi resolve request, không được viết lại logic lowercase ở seeder.

---

<a id="T33"></a>
## T3.3 — Catalog module + GET /exercises

**Phase:** 3 · **Ước lượng:** 30m · **Phụ thuộc:** T3.2, T1.3

### Mục tiêu
Cung cấp cho các module khác cách resolve tên exercise và filter theo tên/muscle group, đồng thời cho client tra cứu tên hợp lệ (`GET /exercises`), vì log chỉ chấp nhận exercise có trong catalog.

### Phạm vi
**Làm**
- `CatalogRepository`, `CatalogService` (export cho workouts và personal-records)
- Lỗi `UNKNOWN_EXERCISE`, `EXERCISE_NOT_FOUND`
- `GET /exercises`

**Không làm**
- Filter history (dùng service này ở T5.1)

### Files
- Tạo: `src/modules/catalog/catalog.module.ts`, `catalog.repository.ts`, `catalog.service.ts`, `exercises.controller.ts`, `catalog.errors.ts`, `dto/list-exercises.query.ts`, `catalog.service.spec.ts`

### Thiết kế chi tiết
```ts
interface ExerciseRef { id: number; displayName: string }

class CatalogRepository {
  findByNameKeys(keys: string[]): Promise<Map<string, ExerciseRef>>;   // find({ where: { nameKey: In(keys) } })
  findIdsByNameLike(term: string): Promise<number[]>;                   // term đã normalize + escape; QueryBuilder: nameKey LIKE :pattern ESCAPE '\'
  findIdsByMuscleGroup(code: string): Promise<number[]>;                // find({ where: { muscleGroup: { code } } }) trên ExerciseMuscleGroup
  list(filter: { search?: string; muscleGroup?: string }): Promise<ExerciseWithGroups[]>;
}

class CatalogService {
  resolveNamesOrThrow(items: { name: string; field: string }[]): Promise<ExerciseRef[]>;
  // normalize từng tên; 1 query; tên lạ → UNKNOWN_EXERCISE (400) liệt kê MỌI tên lạ với field path
  getByNameOrThrow(name: string): Promise<ExerciseRef>;                 // → EXERCISE_NOT_FOUND (404)
  resolveFilterIds(filter: { exercise?: string; muscleGroup?: string }): Promise<number[] | null>;
  // null = không có filter; [] = có filter nhưng không khớp; có cả 2 filter → giao 2 tập
}
```
- `UNKNOWN_EXERCISE` details: `[{ field: "entries[2].exerciseName", issue: "Unknown exercise 'Bech Press'" }]`, message gợi ý dùng `GET /api/v1/exercises`.
- `GET /api/v1/exercises?search=press&muscleGroup=chest` → `{ data: [{ id, name, muscleGroups: ["chest", "triceps"] }] }`, sort theo `name`, không phân trang (catalog nhỏ, ghi chú trong API.md). `muscleGroup` không tồn tại → `data: []`.
- `muscleGroups` lấy trong 1 query bằng `leftJoinAndSelect` (Exercise → ExerciseMuscleGroup → MuscleGroup, sort theo `mg.code`), không N+1; filter muscle group dùng subquery `EXISTS` để vẫn trả đủ mọi nhóm của bài khớp.

### Tiêu chí hoàn thành
- [ ] Resolve N tên chỉ tốn 1 query
- [ ] `search=_` không trả về toàn bộ catalog
- [ ] `search=Bench  Press` (2 khoảng trắng) vẫn khớp

### Tests
- Unit `catalog.service.spec.ts` (mock repository): nhiều tên lạ → 1 lỗi liệt kê đủ field; cùng tên lặp nhiều lần chỉ query 1 key; tên khác hoa thường resolve cùng exercise; `resolveFilterIds` với 0/1/2 filter.
- e2e `GET /exercises` ở T7.3.

### Commit dự kiến
```
feat(catalog): add exercise resolution, filtering and GET /exercises
```

### Rủi ro / điểm cần soi khi review code AI
- AI hay gọi repository trong vòng lặp (1 query mỗi tên).
- Ném lỗi ở tên lạ đầu tiên → client phải sửa từng lỗi một; yêu cầu liệt kê tất cả.
- Không được nối chuỗi `term` vào SQL; luôn dùng tham số.
