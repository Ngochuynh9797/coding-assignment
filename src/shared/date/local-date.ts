import { DateTime } from 'luxon';

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const LOCAL_DATE_FORMAT = 'yyyy-MM-dd';

// Luxon accepts year 0000, which PostgreSQL DATE cannot store. The bound also keeps every derived
// period valid: the previous period of an anchor in 1900-01 starts in 1899-12.
export const MIN_LOCAL_DATE = '1900-01-01';

// The regex pins the exact shape; Luxon then rejects dates that do not exist (2026-02-30).
export function isCalendarDate(s: unknown): s is string {
  return (
    typeof s === 'string' &&
    LOCAL_DATE.test(s) &&
    DateTime.fromFormat(s, LOCAL_DATE_FORMAT, { zone: 'utc' }).isValid
  );
}

export function isValidLocalDate(s: unknown): s is string {
  // YYYY-MM-DD strings sort lexicographically in calendar order.
  return isCalendarDate(s) && s >= MIN_LOCAL_DATE;
}

export function isNotTooFarInFuture(date: string, nowUtc: Date, maxFutureDays = 1): boolean {
  const today = DateTime.fromJSDate(nowUtc, { zone: 'utc' });
  if (!today.isValid) {
    throw new Error('isNotTooFarInFuture: nowUtc is an invalid Date');
  }
  return date <= today.plus({ days: maxFutureDays }).toFormat(LOCAL_DATE_FORMAT);
}
