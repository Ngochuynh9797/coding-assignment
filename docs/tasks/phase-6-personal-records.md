# Phase 6 — Personal records

**Ước lượng:** ~1.5h · **Phụ thuộc:** Phase 4 · **Trạng thái:** Xong

Core feature 3: PR theo khoảng ngày và so sánh 2 kỳ theo timezone.

## Task trong phase

| Task | Tên | Ước lượng | Phụ thuộc | Commit |
|---|---|---|---|---|
| [T6.1](#T61) | DailyBestsRepository | 30m | T4.3 | `feat(personal-records): add daily bests repository for PR queries` |
| [T6.2](#T62) | GET /personal-records | 30m | T6.1 | `feat(personal-records): expose GET personal records with unit conversion` |
| [T6.3](#T63) | GET /personal-records/compare | 30m | T6.2, T2.4 | `feat(personal-records): add PR comparison across periods with timezone support` |

---

<a id="T61"></a>
## T6.1 — DailyBestsRepository

**Phase:** 6 · **Ước lượng:** 30m · **Phụ thuộc:** T4.3

### Mục tiêu
Core feature 3: lấy "heaviest single set", "highest volume set", "best estimated 1RM" kèm ngày đạt, cho một khoảng ngày bất kỳ, trong 1 round-trip đọc từ read model.

### Phạm vi
**Làm**
- `DailyBestsRepository.findRecords(userId, exerciseId, range?)`

**Không làm**
- Đổi đơn vị, response (T6.2)

### Files
- Tạo: `src/modules/personal-records/daily-bests.repository.ts`

### Thiết kế chi tiết
```sql
WITH bests AS (
  (SELECT 'maxWeight' AS metric, performed_on, best_weight_kg AS value_kg, best_weight_set_id AS set_id
     FROM daily_exercise_bests
    WHERE user_id = $1 AND exercise_id = $2 [AND performed_on BETWEEN $3 AND $4]
    ORDER BY best_weight_kg DESC, performed_on ASC LIMIT 1)
  UNION ALL
  (SELECT 'maxVolume', performed_on, best_volume_kg, best_volume_set_id … ORDER BY best_volume_kg DESC, performed_on ASC LIMIT 1)
  UNION ALL
  (SELECT 'bestEstimated1RM', performed_on, best_e1rm_kg, best_e1rm_set_id … ORDER BY best_e1rm_kg DESC, performed_on ASC LIMIT 1)
)
SELECT b.metric, b.performed_on, b.value_kg, s.id AS set_id, s.reps, s.weight, s.unit, s.weight_kg
FROM bests b
JOIN workout_sets s ON s.id = b.set_id;
```
- Đã chốt: CLAUDE.md cấm `query(...)` ở đây và QueryBuilder không có `UNION`, nên mỗi nhánh được dựng bằng một QueryBuilder riêng (`getQuery()`, bọc ngoặc), nối `UNION ALL` rồi đưa vào `addCommonTableExpression(…, 'bests')` của query chính. Tham số bind theo tên một lần ở query ngoài, tên metric cũng bind (`CAST(:maxWeight AS text)`). SQL sinh ra giống hệt khối trên, vẫn 1 round-trip, chạy bằng `getRawMany()`.
- Cả 3 nhánh dùng range scan trên PK `(user_id, exercise_id, performed_on)`; số row mỗi `(user, exercise)` bằng số ngày tập nên sort nhỏ.
- `JOIN workout_sets` là ngoại lệ đọc chéo bảng đã ghi trong plan (chỉ đọc, 1 query) — để lấy `reps` và `weight`/`unit` gốc của set thắng.
- Trả về `Map<metric, RecordRow | null>`; numeric parse thành `Decimal`; `performed_on` dạng string.
- Không có row nào (exercise chưa tập trong khoảng) → cả 3 metric `null`.

### Tiêu chí hoàn thành
- [ ] 1 query cho cả 3 metric
- [ ] Hòa → ngày sớm nhất

### Tests
- Kiểm tra trong e2e T7.4 (giá trị, ngày, hòa, khoảng rỗng); kế hoạch thực thi kiểm tra ở T7.5.

### Commit dự kiến
```
feat(personal-records): add daily bests repository for PR queries
```

### Rủi ro / điểm cần soi khi review code AI
- Mỗi nhánh `UNION ALL` phải bọc ngoặc thì `ORDER BY … LIMIT 1` mới áp cho riêng nhánh đó; thiếu ngoặc là lỗi cú pháp hoặc sai nghĩa.
- Nếu `set_id` trỏ tới set không còn tồn tại (không có FK), `JOIN` sẽ làm mất metric đó → hiện tại không có delete nên không xảy ra; ghi chú cho khi thêm delete.

---

<a id="T62"></a>
## T6.2 — GET /personal-records

**Phase:** 6 · **Ước lượng:** 30m · **Phụ thuộc:** T6.1

### Mục tiêu
Endpoint PR cho một user và một exercise, có khoảng ngày tùy chọn, đổi đơn vị output, và trả kết quả rỗng có message thay vì lỗi.

### Phạm vi
**Làm**
- `PersonalRecordsController` + `PersonalRecordsService.getRecords`
- Query DTO, mapper

**Không làm**
- So sánh 2 khoảng (T6.3)

### Files
- Tạo: `src/modules/personal-records/personal-records.controller.ts`, `personal-records.service.ts`, `dto/personal-records.query.ts`, `pr.mapper.ts`, `pr.mapper.spec.ts`, `src/shared/validation/is-on-or-before.ts` (+ spec)
- Chuyển: `src/modules/workouts/dto/user-id.param.ts` → `src/shared/validation/user-id.param.ts` (personal-records không được import từ workouts)
- Sửa: `src/modules/personal-records/personal-records.module.ts`, `src/modules/workouts/workouts.controller.ts` (import)

### Thiết kế chi tiết
- Query: `exercise` (bắt buộc, tên khớp chính xác sau normalize, không được rỗng/chỉ khoảng trắng), `from`, `to` (`@IsLocalDate`, `from ≤ to`), `unit` (tùy chọn, normalize + `@IsIn`).
- Đã chốt: `from ≤ to` kiểm tra trong DTO bằng decorator dùng chung `@IsOnOrBefore('to')` (chỉ so khi cả 2 là ngày hợp lệ), nên lỗi range trả cùng các lỗi DTO khác. History giữ nguyên `assertRange` trong service.
- Exercise không có trong catalog → `404 EXERCISE_NOT_FOUND`.
- Response `200`:
  ```json
  {
    "data": {
      "exercise": { "id": 1, "name": "Bench Press" },
      "range": { "from": null, "to": null },
      "records": {
        "maxWeight":        { "value": 225,    "unit": "lb", "weight": 225, "reps": 3,  "achievedOn": "2026-10-12", "setId": "…" },
        "maxVolume":        { "value": 2000,   "unit": "lb", "weight": 200, "reps": 10, "achievedOn": "2026-10-20", "setId": "…" },
        "bestEstimated1RM": { "value": 266.67, "unit": "lb", "weight": 200, "reps": 10, "achievedOn": "2026-10-20", "setId": "…" }
      }
    },
    "meta": {}
  }
  ```
- Quy tắc unit của `value`:
  - Có `unit` trong query → dùng unit đó; không có → dùng unit gốc của set thắng.
  - `maxWeight.value`: `convertForOutput` từ `weight`/`unit` gốc của set thắng (giữ chính xác 225 lb).
  - `maxVolume.value`, `bestEstimated1RM.value`: giá trị dẫn xuất → `fromKg(value_kg, unit)`.
  - `weight` + `reps` luôn mô tả set thắng theo unit của `value`.
  - Volume hiển thị dạng tổng khối lượng (reps × weight), cùng unit với weight.
- Metric có `value_kg = 0` (bodyweight) → `null`.
- Cả 3 `null` → `meta.message: "No weighted sets for this exercise in the given range"`.

### Tiêu chí hoàn thành
- [ ] Không có công thức PR trong service/mapper (chỉ đọc giá trị đã lưu)
- [ ] Khoảng không có dữ liệu → 200, không phải 404

### Tests
- Unit `pr.mapper.spec.ts`: không có unit (dùng unit set thắng); `unit=kg` với set gốc lb; bodyweight → `null`; cả 3 `null` → message.
- e2e ở T7.4.

### Commit dự kiến
```
feat(personal-records): expose GET personal records with unit conversion
```

### Rủi ro / điểm cần soi khi review code AI
- AI hay tính lại Epley trong mapper từ `weight`/`reps` → công thức nằm 2 nơi.
- 404 chỉ dành cho exercise không có trong catalog; exercise có nhưng user chưa tập phải là 200 + `null`.

---

<a id="T63"></a>
## T6.3 — GET /personal-records/compare

**Phase:** 6 · **Ước lượng:** 30m · **Phụ thuộc:** T6.2, T2.4

### Mục tiêu
"Support comparing PRs across a time range (e.g., 'PR this month vs last month')", tính kỳ theo timezone của user.

### Phạm vi
**Làm**
- Endpoint compare dùng lại `DailyBestsRepository.findRecords` cho 2 khoảng

**Không làm**
- So sánh nhiều hơn 2 khoảng, chuỗi theo thời gian (time series)

### Files
- Tạo: `src/modules/personal-records/dto/compare.query.ts`, `dto/compare.query.spec.ts`, `src/modules/personal-records/pr-delta.ts`, `src/modules/personal-records/pr-delta.spec.ts`
- Sửa: `personal-records.controller.ts`, `personal-records.service.ts`, `src/shared/units/unit.registry.ts` (+ spec, `BASE_UNIT_CODE`), `src/shared/validation/is-local-date.ts` (export message định dạng)

### Thiết kế chi tiết
- Query, đúng **một** trong hai dạng:
  - Preset: `period=week|month|year`, `tz` (IANA, mặc định `UTC`), `anchor` (tùy chọn, `YYYY-MM-DD`, mặc định hôm nay theo `tz`) → `periodRanges` (T2.4).
  - Custom: `baseFrom`, `baseTo`, `compareFrom`, `compareTo` (đủ cả 4).
  - Trộn 2 dạng hoặc thiếu → `VALIDATION_ERROR`.
- `unit` mặc định **`kg`** (2 kỳ phải cùng unit thì delta mới có nghĩa). Đã chốt: lấy từ `BASE_UNIT_CODE` của unit registry (entry có `kgPerUnit === '1'`), không hardcode `'kg'` trong DTO.
- Đã chốt: `tz` không có default trong DTO (service dùng `UTC`), nếu không request dạng custom nào cũng bị coi là trộn. Không gửi dạng nào → lỗi ở `period`; trộn → lỗi `must not be combined with …` ở từng trường preset; custom thiếu trường → một lỗi `is required …` ở đúng trường đó.
- Chạy 2 truy vấn song song (`Promise.all`), mỗi kỳ trả cùng shape `records` như T6.2.
- Delta cho từng metric (tính bằng `Decimal`, trên kg rồi đổi unit):
  | current | previous | absolute | percent | improved |
  |---|---|---|---|---|
  | có | có | `cur − prev` | `(cur − prev) / prev × 100`, làm tròn 1 chữ số | `cur > prev` |
  | có | `null` | `null` | `null` | `true` |
  | `null` | có | `null` | `null` | `false` |
  | `null` | `null` | `null` | `null` | `null` |
- Response:
  ```json
  { "data": { "exercise": {…}, "unit": "kg",
      "current":  { "range": { "from": "2026-11-01", "to": "2026-11-30" }, "records": {…} },
      "previous": { "range": { "from": "2026-10-01", "to": "2026-10-31" }, "records": {…} },
      "delta": { "maxWeight": { "absolute": 2.5, "percent": 2.4, "improved": true }, … } },
    "meta": {} }
  ```
- Cả 2 kỳ đều rỗng → `meta.message`.

### Tiêu chí hoàn thành
- [ ] Không phụ thuộc timezone của server
- [ ] 2 kỳ chạy song song, mỗi kỳ 1 query

### Tests
- Unit `pr-delta.spec.ts`: đủ 4 hàng của bảng delta; percent làm tròn; giảm → `improved: false`.
- Unit DTO: trộn preset với custom → lỗi; custom thiếu 1 trường → lỗi; `tz` sai → lỗi.
- e2e ở T7.4 (tháng này vs tháng trước với `Asia/Ho_Chi_Minh`).

### Commit dự kiến
```
feat(personal-records): add PR comparison across periods with timezone support
```

### Rủi ro / điểm cần soi khi review code AI
- AI hay dùng `new Date().getMonth()` → tháng theo timezone của server.
- `percent` khi kỳ trước bằng 0 → chia cho 0; bodyweight đã thành `null` ở T6.2 nên rơi vào hàng thứ 2 của bảng.
