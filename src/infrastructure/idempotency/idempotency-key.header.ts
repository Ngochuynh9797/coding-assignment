import { createParamDecorator, type ExecutionContext, HttpStatus } from '@nestjs/common';
import type { Request } from 'express';
import { AppException } from '@shared/errors/app-exception';
import { ErrorCode } from '@shared/errors/error-codes';

const IDEMPOTENCY_KEY = /^[\x21-\x7E]{1,255}$/;

export function parseIdempotencyKey(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || !IDEMPOTENCY_KEY.test(value)) {
    throw new AppException(
      ErrorCode.VALIDATION_ERROR,
      HttpStatus.BAD_REQUEST,
      'Request validation failed',
      [{ field: 'headers.idempotency-key', issue: 'must be 1-255 printable ASCII characters' }],
    );
  }
  return value;
}

// A param decorator rather than @Headers(): @Headers() does not accept pipes.
export const IdempotencyKeyHeader = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string | undefined =>
    parseIdempotencyKey(ctx.switchToHttp().getRequest<Request>().headers['idempotency-key']),
);
