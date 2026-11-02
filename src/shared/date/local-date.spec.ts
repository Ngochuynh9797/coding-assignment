import { isNotTooFarInFuture, isValidLocalDate } from './local-date';

describe('isValidLocalDate', () => {
  it.each(['2028-02-29', '2026-01-01', '2026-12-31', '1900-01-01'])('accepts %p', (input) => {
    expect(isValidLocalDate(input)).toBe(true);
  });

  it.each([
    '2026-02-29',
    '2026-02-30',
    '1899-12-31',
    '0000-06-15',
    '2026-13-01',
    '2026-00-10',
    '26-1-1',
    '2026-1-01',
    '2026-01-01T00:00:00Z',
    ' 2026-01-01',
    '',
    null,
    undefined,
    20260101,
  ])('rejects %p', (input) => {
    expect(isValidLocalDate(input)).toBe(false);
  });
});

describe('isNotTooFarInFuture', () => {
  const now = new Date('2026-11-01T23:30:00Z');

  it.each(['2026-10-01', '2026-11-01', '2026-11-02'])('accepts %p', (date) => {
    expect(isNotTooFarInFuture(date, now)).toBe(true);
  });

  it('rejects a date more than one day after the UTC date', () => {
    expect(isNotTooFarInFuture('2026-11-03', now)).toBe(false);
  });

  it('honours a custom maxFutureDays', () => {
    expect(isNotTooFarInFuture('2026-11-01', now, 0)).toBe(true);
    expect(isNotTooFarInFuture('2026-11-02', now, 0)).toBe(false);
    expect(isNotTooFarInFuture('2026-11-04', now, 3)).toBe(true);
  });
});
