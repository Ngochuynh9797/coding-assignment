# Phase 8 — Docs & review

**Ước lượng:** ~1.5h · **Phụ thuộc:** Phase 0–7 · **Trạng thái:** Xong

README, AI_WORKFLOW.md và kiểm tra cuối từ bản clone sạch.

## Task trong phase

| Task | Tên | Ước lượng | Phụ thuộc | Commit |
|---|---|---|---|---|
| [T8.1](#T81) | README đầy đủ | 40m | T7.5 | `docs: complete README with architecture, API, schema and trade-offs` |
| [T8.2](#T82) | AI_WORKFLOW.md | 30m | tất cả | `docs: add AI workflow log` |
| [T8.3](#T83) | Code review + kiểm tra clone sạch | 20m | tất cả | mỗi finding một commit `fix(...)` |

---

<a id="T81"></a>
## T8.1 — README đầy đủ

**Phase:** 8 · **Ước lượng:** 40m · **Phụ thuộc:** T7.5

### Mục tiêu
Deliverable 2: README có architecture overview (kèm diagram), setup, API docs, schema và design decisions, trade-off và thay đổi khi scale.

### Files
- Sửa: `README.md`

### Nội dung
1. **Tổng quan** + **giả định** (curated catalog đặt đầu tiên)
2. **Time estimate vs actual**: giữ bảng ước lượng gốc (T0.1), thêm cột thực tế
3. **Quick start**: `docker compose up --build`, ví dụ curl theo kịch bản: bulk log (kg + lb, cùng bài 2 lần/ngày) → history `unit=lb` + phân trang → PR → compare `period=month&tz=Asia/Ho_Chi_Minh` → gửi lại cùng `Idempotency-Key`
4. **Architecture**: sơ đồ mermaid 3 tầng + quan hệ module, luồng request của write flow
5. **API**: tóm tắt endpoint + bảng mã lỗi, link `docs/API.md` (không có Swagger: chưa có trong code, README không mô tả tính năng chưa có)
6. **Database**: tóm tắt + link `docs/SCHEMA.md`
7. **Timezone strategy**: `performed_on DATE` theo giờ địa phương, `TIMESTAMPTZ` UTC cho thời điểm hệ thống, `tz` khi compare; trade-off (không biết giờ tập chính xác; không validate được "tương lai" tuyệt đối)
8. **Unit extensibility**: checklist thêm `stone` (1 dòng), quy tắc registry chỉ thêm không xóa, vì sao dùng Decimal
9. **Concurrency & idempotency**
10. **Performance**: tóm tắt từ `docs/PERFORMANCE.md`
11. **Testing**: cách chạy unit/e2e (cần Docker), chiến lược test
12. **Trade-offs & at scale** (theo SCHEMA.md) + known limitations (tên đồng nghĩa, đổi tên seed tạo exercise mới, tie-break giữa 2 request song song)
13. Link `AI_WORKFLOW.md`

### Tiêu chí hoàn thành
- [ ] Người lạ làm theo README chạy được trong < 5 phút
- [ ] Mọi lệnh curl trong README đã chạy thử và output khớp
- [ ] Không mâu thuẫn với SCHEMA.md / API.md

### Commit dự kiến
```
docs: complete README with architecture, API, schema and trade-offs
```

### Rủi ro / điểm cần soi khi review code AI
- AI hay viết README mô tả tính năng "dự kiến" chưa có thật; mọi khẳng định phải kiểm chứng được trong code hoặc số đo.

---

<a id="T82"></a>
## T8.2 — AI_WORKFLOW.md

**Phase:** 8 · **Ước lượng:** 30m · **Phụ thuộc:** tất cả

### Mục tiêu
Deliverable bắt buộc "AI workflow log" (mục được đánh giá là Critical).

### Files
- Tạo: `AI_WORKFLOW.md` (tổng hợp từ `notes/ai-log.md`)

### Nội dung bắt buộc (theo đề)
1. **Công cụ và mục đích**: Claude Code (architecture, schema review, coding, testing, debugging, docs); ghi rõ phần nào AI viết, phần nào tự quyết.
2. **≥ 2 ví dụ AI sai/chưa tối ưu và cách sửa** — chọn từ ai-log, mỗi ví dụ: AI đề xuất gì → phát hiện bằng cách nào → sửa thế nào → commit. Ứng viên đã có từ giai đoạn design:
   - Khẳng định "index-only scan" sai vì query lấy cột không có trong `INCLUDE`
   - `INCLUDE` trên cột bị upsert liên tục làm mất HOT update
   - FK `best_*_set_id` chặn `ON DELETE CASCADE`
   - Test round-trip unit luôn pass kể cả khi hệ số sai
   - Tính bằng float làm `PrCalculator` lệch với giá trị DB lưu
   - Cộng thêm các lỗi thật phát hiện trong lúc code (giữ nguyên số liệu, không tô vẽ)
3. **≥ 1 ví dụ bác bỏ đề xuất của AI và lý do**: ví dụ auto-create exercise → chọn curated catalog; `useContainer` cho validator → dùng `@IsIn` từ registry.
4. **Chiến lược prompt**: CLAUDE.md làm rules file; spec từng task trong `docs/tasks/` làm context; plan mode trước khi code; chia nhỏ theo task; yêu cầu AI phản biện chính design của nó (3 vòng phản biện schema).
5. **Cách review code AI**: đọc diff, test trước cho logic tính toán, rule ESLint boundary, commit sửa lỗi tách riêng (dẫn vài commit cụ thể).

### Tiêu chí hoàn thành
- [ ] Mỗi ví dụ dẫn được tới commit hoặc file cụ thể
- [ ] Ngắn gọn ("brief markdown file"), khoảng 1–2 trang

### Commit dự kiến
```
docs: add AI workflow log
```

### Rủi ro / điểm cần soi
- Ví dụ bịa hoặc phóng đại dễ lộ khi người chấm đối chiếu git log; chỉ dùng sự việc thật.

---

<a id="T83"></a>
## T8.3 — Code review + kiểm tra clone sạch

**Phase:** 8 · **Ước lượng:** 20m · **Phụ thuộc:** tất cả

### Mục tiêu
Bước kiểm tra cuối: không còn lỗi rõ ràng, repo chạy được từ đầu trên máy khác.

### Phạm vi
**Làm**
- Chạy `/code-review` trên toàn repo, xử lý từng finding (sửa hoặc ghi lý do bỏ qua)
- Đối chiếu code với `docs/SCHEMA.md`, `docs/API.md`, CLAUDE.md
- Clone repo ra thư mục mới, làm theo README từ đầu

### Checklist
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e` đều pass
- [ ] `grep` không còn `'kg'`/`'lb'` hardcode ngoài registry, không còn `OFFSET`, không có `parseFloat` trên cân nặng
- [ ] Không còn TODO, code chết, `console.log`
- [ ] Clone sạch → `docker compose up --build` → kịch bản curl trong README chạy đúng
- [ ] `git log --oneline` gọn, message rõ nghĩa, không có commit kiểu "fix", "wip"
- [ ] Không có secret hay `.env` trong repo
- [ ] Bảng trạng thái trong `docs/tasks/README.md` cập nhật hết

### Commit dự kiến
Mỗi finding được sửa là một commit riêng, ví dụ:
```
fix(workouts): <mô tả finding>
```

### Rủi ro / điểm cần soi
- Finding của `/code-review` cũng là output của AI; kiểm chứng từng cái trước khi sửa, và ghi vào ai-log những finding sai.
