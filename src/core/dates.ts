/** Whole years from `from` to `to`, counting a year only once its anniversary passes. */
export function yearsBetween(from: Date, to: Date): number {
  let years = to.getUTCFullYear() - from.getUTCFullYear();
  const beforeAnniversary =
    to.getUTCMonth() < from.getUTCMonth() ||
    (to.getUTCMonth() === from.getUTCMonth() &&
      to.getUTCDate() < from.getUTCDate());
  if (beforeAnniversary) years -= 1;
  return years;
}

/** Parses "MM-DD-YYYY" or "MM/DD/YYYY" (state data uses both); null for blanks or junk. */
export function parseUsDate(value: string): Date | null {
  const m = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(value.trim());
  if (!m) return null;
  return new Date(Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2])));
}
