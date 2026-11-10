import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';

export function getDatabaseOptions(env: Record<string, unknown>): PostgresConnectionOptions {
  for (const key of ['DB_HOST', 'DB_USERNAME', 'DB_PASSWORD', 'DB_NAME']) {
    if (typeof env[key] !== 'string' || !env[key].trim()) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }
  const port = Number(env.DB_PORT ?? 5432);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('DB_PORT must be an integer between 1 and 65535');
  }
  const schema = env.DB_SCHEMA ?? 'public';
  if (typeof schema !== 'string' || !/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) {
    throw new Error('DB_SCHEMA must be a lowercase PostgreSQL identifier');
  }
  const sslMode = env.DB_SSL_MODE ?? 'local';
  if (sslMode !== 'local' && sslMode !== 'require') {
    throw new Error('DB_SSL_MODE must be local or require');
  }
  if (sslMode === 'local' && !['localhost', '127.0.0.1', '::1'].includes(String(env.DB_HOST))) {
    throw new Error('DB_SSL_MODE=local is only allowed for a local database');
  }
  return {
    type: 'postgres',
    host: env.DB_HOST as string,
    port,
    username: env.DB_USERNAME as string,
    password: env.DB_PASSWORD as string,
    database: env.DB_NAME as string,
    schema,
    ssl: sslMode === 'require' ? { rejectUnauthorized: false } : false,
    synchronize: false,
    uuidExtension: 'pgcrypto',
    installExtensions: false,
  };
}
