import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase configuration. Check your .env file.');
}

// 15 seconds default timeout per attempt: fast failure detection so retries can trigger
// quickly without hanging the UI when clinic Wi-Fi or mobile data drops packets.
const DEFAULT_TIMEOUT_MS = 15000;
const MAX_FETCH_RETRIES = 2; // Total of up to 3 attempts
const BASE_RETRY_DELAY_MS = 800;

const isTransientStatus = (status) => {
  return status === 502 || status === 503 || status === 504 || status === 429;
};

const isTransientFetchError = (err) => {
  if (!err) return false;
  const msg = String(err.message || '').toLowerCase();
  return (
    msg.includes('network request timed out') ||
    msg.includes('failed to fetch') ||
    msg.includes('network error') ||
    msg.includes('networkerror') ||
    msg.includes('timeout') ||
    msg.includes('abort') ||
    msg.includes('connection reset') ||
    msg.includes('socket hang up') ||
    msg.includes('err_internet_disconnected')
  );
};

export const fetchWithTimeout = async (url, options = {}) => {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? MAX_FETCH_RETRIES;
  const callerSignal = options.signal;

  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // If the caller cancelled the request (e.g. unmount), exit immediately
    if (callerSignal?.aborted) {
      const abortErr = new Error(callerSignal.reason || 'Aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }

    const controller = new AbortController();
    let timedOut = false;

    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort(
        new Error(`Network request timed out after ${timeoutMs / 1000}s. Please check your internet connection and try again.`)
      );
    }, timeoutMs);

    const abortHandler = () => {
      clearTimeout(timeoutId);
      controller.abort(callerSignal.reason);
    };

    if (callerSignal) {
      callerSignal.addEventListener('abort', abortHandler);
    }

    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      if (callerSignal) callerSignal.removeEventListener('abort', abortHandler);

      // Retry transient server errors (502/503/504 gateway or 429 rate limit)
      if (isTransientStatus(response.status) && attempt < maxRetries && !callerSignal?.aborted) {
        console.warn(`[supabase-fetch] HTTP ${response.status} on ${url}. Retrying attempt ${attempt + 1}/${maxRetries}...`);
        const jitter = Math.floor(Math.random() * 200);
        const delay = BASE_RETRY_DELAY_MS * (2 ** attempt) + jitter;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      return response;
    } catch (err) {
      clearTimeout(timeoutId);
      if (callerSignal) callerSignal.removeEventListener('abort', abortHandler);

      // If caller intentionally aborted, do not retry
      if (callerSignal?.aborted && !timedOut) {
        throw err;
      }

      lastError = err;

      if (isTransientFetchError(err) && attempt < maxRetries && !callerSignal?.aborted) {
        console.warn(`[supabase-fetch] Network failure (${err.message}) on ${url}. Retrying attempt ${attempt + 1}/${maxRetries}...`);
        const jitter = Math.floor(Math.random() * 200);
        const delay = BASE_RETRY_DELAY_MS * (2 ** attempt) + jitter;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      throw err;
    }
  }

  throw lastError;
};

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    fetch: fetchWithTimeout,
  },
});
