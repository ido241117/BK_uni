import { INestApplication, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataType, newDb } from 'pg-mem';
import request from 'supertest';
import { setupApp } from '../src/app.setup';
import { AuthModule } from '../src/auth/auth.module';
import { CourseModule } from '../src/course/course.module';
import { CurriculumModule } from '../src/curriculum/curriculum.module';
import { entities } from '../src/database/entities';
import { StudentModule } from '../src/student/student.module';

const origin = 'http://localhost:5173';

/** Dựng lại đúng các module nghiệp vụ của AppModule nhưng dùng PostgreSQL trong bộ nhớ. */
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
        const db = newDb();
        db.public.registerFunction({ name: 'current_database', returns: DataType.text, implementation: () => 'test' });
        db.public.registerFunction({ name: 'version', returns: DataType.text, implementation: () => 'PostgreSQL 17' });
        db.public.registerFunction({ name: 'gen_random_uuid', returns: DataType.uuid, implementation: randomUUID, impure: true });
        return db.adapters.createTypeormDataSource({
          type: 'postgres', entities, synchronize: true, uuidExtension: 'pgcrypto', installExtensions: false,
        }).initialize();
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    AuthModule,
    CourseModule,
    CurriculumModule,
    StudentModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
class AppWiringModule {}

describe('App wiring', () => {
  let app: INestApplication;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppWiringModule] }).compile();
    app = module.createNestApplication();
    setupApp(app, [origin]);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves public catalog endpoints without a session', async () => {
    const courses = await request(server()).get('/api/courses').expect(200);
    expect(courses.body).toMatchObject({ error: false, data: [] });
    await request(server()).get('/api/curricula').expect(200);
  });

  it('requires a session for /me endpoints and admin writes', async () => {
    await request(server()).get('/api/student-profiles/me').expect(401);
    await request(server()).get('/api/student-courses/me').expect(401);
    await request(server()).post('/api/courses').set('Origin', origin)
      .send({ code: 'X', name: 'X', credits: 1 }).expect(401);
    await request(server()).post('/api/curricula').set('Origin', origin)
      .send({ code: 'X', name: 'X', major: 'X', faculty: 'X', cohort: 2023, duration_years: 4, min_semester_credits: 1, max_semester_credits: 18 })
      .expect(401);
  });

  it('protects admin routes from students', async () => {
    const credentials = { email: 'wiring@example.com', password: 'secure-password' };
    await request(server()).post('/api/auth/register').set('Origin', origin).send(credentials).expect(201);
    const login = await request(server()).post('/api/auth/login').set('Origin', origin).send(credentials).expect(200);
    const cookie = (login.headers['set-cookie'] as unknown as string[])[0].split(';')[0];

    await request(server()).get('/api/auth/me').set('Cookie', cookie).expect(200);
    await request(server()).get('/api/student-profiles/me').set('Cookie', cookie).expect(200);
    await request(server()).post('/api/courses').set('Origin', origin).set('Cookie', cookie)
      .send({ code: 'DENIED', name: 'Không có quyền', credits: 1 }).expect(403);
  });
});
