/**
 * Rounds to 2 decimal places and kills floating-point artifacts
 * (e.g. 60.199999999999996 -> 60.2, 0.30000000000000004 -> 0.3).
 */
export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}