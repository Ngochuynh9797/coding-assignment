import 'reflect-metadata';
import { validate } from 'class-validator';
import { IsLocalDate } from './is-local-date';

class PlainDate {
  @IsLocalDate()
  date!: unknown;
}

class EntryDate {
  @IsLocalDate({ maxFutureDays: 1 })
  date!: unknown;
}

async function issues(cls: new () => { date: unknown }, date: unknown): Promise<string[]> {
  const dto = Object.assign(new cls(), { date });
  const errors = await validate(dto);
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('@IsLocalDate', () => {
  const formatMessage = 'must be a valid date in YYYY-MM-DD format';

  afterEach(() => jest.useRealTimers());

  it('accepts a real date', async () => {
    expect(await issues(PlainDate, '2028-02-29')).toEqual([]);
  });

  it.each([null, undefined, '2026-02-30', '2026/01/01', 20260101])(
    'rejects %p with the format message',
    async (value) => {
      expect(await issues(PlainDate, value)).toEqual([formatMessage]);
    },
  );

  it('does not limit future dates without maxFutureDays', async () => {
    expect(await issues(PlainDate, '2999-01-01')).toEqual([]);
  });

  it('rejects a date beyond maxFutureDays with its own message', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-01T23:30:00Z') });

    expect(await issues(EntryDate, '2026-11-02')).toEqual([]);
    expect(await issues(EntryDate, '2026-11-03')).toEqual([
      'must be at most 1 day(s) after the current UTC date',
    ]);
  });

  it.each(['1899-12-31', '0000-06-15'])('rejects %p as before the minimum date', async (value) => {
    expect(await issues(PlainDate, value)).toEqual(['must be on or after 1900-01-01']);
  });

  it('reports the format message, not the future message, for an invalid date', async () => {
    expect(await issues(EntryDate, '2026-13-01')).toEqual([formatMessage]);
  });
});
