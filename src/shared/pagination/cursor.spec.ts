import { AppException } from '@shared/errors/app-exception';
import { ErrorCode } from '@shared/errors/error-codes';
import { decodeCursor, encodeCursor } from './cursor';

const ID = '019a3f2e-7c41-7d3a-9b2e-5f1c8a6d4e21';
const encode = (payload: unknown): string =>
  Buffer.from(JSON.stringify(payload)).toString('base64url');

describe('cursor', () => {
  it('round-trips a cursor', () => {
    const cursor = { performedOn: '2026-10-31', id: ID };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it('encodes as base64url JSON with a version', () => {
    const encoded = encodeCursor({ performedOn: '2026-10-31', id: ID });
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(JSON.parse(Buffer.from(encoded, 'base64url').toString())).toEqual({
      v: 1,
      d: '2026-10-31',
      id: ID,
    });
  });

  it.each([
    ['garbage with invalid characters', 'not a cursor!'],
    ['empty string', ''],
    ['base64 of non-JSON', Buffer.from('hello').toString('base64url')],
    ['JSON that is not an object', encode([1, 2])],
    ['JSON null', encode(null)],
    ['missing fields', encode({ v: 1 })],
    ['unknown version', encode({ v: 2, d: '2026-10-31', id: ID })],
    ['invalid date', encode({ v: 1, d: '2026-02-30', id: ID })],
    ['id that is not a uuid', encode({ v: 1, d: '2026-10-31', id: '42' })],
    ['id of the wrong type', encode({ v: 1, d: '2026-10-31', id: 42 })],
  ])('rejects %s with INVALID_CURSOR', (_, input) => {
    let error: unknown;
    try {
      decodeCursor(input);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(AppException);
    expect(error).toMatchObject({ code: ErrorCode.INVALID_CURSOR, httpStatus: 400 });
  });
});
