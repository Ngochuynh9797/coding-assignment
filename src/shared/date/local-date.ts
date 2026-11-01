import { DateTime } from 'luxon';

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const LOCAL_DATE_FORMAT = 'yyyy-MM-dd';

// The regex pins the exact shape; Luxon then rejects dates that do not exist (2026-02-30).
export function isValidLocalDate(s: unknown): s is string {
  return (
    typeof s === 'string' &&
    LOCAL_DATE.test(s) &&
    DateTime.fromFormat(s, LOCAL_DATE_FORMAT, { zone: 'utc' }).isValid
  );
}

export function isNotTooFarInFuture(date: string, nowUtc: Date, maxFutureDays = 1): boolean {
  const today = DateTime.fromJSDate(nowUtc, { zone: 'utc' });
  if (!today.isValid) {
    throw new Error('isNotTooFarInFuture: nowUtc is an invalid Date');
  }
  return date <= today.plus({ days: maxFutureDays }).toFormat(LOCAL_DATE_FORMAT);
}
