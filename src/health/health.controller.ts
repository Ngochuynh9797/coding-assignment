import { Controller, Get, HttpStatus } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppException } from '@shared/errors/app-exception';
import { ErrorCode } from '@shared/errors/error-codes';

// Shorter than the Docker healthcheck timeout (3 s), so an unreachable database yields a 503, not a hang.
const DB_CHECK_TIMEOUT_MS = 2_000;

@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  async check(): Promise<{ status: 'ok'; db: 'up' }> {
    try {
      await this.pingDatabase();
    } catch {
      throw new AppException(
        ErrorCode.SERVICE_UNAVAILABLE,
        HttpStatus.SERVICE_UNAVAILABLE,
        'Database is not reachable',
      );
    }
    return { status: 'ok', db: 'up' };
  }

  private async pingDatabase(): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Database check timed out after ${DB_CHECK_TIMEOUT_MS} ms`)),
        DB_CHECK_TIMEOUT_MS,
      );
    });
    try {
      await Promise.race([this.dataSource.query('SELECT 1'), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}
