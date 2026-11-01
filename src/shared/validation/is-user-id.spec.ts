import 'reflect-metadata';
import { validate } from 'class-validator';
import { IsUserId } from './is-user-id';

class Params {
  @IsUserId()
  userId!: unknown;
}

async function issues(userId: unknown): Promise<string[]> {
  const errors = await validate(Object.assign(new Params(), { userId }));
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('@IsUserId', () => {
  it.each(['user_123', 'A-b_9', 'x', 'a'.repeat(64)])('accepts %p', async (value) => {
    expect(await issues(value)).toEqual([]);
  });

  it.each(['', 'a'.repeat(65), 'user 1', 'user/1', 'üser', 'a\n', null, undefined, 123])(
    'rejects %p',
    async (value) => {
      expect(await issues(value)).toEqual([
        "must be 1-64 characters of letters, digits, '_' or '-'",
      ]);
    },
  );
});
