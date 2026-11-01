import { Module } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { AllExceptionsFilter } from '@common/filters/all-exceptions.filter';
import { LoggingModule } from '@common/logging/logging.module';
import { createValidationPipe } from '@common/pipes/validation.pipe';
import { ConfigModule } from '@config/config.module';
import { DatabaseModule } from '@infra/database/database.module';
import { CatalogModule } from '@modules/catalog/catalog.module';
import { WorkoutsModule } from '@modules/workouts/workouts.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    DatabaseModule,
    HealthModule,
    CatalogModule,
    WorkoutsModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_PIPE, useFactory: createValidationPipe },
  ],
})
export class AppModule {}
