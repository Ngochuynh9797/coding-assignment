# Phase 0 — Design & setup

**Ước lượng:** ~1h · **Phụ thuộc:** — · **Trạng thái:** Xong

Đưa ước lượng, giả định, schema, API contract và rules cho AI vào repo trước khi có code.

## Task trong phase

| Task | Tên | Ước lượng | Phụ thuộc | Commit |
|---|---|---|---|---|
| [T0.1](#T01) | Git init + ước lượng + giả định | 15m | — | `docs: add time estimate and assumptions before implementation` |
| [T0.2](#T02) | Commit SCHEMA.md, API.md, task specs | 30m | T0.1 | `docs: add database schema, API contract and task specs` |
| [T0.3](#T03) | CLAUDE.md + ai-log | 15m | T0.1 | `chore: add CLAUDE.md rules and AI workflow log` |

---

<a id="T01"></a>
## T0.1 — Git init + ước lượng + giả định

**Phase:** 0 · **Ước lượng:** 15m · **Phụ thuộc:** —

### Mục tiêu
Đáp ứng deliverable "Estimation: provide your time estimate before starting". Commit đầu tiên của repo phải chứa ước lượng, để git log chứng minh ước lượng được viết trước khi có code.

### Phạm vi
**Làm**
- `git init`, `.gitignore`
- `README.md` bản khung: tên dự án, ước lượng theo phase, danh sách giả định, ghi chú "Work in progress"

**Không làm**
- Không commit `docs/` trong commit này (để T0.2), giữ commit đầu tiên chỉ có ước lượng
- Chưa viết hướng dẫn setup hay API (để T8.1)

### Files
- Tạo: `.gitignore`, `README.md`

### Thiết kế chi tiết
`.gitignore`: `node_modules/`, `dist/`, `coverage/`, `.env`, `.env.*` (trừ `.env.example`), `*.log`, `.DS_Store`.

`README.md` gồm:
1. **Time estimate**: bảng theo phase (lấy từ [README task](README.md)), tổng ~14h, ghi ngày viết.
2. **Assumptions** (đặt curated catalog lên đầu):
   - Exercises là catalog do admin quản lý; tên lạ bị từ chối (`400 UNKNOWN_EXERCISE`); bài này seed catalog từ file.
   - `date` là ngày theo giờ địa phương của user (`YYYY-MM-DD`), lưu kiểu `DATE`.
   - Volume và PR tính theo từng set; 1RM dùng đúng công thức Epley của đề, kể cả khi reps = 1.
   - PR hòa → chọn ngày đạt sớm nhất.
   - Không có update/delete entry (ngoài phạm vi đề bài).
   - Giới hạn input: 1–100 entries, 1–50 sets, reps 1–1000, `weight_kg ≤ 1000`.
3. Dòng ghi chú: chi tiết đầy đủ sẽ có trong README cuối cùng.

### Tiêu chí hoàn thành
- [ ] `git log` có đúng 1 commit, chỉ gồm `.gitignore` và `README.md`
- [ ] README có bảng ước lượng và danh sách giả định

### Tests
Không có.

### Commit dự kiến
```
docs: add time estimate and assumptions before implementation
```

### Rủi ro / điểm cần soi
- Ước lượng phải là con số đưa ra **trước** khi làm. Không sửa lại con số này sau; nếu thực tế khác, ghi "actual vs estimate" ở README cuối (T8.1).

---

<a id="T02"></a>
## T0.2 — Commit SCHEMA.md, API.md, task specs

**Phase:** 0 · **Ước lượng:** 30m · **Phụ thuộc:** T0.1

### Mục tiêu
Đưa design đã chốt vào repo trước khi code: schema, API contract và các task spec. Người chấm sẽ thấy design có trước implementation.

### Phạm vi
**Làm**
- Bổ sung mục **Unit extensibility** vào `docs/SCHEMA.md`
- Viết `docs/API.md` (contract đầy đủ)
- Commit `docs/SCHEMA.md`, `docs/API.md`, `docs/tasks/`

**Không làm**
- Không sửa schema ngoài mục unit (schema đã chốt)

### Files
- Sửa: `docs/SCHEMA.md`
- Tạo: `docs/API.md`
- Commit: `docs/tasks/*.md`

### Thiết kế chi tiết

### Mục "Unit extensibility" thêm vào SCHEMA.md
- Registry dạng dữ liệu `{ code, kgPerUnit, aliases, reference }` là nguồn duy nhất cho validation, alias, quy đổi và test.
- `weight_kg` chỉ được sinh ra bởi `toStoredKg()` (Decimal, làm tròn về scale 4).
- Output quy đổi từ `weight` + `unit` gốc; fallback từ `weight_kg` nếu unit gốc không còn trong registry.
- Registry **chỉ được thêm, không được xóa** unit.
- Checklist thêm `stone`: 1 dòng trong registry, không cần migration.

### docs/API.md
- Base path `/api/v1`, content-type JSON, `userId` trong path.
- Mỗi endpoint: method, path, params/body, ví dụ request và response, mã lỗi có thể trả.
- Endpoints: `POST /users/:userId/workouts`, `GET /users/:userId/workouts`, `GET /users/:userId/personal-records`, `GET /users/:userId/personal-records/compare`, `GET /exercises`, `GET /health`.
- Error format chung:
  ```json
  { "error": { "code": "VALIDATION_ERROR", "message": "Request validation failed",
               "details": [{ "field": "entries[0].sets[1].unit", "issue": "Unsupported unit 'stn'. Supported units: kg, lb" }] },
    "requestId": "..." }
  ```
- Bảng mã lỗi:

  | Code | HTTP | Khi nào |
  |---|---|---|
  | `VALIDATION_ERROR` | 400 | Body/query/param sai (gồm unit không hỗ trợ, ngày sai, vượt giới hạn kg) |
  | `UNKNOWN_EXERCISE` | 400 | Body POST có `exerciseName` không có trong catalog |
  | `INVALID_CURSOR` | 400 | Cursor hỏng hoặc bị sửa |
  | `EXERCISE_NOT_FOUND` | 404 | PR/compare với exercise không có trong catalog |
  | `NOT_FOUND` | 404 | Route không tồn tại |
  | `IDEMPOTENCY_KEY_REUSED` | 422 | Cùng `Idempotency-Key`, body khác |
  | `INTERNAL_ERROR` | 500 | Lỗi không lường trước |
  | `SERVICE_UNAVAILABLE` | 503 | `/health` khi DB không truy cập được |

- Kết quả rỗng: `200` + `data: []` (hoặc record `null`) + `meta.message`.
- Quy tắc unit trong query: không truyền → giữ unit gốc (history) / unit của set thắng (PR); compare mặc định `kg`.

### Tiêu chí hoàn thành
- [ ] SCHEMA.md có mục Unit extensibility
- [ ] API.md có đủ 6 endpoint, ví dụ request/response, bảng mã lỗi
- [ ] Không có mâu thuẫn giữa API.md, SCHEMA.md và task specs

### Tests
Không có.

### Commit dự kiến
```
docs: add database schema, API contract and task specs
```

### Rủi ro / điểm cần soi
- API.md là contract để review từng endpoint; khi code lệch contract thì sửa contract trước (trong cùng commit) chứ không để lệch âm thầm.

---

<a id="T03"></a>
## T0.3 — CLAUDE.md + ai-log

**Phase:** 0 · **Ước lượng:** 15m · **Phụ thuộc:** T0.1

### Mục tiêu
Tạo rules file cho Claude Code (bằng chứng cho mục "prompting strategy / rules files" của AI_WORKFLOW.md) và file nhật ký để ghi lại các lần AI sai hoặc đề xuất bị bác bỏ trong lúc làm.

### Phạm vi
**Làm**
- `CLAUDE.md` ở root
- `notes/ai-log.md` với template

**Không làm**
- Không viết AI_WORKFLOW.md (để T8.2)

### Files
- Tạo: `CLAUDE.md`, `notes/ai-log.md`

### Thiết kế chi tiết

### CLAUDE.md
- **Dự án:** Workout Logging API, NestJS + TypeScript, PostgreSQL 18, TypeORM (migration SQL tay).
- **Nguồn chuẩn:** `docs/SCHEMA.md` (schema, write/read flow), `docs/API.md` (contract), `docs/tasks/` (spec từng task). Code lệch spec → dừng lại và hỏi.
- **Cấu trúc 3 tầng** và quy tắc phụ thuộc (`infrastructure/`, `shared/` không import `modules/`; `shared/` không dùng DB; module một chiều: workouts → catalog, workouts → personal-records, personal-records → catalog).
- **Cấm:**
  - `number`/float cho cân nặng → dùng `Decimal`; không so sánh numeric dạng string từ `pg`
  - Offset pagination
  - Công thức PR ở ngoài `PrCalculator`
  - Hardcode unit (`'kg'`, `'lb'`, `@IsEnum([...])`) ở ngoài registry
  - Timezone của server trong logic ngày
  - `useContainer` của class-validator
  - Ghi vào `daily_exercise_bests` ở ngoài `DailyBestsWriter`
- **Quy ước:** Conventional Commits; unit test `*.spec.ts` đặt cạnh file; e2e ở `test/e2e/`; không comment giải thích "what"; lỗi trả theo error format chung.
- **Lệnh:** `npm run lint`, `npm test`, `npm run test:e2e`, `docker compose up --build`.

### notes/ai-log.md
Mỗi mục gồm: ngày, task, loại (`wrong` / `suboptimal` / `rejected`), AI đề xuất gì, phát hiện bằng cách nào, sửa thế nào, commit liên quan. Ghi sẵn các mục từ giai đoạn design (đã xảy ra thật):
- AI ghi "index-only scan" cho query PR trong khi query lấy cột không có trong `INCLUDE`
- FK `best_*_set_id` chặn `ON DELETE CASCADE` của sets
- `INCLUDE` các cột bị upsert liên tục làm mất HOT update
- Đề xuất auto-create exercise bị thay bằng curated catalog
- Test round-trip của unit luôn pass kể cả khi hệ số sai
- Tính bằng float khiến `PrCalculator` lệch với giá trị DB lưu

### Tiêu chí hoàn thành
- [ ] CLAUDE.md ngắn gọn (< 80 dòng), mỗi quy tắc có thể kiểm tra được
- [ ] ai-log có template + các mục từ giai đoạn design

### Tests
Không có.

### Commit dự kiến
```
chore: add CLAUDE.md rules and AI workflow log
```

### Rủi ro / điểm cần soi
- CLAUDE.md quá dài sẽ bị AI bỏ qua; chỉ giữ quy tắc có tác dụng chặn lỗi thật.
- ai-log chỉ ghi sự việc thật; không bịa thêm cho đủ số lượng.
