import 'reflect-metadata';
import { validate } from 'class-validator';
import { IsTimeZone } from './is-time-zone';

class Query {
  @IsTimeZone()
  tz!: unknown;
}

async function issues(tz: unknown): Promise<string[]> {
  const errors = await validate(Object.assign(new Query(), { tz }));
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('@IsTimeZone', () => {
  it.each(['UTC', 'Asia/Ho_Chi_Minh', 'America/Los_Angeles'])('accepts %p', async (value) => {
    expect(await issues(value)).toEqual([]);
  });

  it.each(['Mars/Olympus', '', 'GMT+25', null, undefined, 7])('rejects %p', async (value) => {
    expect(await issues(value)).toEqual(['must be a valid IANA timezone']);
  });
});
