import 'reflect-metadata';
import { validate } from 'class-validator';
import { IsOnOrBefore } from './is-on-or-before';

class Range {
  @IsOnOrBefore('to')
  from?: unknown;

  to?: unknown;
}

async function issues(from: unknown, to: unknown): Promise<string[]> {
  const errors = await validate(Object.assign(new Range(), { from, to }));
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('@IsOnOrBefore', () => {
  it.each([
    ['2026-10-01', '2026-10-31'],
    ['2026-10-31', '2026-10-31'],
    ['2025-12-31', '2026-01-01'],
  ])('accepts %p before or on %p', async (from, to) => {
    expect(await issues(from, to)).toEqual([]);
  });

  it('rejects a date after the other property, naming it', async () => {
    expect(await issues('2026-11-01', '2026-10-31')).toEqual(["must be on or before 'to'"]);
  });

  it.each([
    [undefined, '2026-10-31'],
    ['2026-11-01', undefined],
    ['2026-13-01', '2026-10-31'],
    ['2026-11-01', 'not-a-date'],
  ])('leaves %p / %p to the format validators', async (from, to) => {
    expect(await issues(from, to)).toEqual([]);
  });
});
