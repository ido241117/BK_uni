import { getDatabaseOptions } from '../src/database/database-options';

const config = {
  DB_HOST: 'localhost',
  DB_PORT: '5432',
  DB_USERNAME: 'postgres',
  DB_PASSWORD: 'password',
  DB_NAME: 'bk_uni',
};

describe('Database options', () => {
  it('uses the public schema for a local database', () => {
    expect(getDatabaseOptions(config)).toMatchObject({ schema: 'public', ssl: false, port: 5432 });
  });

  it('requires TLS for the remote demo database', () => {
    expect(getDatabaseOptions({
      ...config, DB_HOST: 'pooler.example.com', DB_SCHEMA: 'bk_uni', DB_SSL_MODE: 'require',
    })).toMatchObject({ schema: 'bk_uni', ssl: { rejectUnauthorized: false } });
  });

  it('rejects remote connections without TLS and invalid configuration', () => {
    expect(() => getDatabaseOptions({ ...config, DB_HOST: 'pooler.example.com' })).toThrow();
    expect(() => getDatabaseOptions({ ...config, DB_SSL_MODE: 'disable' })).toThrow();
    expect(() => getDatabaseOptions({ ...config, DB_SCHEMA: 'public;DROP TABLE users' })).toThrow();
    expect(() => getDatabaseOptions({ ...config, DB_PORT: 'invalid' })).toThrow();
  });
});
