import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import type { HttpLogger } from 'pino-http';
import { APP_CONFIG } from '@config/config.module';
import type { AppConfig } from '@config/env.validation';
import { HTTP_LOGGER } from '@common/logging/logging.module';
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
