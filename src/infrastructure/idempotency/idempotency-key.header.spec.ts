import { AppException } from '@shared/errors/app-exception';
import { parseIdempotencyKey } from './idempotency-key.header';

describe('parseIdempotencyKey', () => {
  it('passes a missing header through as undefined', () => {
    expect(parseIdempotencyKey(undefined)).toBeUndefined();
  });

  it.each(['3c9b1f0a-log-2026-10-31', 'x', '!~', 'k'.repeat(255)])('accepts %p', (key) => {
    expect(parseIdempotencyKey(key)).toBe(key);
  });

  it.each(['', 'has space', 'k'.repeat(256), 'tab\t', 'ü', ['a', 'b']])('rejects %p', (key) => {
    let error: unknown;
    try {
      parseIdempotencyKey(key);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe('VALIDATION_ERROR');
    expect((error as AppException).httpStatus).toBe(400);
    expect((error as AppException).details).toEqual([
      { field: 'headers.idempotency-key', issue: 'must be 1-255 printable ASCII characters' },
    ]);
  });
});
