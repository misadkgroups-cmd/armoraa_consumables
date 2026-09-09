/**
 * Rounds to 2 decimal places and kills floating-point artifacts
 * (e.g. 60.199999999999996 -> 60.2, 0.30000000000000004 -> 0.3).
 */
export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * Truncates (never rounds) to 1 decimal place for quantity display.
 * Examples: 2.6 -> 2.6, 2.27 -> 2.2, 2.999 -> 2.9, 0.567 -> 0.5, 3.0 -> 3.
 * NOTE: negative values floor toward -inf; quantities are always >= 0.
 */
export function trunc1(n) {
  const v = Number(n);
  if (!isFinite(v)) return 0;
  return Math.floor(v * 10) / 10;
}

/**
 * Display form of a quantity: truncated to exactly 1 decimal place.
 * Examples: 2.6 -> "2.6", 3 -> "3.0", 2.27 -> "2.2".
 */
export function fmtQty1(n) {
  return trunc1(n).toFixed(1);
}