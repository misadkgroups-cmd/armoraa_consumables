const DEFAULT_RETRIES = 3;
const BASE_DELAY_MS = 1000;

/**
 * Checks whether an error is transient and safe to retry.
 * Handles server overloads (503), gateway timeouts (504, 502), rate limits (429),
 * and network-level disconnections/timeouts (TypeError: Failed to fetch, NetworkError, AbortError).
 *
 * @param {object|Error} error
 * @returns {boolean}
 */
export function isRetryableError(error) {
  if (!error) return false;
  const msg = String(error.message || '').toLowerCase();
  const details = String(error.details || '').toLowerCase();
  const code = String(error.code || error.status || '');

  // 1. Server overload / rate limits / transient gateway errors
  if (code === '503' || code === '502' || code === '504' || code === '429') return true;
  if (msg.includes('503') || msg.includes('502') || msg.includes('504') || msg.includes('429')) return true;

  // 2. Network connectivity / timeout / socket drops
  if (
    msg.includes('failed to fetch') ||
    msg.includes('network error') ||
    msg.includes('networkerror') ||
    msg.includes('network request timed out') ||
    msg.includes('timeout') ||
    msg.includes('abort') ||
    msg.includes('connection reset') ||
    msg.includes('socket hang up') ||
    msg.includes('err_internet_disconnected') ||
    details.includes('failed to fetch') ||
    details.includes('timeout')
  ) {
    return true;
  }

  return false;
}

/**
 * Wraps a Supabase query promise with automatic retry logic (jittered exponential backoff).
 * Retries on transient 502/503/504/429 gateway errors and network-level fetch failures.
 *
 * @param {Function} supabaseFn - A function that returns a Supabase query promise, e.g.:
 *   () => supabase.from('table').select('*')
 * @param {object}   [options]
 * @param {number}   [options.maxRetries=3]
 * @param {function} [options.onRetry] - Callback invoked before each retry with (attempt, delayMs, error)
 * @returns {Promise<{data, error}>}
 */
export async function withRetry(supabaseFn, { maxRetries = DEFAULT_RETRIES, onRetry } = {}) {
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await supabaseFn();
      const data = res?.data;
      const error = res?.error;

      if (!error) {
        return { data, error: null };
      }

      lastError = error;

      if (!isRetryableError(error)) {
        // Non-transient error (e.g. 400 Bad Request, 401 Unauthorized, 404, Unique violation)
        break;
      }
    } catch (thrown) {
      lastError = {
        message: thrown?.message || 'Network error occurred. Please check your internet connection.',
        originalError: thrown,
        isNetworkError: true,
      };

      if (!isRetryableError(lastError)) {
        break;
      }
    }

    if (attempt >= maxRetries) {
      break; // Exhausted retries
    }

    // Jittered Exponential backoff: 1s, 2s, 4s... (+ random 0-250ms jitter)
    const jitter = Math.floor(Math.random() * 250);
    const delayMs = BASE_DELAY_MS * 2 ** attempt + jitter;

    if (onRetry) {
      try {
        onRetry(attempt + 1, delayMs, lastError);
      } catch (e) {
        console.warn('onRetry callback error:', e);
      }
    }

    console.warn(
      `[supabaseRetry] Transient error on attempt ${attempt + 1}/${maxRetries}. Retrying in ${delayMs}ms...`,
      lastError
    );

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  // All retries exhausted — return the last error with a user-friendly message
  return {
    data: null,
    error: {
      ...lastError,
      message:
        lastError?.message ||
        'Service temporarily unavailable. Please check your network connection and try again.',
    },
  };
}

/**
 * Generic retry helper for any arbitrary async action (e.g. multi-step transactions).
 */
export async function withAsyncRetry(asyncFn, { maxRetries = DEFAULT_RETRIES, onRetry } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await asyncFn(attempt);
    } catch (err) {
      lastError = err;
      if (!isRetryableError(err) || attempt >= maxRetries) {
        throw err;
      }
      const delayMs = BASE_DELAY_MS * 2 ** attempt + Math.floor(Math.random() * 250);
      if (onRetry) onRetry(attempt + 1, delayMs, err);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastError;
}

export const chunk = (arr, size = 100) => {
  const out = [];
  for (let i = 0; i < (arr || []).length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

/**
 * Fetches ALL rows matching a query by automatically paginating in chunks of 1000,
 * overcoming PostgREST's default 1000-row limit.
 */
export async function fetchAllRows(buildQueryFn, step = 1000) {
  let all = [];
  let from = 0;
  while (true) {
    const q = buildQueryFn().range(from, from + step - 1);
    const { data, error } = await withRetry(() => q);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < step) break;
    from += step;
  }
  return all;
}

/**
 * Higher-order function that creates a Supabase retry helper with a pre-configured onRetry callback.
 */
export function createRetryWrapper(options = {}) {
  return (supabaseFn) => withRetry(supabaseFn, options);
}
