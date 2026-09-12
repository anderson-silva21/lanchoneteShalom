const counters = new Map();

function positiveIntEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function getClientIp(req) {
  return req?.ip || req?.socket?.remoteAddress || 'unknown';
}

function cleanupExpired(now) {
  counters.forEach((value, key) => {
    if (value.resetAt <= now) counters.delete(key);
  });
}

function createRateLimiter({
  keyPrefix,
  windowMs,
  maxRequests,
  message = 'Muitas requisicoes. Tente novamente em instantes.'
}) {
  if (!keyPrefix) throw new Error('Rate limiter sem prefixo.');

  return (req, res, next) => {
    const now = Date.now();
    cleanupExpired(now);

    const key = `${keyPrefix}:${getClientIp(req)}`;
    const current = counters.get(key);
    const counter = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + windowMs }
      : current;

    counter.count += 1;
    counters.set(key, counter);

    const retryAfterSeconds = Math.max(1, Math.ceil((counter.resetAt - now) / 1000));
    res.set('X-RateLimit-Limit', String(maxRequests));
    res.set('X-RateLimit-Remaining', String(Math.max(maxRequests - counter.count, 0)));
    res.set('X-RateLimit-Reset', String(Math.ceil(counter.resetAt / 1000)));

    if (counter.count > maxRequests) {
      res.set('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        message,
        retry_after_seconds: retryAfterSeconds
      });
    }

    return next();
  };
}

function createEnvRateLimiter({
  keyPrefix,
  windowMinutesEnv,
  maxRequestsEnv,
  defaultWindowMinutes,
  defaultMaxRequests,
  message
}) {
  return createRateLimiter({
    keyPrefix,
    windowMs: positiveIntEnv(windowMinutesEnv, defaultWindowMinutes) * 60 * 1000,
    maxRequests: positiveIntEnv(maxRequestsEnv, defaultMaxRequests),
    message
  });
}

function resetRateLimitMemory() {
  counters.clear();
}

module.exports = {
  createEnvRateLimiter,
  createRateLimiter,
  resetRateLimitMemory
};
