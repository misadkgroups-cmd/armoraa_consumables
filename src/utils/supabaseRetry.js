const DEFAULT_RETRIES = 3;
const BASE_DELAY_MS = 1000;

/**
 * Wraps a Supabase query promise with automatic 503 retry logic (exponential backoff).
 * Supabase can return a 503 when the PostgREST or API gateway is temporarily overloaded.
 *
 * @param {Function} supabaseFn - A function that returns a Supabase query promise, e.g.:
 *   () => supabase.from('table').select('*')
 * @param {object}   [options]
 * @param {number}   [options.maxRetries=3]
 * @param {function} [options.onRetry] - Callback invoked before each retry with (attempt, delayMs)
 * @returns {Promise<{data, error}>}
 */
export async function withRetry(supabaseFn, { maxRetries = DEFAULT_RETRIES, onRetry } = {}) {
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const { data, error } = await supabaseFn();

    if (!error) {
      return { data, error: null };
    }

    lastError = error;

    // Only retry on 503 Service Unavailable
    const is503 =
      error.code === '503' ||
      error.status === 503 ||
      (error.message && error.message.includes('503')) ||
      (error.details && error.details.includes('503'));

    if (!is503) {
      // Non-retryable error — break immediately
      break;
    }

    if (attempt >= maxRetries) {
      break; // Exhausted retries
    }

    // Exponential backoff: 1s, 2s, 4s...
    const delayMs = BASE_DELAY_MS * 2 ** attempt;

    if (onRetry) {
      onRetry(attempt + 1, delayMs);
    }

    console.warn(
      `[supabaseRetry] 503 error on attempt ${attempt + 1}/${maxRetries}. Retrying in ${delayMs}ms...`,
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
        'Service temporarily unavailable. Please try again later.',
    },
  };
}

/**
 * Higher-order function that creates a Supabase retry helper with a pre-configured onRetry callback.
 * Use this when you want to integrate with your app's notification or logging system.
 *
 * @param {object}   [options]
 * @param {number}   [options.maxRetries=3]
 * @param {function} [options.onRetry]  - Called on each retry with (attempt, delayMs)
 * @returns {Function} A function that accepts a supabaseFn and returns a promise.
 */
export function createRetryWrapper(options = {}) {
  return (supabaseFn) => withRetry(supabaseFn, options);
}