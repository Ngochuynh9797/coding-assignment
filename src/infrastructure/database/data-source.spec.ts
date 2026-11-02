import { types } from 'pg';
import type { AppConfig } from '@config/env.validation';
import { buildDataSourceOptions, type typeParsers } from './data-source';

describe('buildDataSourceOptions', () => {
  const config = { DATABASE_URL: 'postgres://localhost/test', DB_POOL_MAX: 5 } as AppConfig;
  const { getTypeParser } = (buildDataSourceOptions(config).extra as { types: typeof typeParsers })
    .types;

  it('keeps DATE as the YYYY-MM-DD string instead of a server-timezone Date', () => {
    expect(getTypeParser(types.builtins.DATE, 'text')('2026-10-31')).toBe('2026-10-31');
  });

  it('uses the default parser for other types', () => {
    expect(getTypeParser(types.builtins.INT4, 'text')('42')).toBe(42);
  });
});
