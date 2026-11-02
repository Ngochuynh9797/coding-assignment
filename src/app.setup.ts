import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import type { HttpLogger } from 'pino-http';
import { HTTP_LOGGER } from '@common/logging/logging.module';

// Shared by main.ts and the e2e tests, so the tests exercise the same prefix, parser and logging.
export function configureApp(app: NestExpressApplication): void {
  app.use(app.get<HttpLogger>(HTTP_LOGGER));
  // Registered after the logger so a 413 is still logged with its request id; Nest then skips its
  // default (100 kB) JSON parser.
  app.useBodyParser('json', { limit: '1mb' });
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api/v1');
}
