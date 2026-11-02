import 'reflect-metadata';
import { validate } from 'class-validator';
import { MaxDecimalPlaces } from './max-decimal-places';

class Weight {
  @MaxDecimalPlaces(4)
  value?: unknown;
}

async function issues(value: unknown): Promise<string[]> {
  const errors = await validate(Object.assign(new Weight(), { value }));
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('@MaxDecimalPlaces', () => {
  it.each([0, 100, 102.5, 1.2345, 0.0001, 1e-4, 1e21])('accepts %p', async (value) => {
    expect(await issues(value)).toEqual([]);
  });

  it.each([1.23456, 0.00001, 1e-7, 1.5e-7])('rejects %p', async (value) => {
    expect(await issues(value)).toEqual(['value must have at most 4 decimal places']);
  });

  it.each(['1.23456', null, undefined, Number.NaN, Number.POSITIVE_INFINITY])(
    'leaves %p to the type validator',
    async (value) => {
      expect(await issues(value)).toEqual([]);
    },
  );
});
