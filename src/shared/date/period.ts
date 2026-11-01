import { DateTime } from 'luxon';
import { LOCAL_DATE_FORMAT } from './local-date';

export type PeriodKind = 'week' | 'month' | 'year';

export interface DateRange {
  from: string;
  to: string;
}

export function periodRanges(
  kind: PeriodKind,
  tz: string,
  anchor?: string,
  now: Date = new Date(),
): { current: DateRange; previous: DateRange } {
  // The timezone only decides which calendar date "today" is; the rest is pure calendar arithmetic,
  // done in UTC so DST transitions inside a period cannot shift a boundary.
  const base = DateTime.fromISO(anchor ?? todayIn(tz, now), { zone: 'utc' });
  if (!base.isValid) {
    throw new Error(`Invalid anchor date '${anchor}'`);
  }

  const currentStart = base.startOf(kind);
  const previousEnd = currentStart.minus({ days: 1 });

  return {
    current: rangeOf(currentStart, base.endOf(kind)),
    previous: rangeOf(previousEnd.startOf(kind), previousEnd),
  };
}

function todayIn(tz: string, now: Date): string {
  const today = DateTime.fromJSDate(now, { zone: tz });
  if (!today.isValid) {
    throw new Error(`Invalid timezone '${tz}'`);
  }
  return today.toFormat(LOCAL_DATE_FORMAT);
}

function rangeOf(from: DateTime, to: DateTime): DateRange {
  return { from: from.toFormat(LOCAL_DATE_FORMAT), to: to.toFormat(LOCAL_DATE_FORMAT) };
}
