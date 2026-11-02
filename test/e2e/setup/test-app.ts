import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../../src/app.module';
import { configureApp } from '../../../src/app.setup';

export type HttpClient = ReturnType<typeof request>;

export interface TestApp {
  app: NestExpressApplication;
  dataSource: DataSource;
  http: () => HttpClient;
  close: () => Promise<void>;
}

// AppModule registers the global filter and pipe (APP_FILTER / APP_PIPE) and configureApp is the
// function main.ts uses, so responses have the production shape.
export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
  configureApp(app);
  // A real listening server: each supertest request then opens its own connection, so requests
  // sent with Promise.all are actually concurrent.
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();
  return {
    app,
    dataSource: app.get(DataSource),
    http: () => request(url),
    close: () => app.close(),
  };
}

// The catalog is seeded once in global-setup and kept.
export async function resetDatabase(dataSource: DataSource): Promise<void> {
  await dataSource.query(
    'TRUNCATE workout_sets, workout_entries, daily_exercise_bests, idempotency_keys',
  );
}
