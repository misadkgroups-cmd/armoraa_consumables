import axios from 'axios';

const DEFAULT_RETRIES = 3;
const BASE_DELAY_MS = 1000; // 1 second initial delay

/**
 * Creates an axios instance with automatic 503 retry logic (exponential backoff).
 * @param {object} options
 * @param {string}  options.baseURL        - Base URL for the instance
 * @param {number}  options.maxRetries     - Max retries on 503 (default 3)
 * @param {boolean} options.useRetryAfter  - Whether to honour the Retry-After header (default true)
 */
export function createHttpClient({
  baseURL = '',
  maxRetries = DEFAULT_RETRIES,
  useRetryAfter = true,
} = {}) {
  const client = axios.create({ baseURL });

  client.interceptors.response.use(
    (response) => response, // pass through 2xx
    async (error) => {
      const config = error.config || {};

      // Only retry on 503 Service Unavailable
      if (!error.response || error.response.status !== 503) {
        return Promise.reject(error);
      }

      // Initialise retry counter on the config object
      if (config.__retryCount === undefined) {
        config.__retryCount = 0;
      }

      if (config.__retryCount >= maxRetries) {
        // Exhausted retries — attach a user-friendly message & rethrow
        const serverError = new Error(
          'Service temporarily unavailable. Please try again later.',
        );
        serverError.status = 503;
        serverError.originalError = error;
        return Promise.reject(serverError);
      }

      config.__retryCount += 1;

      // Calculate delay: exponential backoff + optional Retry-After header
      let delayMs = BASE_DELAY_MS * 2 ** (config.__retryCount - 1);

      if (useRetryAfter && error.response.headers['retry-after']) {
        const retryAfterSeconds = parseInt(
          error.response.headers['retry-after'],
          10,
        );
        if (!Number.isNaN(retryAfterSeconds) && retryAfterSeconds > 0) {
          delayMs = Math.max(delayMs, retryAfterSeconds * 1000);
        }
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delayMs));

      return client(config); // Retry the request
    },
  );

  return client;
}

/**
 * Default application API client (baseURL = '/api')
 */
const api = createHttpClient({ baseURL: '/api' });

export default api;