import { escapeLike } from './escape-like';

describe('escapeLike', () => {
  it.each([
    ['_', '\\_'],
    ['50%', '50\\%'],
    ['a\\b', 'a\\\\b'],
    ['bench press', 'bench press'],
    // A backslash before a wildcard must not be escaped twice.
    ['\\%', '\\\\\\%'],
    ['%_\\', '\\%\\_\\\\'],
  ])('escapes %p as %p', (input, expected) => {
    expect(escapeLike(input)).toBe(expected);
  });
});
