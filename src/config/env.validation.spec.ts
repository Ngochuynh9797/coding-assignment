import { parseEnv } from './env.validation';

const DATABASE_URL = 'postgres://workout:secret@localhost:5432/workout';

describe('parseEnv', () => {
  it('parses a complete, valid environment into typed values', () => {
    const config = parseEnv({
      NODE_ENV: 'production',
      PORT: '8080',
      DATABASE_URL,
      DB_POOL_MAX: '20',
      LOG_LEVEL: 'warn',
    });

    expect(config).toEqual({
      NODE_ENV: 'production',
      PORT: 8080,
      DATABASE_URL,
      DB_POOL_MAX: 20,
      LOG_LEVEL: 'warn',
    });
  });

  it('applies defaults when only the required variable is set', () => {
    expect(parseEnv({ DATABASE_URL })).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_URL,
      DB_POOL_MAX: 10,
      LOG_LEVEL: 'info',
    });
  });

  it('accepts the postgresql:// scheme', () => {
    const url = 'postgresql://workout:secret@db:5432/workout';
    expect(parseEnv({ DATABASE_URL: url }).DATABASE_URL).toBe(url);
  });

  it('ignores unrelated variables', () => {
    expect(parseEnv({ DATABASE_URL, HOME: '/root' })).not.toHaveProperty('HOME');
  });

  it('rejects a missing DATABASE_URL and names the variable', () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });

  it('rejects a non-postgres DATABASE_URL', () => {
    expect(() => parseEnv({ DATABASE_URL: 'mysql://localhost/db' })).toThrow(/DATABASE_URL/);
  });

  it.each(['abc', '0', '70000', '30.5', ''])('rejects PORT=%j', (port) => {
    expect(() => parseEnv({ DATABASE_URL, PORT: port })).toThrow(/PORT/);
  });

  it('rejects an unknown LOG_LEVEL', () => {
    expect(() => parseEnv({ DATABASE_URL, LOG_LEVEL: 'verbose' })).toThrow(/LOG_LEVEL/);
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => parseEnv({ DATABASE_URL, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('rejects a non-positive DB_POOL_MAX', () => {
    expect(() => parseEnv({ DATABASE_URL, DB_POOL_MAX: '0' })).toThrow(/DB_POOL_MAX/);
  });

  it('lists every invalid variable in one error', () => {
    let message = '';
    try {
      parseEnv({ PORT: 'abc', LOG_LEVEL: 'verbose' });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toMatch(/DATABASE_URL/);
    expect(message).toMatch(/PORT/);
    expect(message).toMatch(/LOG_LEVEL/);
  });
});
