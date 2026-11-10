export function validateEnvironment(env: Record<string, unknown>): Record<string, unknown> {
  for (const key of ['DB_HOST', 'DB_USERNAME', 'DB_PASSWORD', 'DB_NAME', 'JWT_ACCESS_SECRET', 'CORS_ORIGINS']) {
    if (typeof env[key] !== 'string' || !env[key].trim()) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }
  if ((env.JWT_ACCESS_SECRET as string).length < 32) {
    throw new Error('JWT_ACCESS_SECRET must have at least 32 characters');
  }
  for (const [key, fallback, max] of [
    ['PORT', 3000, 65535],
    ['DB_PORT', 5432, 65535],
    ['SESSION_TTL_SECONDS', 86400, 2592000],
  ] as const) {
    const value = Number(env[key] ?? fallback);
    if (!Number.isInteger(value) || value < 1 || value > max) {
      throw new Error(`${key} must be an integer between 1 and ${max}`);
    }
    env[key] = value;
  }
  const origins = (env.CORS_ORIGINS as string).split(',').map((origin) => origin.trim());
  if (origins.some((origin) => {
    try {
      const url = new URL(origin);
      return url.origin !== origin || !['http:', 'https:'].includes(url.protocol) ||
        (env.NODE_ENV === 'production' && url.protocol !== 'https:');
    } catch {
      return true;
    }
  })) throw new Error('CORS_ORIGINS must contain valid origins (HTTPS in production)');
  if (env.DEEPSEEK_THINKING !== undefined && !['enabled', 'disabled'].includes(String(env.DEEPSEEK_THINKING))) {
    throw new Error('DEEPSEEK_THINKING must be enabled or disabled');
  }
  if (env.NODE_ENV && !['development', 'test', 'production'].includes(String(env.NODE_ENV))) {
    throw new Error('Invalid NODE_ENV');
  }
  return env;
}
