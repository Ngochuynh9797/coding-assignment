import { idempotencyCutoff } from './idempotency-cleanup.job';

describe('idempotencyCutoff', () => {
  const now = new Date('2026-11-01T10:30:00.000Z');

  it.each([
    [24, '2026-10-31T10:30:00.000Z'],
    [1, '2026-11-01T09:30:00.000Z'],
    [8760, '2025-11-01T10:30:00.000Z'],
  ])('subtracts %p hours from now', (ttlHours, expected) => {
    expect(idempotencyCutoff(now, ttlHours).toISOString()).toBe(expected);
  });

  it('does not mutate the input date', () => {
    idempotencyCutoff(now, 24);

    expect(now.toISOString()).toBe('2026-11-01T10:30:00.000Z');
  });
});
