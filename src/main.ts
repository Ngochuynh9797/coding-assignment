import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import type { HttpLogger } from 'pino-http';
import { APP_CONFIG } from '@config/config.module';
import type { AppConfig } from '@config/env.validation';
import { HTTP_LOGGER } from '@common/logging/logging.module';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.use(app.get<HttpLogger>(HTTP_LOGGER));
  // Registered after the logger so a 413 is still logged with its request id; Nest then skips its
  // default (100 kB) JSON parser.
  app.useBodyParser('json', { limit: '1mb' });
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();
  const config = app.get<AppConfig>(APP_CONFIG);
  await app.listen(config.PORT);
}

void bootstrap();
