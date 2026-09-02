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

/**
 * Formats any date value (YYYY-MM-DD string, ISO timestamp, or Date) as
 * 'DD-MM-YYYY' for display. Local-time safe. Returns '-' for falsy input.
 */
export function formatDateDisplay(value) {
  if (!value) return '-';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-');
    return `${d}-${m}-${y}`;
  }
  const dt = new Date(value);
  if (isNaN(dt.getTime())) return String(value);
  const day = String(dt.getDate()).padStart(2, '0');
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  return `${day}-${month}-${dt.getFullYear()}`;
}

/**
 * Same as formatDateDisplay but appends a 12-hour time (DD-MM-YYYY hh:mm am/pm).
 */
export function formatDateTimeDisplay(value) {
  if (!value) return '-';
  const dt = new Date(value);
  if (isNaN(dt.getTime())) return String(value);
  let h = dt.getHours();
  const suffix = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  const hh = String(h).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');
  return `${formatDateDisplay(dt)} ${hh}:${mm} ${suffix}`;
}


