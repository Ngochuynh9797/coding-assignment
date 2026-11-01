import { HttpStatus } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { isValidLocalDate } from '@shared/date/local-date';
import { AppException } from '@shared/errors/app-exception';
import { ErrorCode } from '@shared/errors/error-codes';

export interface HistoryCursor {
  performedOn: string;
  id: string;
}

const VERSION = 1;
// Buffer.from(s, 'base64url') silently skips invalid characters, so the alphabet is checked first.
const BASE64URL = /^[A-Za-z0-9_-]+$/;

export function encodeCursor(c: HistoryCursor): string {
  return Buffer.from(JSON.stringify({ v: VERSION, d: c.performedOn, id: c.id })).toString(
    'base64url',
  );
}

export function decodeCursor(s: string): HistoryCursor {
  const payload = parsePayload(s);
  if (
    !isRecord(payload) ||
    payload.v !== VERSION ||
    !isValidLocalDate(payload.d) ||
    typeof payload.id !== 'string' ||
    !isUUID(payload.id)
  ) {
    throw invalidCursor();
  }
  return { performedOn: payload.d, id: payload.id };
}

function parsePayload(s: string): unknown {
  if (!BASE64URL.test(s)) {
    throw invalidCursor();
  }
  try {
    return JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
  } catch {
    throw invalidCursor();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidCursor(): AppException {
  return new AppException(
    ErrorCode.INVALID_CURSOR,
    HttpStatus.BAD_REQUEST,
    'Invalid pagination cursor',
    [{ field: 'cursor', issue: 'is malformed or has been tampered with' }],
  );
}
