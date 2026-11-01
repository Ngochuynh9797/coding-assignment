import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import type { HttpLogger } from 'pino-http';
import { APP_CONFIG } from '@infra/config/config.module';
import type { AppConfig } from '@infra/config/env.schema';
import { HTTP_LOGGER } from '@infra/logging/logging.module';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.use(app.get<HttpLogger>(HTTP_LOGGER));
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();
  const config = app.get<AppConfig>(APP_CONFIG);
  await app.listen(config.PORT);
}

void bootstrap();
