// For LIKE ... ESCAPE '\'. A single pass cannot re-escape the backslashes it inserts.
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}
