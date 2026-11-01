import { Decimal } from 'decimal.js';
import { canonicalJson, hashRequestBody } from './canonical-json';

describe('canonicalJson', () => {
  it('sorts keys recursively', () => {
    expect(canonicalJson({ b: 1, a: { d: 1, c: 2 } })).toBe(
      canonicalJson({ a: { c: 2, d: 1 }, b: 1 }),
    );
    expect(canonicalJson({ b: 1, a: { d: 1, c: 2 } })).toBe('{"a":{"c":2,"d":1},"b":1}');
  });

  it('keeps nested keys that a top-level replacer array would drop', () => {
    expect(canonicalJson({ entries: [{ name: 'x', sets: [{ reps: 5 }] }] })).toBe(
      '{"entries":[{"name":"x","sets":[{"reps":5}]}]}',
    );
  });

  it('sorts keys of objects inside arrays', () => {
    expect(canonicalJson([{ b: 1, a: 2 }])).toBe('[{"a":2,"b":1}]');
  });

  it('preserves array order', () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });

  it('drops keys whose value is undefined', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it('sorts integer-like keys as strings', () => {
    expect(canonicalJson({ b: 1, 10: 2, 9: 3 })).toBe('{"10":2,"9":3,"b":1}');
  });

  it('serializes primitives like JSON.stringify', () => {
    expect(canonicalJson({ s: 'a"b', n: 1.5, t: true, z: null })).toBe(
      '{"n":1.5,"s":"a\\"b","t":true,"z":null}',
    );
  });

  it('uses toJSON when a value provides it', () => {
    expect(canonicalJson({ weight: new Decimal('102.5') })).toBe('{"weight":"102.5"}');
  });
});

describe('hashRequestBody', () => {
  it('returns the same sha256 hex for bodies that differ only in key order', () => {
    const a = hashRequestBody({ entries: [{ exerciseName: 'x', date: '2026-10-12' }], b: 1 });
    const b = hashRequestBody({ b: 1, entries: [{ date: '2026-10-12', exerciseName: 'x' }] });

    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns a different hash for a different body', () => {
    expect(hashRequestBody({ a: 1 })).not.toBe(hashRequestBody({ a: 2 }));
  });
});
