/**
 * Money domain — the single source of truth for the unit contract.
 *
 * INVARIANT: every monetary amount in this app is an integer number of
 * CENTS. Dollars never exist as a float anywhere except at the very edge,
 * inside `formatCents`, purely for display.
 *
 *   - `applyTaxCents` takes an amount in cents and returns the tax portion
 *     ALREADY in cents.
 *   - `formatCents` divides by 100 exactly once, at the display boundary,
 *     to render a `$1,299.00` string.
 *
 * A stray `* 100` or `/ 100` anywhere outside this file is almost always a
 * unit bug — the conversion already happened here.
 */

/** Add two cents amounts. */
export function addCents(a: number, b: number): number {
  return a + b;
}

/** Tax portion of `amountCents`, returned in cents. */
export function applyTaxCents(amountCents: number, rate: number): number {
  return Math.round(amountCents * rate);
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** Render a cents amount as a `$1,299.00` string (the only `/ 100`). */
export function formatCents(cents: number): string {
  return usd.format(cents / 100);
}
