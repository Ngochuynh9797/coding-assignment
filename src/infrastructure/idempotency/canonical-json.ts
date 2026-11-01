import { createHash } from 'node:crypto';

interface JsonSerializable {
  toJSON(): unknown;
}

const hasToJson = (value: object): value is JsonSerializable =>
  typeof (value as Partial<JsonSerializable>).toJSON === 'function';

// Built as a string rather than a re-ordered object: JS always enumerates integer-like keys first,
// so a rebuilt object would not keep the sorted order.
export function canonicalJson(value: unknown): string {
  if (value !== null && typeof value === 'object' && hasToJson(value)) {
    return canonicalJson(value.toJSON());
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => (item === undefined ? 'null' : canonicalJson(item))).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const members = Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
    return `{${members.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function hashRequestBody(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}
