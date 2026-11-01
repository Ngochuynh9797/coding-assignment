import { periodRanges } from './period';

describe('periodRanges', () => {
  const now = new Date('2026-10-31T17:30:00Z');

  it('uses the user timezone for "today" when no anchor is given', () => {
    expect(periodRanges('month', 'Asia/Ho_Chi_Minh', undefined, now)).toEqual({
      current: { from: '2026-11-01', to: '2026-11-30' },
      previous: { from: '2026-10-01', to: '2026-10-31' },
    });
  });

  it('gives a different month for the same instant in UTC', () => {
    expect(periodRanges('month', 'UTC', undefined, now)).toEqual({
      current: { from: '2026-10-01', to: '2026-10-31' },
      previous: { from: '2026-09-01', to: '2026-09-30' },
    });
  });

  it('starts weeks on Monday', () => {
    expect(periodRanges('week', 'UTC', '2026-11-01')).toEqual({
      current: { from: '2026-10-26', to: '2026-11-01' },
      previous: { from: '2026-10-19', to: '2026-10-25' },
    });
  });

  it('keeps a Monday anchor in its own week', () => {
    expect(periodRanges('week', 'UTC', '2026-10-26').current).toEqual({
      from: '2026-10-26',
      to: '2026-11-01',
    });
  });

  it('computes years', () => {
    expect(periodRanges('year', 'UTC', '2026-06-15')).toEqual({
      current: { from: '2026-01-01', to: '2026-12-31' },
      previous: { from: '2025-01-01', to: '2025-12-31' },
    });
  });

  it('ends February on the 29th in a leap year', () => {
    expect(periodRanges('month', 'UTC', '2028-03-10').previous).toEqual({
      from: '2028-02-01',
      to: '2028-02-29',
    });
    expect(periodRanges('month', 'UTC', '2028-02-10').current).toEqual({
      from: '2028-02-01',
      to: '2028-02-29',
    });
  });

  it('rolls January back to December of the previous year', () => {
    expect(periodRanges('month', 'UTC', '2027-01-15').previous).toEqual({
      from: '2026-12-01',
      to: '2026-12-31',
    });
  });

  it('is not affected by a DST change inside the period', () => {
    expect(periodRanges('month', 'America/Los_Angeles', '2026-11-15')).toEqual({
      current: { from: '2026-11-01', to: '2026-11-30' },
      previous: { from: '2026-10-01', to: '2026-10-31' },
    });
  });

  it('throws on an invalid timezone', () => {
    expect(() => periodRanges('month', 'Mars/Olympus', undefined, now)).toThrow(/Mars\/Olympus/);
  });
});
