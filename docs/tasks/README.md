# Task specs

Mỗi phase là **một task cha**, có **một file spec** riêng để review trước khi code. Trong file, các task con (T<phase>.<n>) là các mục nhỏ, mỗi mục tương ứng khoảng 1 commit, để git log thể hiện quá trình làm từng bước.

Một phase chỉ được bắt đầu khi spec đã được duyệt và các phase phụ thuộc đã xong.

Nguồn chuẩn cho schema: [`docs/SCHEMA.md`](../SCHEMA.md). Spec nào lệch với SCHEMA.md thì sửa SCHEMA.md trước.

**Trạng thái:** `Chờ review` → `Đã duyệt` → `Đang làm` → `Xong`

## Mục lục

| Phase | Spec | Task con | Phụ thuộc | Ước lượng | Trạng thái |
|---|---|---|---|---|---|
| 0 | [Design & setup](phase-0-design-setup.md) | T0.1–T0.3 | — | ~1h | Xong |
| 1 | [Scaffold & production basics](phase-1-scaffold.md) | T1.1–T1.4 | Phase 0 | ~2h | Xong |
| 2 | [Domain thuần + unit test](phase-2-domain.md) | T2.1–T2.4 | Phase 1 | ~1.5h | Xong |
| 3 | [Database & catalog](phase-3-database-catalog.md) | T3.1–T3.3 | Phase 1, 2 | ~1.5h | Xong |
| 4 | [Log workout](phase-4-log-workout.md) | T4.1–T4.4 | Phase 2, 3 | ~2h | Xong |
| 5 | [History](phase-5-history.md) | T5.1–T5.3 | Phase 3, 4 | ~1.5h | Xong |
| 6 | [Personal records](phase-6-personal-records.md) | T6.1–T6.3 | Phase 4 | ~1.5h | Xong |
| 7 | [Integration, edge case & performance](phase-7-integration-performance.md) | T7.1–T7.5 | Phase 3–6 | ~2h | Xong |
| 8 | [Docs & review](phase-8-docs-review.md) | T8.1–T8.3 | Phase 0–7 | ~1.5h | Xong |

**Tổng ước lượng: ~14h**

## Quy trình mỗi phase
1. Đọc spec, xác nhận các phase phụ thuộc đã xong.
2. Với từng task con theo thứ tự trong spec: Claude Code ở plan mode → review plan với spec → implement → chạy test → đọc diff → sửa.
3. Ghi các điểm AI sai / bị bác bỏ vào `notes/ai-log.md`.
4. Commit từng task con theo message dự kiến; sửa lỗi của AI thì tách commit riêng.
5. Xong cả phase thì cập nhật cột Trạng thái ở bảng trên.
