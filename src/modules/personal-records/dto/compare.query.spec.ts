import 'reflect-metadata';
import type { ArgumentMetadata } from '@nestjs/common';
import { createValidationPipe } from '@common/pipes/validation.pipe';
import { AppException, type ErrorDetail } from '@shared/errors/app-exception';
import { CompareQuery } from './compare.query';

const query: ArgumentMetadata = { type: 'query', metatype: CompareQuery };

const custom = {
  baseFrom: '2026-11-01',
  baseTo: '2026-11-30',
  compareFrom: '2026-10-01',
  compareTo: '2026-10-31',
};

function transform(value: Record<string, unknown>): Promise<CompareQuery> {
  return createValidationPipe().transform(
    { exercise: 'Bench Press', ...value },
    query,
  ) as Promise<CompareQuery>;
}

async function details(value: Record<string, unknown>): Promise<ErrorDetail[]> {
  try {
    await transform(value);
  } catch (error) {
    expect(error).toBeInstanceOf(AppException);
    return (error as AppException).details;
  }
  throw new Error('expected validation to fail');
}

async function fields(value: Record<string, unknown>): Promise<string[]> {
  return [...new Set((await details(value)).map((d) => d.field))].sort();
}

describe('CompareQuery', () => {
  it('accepts the preset form and defaults unit to kg without defaulting tz', async () => {
    const result = await transform({ period: 'month' });

    expect(result).toBeInstanceOf(CompareQuery);
    expect(result.unit).toBe('kg');
    expect(result.tz).toBeUndefined();
  });

  it('accepts the preset form with tz, anchor and a unit alias', async () => {
    const result = await transform({
      period: 'week',
      tz: 'Asia/Ho_Chi_Minh',
      anchor: '2026-11-15',
      unit: ' LBS ',
    });

    expect(result).toMatchObject({ period: 'week', tz: 'Asia/Ho_Chi_Minh', unit: 'lb' });
  });

  it('accepts the custom form', async () => {
    expect(await transform(custom)).toMatchObject(custom);
  });

  it('requires one of the two forms', async () => {
    expect(await fields({})).toEqual(['period']);
  });

  it('rejects an unknown period', async () => {
    expect(await fields({ period: 'day' })).toEqual(['period']);
  });

  it.each([{ period: 'month' }, { tz: 'UTC' }, { anchor: '2026-11-15' }])(
    'rejects mixing the custom form with %p',
    async (preset) => {
      const result = await details({ ...custom, ...preset });

      expect(result).toEqual([
        {
          field: Object.keys(preset)[0],
          issue: 'must not be combined with baseFrom, baseTo, compareFrom, compareTo',
        },
      ]);
    },
  );

  it.each(Object.keys(custom))('rejects a custom form without %s', async (missing) => {
    const partial: Record<string, unknown> = { ...custom };
    delete partial[missing];

    expect(await details(partial)).toEqual([
      {
        field: missing,
        issue: 'is required when any of baseFrom, baseTo, compareFrom, compareTo is given',
      },
    ]);
  });

  it('reports a malformed custom date with the format message', async () => {
    expect(await details({ ...custom, baseTo: '2026-11-31' })).toEqual([
      { field: 'baseTo', issue: 'must be a valid date in YYYY-MM-DD format' },
    ]);
  });

  it('reports a custom date before the minimum with its own message', async () => {
    expect(await details({ ...custom, compareFrom: '0000-12-01' })).toEqual([
      { field: 'compareFrom', issue: 'must be on or after 1900-01-01' },
    ]);
  });

  // The previous period of an anchor in 1900-01 starts in 1899-12, which PostgreSQL still stores.
  it('rejects an anchor before the minimum date', async () => {
    expect(await details({ period: 'month', anchor: '0001-01-15' })).toEqual([
      { field: 'anchor', issue: 'must be on or after 1900-01-01' },
    ]);
  });

  it('rejects an invalid tz', async () => {
    expect(await details({ period: 'month', tz: 'Mars/Olympus' })).toEqual([
      { field: 'tz', issue: 'must be a valid IANA timezone' },
    ]);
  });

  it('rejects an invalid anchor', async () => {
    expect(await fields({ period: 'month', anchor: '2026-02-30' })).toEqual(['anchor']);
  });

  it('rejects ranges whose start is after their end', async () => {
    const result = await details({
      ...custom,
      baseFrom: '2026-12-01',
      compareFrom: '2026-11-01',
    });

    expect(result).toEqual([
      { field: 'baseFrom', issue: "must be on or before 'baseTo'" },
      { field: 'compareFrom', issue: "must be on or before 'compareTo'" },
    ]);
  });

  it('rejects an unsupported unit and a blank exercise', async () => {
    const result = await details({ exercise: '  ', period: 'month', unit: 'stn' });

    expect(result).toEqual([
      { field: 'exercise', issue: 'exercise must not be blank' },
      { field: 'unit', issue: "Unsupported unit 'stn'. Supported units: kg, lb" },
    ]);
  });
});
