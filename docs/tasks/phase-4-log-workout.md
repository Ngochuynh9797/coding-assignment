# Phase 4 — Log workout

**Ước lượng:** ~2h · **Phụ thuộc:** Phase 2, Phase 3 · **Trạng thái:** Xong

Core feature 1: bulk logging nguyên tử, idempotency, cập nhật read model PR trong cùng transaction.

## Task trong phase

| Task | Tên | Ước lượng | Phụ thuộc | Commit |
|---|---|---|---|---|
| [T4.1](#T41) | DTOs + validation cho POST workouts | 30m | T2.1, T2.4 | `feat(workouts): add validated DTOs for bulk workout logging` |
| [T4.2](#T42) | IdempotencyService | 30m | T3.1, T2.3 | `feat(idempotency): add transactional idempotency keys with replay` |
| [T4.3](#T43) | Write flow: log bulk + DailyBestsWriter | 45m | T4.1, T4.2, T3.3, T2.2 | `feat(workouts): implement transactional bulk logging with daily bests upsert` |
| [T4.4](#T44) | Script rebuild-daily-bests | 15m | T4.3 | `feat(personal-records): add rebuild script for daily exercise bests` |

---

<a id="T41"></a>
## T4.1 — DTOs + validation cho POST workouts

**Phase:** 4 · **Ước lượng:** 30m · **Phụ thuộc:** T2.1, T2.4

### Mục tiêu
Edge case của đề: "invalid or unsupported weight units", "missing or malformed request fields (null date, negative weight/reps, empty sets array)". Mọi lỗi được chặn ở biên với field path rõ ràng.

### Phạm vi
**Làm**
- DTO lồng nhau cho body, param `userId`, header `Idempotency-Key`
- Controller `POST /users/:userId/workouts` (gọi service ở T4.3; ở task này có thể trả 501 tạm)

**Không làm**
- Kiểm tra giới hạn theo kg và tên exercise (cần DB/converter, làm trong service ở T4.3)

### Files
- Tạo: `src/modules/workouts/dto/log-workouts.dto.ts`, `src/modules/workouts/dto/user-id.param.ts`, `src/modules/workouts/workouts.controller.ts`, `src/modules/workouts/workouts.module.ts`, `src/modules/workouts/dto/log-workouts.dto.spec.ts`, `src/infrastructure/idempotency/idempotency-key.header.ts` (+ `.spec.ts`)
- Sửa: `src/main.ts` (body parser 1 MB), `src/app.module.ts` (đăng ký `WorkoutsModule`)

### Thiết kế chi tiết
```ts
class SetDto {
  @IsInt() @Min(1) @Max(1000) reps: number;
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 }) @Min(0) weight: number;
  @Transform(({ value }) => normalizeUnitCode(value))
  @IsIn(SUPPORTED_UNIT_CODES, { message: ({ value }) => `Unsupported unit '${value}'. Supported units: ${SUPPORTED_UNIT_CODES.join(', ')}` })
  unit: string;
}
class EntryDto {
  @IsLocalDate({ maxFutureDays: 1 }) date: string;
  @IsString() @IsNotEmpty() @MaxLength(100) exerciseName: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => SetDto) sets: SetDto[];
}
class LogWorkoutsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => EntryDto) entries: EntryDto[];
}
class UserIdParam { @IsUserId() userId: string }
```
- `weight` nhận JSON number; `"100"` (string) bị từ chối (không bật implicit conversion).
- `maxDecimalPlaces: 4` khớp cột `weight NUMERIC(10,4)`, tránh DB làm tròn ngầm giá trị gốc.
- Header `Idempotency-Key`: tùy chọn; nếu có: 1–255 ký tự ASCII in được (`^[\x21-\x7E]{1,255}$`), sai → `VALIDATION_ERROR` với field `headers.idempotency-key`. Đọc bằng param decorator `@IdempotencyKeyHeader()` (vì `@Headers()` không nhận pipe). Lỗi header và lỗi body nằm ở hai bước khác nhau: request sai cả hai chỉ nhận lỗi của bước chạy trước.
- Thứ tự set = thứ tự trong mảng → `set_index` = vị trí + 1 (client không gửi `setIndex`).
- Body quá lớn: giới hạn body parser 1 MB (`app.useBodyParser('json', { limit: '1mb' })` trong `main.ts`, đặt sau logger để 413 vẫn có request id).

### Tiêu chí hoàn thành
- [ ] Mỗi edge case trong đề bài trả 400 với field path chính xác
- [ ] `unit: "LBS"` được chấp nhận và đến service dưới dạng `lb`

### Tests
Unit `log-workouts.dto.spec.ts` (`plainToInstance` + `validate`), mỗi case kiểm tra field path:
- `date: null`, `date: "2026-02-30"`, `date: "31/10/2026"`, ngày quá xa tương lai
- `reps: -1`, `reps: 0`, `reps: 2.5`, `weight: -5`, `weight: "100"`, `weight: 1.23456`
- `unit: "stn"` → message liệt kê unit; `unit: " LBS "` → hợp lệ, giá trị `lb`; `unit` thiếu
- `sets: []`, `entries: []`, 101 entries, 51 sets
- field thừa (`entries[0].notes`) → lỗi whitelist
- `userId: "a b"`, `userId` 65 ký tự

### Commit dự kiến
```
feat(workouts): add validated DTOs for bulk workout logging
```

### Rủi ro / điểm cần soi khi review code AI
- AI hay viết `@IsEnum(['kg', 'lb'])` → phá vỡ unit extensibility.
- Thiếu `@Type(() => SetDto)` thì `@ValidateNested` không validate gì cả (lỗi im lặng).
- `@IsDateString()` của class-validator chấp nhận cả datetime ISO và không kiểm tra ngày có thật → không dùng.

---

<a id="T42"></a>
## T4.2 — IdempotencyService

**Phase:** 4 · **Ước lượng:** 30m · **Phụ thuộc:** T3.1, T2.3

### Mục tiêu
Edge case "concurrent writes: same user logging same exercise at same time" trong trường hợp retry/double-submit: cùng một request gửi nhiều lần chỉ ghi một lần.

### Phạm vi
**Làm**
- `IdempotencyService.claim` / `complete` chạy **trong transaction của caller**

**Không làm**
- Không làm interceptor tổng quát: claim phải nằm trong cùng transaction với việc ghi workout
- Không dọn key quá hạn: key được giữ vô thời hạn. Bản đầu có cron dọn key mỗi giờ (`@nestjs/schedule`) nhưng đã bị gỡ khi review vì over-engineering ở quy mô này; hướng làm khi cần nằm trong mục "What would change at scale" của `docs/SCHEMA.md`. Index `idempotency_created_at` được giữ lại cho việc đó

### Files
- Tạo: `src/infrastructure/idempotency/idempotency.service.ts`, `idempotency.module.ts`, `idempotency.errors.ts`
- Sửa: `src/config/env.validation.ts`, `.env.example`, `docker-compose.yml` (bỏ `IDEMPOTENCY_TTL_HOURS`, không còn dùng)

### Thiết kế chi tiết
```ts
type ClaimResult = { kind: 'new' } | { kind: 'replay'; status: number; body: unknown };

claim(tx, userId: string, key: string, requestHash: string): Promise<ClaimResult>;
complete(tx, userId: string, key: string, status: number, body: unknown): Promise<void>;
```
- `claim` (QueryBuilder `insert().orIgnore().returning(['userId'])`, tương đương):
  ```sql
  INSERT INTO idempotency_keys (user_id, key, request_hash) VALUES ($1, $2, $3)
  ON CONFLICT DO NOTHING          -- bảng chỉ có một ràng buộc unique là PK (user_id, key)
  RETURNING user_id;
  ```
  - Có row trả về → `new`.
  - Không có → `findOneBy(IdempotencyKey, { userId, key })`; hash khác → `IDEMPOTENCY_KEY_REUSED` (422); giống → `replay`.
  - Khi một transaction khác đang giữ cùng key (chưa commit), `INSERT ... ON CONFLICT DO NOTHING` **chờ** transaction đó kết thúc: commit → conflict → replay; rollback → insert thành công → `new`.
- `complete`: `tx.update(IdempotencyKey, { userId, key }, { responseStatus, response })`.
- Caller (T4.3) dùng `hashRequestBody(dto)` trên body đã validate.
- Replay trả đúng status gốc (controller set status động qua `@Res({ passthrough: true })`) và thêm header `Idempotent-Replayed: true`.
- Key không hết hạn: dùng lại một key cũ với cùng body → replay, body khác → 422. Client dùng key ngẫu nhiên (UUID) nên thực tế không trùng.

### Tiêu chí hoàn thành
- [ ] Không có đường nào ghi workout mà không đi qua claim khi có header
- [ ] Lỗi trong transaction → key cũng bị rollback (client retry được)

### Tests
- e2e ở T7.2: replay đúng status + body; khác thứ tự key JSON → replay; khác body → 422; 2 request đồng thời cùng key → 1 lần ghi, request còn lại nhận replay; request đầu lỗi validation exercise → retry cùng key với body đã sửa vẫn thành công.

### Commit dự kiến
```
feat(idempotency): add transactional idempotency keys with replay
```

### Rủi ro / điểm cần soi khi review code AI
- AI hay làm idempotency bằng interceptor + transaction riêng → key đã lưu nhưng workout rollback (hoặc ngược lại) → mất tính nguyên tử.
- AI hay trả 409 cho key đang xử lý; với thiết kế này request thứ hai chờ rồi replay, không cần 409.
- Hash body thô (trước validation) → `"LBS"` và `"lb"` bị coi là khác nhau.

---

<a id="T43"></a>
## T4.3 — Write flow: log bulk + DailyBestsWriter

**Phase:** 4 · **Ước lượng:** 45m · **Phụ thuộc:** T4.1, T4.2, T3.3, T2.2

### Mục tiêu
Core feature 1: "log a workout entry", "support bulk logging", "store a normalized value (kg) alongside the original", và cập nhật read model PR trong cùng transaction. Hiện thực đúng mục **Write flow** của `docs/SCHEMA.md`.

### Phạm vi
**Làm**
- `WorkoutsService.logBulk`, `WorkoutsRepository.insertEntriesAndSets`
- `DailyBestsWriter.applySets` (thuộc module personal-records, export cho workouts)
- Nối controller T4.1 với service

**Không làm**
- Đọc PR (T6.x), history (T5.x)

### Files
- Tạo: `src/modules/workouts/workouts.service.ts`, `src/modules/workouts/workouts.repository.ts`, `src/modules/personal-records/daily-bests.writer.ts`, `src/modules/personal-records/personal-records.module.ts`
- Sửa: `src/modules/workouts/workouts.controller.ts`, `src/modules/workouts/workouts.module.ts`, `src/modules/catalog/catalog.service.ts` + `catalog.repository.ts` (nhận `EntityManager` tùy chọn), `src/modules/catalog/catalog.service.spec.ts`
- Dependency: `uuid@11.1.1` (hàm `v7`; bản 12+ là ESM-only)

### Thiết kế chi tiết
Trong **1 transaction** (`READ COMMITTED`):
1. Nếu có `Idempotency-Key`: `claim` → `replay` thì trả ngay.
2. `CatalogService.resolveNamesOrThrow(items, tx)` (1 query, chạy trên connection của transaction thay vì chiếm thêm một connection trong pool) → `UNKNOWN_EXERCISE` liệt kê mọi field path.
3. Với từng set: `weightKg = toStoredKg(weight, unit)`; `weightKg > 1000` → `VALIDATION_ERROR` field `entries[i].sets[j].weight`, issue `exceeds maximum of 1000 kg`. Gom **mọi** lỗi rồi ném một lần.
4. Sinh UUIDv7 cho mọi entry và set **theo thứ tự trong request**; insert mỗi bảng bằng một câu multi-row `VALUES` qua QueryBuilder (`insert().into(...).values(rows).updateEntity(false)`, không có `RETURNING`). Numeric đi qua `decimalTransformer` (`Decimal` → string). Số tham số tăng theo kích thước bulk: ở giới hạn DTO (100 entries × 50 sets) câu insert sets bind 35k tham số, dưới giới hạn 65535 của PostgreSQL; nếu nâng giới hạn DTO thì phải chia lô trong `WorkoutsRepository`.
5. `DailyBestsWriter.applySets(tx, userId, sets)`: `bestsByGroup(sets)` → `upsertBests` (câu SQL thô duy nhất ngoài migration và `/health`, vì `orUpdate` của TypeORM chỉ sinh được `col = EXCLUDED.col`; numeric truyền dạng `Decimal.toFixed(4)`):
   ```sql
   INSERT INTO daily_exercise_bests AS d (user_id, exercise_id, performed_on,
     best_weight_kg, best_weight_set_id, best_volume_kg, best_volume_set_id, best_e1rm_kg, best_e1rm_set_id)
   SELECT $1, t.* FROM unnest($2::int[], $3::date[], $4::numeric[], $5::uuid[], $6::numeric[], $7::uuid[], $8::numeric[], $9::uuid[])
     AS t(exercise_id, performed_on, w, w_id, v, v_id, e, e_id)
   ORDER BY t.exercise_id, t.performed_on
   ON CONFLICT (user_id, exercise_id, performed_on) DO UPDATE SET
     best_weight_set_id = CASE WHEN EXCLUDED.best_weight_kg > d.best_weight_kg THEN EXCLUDED.best_weight_set_id ELSE d.best_weight_set_id END,
     best_weight_kg     = GREATEST(d.best_weight_kg, EXCLUDED.best_weight_kg),
     best_volume_set_id = CASE WHEN EXCLUDED.best_volume_kg > d.best_volume_kg THEN EXCLUDED.best_volume_set_id ELSE d.best_volume_set_id END,
     best_volume_kg     = GREATEST(d.best_volume_kg, EXCLUDED.best_volume_kg),
     best_e1rm_set_id   = CASE WHEN EXCLUDED.best_e1rm_kg > d.best_e1rm_kg THEN EXCLUDED.best_e1rm_set_id ELSE d.best_e1rm_set_id END,
     best_e1rm_kg       = GREATEST(d.best_e1rm_kg, EXCLUDED.best_e1rm_kg);
   ```
   `ORDER BY` để thứ tự khóa row luôn theo `(exercise_id, performed_on)` → không deadlock. Trong `SET`, `d.*` luôn là giá trị cũ nên thứ tự các phép gán không ảnh hưởng.
6. Tạo response, `complete` idempotency key, commit.

Response `201`:
```json
{ "data": { "entries": [ { "id": "…", "date": "2026-10-31", "exercise": { "id": 1, "name": "Bench Press" },
  "sets": [ { "id": "…", "setIndex": 1, "reps": 5, "weight": 225, "unit": "lb", "weightKg": 102.06 } ] } ] } }
```

### Tiêu chí hoàn thành
- [ ] Mọi bước trong 1 transaction; lỗi ở bất kỳ bước nào → không còn dữ liệu nào được ghi
- [ ] Số query cố định, không tăng theo số entry/set (resolve 1 + insert 2 + upsert 1 + idempotency 2)
- [ ] `workouts` không chứa SQL nào ghi vào `daily_exercise_bests`

### Tests
- Unit `workouts.service.spec.ts` (mock repository/writer/catalog): gom đủ lỗi giới hạn kg; thứ tự id theo thứ tự request; replay không gọi repository.
- Unit `daily-bests.writer.spec.ts`: tham số truyền vào đã sort.
- e2e ở T7.2 (rollback, concurrency, deadlock).

### Commit dự kiến
```
feat(workouts): implement transactional bulk logging with daily bests upsert
```

### Rủi ro / điểm cần soi khi review code AI
- AI hay insert từng entry trong vòng lặp hoặc dùng `Promise.all` ngoài transaction.
- AI hay dùng `INSERT ... RETURNING` rồi ghép id theo thứ tự → Postgres không cam kết thứ tự đó.
- Thiếu `ORDER BY` trong upsert → nguy cơ deadlock khi 2 bulk request song song.
- Kiểm tra lại `uuid` v7 có đảm bảo tăng dần khi sinh nhiều id trong cùng 1 ms (cần cho tie-break của rebuild ở T4.4); nếu không, rebuild phải sắp theo thứ tự khác. **Đã kiểm:** `uuid@11` tăng `seq` khi cùng ms (tràn thì tăng ms), có unit test 10k id tăng nghiêm ngặt.

---

<a id="T44"></a>
## T4.4 — Script rebuild-daily-bests

**Phase:** 4 · **Ước lượng:** 15m · **Phụ thuộc:** T4.3

### Mục tiêu
Hiện thực tính chất "read model rebuildable from the workout log" trong SCHEMA.md: tính lại toàn bộ `daily_exercise_bests` từ `workout_entries` + `workout_sets`, dùng để phục hồi và để kiểm chứng logic incremental (T7.4).

### Phạm vi
**Làm**
- Script `npm run rebuild:bests [-- --user=<id>]`
- Dùng lại `PrCalculator.bestsByGroup` (không viết công thức bằng SQL)

**Không làm**
- Không chạy tự động trong docker compose

### Files
- Tạo: `src/modules/personal-records/rebuild-daily-bests.ts`, `src/modules/personal-records/daily-bests-rebuilder.service.ts`
- Sửa: `package.json`, `src/shared/validation/is-user-id.ts` (export `isUserId` để kiểm tra `--user`)

### Thiết kế chi tiết
- Duyệt từng user (`SELECT DISTINCT user_id FROM workout_entries`, hoặc chỉ user được chỉ định).
- Với mỗi user, trong 1 transaction:
  1. Đọc set theo thứ tự tái hiện đúng thứ tự ghi (QueryBuilder theo **tên bảng**, vì `personal-records` không được import entity của `workouts`; `performed_on` lấy qua `to_char(..., 'YYYY-MM-DD')` vì `pg` mặc định parse `DATE` thành JS `Date` theo timezone của server):
     ```sql
     SELECT s.id, e.exercise_id, to_char(e.performed_on, 'YYYY-MM-DD'), s.reps, s.weight_kg
     FROM workout_sets s JOIN workout_entries e ON e.id = s.entry_id
     WHERE e.user_id = $1
     ORDER BY e.created_at, e.id, s.set_index;
     ```
  2. `bestsByGroup` → `tx.delete(DailyExerciseBest, { userId })` → `DailyBestsWriter.upsertBests` (cùng câu `unnest` với writer; bảng vừa bị xóa nên `ON CONFLICT` không bao giờ kích hoạt).
- Log số user / số row đã ghi và thời gian chạy. Tham số lạ hoặc `--user` sai định dạng → lỗi, exit code 1.
- Không chạy khi user đó đang ghi: request commit giữa lúc đọc và lúc `DELETE` sẽ mất bests cho tới lần rebuild sau.

### Tiêu chí hoàn thành
- [ ] Chạy trên dữ liệu đã ghi incremental (tuần tự) → bảng giống hệt trước khi chạy
- [ ] Không có công thức PR nào trong file này

### Tests
- e2e ở T7.4: snapshot bảng → rebuild → so sánh từng row (cả `*_set_id`).

### Commit dự kiến
```
feat(personal-records): add rebuild script for daily exercise bests
```

### Rủi ro / điểm cần soi khi review code AI
- Thứ tự `ORDER BY e.created_at, e.id, s.set_index` phải khớp với thứ tự incremental đã xử lý; phụ thuộc vào việc id UUIDv7 tăng dần trong cùng request (xem rủi ro ở T4.3).
- Hai request **song song** cùng ngày, cùng giá trị: incremental chọn request upsert trước, rebuild chọn request có `created_at` sớm hơn → có thể khác `*_set_id` (giá trị vẫn đúng). Chấp nhận và ghi vào README; test so sánh chỉ dùng dữ liệu ghi tuần tự.
