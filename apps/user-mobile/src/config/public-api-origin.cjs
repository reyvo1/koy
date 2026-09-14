// @ts-check

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

const DEFAULT_DEVELOPMENT_API_ORIGIN = 'http://127.0.0.1:3000';

/**
 * @param {string | undefined} value
 * @returns {string}
 */
function validatePublicApiOrigin(value) {
  const candidate = value?.trim() || DEFAULT_DEVELOPMENT_API_ORIGIN;

  /** @type {URL} */
  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error('EXPO_PUBLIC_API_BASE_URL must be a valid absolute URL.');
  }

  if (url.username || url.password) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL must not contain credentials.');
  }

  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error(
      'EXPO_PUBLIC_API_BASE_URL must contain only an origin without a path, query, or fragment.',
    );
  }

  const isSecure = url.protocol === 'https:';
  const isLoopbackDevelopment =
    url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname);

  if (!isSecure && !isLoopbackDevelopment) {
    throw new Error(
      'EXPO_PUBLIC_API_BASE_URL must use HTTPS unless it targets an explicit loopback development host.',
    );
  }

  return url.origin;
}

module.exports = {
  DEFAULT_DEVELOPMENT_API_ORIGIN,
  validatePublicApiOrigin,
};
