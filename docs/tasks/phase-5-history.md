# Phase 5 — History

**Ước lượng:** ~1.5h · **Phụ thuộc:** Phase 3, Phase 4 · **Trạng thái:** Chờ review

Core feature 2: lịch sử có filter, keyset pagination và đổi đơn vị.

## Task trong phase

| Task | Tên | Ước lượng | Phụ thuộc | Commit |
|---|---|---|---|---|
| [T5.1](#T51) | Resolve filter history | 20m | T3.3 | `feat(workouts): add history query validation and catalog-based filter resolution` |
| [T5.2](#T52) | Keyset query + load sets | 40m | T5.1, T2.4 | `feat(workouts): add keyset-paginated history query with batched set loading` |
| [T5.3](#T53) | Response history + đổi đơn vị | 30m | T5.2, T2.1 | `feat(workouts): expose GET workout history with unit conversion and empty-state message` |

---

<a id="T51"></a>
## T5.1 — Resolve filter history

**Phase:** 5 · **Ước lượng:** 20m · **Phụ thuộc:** T3.3

### Mục tiêu
Core feature 2: filter history theo "exercise name (partial match)", "date range", "muscle group". Task này định nghĩa query DTO và biến filter theo tên/muscle group thành danh sách `exercise_id` trên catalog nhỏ, trước khi đụng tới bảng lớn.

### Phạm vi
**Làm**
- `HistoryQueryDto`
- `WorkoutHistoryService.resolveFilters` (gọi `CatalogService.resolveFilterIds`)

**Không làm**
- Query entries (T5.2), response (T5.3)

### Files
- Tạo: `src/modules/workouts/dto/history.query.ts`, `src/modules/workouts/workout-history.service.ts`, `src/modules/workouts/workout-history.service.spec.ts`

### Thiết kế chi tiết
```ts
class HistoryQueryDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) exercise?: string;     // partial
  @IsOptional() @Matches(/^[a-z_]{1,50}$/) muscleGroup?: string;                 // code
  @IsOptional() @IsLocalDate() from?: string;
  @IsOptional() @IsLocalDate() to?: string;
  @IsOptional() @Transform(normalizeUnitCode) @IsIn(SUPPORTED_UNIT_CODES, { message: … }) unit?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit: number = 20;
  @IsOptional() @IsString() @MaxLength(200) cursor?: string;
}
```
- `from > to` → `VALIDATION_ERROR` (field `from`, issue `must be on or before 'to'`).
- `resolveFilters`:
  - Không có `exercise`/`muscleGroup` → `exerciseIds = null` (không lọc).
  - Có filter mà không khớp exercise nào → `exerciseIds = []` → service trả **rỗng ngay**, không query `workout_entries`.
  - Có cả hai → giao 2 tập.
- `exercise` đi qua `normalizeExerciseName` + `escapeLike` (nằm trong catalog, T3.3).

### Tiêu chí hoàn thành
- [ ] Filter không khớp → 0 query vào bảng entries
- [ ] Không có SQL nào trong service

### Tests
- Unit (mock catalog): không filter → `null`; filter không khớp → trả rỗng và repository không được gọi; giao 2 tập; `from > to` → lỗi.

### Commit dự kiến
```
feat(workouts): add history query validation and catalog-based filter resolution
```

### Rủi ro / điểm cần soi khi review code AI
- AI hay join `exercises` + `ILIKE` trực tiếp trong query entries → không tận dụng được index `(user_id, exercise_id, …)`.
- `@Type(() => Number)` thiếu thì `limit` là string và `@IsInt` luôn fail.

---

<a id="T52"></a>
## T5.2 — Keyset query + load sets

**Phase:** 5 · **Ước lượng:** 40m · **Phụ thuộc:** T5.1, T2.4

### Mục tiêu
"Paginated with cursor-based pagination" và "endpoints must perform well with 50,000+ workout entries per user": mỗi trang chỉ đọc đúng số row cần, tốc độ không đổi dù đang ở trang đầu hay trang cuối.

### Phạm vi
**Làm**
- `WorkoutsRepository.findHistoryPage`, `findSetsByEntryIds`

**Không làm**
- Định dạng response, đổi đơn vị (T5.3)

### Files
- Sửa: `src/modules/workouts/workouts.repository.ts`
- Tạo: `src/modules/workouts/history-query.builder.ts` (dựng SQL động)

### Thiết kế chi tiết
- SQL được **dựng động**, chỉ thêm điều kiện khi có filter (tránh dạng `($2 IS NULL OR …)` làm planner chọn plan chung kém):
  ```sql
  SELECT e.id, e.exercise_id, x.display_name, e.performed_on, e.created_at
  FROM workout_entries e
  JOIN exercises x ON x.id = e.exercise_id
  WHERE e.user_id = $1
    [AND e.exercise_id = ANY($n::int[])]
    [AND e.performed_on >= $n]
    [AND e.performed_on <= $n]
    [AND (e.performed_on, e.id) < ($n::date, $m::uuid)]
  ORDER BY e.performed_on DESC, e.id DESC
  LIMIT $limit + 1;
  ```
  Lấy `limit + 1` row để biết `hasMore` mà không cần `COUNT(*)`.
- Sets của cả trang trong **1 query**:
  ```sql
  SELECT entry_id, set_index, reps, weight, unit, weight_kg
  FROM workout_sets WHERE entry_id = ANY($1::uuid[])
  ORDER BY entry_id, set_index;
  ```
- `nextCursor` = `encodeCursor` của row cuối cùng trong trang (khi `hasMore`).
- Numeric (`weight`, `weight_kg`) parse từ string thành `Decimal` ngay trong repository; `performed_on` giữ dạng string `YYYY-MM-DD` (cấu hình type parser của `pg` cho `DATE` (OID 1082) trả string, tránh bị đổi thành `Date` theo timezone server).
- Phương án dự phòng (chỉ làm nếu T7.5 đo thấy chậm): khi `exercise_id = ANY(...)` có nhiều id, Postgres phải đọc mọi entry khớp rồi sort; khi đó chuyển sang k-way merge bằng `unnest(ids) CROSS JOIN LATERAL (… ORDER BY … LIMIT n+1)`.

### Tiêu chí hoàn thành
- [ ] Không có `OFFSET` và không có `COUNT(*)`
- [ ] 1 trang = đúng 2 query (entries + sets)
- [ ] `DATE` không bị lệch ngày khi server chạy ở timezone khác UTC

### Tests
- Unit `history-query.builder.spec.ts`: SQL và thứ tự tham số đúng với từng tổ hợp filter.
- e2e ở T7.3 (duyệt hết các trang, nhiều entry cùng ngày).
- Hiệu năng ở T7.5.

### Commit dự kiến
```
feat(workouts): add keyset-paginated history query with batched set loading
```

### Rủi ro / điểm cần soi khi review code AI
- `pg` mặc định trả `DATE` thành `Date` JS ở **timezone của server** → lệch 1 ngày; đây là lỗi kinh điển cần kiểm tra.
- AI hay load sets theo từng entry (N+1).
- Điều kiện cursor phải dùng so sánh bộ `(performed_on, id) < (…)`, không tách thành 2 điều kiện riêng.

---

<a id="T53"></a>
## T5.3 — Response history + đổi đơn vị

**Phase:** 5 · **Ước lượng:** 30m · **Phụ thuộc:** T5.2, T2.1

### Mục tiêu
"Return in the unit the user specifies (convert if needed)" và "date ranges with no data (return empty result with appropriate message, not an error)".

### Phạm vi
**Làm**
- `GET /users/:userId/workouts` hoàn chỉnh: controller + mapping response

**Không làm**
- Cache, ETag

### Files
- Sửa: `src/modules/workouts/workouts.controller.ts`, `src/modules/workouts/workout-history.service.ts`
- Tạo: `src/modules/workouts/history.mapper.ts`, `src/modules/workouts/history.mapper.spec.ts`

### Thiết kế chi tiết
Response `200`:
```json
{
  "data": [
    {
      "id": "0193…", "date": "2026-10-31",
      "exercise": { "id": 1, "name": "Bench Press" },
      "sets": [
        { "setIndex": 1, "reps": 5, "weight": 225, "unit": "lb",
          "converted": { "weight": 102.06, "unit": "kg" } }
      ],
      "loggedAt": "2026-10-31T10:15:00.000Z"
    }
  ],
  "pageInfo": { "nextCursor": "eyJ2Ij…", "hasMore": true },
  "meta": {}
}
```
- Không truyền `unit` → không có `converted`, mỗi set giữ `weight`/`unit` gốc.
- Có `unit` → `converted` = `roundForOutput(convertForOutput(...))`; trùng unit gốc thì `converted.weight` bằng đúng giá trị gốc.
- `exercise.name` lấy `display_name` hiện tại của catalog.
- Rỗng → `data: []`, `pageInfo: { nextCursor: null, hasMore: false }`, `meta.message: "No workouts found for the given filters"`.
- Cursor hỏng → `400 INVALID_CURSOR`.

### Tiêu chí hoàn thành
- [ ] Giá trị cân nặng trong JSON là number, tối đa 2 chữ số thập phân ở `converted`; giá trị gốc giữ nguyên độ chính xác đã nhập
- [ ] Mapping là hàm thuần, test được không cần DB

### Tests
- Unit `history.mapper.spec.ts`: không có `unit`; `unit=lb` với set gốc lb (giữ 225) và set gốc kg (100 kg → 220.46); trang rỗng có message.
- e2e ở T7.3.

### Commit dự kiến
```
feat(workouts): expose GET workout history with unit conversion and empty-state message
```

### Rủi ro / điểm cần soi khi review code AI
- AI hay chuyển `Decimal` → `number` sớm rồi tính tiếp → lại gặp sai số float.
- AI hay quy đổi từ `weight_kg` cho mọi trường hợp → 225 lb hiển thị thành 225.00000xx hoặc 224.99.
