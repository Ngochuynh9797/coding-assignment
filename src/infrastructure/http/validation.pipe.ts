import { HttpStatus, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { AppException, type ErrorDetail } from '@shared/errors/app-exception';
import { ErrorCode } from '@shared/errors/error-codes';

function childPath(parent: ValidationError, parentPath: string, property: string): string {
  return Array.isArray(parent.value) ? `${parentPath}[${property}]` : `${parentPath}.${property}`;
}

export function flattenValidationErrors(
  errors: ValidationError[],
  parent?: { error: ValidationError; path: string },
): ErrorDetail[] {
  return errors.flatMap((error) => {
    const path = parent ? childPath(parent.error, parent.path, error.property) : error.property;
    const own = Object.values(error.constraints ?? {}).map((issue) => ({ field: path, issue }));
    const nested = flattenValidationErrors(error.children ?? [], { error, path });
    return [...own, ...nested];
  });
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    // Implicit conversion would turn "abc" into NaN; numeric query params use @Type(() => Number).
    transformOptions: { enableImplicitConversion: false },
    exceptionFactory: (errors) =>
      new AppException(
        ErrorCode.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
        'Request validation failed',
        flattenValidationErrors(errors),
      ),
  });
}
