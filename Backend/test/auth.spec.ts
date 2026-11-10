import { Controller, Get, INestApplication, Module, UseGuards } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataType, newDb } from 'pg-mem';
import request from 'supertest';
import { DataSource, Repository } from 'typeorm';
import { setupApp } from '../src/app.setup';
import { AuthModule } from '../src/auth/auth.module';
import { AuthSession } from '../src/auth/entities/auth-session.entity';
import { Roles } from '../src/auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { User } from '../src/user/entities/user.entity';
import { ROLE } from '../src/user/enum/role';

const origin = 'http://localhost:5173';

@Controller('test')
class TestController {
  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE.ADMIN)
  admin() {
    return 'admin';
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      load: [() => ({
        JWT_ACCESS_SECRET: 'test-secret-with-at-least-32-characters',
        SESSION_TTL_SECONDS: 3600,
        NODE_ENV: 'test',
      })],
    }),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({ type: 'postgres', autoLoadEntities: true }),
      dataSourceFactory: async () => {
        const testUrl = process.env.BK_TEST_DATABASE_URL;
        if (testUrl) {
          if (new URL(testUrl).pathname !== '/bk_uni_test') {
            throw new Error('BK_TEST_DATABASE_URL must point to a dedicated bk_uni_test database');
          }
          const bootstrap = await new DataSource({
            type: 'postgres', url: testUrl, uuidExtension: 'pgcrypto', installExtensions: false,
          }).initialize();
          await bootstrap.query('CREATE SCHEMA IF NOT EXISTS "bk_uni_test"');
          await bootstrap.destroy();
          const dataSource = await new DataSource({
            type: 'postgres',
            url: testUrl,
            schema: 'bk_uni_test',
            entities: [User, AuthSession],
            synchronize: true,
            uuidExtension: 'pgcrypto',
            installExtensions: false,
          }).initialize();
          return dataSource;
        }
        const db = newDb();
        db.public.registerFunction({ name: 'current_database', returns: DataType.text, implementation: () => 'test' });
        db.public.registerFunction({ name: 'version', returns: DataType.text, implementation: () => 'PostgreSQL 17' });
        db.public.registerFunction({ name: 'gen_random_uuid', returns: DataType.uuid, implementation: randomUUID, impure: true });
        const dataSource = await db.adapters.createTypeormDataSource({
          type: 'postgres',
          entities: [User, AuthSession],
          synchronize: true,
          uuidExtension: 'pgcrypto',
          installExtensions: false,
        }).initialize();
        return dataSource;
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    AuthModule,
  ],
  controllers: [TestController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
class TestModule {}

describe('Account and access', () => {
  let app: INestApplication;
  let sessions: Repository<AuthSession>;
  let users: Repository<User>;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [TestModule] }).compile();
    app = module.createNestApplication();
    setupApp(app, [origin]);
    await app.init();
    sessions = module.get(getRepositoryToken(AuthSession));
    users = module.get(getRepositoryToken(User));
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers a student, logs in, authorizes, and revokes the session on logout', async () => {
    const credentials = { email: 'Student@example.com', password: 'secure-password' };
    const register = await request(app.getHttpServer()).post('/api/auth/register')
      .set('Origin', origin).send(credentials).expect(201);
    expect(register.body).toEqual({
      error: false,
      data: { id: expect.any(String), email: 'student@example.com', role: ROLE.STUDENT },
      message: 'Thành công',
    });
    const stored = await users.createQueryBuilder('user').addSelect('user.password').getOneOrFail();
    expect(stored.password).not.toBe(credentials.password);
    expect(stored.password).toMatch(/^\$2[ab]\$/);

    await request(app.getHttpServer()).post('/api/auth/register').set('Origin', origin)
      .send(credentials).expect(409);
    await request(app.getHttpServer()).post('/api/auth/login').set('Origin', origin)
      .send({ ...credentials, password: 'wrong-password' }).expect(401);
    const login = await request(app.getHttpServer()).post('/api/auth/login')
      .set('Origin', origin).send(credentials).expect(200);
    expect(login.body.data).toEqual(register.body.data);
    expect(JSON.stringify(login.body)).not.toMatch(/token|password/i);
    const cookies = login.headers['set-cookie'] as unknown as string[];
    expect(cookies[0]).toMatch(/HttpOnly/);
    expect(cookies[0]).toMatch(/SameSite=Lax/);
    const cookie = cookies[0].split(';')[0];

    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(200);
    await request(app.getHttpServer()).get('/api/test/admin').set('Cookie', cookie).expect(403);
    await request(app.getHttpServer()).post('/api/auth/logout').set('Origin', origin)
      .set('Cookie', cookie).expect(200);
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(401);
  });

  it('rejects invalid input, privilege escalation and untrusted origins', async () => {
    await request(app.getHttpServer()).post('/api/auth/register').set('Origin', origin)
      .send({ email: 'new@example.com', password: 'secure-password', role: 'ADMIN' }).expect(400);
    await request(app.getHttpServer()).post('/api/auth/register').set('Origin', origin)
      .send({ email: 'bad', password: 'short' }).expect(400);
    await request(app.getHttpServer()).post('/api/auth/register').set('Origin', origin)
      .send({ email: 'new@example.com', password: 'á'.repeat(40) }).expect(400);
    await request(app.getHttpServer()).post('/api/auth/login')
      .send({ email: 'student@example.com', password: 'secure-password' }).expect(403);
    await request(app.getHttpServer()).post('/api/auth/login').set('Origin', 'https://evil.example')
      .send({ email: 'student@example.com', password: 'secure-password' }).expect(403);
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
  });

  it('rejects expired sessions and uses the current database role', async () => {
    const login = await request(app.getHttpServer()).post('/api/auth/login').set('Origin', origin)
      .send({ email: 'student@example.com', password: 'secure-password' }).expect(200);
    const cookie = (login.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    await users.update({ email: 'student@example.com' }, { role: ROLE.ADMIN });
    await request(app.getHttpServer()).get('/api/test/admin').set('Cookie', cookie).expect(200);
    await sessions.createQueryBuilder().update().set({ expires_at: new Date('2020-01-01') }).execute();
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(401);
  });

  it('limits repeated login attempts', async () => {
    let response: request.Response | undefined;
    for (let attempt = 0; attempt < 11; attempt++) {
      response = await request(app.getHttpServer()).post('/api/auth/login').set('Origin', origin)
        .send({ email: 'student@example.com', password: 'wrong-password' });
      if (response.status === 429) break;
    }
    expect(response?.status).toBe(429);
    expect(response?.body).toMatchObject({ error: true, data: null });
  });
});
