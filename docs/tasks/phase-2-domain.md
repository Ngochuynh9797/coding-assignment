# Phase 2 — Domain thuần + unit test

**Ước lượng:** ~1.5h · **Phụ thuộc:** Phase 1 · **Trạng thái:** Chờ review

Các hàm thuần (unit, PR, chuẩn hóa chuỗi, ngày, cursor) được viết test trước, không cần DB.

## Task trong phase

| Task | Tên | Ước lượng | Phụ thuộc | Commit |
|---|---|---|---|---|
| [T2.1](#T21) | Unit registry + UnitConverter | 30m | T1.3 | `feat(units): add data-driven unit registry and decimal-based converter` |
| [T2.2](#T22) | PrCalculator | 25m | T2.1 | `feat(personal-records): add PR calculator with column-scale rounding` |
| [T2.3](#T23) | normalizeExerciseName, escapeLike, canonicalJson | 15m | T1.1 | `feat: add exercise name normalization, LIKE escaping and canonical JSON hashing` |
| [T2.4](#T24) | Date utils + cursor | 20m | T1.3 | `feat(shared): add local date validation, timezone-aware periods and keyset cursor` |

---

<a id="T21"></a>
## T2.1 — Unit registry + UnitConverter

**Phase:** 2 · **Ước lượng:** 30m · **Phụ thuộc:** T1.3

### Mục tiêu
Yêu cầu "auto-convert and store a normalized value (kg) alongside the original", "return in the unit the user specifies" và "adding a new unit type (e.g. stone) should require minimal code changes". Thêm `stone` chỉ cần 1 dòng trong registry.

### Phạm vi
**Làm** (viết test trước)
- `unit.registry.ts`: dữ liệu unit + hàm thuần cho validator
- `UnitConverter` (injectable) + `UnitsModule`
- Unit test

**Không làm**
- DTO dùng validator (T4.1); hiển thị output (T5.3, T6.2)

### Files
- Tạo: `src/shared/units/unit.registry.ts`, `src/shared/units/unit-converter.ts`, `src/shared/units/units.module.ts`, `src/shared/units/unit-converter.spec.ts`, `src/shared/units/unit.registry.spec.ts`
- Dependency: `decimal.js`

### Thiết kế chi tiết
```ts
export interface WeightUnitDef {
  code: string;            // mã chính, viết thường, lưu vào DB
  kgPerUnit: string;       // string để Decimal không mất chính xác
  aliases: readonly string[];
  reference: { value: string; kg: string };  // giá trị tham chiếu cho test
}

export const WEIGHT_UNITS: readonly WeightUnitDef[] = [
  { code: 'kg', kgPerUnit: '1',          aliases: ['kgs', 'kilogram', 'kilograms'], reference: { value: '1',   kg: '1' } },
  { code: 'lb', kgPerUnit: '0.45359237', aliases: ['lbs', 'pound', 'pounds'],       reference: { value: '100', kg: '45.359237' } },
];
export const SUPPORTED_UNIT_CODES: string[];          // suy ra từ WEIGHT_UNITS
export function normalizeUnitCode(input: unknown): unknown;  // dùng cho @Transform: trim + lowercase + alias → code; không phải string thì trả nguyên
export const WEIGHT_UNITS_TOKEN = Symbol('WEIGHT_UNITS');
```

```ts
@Injectable()
export class UnitConverter {
  constructor(@Inject(WEIGHT_UNITS_TOKEN) defs: readonly WeightUnitDef[]);  // throw nếu code/alias trùng, code không viết thường, hệ số <= 0
  supportedCodes(): string[];
  isSupported(code: string): boolean;
  toStoredKg(weight: Decimal, unit: string): Decimal;          // weight × kgPerUnit, làm tròn 4 chữ số (ROUND_HALF_UP)
  fromKg(kg: Decimal, target: string): Decimal;                // không làm tròn
  convertForOutput(src: { weight: Decimal; unit: string; weightKg: Decimal }, target: string): Decimal;
  // trùng unit → src.weight; khác unit và unit gốc còn trong registry → weight × factor_gốc / factor_đích;
  // unit gốc không còn trong registry → fromKg(weightKg, target)
}
export function roundForOutput(value: Decimal): number;  // 2 chữ số, ROUND_HALF_UP, trả number cho JSON
```
- `UnitsModule` provide `{ provide: WEIGHT_UNITS_TOKEN, useValue: WEIGHT_UNITS }` và export `UnitConverter`.
- Validator (T4.1) dùng `normalizeUnitCode` + `SUPPORTED_UNIT_CODES` trực tiếp từ hằng số, không inject converter.
- Không có `if (unit === 'lb')` ở bất cứ đâu.

### Tiêu chí hoàn thành
- [ ] Không có chuỗi `'kg'`/`'lb'` ngoài `unit.registry.ts` (trừ test)
- [ ] Mọi phép tính qua `Decimal`, không có `number` ở giữa
- [ ] Thêm thử dòng `stone` vào registry → toàn bộ test vẫn pass, không phải sửa file nào khác (thử rồi bỏ)

### Tests
- `it.each(WEIGHT_UNITS)`: `toStoredKg(reference.value, code)` = `reference.kg` (làm tròn 4) — bắt được hệ số sai.
- Bất biến registry: code duy nhất, alias không trùng code/alias khác, viết thường, hệ số > 0.
- Constructor throw khi inject registry có code trùng / alias trùng.
- `normalizeUnitCode`: `' LBS '` → `lb`; `'Kg'` → `kg`; `'stn'` → `'stn'` (để `@IsIn` báo lỗi); `null` → `null`.
- `convertForOutput`: 225 lb → lb = 225 đúng tuyệt đối; 225 lb → kg = 102.05828325; 100 kg → lb ≈ 220.462262; unit gốc `'stone'` không có trong registry → dùng `weightKg`.
- `toStoredKg(225, 'lb')` = `102.0583`.
- Inject registry giả có `stone` (`6.35029318`) → 1 stone → kg = `6.3503`.

### Commit dự kiến
```
feat(units): add data-driven unit registry and decimal-based converter
```

### Rủi ro / điểm cần soi khi review code AI
- AI hay viết test round-trip (`kg → lb → kg ≈ 100`): **luôn pass kể cả khi hệ số sai**, không được dùng làm test chính.
- AI hay dùng `new Map(...)` mà không kiểm tra trùng → unit khai báo 2 lần bị ghi đè im lặng.
- `new Decimal(0.1)` từ number vẫn ổn (Decimal lấy biểu diễn ngắn nhất), nhưng không được tính `number * number` rồi mới đưa vào Decimal.

---

<a id="T22"></a>
## T2.2 — PrCalculator

**Phase:** 2 · **Ước lượng:** 25m · **Phụ thuộc:** T2.1

### Mục tiêu
Tiêu chí "PR aggregation logic, 1RM calculation": nơi duy nhất chứa công thức volume và Epley 1RM, và logic chọn best của từng ngày. Kết quả phải trùng với giá trị DB lưu để cập nhật incremental và rebuild cho ra cùng kết quả.

### Phạm vi
**Làm** (viết test trước)
- Hàm tính metric cho 1 set
- `bestsByGroup`: gom set theo `(exerciseId, performedOn)` và chọn best từng metric

**Không làm**
- Ghi DB (`DailyBestsWriter`, T4.3); đọc PR (T6.x)

### Files
- Tạo: `src/modules/personal-records/domain/pr-calculator.ts`, `src/modules/personal-records/domain/pr-calculator.spec.ts`

### Thiết kế chi tiết
```ts
export interface PrSetInput {
  setId: string;
  exerciseId: number;
  performedOn: string;      // 'YYYY-MM-DD'
  reps: number;
  weightKg: Decimal;        // đã qua toStoredKg (scale 4)
}
export interface SetMetrics { weightKg: Decimal; volumeKg: Decimal; e1rmKg: Decimal }
export interface DailyBest {
  exerciseId: number; performedOn: string;
  bestWeightKg: Decimal; bestWeightSetId: string;
  bestVolumeKg: Decimal; bestVolumeSetId: string;
  bestE1rmKg: Decimal;   bestE1rmSetId: string;
}

export function metricsOf(reps: number, weightKg: Decimal): SetMetrics;
// volumeKg = round4(weightKg × reps)
// e1rmKg   = round4(weightKg × (30 + reps) / 30)   ← tương đương weight × (1 + reps/30), tránh 1/30 bị cắt
export function bestsByGroup(sets: readonly PrSetInput[]): DailyBest[];
// duyệt theo thứ tự đầu vào; chỉ thay best khi giá trị mới LỚN HƠN HẲN (hòa → set đến trước thắng)
// kết quả sort theo (exerciseId ASC, performedOn ASC) — thứ tự upsert để tránh deadlock
```
- Làm tròn theo đúng scale cột DB: `weight_kg` / `best_e1rm_kg` `NUMERIC(10,4)`, `best_volume_kg` `NUMERIC(12,4)`, `ROUND_HALF_UP` (Postgres làm tròn `numeric` cũng half away from zero; với số không âm là như nhau).
- Set có `weightKg = 0` vẫn được tính (bests = 0); việc hiển thị `null` cho PR bằng 0 nằm ở T6.2.

### Tiêu chí hoàn thành
- [ ] Công thức Epley và volume chỉ xuất hiện trong file này
- [ ] Không có `number` trong phép tính cân nặng
- [ ] Đầu ra đã sort theo key

### Tests
- Epley: 100 kg × 5 reps → 116.6667; reps = 1 → 103.3333 (giữ đúng công thức đề bài, không trả 100).
- Volume: 102.0583 × 8 = 816.4664.
- **225 lb (102.0583 kg) so với set nhập 102.0583 kg → hòa → set đến trước thắng**, không phải set kg thắng.
- Hòa trong cùng ngày: 2 set 100 kg × 5 → set đầu tiên là best của cả 3 metric.
- Metric khác nhau thắng ở set khác nhau: set A 140×1 (max weight, e1rm 144.6667), set B 100×15 (max volume 1500, max e1rm 150) → setId tương ứng đúng. (Không dùng 100×12: e1rm = 140 < 144.6667 nên A thắng cả e1rm.)
- 1 request log cùng bài 2 lần trong 1 ngày (2 entry) → ra **1** group.
- Nhiều exercise × nhiều ngày, đầu vào lộn xộn → đầu ra sort đúng.
- Bodyweight (0 kg) → bests = 0.
- Mảng rỗng → `[]`.

### Commit dự kiến
```
feat(personal-records): add PR calculator with column-scale rounding
```

### Rủi ro / điểm cần soi khi review code AI
- AI hay viết `weight * (1 + reps / 30)` bằng `number` → sai số và lệch với DB.
- AI hay dùng `>=` khi so best → set đến sau thắng khi hòa, sai quy tắc và làm test rebuild (T7.4) fail.
- Nếu đầu ra không sort, 2 request song song có thể deadlock khi upsert (T4.3).

---

<a id="T23"></a>
## T2.3 — normalizeExerciseName, escapeLike, canonicalJson

**Phase:** 2 · **Ước lượng:** 15m · **Phụ thuộc:** T1.1

### Mục tiêu
Các hàm thuần làm nền cho: resolve tên exercise không phân biệt hoa thường/khoảng trắng, partial match an toàn ("exercise name partial match supported"), và idempotency (phát hiện body giống nhau dù khác thứ tự key).

### Phạm vi
**Làm** (viết test trước)
- `normalizeExerciseName`, `escapeLike` (catalog domain)
- `canonicalJson`, `hashRequestBody` (idempotency)

### Files
- Tạo: `src/modules/catalog/domain/normalize-exercise-name.ts`, `src/modules/catalog/domain/escape-like.ts`, `src/infrastructure/idempotency/canonical-json.ts`, kèm `*.spec.ts`

### Thiết kế chi tiết
```ts
export function normalizeExerciseName(input: string): string;
// NFKC → trim → gộp mọi khoảng trắng (\s+) thành 1 dấu cách → toLowerCase()
// dùng cho cả name_key khi seed, resolve tên khi log, và từ khóa tìm kiếm

export function escapeLike(term: string): string;
// thay \ → \\, % → \%, _ → \_ (escape \ trước); dùng với LIKE ... ESCAPE '\'

export function canonicalJson(value: unknown): string;
// object: sort key đệ quy; array: giữ thứ tự; bỏ key có giá trị undefined; số/chuỗi theo JSON.stringify
export function hashRequestBody(value: unknown): string;   // sha256 hex của canonicalJson
```
- Hash tính trên **body sau khi đã qua ValidationPipe** (đã whitelist, unit đã normalize) để `"LBS"` và `"lb"` được coi là cùng request.

### Tiêu chí hoàn thành
- [ ] 3 hàm thuần, không phụ thuộc framework

### Tests
- normalize: `' BENCH  Press '` → `bench press`; tab/xuống dòng; ký tự full-width (NFKC) → ASCII.
- escapeLike: `'_'` → `'\_'`; `'50%'` → `'50\%'`; `'a\b'` → `'a\\b'`; chuỗi thường không đổi.
- canonicalJson: `{b:1,a:{d:1,c:2}}` và `{a:{c:2,d:1},b:1}` → cùng chuỗi; `[1,2]` khác `[2,1]`; `undefined` bị bỏ.
- hashRequestBody: 2 object khác thứ tự key → cùng hash.

### Commit dự kiến
```
feat: add exercise name normalization, LIKE escaping and canonical JSON hashing
```

### Rủi ro / điểm cần soi khi review code AI
- Escape `%`/`_` trước `\` sẽ escape đúp → sai; phải escape `\` trước.
- `JSON.stringify(obj, Object.keys(obj).sort())` (cách AI hay gợi ý) chỉ sort cấp 1 và **lọc mất key lồng nhau** → sai.

---

<a id="T24"></a>
## T2.4 — Date utils + cursor

**Phase:** 2 · **Ước lượng:** 20m · **Phụ thuộc:** T1.3

### Mục tiêu
Tiêu chí "timezone handling" và "pagination": validate ngày địa phương, tính kỳ "tháng này / tháng trước" theo timezone của user, và cursor cho keyset pagination.

### Phạm vi
**Làm** (viết test trước)
- Local date: parse/validate `YYYY-MM-DD`, giới hạn tương lai
- Period theo `tz`
- Cursor encode/decode
- Decorator `@IsLocalDate`, `@IsUserId`, `@IsTimeZone`

### Files
- Tạo: `src/shared/date/local-date.ts`, `src/shared/date/period.ts`, `src/shared/pagination/cursor.ts`, `src/shared/validation/is-local-date.ts`, `src/shared/validation/is-user-id.ts`, `src/shared/validation/is-time-zone.ts`, kèm `*.spec.ts`
- Sửa: `src/shared/errors/error-codes.ts` (thêm `INVALID_CURSOR`: mã cross-cutting, dùng chung cho mọi endpoint phân trang)
- Dependency: `luxon`

### Thiết kế chi tiết
```ts
// local-date.ts
export function isValidLocalDate(s: unknown): s is string;     // đúng regex ^\d{4}-\d{2}-\d{2}$ VÀ là ngày có thật (2026-02-30 sai)
export function isNotTooFarInFuture(date: string, nowUtc: Date, maxFutureDays = 1): boolean;  // date <= today_utc + maxFutureDays ngày

// period.ts
export type PeriodKind = 'week' | 'month' | 'year';
export interface DateRange { from: string; to: string }        // inclusive, 'YYYY-MM-DD'
export function periodRanges(kind: PeriodKind, tz: string, anchor?: string, now?: Date):
  { current: DateRange; previous: DateRange };
// anchor mặc định = "hôm nay" theo tz; tuần bắt đầu thứ Hai (ISO); current = trọn kỳ chứa anchor

// cursor.ts
export interface HistoryCursor { performedOn: string; id: string }
export function encodeCursor(c: HistoryCursor): string;        // base64url(JSON { v: 1, d, id })
export function decodeCursor(s: string): HistoryCursor;        // sai base64/JSON/version/ngày/uuid → AppException INVALID_CURSOR 400
```
- Decorator:
  - `@IsLocalDate(options?: { maxFutureDays?: number })`: `null`/`undefined`/sai định dạng/ngày không tồn tại → message `must be a valid date in YYYY-MM-DD format`; có `maxFutureDays` và ngày vượt giới hạn → `must be at most N day(s) after the current UTC date`. Không truyền `maxFutureDays` thì không giới hạn ngày tương lai.
  - `@IsUserId()`: `^[A-Za-z0-9_-]{1,64}$`.
  - `@IsTimeZone()`: Luxon `IANAZone.isValidZone`.
- Không dùng `new Date('YYYY-MM-DD')` (parse theo UTC, dễ lệch ngày) trong logic ngày.

### Tiêu chí hoàn thành
- [ ] Không phụ thuộc timezone của máy chạy (test chạy với `TZ=America/Los_Angeles` vẫn pass)

### Tests
- `isValidLocalDate`: `2026-02-29` sai (2026 không nhuận), `2028-02-29` đúng, `2026-13-01` sai, `26-1-1` sai, `null` sai.
- `isNotTooFarInFuture`: now = `2026-11-01T23:30Z` → `2026-11-02` đúng, `2026-11-03` sai.
- `periodRanges('month', 'Asia/Ho_Chi_Minh', now = 2026-10-31T17:30Z)` → current = `2026-11-01..2026-11-30` (ở VN đã sang 1/11), previous = `2026-10-01..2026-10-31`; cùng `now` với `UTC` → current = tháng 10.
- `week`: anchor Chủ nhật `2026-11-01` → `2026-10-26..2026-11-01`.
- `year`, tháng 2 năm nhuận, tháng 1 → previous là tháng 12 năm trước.
- Cursor: encode → decode ra lại đúng; chuỗi rác, JSON sai shape, `v: 2`, id không phải uuid → `INVALID_CURSOR`.

### Commit dự kiến
```
feat(shared): add local date validation, timezone-aware periods and keyset cursor
```

### Rủi ro / điểm cần soi khi review code AI
- AI hay tính "tháng này" bằng `new Date()` theo timezone của server → sai với user ở múi giờ khác.
- Cursor chỉ là base64 thuần thì client sửa được, nhưng không gây sai dữ liệu (chỉ là vị trí đọc); chấp nhận, ghi chú trong README.
