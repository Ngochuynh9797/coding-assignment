# Phase 7 — Integration, edge case & performance

**Ước lượng:** ~2h · **Phụ thuộc:** Phase 3–6 · **Trạng thái:** Xong

Kiểm chứng end-to-end trên Postgres thật và đo hiệu năng với 50k entries.

## Task trong phase

| Task | Tên | Ước lượng | Phụ thuộc | Commit |
|---|---|---|---|---|
| [T7.1](#T71) | Setup e2e (Testcontainers) | 20m | T3.2 | `test: add Testcontainers-based e2e setup with health and catalog tests` |
| [T7.2](#T72) | e2e POST workouts | 30m | T7.1, T4.3 | `test: add e2e coverage for bulk logging, validation, idempotency and concurrency` |
| [T7.3](#T73) | e2e history | 25m | T7.1, T5.3 | `test: add e2e coverage for workout history filters, pagination and units` |
| [T7.4](#T74) | e2e PR + compare + rebuild | 20m | T7.1, T6.3, T4.4 | `test: add e2e coverage for personal records, period comparison and bests rebuild` |
| [T7.5](#T75) | Seed 50k + EXPLAIN ANALYZE | 25m | T5.3, T6.3, T4.4 | `perf: add 50k-entry seed and query plan measurements` |

---

<a id="T71"></a>
## T7.1 — Setup e2e (Testcontainers)

**Phase:** 7 · **Ước lượng:** 20m · **Phụ thuộc:** T3.2

### Mục tiêu
Tiêu chí "integration tests for API endpoints": chạy test trên Postgres 18 thật (đúng migration, đúng `uuidv7()`, đúng `pg_trgm`), không mock DB.

### Phạm vi
**Làm**
- Jest config e2e, global setup/teardown container
- Helper tạo app, truncate dữ liệu, gửi request
- e2e cho `/health` và `GET /exercises`

### Files
- Tạo: `test/jest-e2e.config.ts`, `test/e2e/setup/global-setup.ts`, `test/e2e/setup/global-teardown.ts`, `test/e2e/setup/test-app.ts`, `test/e2e/setup/fixtures.ts`, `test/e2e/health.e2e-spec.ts`, `test/e2e/exercises.e2e-spec.ts`
- Dependency: `@testcontainers/postgresql`, `supertest`

### Thiết kế chi tiết
- `global-setup`: khởi động `PostgreSqlContainer('postgres:18')` **một lần**, chạy migration + seed catalog, ghi `DATABASE_URL` vào env cho các worker.
- `test-app.ts`: `createTestApp()` dựng Nest app với cùng `main` config (prefix, pipe, filter) — tách hàm `configureApp(app)` dùng chung với `main.ts` để test không lệch cấu hình thật.
- `beforeEach`: `TRUNCATE workout_sets, workout_entries, daily_exercise_bests, idempotency_keys` (giữ catalog).
- `fixtures.ts`: builder `entry({ date, exerciseName, sets })`, helper `logWorkouts(userId, entries, headers?)`.
- `runInBand` (các file e2e dùng chung DB).
- Yêu cầu Docker khi chạy `npm run test:e2e`; ghi rõ trong README.

### Tiêu chí hoàn thành
- [ ] `npm run test:e2e` chạy từ máy sạch (có Docker) không cần setup tay
- [ ] App trong test dùng đúng pipe/filter như production

### Tests
- `/health` → 200.
- `GET /exercises`: có dữ liệu seed; `search=bench` trả cả `Incline Bench Press`; `search=_` không trả tất cả; `search=Bench  Press` khớp; `muscleGroup=chest`; `muscleGroup=unknown` → `[]`.

### Commit dự kiến
```
test: add Testcontainers-based e2e setup with health and catalog tests
```

### Rủi ro / điểm cần soi khi review code AI
- AI hay tạo app test với `Test.createTestingModule` nhưng quên `useGlobalPipes`/`useGlobalFilters` → test pass trong khi production trả format khác.
- Khởi động container cho mỗi file test làm test rất chậm.

---

<a id="T72"></a>
## T7.2 — e2e POST workouts

**Phase:** 7 · **Ước lượng:** 30m · **Phụ thuộc:** T7.1, T4.3

### Mục tiêu
Phủ các edge case của đề bài cho việc log: validation, unit, bulk nguyên tử, concurrent writes, idempotency.

### Files
- Tạo: `test/e2e/log-workouts.e2e-spec.ts`, `test/e2e/log-concurrency.e2e-spec.ts`

### Test cases

### Happy path
- Bulk 3 entries (kg + lb, cùng bài 2 lần trong 1 ngày) → 201; DB có đúng số entry/set; `weight`/`unit` gốc giữ nguyên; `weight_kg` 225 lb = `102.0583`; `daily_exercise_bests` có **1** row cho bài lặp.
- `unit: "LBS"` → lưu `lb`.

### Validation (mỗi case kiểm tra `code` + `details[].field`)
- `date: null`, ngày không tồn tại, sai định dạng, quá xa tương lai
- `reps`/`weight` âm, `reps: 0`, `sets: []`, `entries: []`
- `unit: "stn"` → message liệt kê unit hỗ trợ
- `weight` vượt 1000 kg sau quy đổi (`2300 lb`)
- Field thừa; `userId` sai định dạng; body không phải JSON

### Catalog
- 2 tên lạ ở `entries[0]` và `entries[2]` → 1 response `UNKNOWN_EXERCISE` liệt kê cả 2 field; DB không có gì được ghi
- Tên khác hoa thường/khoảng trắng → resolve đúng exercise

### Nguyên tử
- 1 entry hợp lệ + 1 entry vượt giới hạn kg → 400, DB rỗng (kể cả bests)

### Idempotency
- Gửi lại cùng key + cùng body → 201, header `Idempotent-Replayed: true`, body giống hệt, DB không tăng
- Cùng body nhưng khác thứ tự key JSON → replay
- Cùng key, body khác → `422 IDEMPOTENCY_KEY_REUSED`
- Request đầu lỗi `UNKNOWN_EXERCISE` → sửa body, gửi lại cùng key → 201 (key đã rollback)
- 2 request đồng thời cùng key → đúng 1 lần ghi, cả 2 nhận 201 cùng body

### Concurrency
- 2 bulk request song song của cùng user: A log 10 ngày theo thứ tự tăng, B log 10 ngày đó theo thứ tự giảm, cùng exercise, lặp 50 lần → không lỗi deadlock (`40P01`), bests mỗi ngày đúng bằng max của tất cả set. (Ban đầu là 2 ngày × 20 lần, nhưng khi bỏ sắp xếp lock thì gần như không bao giờ tái hiện được deadlock; với 10 ngày, mỗi vòng có ~2–5% khả năng deadlock, nên test bắt được regression với xác suất cao nhưng không chắc chắn.)
- 2 request song song cùng ngày, cùng exercise, không có idempotency key → cả 2 được ghi (2 entry), bests đúng

### Tiêu chí hoàn thành
- [ ] Mọi edge case của đề liên quan đến log có ít nhất 1 test
- [ ] Test concurrency ổn định khi chạy lại 10 lần

### Commit dự kiến
```
test: add e2e coverage for bulk logging, validation, idempotency and concurrency
```

### Rủi ro / điểm cần soi khi review code AI
- Test concurrency viết bằng `await` tuần tự thì không song song thật; phải dùng `Promise.all` và cho mỗi request một kết nối riêng.
- Assert chỉ status code mà không kiểm tra DB → không chứng minh được tính nguyên tử.

---

<a id="T73"></a>
## T7.3 — e2e history

**Phase:** 7 · **Ước lượng:** 25m · **Phụ thuộc:** T7.1, T5.3

### Mục tiêu
Kiểm chứng filter, phân trang, đổi đơn vị và trường hợp rỗng của `GET /users/:userId/workouts`.

### Files
- Tạo: `test/e2e/history.e2e-spec.ts`

### Test cases
### Filter
- `exercise=bench` → có `Bench Press` và `Incline Bench Press`, không có `Squat`
- `exercise=_` → rỗng (không khớp tất cả); `exercise=Bench  Press` → khớp
- `muscleGroup=chest` → bài có chest; bài không có muscle group không xuất hiện
- `exercise` + `muscleGroup` → giao 2 tập
- `from`/`to` inclusive ở 2 đầu
- Dữ liệu user khác không lọt vào

### Rỗng
- Khoảng ngày không có dữ liệu → `200`, `data: []`, `hasMore: false`, có `meta.message`
- `exercise=xyz` → `200` rỗng (không phải 404)

### Phân trang
- 45 entry, trong đó 10 entry cùng 1 ngày; duyệt `limit=7` đến hết → tổng 45, không trùng, không sót, thứ tự `(date DESC, id DESC)`; các entry cùng ngày theo thứ tự log mới nhất trước
- Ghi thêm entry ở ngày cũ hơn trong lúc đang duyệt → không làm trùng trang đã đọc
- Cursor rác → `400 INVALID_CURSOR`; `limit=0`, `limit=101` → `400`

### Đơn vị
- Không có `unit` → không có `converted`
- `unit=lb`: set gốc 225 lb → `converted.weight = 225`; set gốc 100 kg → `220.46`
- `unit=LBS` → chấp nhận; `unit=stn` → `400`

### Validation
- `from > to` → `400` field `from`

### Tiêu chí hoàn thành
- [ ] Test phân trang duyệt hết dữ liệu và so tập id, không chỉ kiểm tra trang đầu

### Commit dự kiến
```
test: add e2e coverage for workout history filters, pagination and units
```

### Rủi ro / điểm cần soi khi review code AI
- Test chỉ kiểm tra trang 1 sẽ không phát hiện lỗi điều kiện cursor (trùng/sót ở ranh giới cùng ngày).

---

<a id="T74"></a>
## T7.4 — e2e PR + compare + rebuild

**Phase:** 7 · **Ước lượng:** 20m · **Phụ thuộc:** T7.1, T6.3, T4.4

### Mục tiêu
Kiểm chứng logic PR end-to-end, so sánh theo kỳ với timezone, và tính chất "read model rebuild được và trùng với incremental".

### Files
- Tạo: `test/e2e/personal-records.e2e-spec.ts`, `test/e2e/rebuild-daily-bests.e2e-spec.ts`

### Test cases
### PR
- Dữ liệu nhiều ngày → `maxWeight`, `maxVolume`, `bestEstimated1RM` đúng giá trị, đúng `achievedOn`, đúng `setId`; 3 metric thắng ở 3 set khác nhau
- Hòa giữa 2 ngày → ngày sớm hơn
- Log lùi ngày (backdate) một set nặng hơn → PR đổi sang ngày cũ đó
- Set nhập 225 lb và set nhập 102.0583 kg → hòa (không phải kg thắng)
- `unit=kg` với set thắng gốc lb; không có `unit` → dùng unit của set thắng
- Bodyweight (0 kg) → `null` + message
- Khoảng ngày không có dữ liệu → `200` + `null`
- Exercise không có trong catalog → `404 EXERCISE_NOT_FOUND`

### Compare
- Set ngày `2026-10-31` và set ngày `2026-11-01`; `period=month&tz=Asia/Ho_Chi_Minh&anchor=2026-11-15` → current = tháng 11 (chỉ có set 1/11), previous = tháng 10 (chỉ có set 31/10), delta đúng. Phần "hôm nay theo `tz`" khi không có `anchor` được kiểm tra bằng unit test với `now` cố định (T2.4)
- Kỳ trước rỗng → `percent: null`, `improved: true`
- Custom 4 tham số; trộn preset + custom → `400`

### Rebuild
- Ghi tuần tự một bộ dữ liệu đa dạng (nhiều user, nhiều bài, hòa, backdate, nhiều request) → snapshot `daily_exercise_bests` → chạy rebuild → bảng **giống hệt từng row**, kể cả `*_set_id`

### Tiêu chí hoàn thành
- [ ] Test rebuild dùng dữ liệu có ca hòa (nơi dễ lệch nhất)

### Commit dự kiến
```
test: add e2e coverage for personal records, period comparison and bests rebuild
```

### Rủi ro / điểm cần soi khi review code AI
- Test compare dùng `new Date()` thật sẽ hỏng khi chạy vào ngày khác; luôn truyền `anchor` cố định.

---

<a id="T75"></a>
## T7.5 — Seed 50k + EXPLAIN ANALYZE

**Phase:** 7 · **Ước lượng:** 25m · **Phụ thuộc:** T5.3, T6.3, T4.4

### Mục tiêu
"Endpoints must perform well with 50,000+ workout entries per user" và tiêu chí "performance awareness": đo thật và dán bằng chứng vào README, không chỉ khẳng định.

### Phạm vi
**Làm**
- `scripts/seed-large.ts`
- Đo latency + `EXPLAIN (ANALYZE, BUFFERS)` cho các query chính
- Quyết định có cần LATERAL k-way merge cho filter muscle group hay không

### Files
- Tạo: `scripts/seed-large.ts`, `scripts/explain-queries.ts`, `docs/PERFORMANCE.md`
- Sửa: `package.json` (`seed:large`, `perf:explain`)

### Thiết kế chi tiết
- Dữ liệu:
  - `perf-user`: **50 000 entries**, ~4 set mỗi entry (~200k sets), trải 5 năm, 40 exercise phân bố lệch (vài bài chiếm phần lớn), ngày nào cũng tập, ~27 entry/ngày (50 000 entries trong 5 năm không khớp được với "1–4 entry mỗi ngày tập"; đã chốt giữ 50k + 5 năm)
  - Thêm 200 user nền × 2 000 entries để index có độ chọn lọc thực tế
  - Insert bằng `unnest` theo lô 5 000, sau đó chạy rebuild bests và `ANALYZE`
- Đo cho `perf-user` (chạy 20 lần, lấy p50/p95):
  1. History trang đầu, không filter
  2. History trang sâu (sau ~2 000 trang)
  3. History `exercise=press`
  4. History `muscleGroup=chest`
  5. PR all-time cho bài nhiều dữ liệu nhất
  6. Compare tháng
- Mỗi query: plan dùng index nào, số row đọc, buffers.
- Mục tiêu: p95 < 50 ms ở mức DB.
- Nếu (4) phải sort > 10k row hoặc vượt mục tiêu → hiện thực phương án LATERAL k-way merge (T5.2) trong một commit riêng, đo lại, ghi cả trước/sau.

### Tiêu chí hoàn thành
- [ ] `docs/PERFORMANCE.md` có bảng latency + plan rút gọn của 6 query, kèm cấu hình máy đo
- [ ] Trang sâu không chậm hơn trang đầu đáng kể (chứng minh keyset)

### Tests
Không phải test tự động; script chạy được lại.

### Commit dự kiến
```
perf: add 50k-entry seed and query plan measurements
```
(và nếu cần) `perf(workouts): use k-way merge for multi-exercise history filter`

### Rủi ro / điểm cần soi khi review code AI
- AI hay "đo" bằng 1 lần chạy hoặc trên bảng chưa `ANALYZE` → số liệu vô nghĩa.
- Không được chỉnh số liệu cho đẹp; ghi đúng kết quả, kể cả khi có query chưa đạt.
