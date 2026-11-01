import { normalizeExerciseName } from './normalize-exercise-name';

describe('normalizeExerciseName', () => {
  it.each([
    [' BENCH  Press ', 'bench press'],
    ['Bench\tPress', 'bench press'],
    ['Bench\n\r Press', 'bench press'],
    ['ＢＥＮＣＨ　ＰＲＥＳＳ', 'bench press'],
    ['bench press', 'bench press'],
    ['   ', ''],
  ])('normalizes %p to %p', (input, expected) => {
    expect(normalizeExerciseName(input)).toBe(expected);
  });
});
