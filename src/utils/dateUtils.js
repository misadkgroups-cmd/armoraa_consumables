/**
 * Returns today's date in LOCAL time as 'YYYY-MM-DD'.
 *
 * NEVER use `new Date().toISOString().split('T')[0]` for a "today" default:
 * toISOString() is UTC, so in timezones ahead of UTC it yields YESTERDAY
 * during the early morning hours (and tomorrow in zones behind UTC), which
 * silently saved bills with the wrong service date.
 */
export function getTodayLocal() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/**
 * Formats an arbitrary Date in LOCAL time as 'YYYY-MM-DD' (UTC-safe).
 */
export function formatDateLocal(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

