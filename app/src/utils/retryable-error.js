const RETRYABLE_HTTP_STATUSES = new Set([ 429, 502, 503, 504 ]);

const RETRYABLE_ERROR_CODES = new Set([
  'ECONNABORTED',
  'ETIMEDOUT',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
]);

const RETRYABLE_MESSAGES = new Set([
  'Connect timeout',
  'Read timeout',
]);

/**
 * Returns true when the error is likely transient and worth retrying
 * @param {Error} error
 * @returns {Boolean}
 */
module.exports.isRetryableError = error => {

  if (!error || typeof error !== 'object')
    return false;

  if (error.isNetworkError)
    return true;

  if (RETRYABLE_MESSAGES.has(error.message))
    return true;

  if (error.code && RETRYABLE_ERROR_CODES.has(error.code))
    return true;

  const axiosCode = error.error?.code;

  if (axiosCode && RETRYABLE_ERROR_CODES.has(axiosCode))
    return true;

  if (error.isApiError && RETRYABLE_HTTP_STATUSES.has(error.statusCode))
    return true;

  const responseStatus = error.error?.response?.status;

  if (responseStatus && RETRYABLE_HTTP_STATUSES.has(responseStatus))
    return true;

  return false;

};

/**
 * Exponential backoff delay for a retry attempt (1-based)
 * @param {Number} attempt
 * @returns {Number}
 */
module.exports.getRetryDelayMs = attempt => {

  const baseDelay = 3_000;
  const delay = baseDelay * (2 ** (attempt - 1));
  return Math.min(delay, 60_000);

};

/**
 * @param {Error} error
 * @returns {String}
 */
module.exports.getErrorMessage = error => {

  if (!error)
    return 'Unknown error';

  if (typeof error.message === 'string' && error.message.length > 0)
    return error.message;

  return String(error);

};
