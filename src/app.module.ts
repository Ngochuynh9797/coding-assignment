import { Module } from '@nestjs/common';
import { ConfigModule } from '@infra/config/config.module';
import { HealthModule } from '@infra/health/health.module';
import { HttpModule } from '@infra/http/http.module';
import { LoggingModule } from '@infra/logging/logging.module';

@Module({
  imports: [ConfigModule, LoggingModule, HttpModule, HealthModule],
})
export class AppModule {}
