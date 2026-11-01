// Single source for name_key, request name resolution and search terms: all three must agree.
export function normalizeExerciseName(input: string): string {
  return input.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}
