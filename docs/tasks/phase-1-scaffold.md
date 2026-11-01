# Phase 1 — Scaffold & production basics

**Ước lượng:** ~2h · **Phụ thuộc:** Phase 0 · **Trạng thái:** Xong

Dựng khung NestJS 3 tầng, config, logging, error format và Docker để mọi phase sau có nền production-ready.

## Task trong phase

| Task | Tên | Ước lượng | Phụ thuộc | Commit |
|---|---|---|---|---|
| [T1.1](#T11) | Scaffold NestJS + 3 tầng + lint boundaries | 30m | T0.3 | `chore: scaffold NestJS project with layered structure and import boundaries` |
| [T1.2](#T12) | Config (zod) + structured logging | 30m | T1.1 | `feat(infra): add validated configuration and structured JSON logging` |
| [T1.3](#T13) | Error format, exception filter, ValidationPipe | 30m | T1.1 | `feat(infra): add unified error format, exception filter and validation pipe` |
| [T1.4](#T14) | Dockerfile, docker compose, /health | 30m | T1.2 | `build: add multi-stage Dockerfile, docker compose and health endpoint` |

---

<a id="T11"></a>
## T1.1 — Scaffold NestJS + 3 tầng + lint boundaries

**Phase:** 1 · **Ước lượng:** 30m · **Phụ thuộc:** T0.3

### Mục tiêu
Dựng khung project với cấu trúc 3 tầng (`infrastructure/`, `shared/`, `modules/`) và để ESLint enforce quy tắc phụ thuộc ngay từ đầu (tiêu chí "separation of concerns").

### Phạm vi
**Làm**
- Khởi tạo NestJS (Node 22 LTS, TypeScript strict), ESLint + Prettier
- Tạo thư mục rỗng có `.gitkeep` cho 3 tầng
- Path alias `@infra/*`, `@shared/*`, `@modules/*` (tsconfig + Jest)
- Rule ESLint `import/no-restricted-paths`
- npm scripts

**Không làm**
- Chưa có config, logging, DB (T1.2, T3.1)
- Không giữ `AppController`/`AppService` mẫu của Nest CLI (viết file tay, không chạy `nest new`)

### Files
- Tạo: `package.json`, `tsconfig.json`, `tsconfig.build.json`, `nest-cli.json`, `eslint.config.mjs`, `.prettierrc`, `jest.config.ts`, `src/main.ts`, `src/app.module.ts`
- Tạo thư mục: `src/infrastructure/`, `src/shared/`, `src/modules/`, `test/e2e/`

### Thiết kế chi tiết
- `tsconfig`: `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: false` (tránh xung đột với class-validator), `paths` cho 3 alias.
- `eslint.config.mjs` (flat config) + `eslint-plugin-import`:
  ```js
  'import/no-restricted-paths': ['error', { zones: [
    { target: './src/infrastructure', from: './src/modules' },
    { target: './src/shared', from: './src/modules' },
    { target: './src/shared', from: './src/infrastructure/database' },
    { target: './src/modules/catalog', from: './src/modules/workouts' },
    { target: './src/modules/catalog', from: './src/modules/personal-records' },
    { target: './src/modules/personal-records', from: './src/modules/workouts' },
  ]}]
  ```
  Ngoài ra bật `@typescript-eslint/no-floating-promises`, `no-explicit-any`.
- `main.ts`: global prefix `api/v1`, `enableShutdownHooks()`, port từ env (tạm thời `process.env.PORT ?? 3000`, thay ở T1.2).
- Scripts: `build`, `start`, `start:dev`, `lint`, `format`, `test`, `test:e2e`, `typecheck`.

### Tiêu chí hoàn thành
- [ ] `npm run build`, `npm run lint`, `npm test` chạy được (chưa có test cũng không lỗi: `--passWithNoTests`)
- [ ] Viết thử 1 import từ `shared/` sang `modules/` → `npm run lint` báo lỗi (thử rồi xóa)
- [ ] Không còn code mẫu của Nest CLI

### Tests
- Kiểm tra thủ công rule boundary như trên.

### Commit dự kiến
```
chore: scaffold NestJS project with layered structure and import boundaries
```

### Rủi ro / điểm cần soi khi review code AI
- AI thường giữ lại `AppController` mẫu và `src/common/` theo thói quen → không đúng cấu trúc đã chốt.
- Alias phải khai báo ở cả `tsconfig` và `jest.config` (`moduleNameMapper`), thiếu một chỗ thì test lỗi import.
- `eslint-plugin-import` cần resolver TypeScript (`eslint-import-resolver-typescript`) để hiểu alias; thiếu thì rule im lặng không chạy → phải thử vi phạm thật để chắc rule hoạt động.

---

<a id="T12"></a>
## T1.2 — Config (zod) + structured logging

**Phase:** 1 · **Ước lượng:** 30m · **Phụ thuộc:** T1.1

### Mục tiêu
Production readiness: configuration management (validate env, fail fast) và structured logging (JSON, có requestId).

### Phạm vi
**Làm**
- `ConfigModule` global + schema zod cho env
- `nestjs-pino`: log JSON, requestId, redact
- `.env.example`

**Không làm**
- Chưa kết nối DB (T3.1), chỉ khai báo biến

### Files
- Tạo: `src/infrastructure/config/env.schema.ts`, `src/infrastructure/config/config.module.ts`, `src/infrastructure/logging/logging.module.ts`, `.env.example`
- Sửa: `src/app.module.ts`, `src/main.ts`

### Thiết kế chi tiết
- Env schema (zod):

  | Biến | Kiểu | Mặc định |
  |---|---|---|
  | `NODE_ENV` | `development \| test \| production` | `development` |
  | `PORT` | int 1–65535 | `3000` |
  | `DATABASE_URL` | URL `postgres://` | bắt buộc |
  | `DB_POOL_MAX` | int | `10` |
  | `LOG_LEVEL` | `fatal..trace` | `info` |
  | `IDEMPOTENCY_TTL_HOURS` | int | `24` |

  Env sai → app không khởi động và in rõ biến nào sai.
- Truy cập config qua một `AppConfig` typed (inject), không gọi `process.env` rải rác.
- Logging:
  - `pino-http` với `genReqId`: lấy header `x-request-id` nếu hợp lệ (≤ 128 ký tự), không thì sinh UUID; trả lại header `x-request-id` trong response.
  - `redact`: `req.headers.authorization`, `req.headers.cookie`.
  - Dev: `pino-pretty`; production: JSON thuần.
  - `bufferLogs: true` + `app.useLogger(app.get(Logger))` để log lúc bootstrap cũng qua pino.
- Không log body request (có thể lớn với bulk 100 entries).

### Tiêu chí hoàn thành
- [ ] Thiếu `DATABASE_URL` → app thoát với message rõ ràng
- [ ] Mỗi log request có `reqId`, `method`, `url`, `statusCode`, `responseTime`
- [ ] Gửi `x-request-id: abc` → log và response header dùng `abc`

### Tests
- Unit: `env.schema.spec.ts` — env hợp lệ, thiếu biến bắt buộc, `PORT` không phải số, áp mặc định.

### Commit dự kiến
```
feat(infra): add validated configuration and structured JSON logging
```

### Rủi ro / điểm cần soi khi review code AI
- AI hay dùng `ConfigService.get('X')` trả `any` rải rác khắp nơi → yêu cầu một object config typed duy nhất.
- requestId từ header client phải được giới hạn độ dài/ký tự để tránh log injection.

---

<a id="T13"></a>
## T1.3 — Error format, exception filter, ValidationPipe

**Phase:** 1 · **Ước lượng:** 30m · **Phụ thuộc:** T1.1

### Mục tiêu
Tiêu chí "consistent error responses, structured error responses, validation at boundaries, meaningful messages": mọi lỗi đều trả về cùng một format, lỗi validation chỉ rõ field (kể cả field lồng trong mảng).

### Phạm vi
**Làm**
- `AppException` (base) + error codes
- `AllExceptionsFilter`
- Global `ValidationPipe` với `exceptionFactory` làm phẳng lỗi lồng nhau thành field path
- Map lỗi Postgres

**Không làm**
- Các lỗi nghiệp vụ cụ thể (`UNKNOWN_EXERCISE`...) được định nghĩa trong module của chúng

### Files
- Tạo: `src/shared/errors/app-exception.ts`, `src/shared/errors/error-codes.ts`, `src/infrastructure/http/all-exceptions.filter.ts`, `src/infrastructure/http/validation.pipe.ts`, `src/infrastructure/http/http.module.ts`
- Sửa: `src/main.ts` (hoặc đăng ký qua `APP_FILTER` / `APP_PIPE`)

> `AppException` đặt ở `shared/errors/` (không ở `infrastructure/http/`) để code trong `shared/` (ví dụ cursor) ném lỗi được mà không phải import tầng infrastructure.

### Thiết kế chi tiết
- `AppException(code, httpStatus, message, details?: { field: string; issue: string }[])`.
- Response:
  ```json
  { "error": { "code": "...", "message": "...", "details": [] }, "requestId": "..." }
  ```
- `ValidationPipe`: `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`, **không** bật `enableImplicitConversion` (tránh `"abc"` thành `NaN`; query số dùng `@Type(() => Number)` tường minh).
- `exceptionFactory`: duyệt đệ quy `ValidationError.children`, tạo path dạng `entries[2].sets[0].unit`; mỗi constraint thành một `detail`.
- Filter map:
  | Nguồn | Kết quả |
  |---|---|
  | `AppException` | giữ nguyên |
  | `NotFoundException` của Nest (route) | `404 NOT_FOUND` |
  | `BadRequestException` khác (JSON hỏng...) | `400 VALIDATION_ERROR` |
  | `QueryFailedError` code `23505` | `409 CONFLICT` |
  | `QueryFailedError` code `23503` | `409 CONFLICT` (module có thể bắt trước và đổi thành lỗi nghiệp vụ) |
  | Lỗi khác | `500 INTERNAL_ERROR`, message chung, log `error` kèm stack |
- Lỗi 4xx log ở mức `warn`, 5xx ở mức `error`; không trả stack trace cho client.

### Tiêu chí hoàn thành
- [ ] Mọi lỗi (kể cả route không tồn tại, JSON hỏng) đều có cùng format và có `requestId`
- [ ] Lỗi field lồng trong mảng có path đúng
- [ ] Lỗi 500 không lộ thông tin nội bộ

### Tests
- Unit `validation.pipe.spec.ts`: DTO lồng 2 cấp sai ở `entries[1].sets[0].reps` → path đúng; field thừa → lỗi `property x should not exist`.
- Unit `all-exceptions.filter.spec.ts`: AppException, HttpException, QueryFailedError 23505, Error thường → đúng status + code.

### Commit dự kiến
```
feat(infra): add unified error format, exception filter and validation pipe
```

### Rủi ro / điểm cần soi khi review code AI
- AI hay chỉ lấy lỗi cấp 1 của `ValidationError` → mất lỗi của set lồng bên trong.
- Không được để message gốc của Postgres (`duplicate key value violates...`) lọt ra client.

---

<a id="T14"></a>
## T1.4 — Dockerfile, docker compose, /health

**Phase:** 1 · **Ước lượng:** 30m · **Phụ thuộc:** T1.2

### Mục tiêu
Deliverable "setup must work with `docker compose up`" và tiêu chí "Docker setup" của production readiness.

### Phạm vi
**Làm**
- Dockerfile multi-stage
- `docker-compose.yml` (postgres:18 + app)
- Entrypoint chạy migrate + seed rồi start (các bước migrate/seed được nối vào ở T3.1/T3.2, ở task này để sẵn chỗ)
- `GET /health` (liveness)

**Không làm**
- Không làm compose riêng cho test (e2e dùng Testcontainers, T7.1)
- Không kiểm tra DB trong `/health`: chưa có kết nối DB (T3.1), DB check được nối vào ở T3.1

### Files
- Tạo: `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `docker/entrypoint.sh`, `src/infrastructure/health/health.controller.ts`, `src/infrastructure/health/health.module.ts`, `config/.gitkeep` (để `COPY config/` không lỗi trước T3.2)

### Thiết kế chi tiết
- **Dockerfile**: stage `deps` (`npm ci`), stage `build` (`npm run build`, `npm prune --omit=dev --omit=optional`: `ts-node`/`typescript` là optional peer của `typeorm`, bị npm đánh dấu `devOptional` nên `--omit=dev` không loại), stage `runtime` (`node:22-alpine`, user `node` không phải root, chỉ copy `dist/`, `node_modules/`, `config/`, `package.json`). `HEALTHCHECK` gọi `/api/v1/health`.
- **docker-compose.yml**:
  - `db`: `postgres:18`, env user/password/db, healthcheck `pg_isready`, volume mount tại **`/var/lib/postgresql`** (image Postgres 18 đổi vị trí PGDATA so với các bản trước; đã kiểm tra image: `PGDATA=/var/lib/postgresql/18/docker`, `VOLUME /var/lib/postgresql`), port 5432 publish ra host để debug (đổi được bằng `DB_HOST_PORT` nếu máy đã dùng 5432).
  - `app`: build từ Dockerfile, `depends_on: db: condition: service_healthy`, `DATABASE_URL` trỏ tới `db`, port 3000.
- **entrypoint.sh**: `set -e` → `node dist/.../migrate` → `node dist/.../seed-catalog` → `exec node dist/main.js` (`exec` để nhận SIGTERM, phối hợp với `enableShutdownHooks`).
- **/health**: ở task này chỉ là liveness, `200 { status: "ok" }`. DB check (`SELECT 1`, `db: "up"`, `503 SERVICE_UNAVAILABLE`) được nối vào ở T3.1 khi có `DatabaseModule`. Không phụ thuộc `@nestjs/terminus` (một query là đủ).

### Tiêu chí hoàn thành
- [ ] `docker compose up --build` từ máy sạch → `curl localhost:3000/api/v1/health` trả 200
- [ ] `docker compose down` → app tắt êm (không bị kill sau timeout)

### Tests
- Kiểm tra thủ công theo tiêu chí trên (e2e cho /health ở T7.1). Tiêu chí "dừng `db` → 503" chuyển sang T3.1.

### Commit dự kiến
```
build: add multi-stage Dockerfile, docker compose and health endpoint
```

### Rủi ro / điểm cần soi khi review code AI
- AI quen mount `/var/lib/postgresql/data`, đúng cho Postgres ≤ 17 nhưng sai với image 18 → cần kiểm tra lại theo tài liệu image `postgres:18` lúc làm.
- Entrypoint thiếu `exec` thì app không nhận SIGTERM.
- Không đưa `devDependencies` vào image runtime.
