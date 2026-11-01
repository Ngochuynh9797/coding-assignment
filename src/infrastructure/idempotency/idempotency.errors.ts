import { HttpStatus } from '@nestjs/common';
import { AppException } from '@shared/errors/app-exception';

export const IdempotencyErrorCode = {
  IDEMPOTENCY_KEY_REUSED: 'IDEMPOTENCY_KEY_REUSED',
} as const;

export function idempotencyKeyReusedError(): AppException {
  return new AppException(
    IdempotencyErrorCode.IDEMPOTENCY_KEY_REUSED,
    HttpStatus.UNPROCESSABLE_ENTITY,
    'This Idempotency-Key was already used with a different request body',
  );
}
