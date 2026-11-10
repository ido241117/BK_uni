import { INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataType, newDb } from 'pg-mem';
import request from 'supertest';
import { DataSource, Repository } from 'typeorm';
import { setupApp } from '../src/app.setup';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { CourseController } from '../src/course/course.controller';
import { CourseService } from '../src/course/course.service';
import { CourseOpenedSemester } from '../src/course/entities/course-opened-semester.entity';
import { Course } from '../src/course/entities/course.entity';

const origin = 'http://localhost:5173';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => ({ type: 'postgres', autoLoadEntities: true }),
      dataSourceFactory: async () => {
        const db = newDb();
        db.public.registerFunction({ name: 'current_database', returns: DataType.text, implementation: () => 'test' });
        db.public.registerFunction({ name: 'version', returns: DataType.text, implementation: () => 'PostgreSQL 17' });
        db.public.registerFunction({ name: 'gen_random_uuid', returns: DataType.uuid, implementation: randomUUID, impure: true });
        return db.adapters.createTypeormDataSource({
          type: 'postgres',
          entities: [Course, CourseOpenedSemester],
          synchronize: true,
          uuidExtension: 'pgcrypto',
          installExtensions: false,
        }).initialize();
      },
    }),
    TypeOrmModule.forFeature([Course, CourseOpenedSemester]),
  ],
  controllers: [CourseController],
  providers: [CourseService],
})
class CourseTestModule {}

describe('Course API', () => {
  let app: INestApplication;
  let openedSemesters: Repository<CourseOpenedSemester>;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [CourseTestModule] })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    setupApp(app, [origin]);
    await app.init();
    openedSemesters = module.get(getRepositoryToken(CourseOpenedSemester));
    const dataSource = module.get(DataSource);
    await dataSource.query('CREATE UNIQUE INDEX "UQ_courses_code_lower" ON "courses" (lower("code"))');
  });

  afterAll(async () => {
    await app.close();
  });

  const createCourse = (body: Record<string, unknown> = {}) => request(server())
    .post('/api/courses')
    .set('Origin', origin)
    .send({ code: 'CO2003', name: 'Cấu trúc dữ liệu và giải thuật', credits: 4, ...body });

  it('creates a course and returns snake_case fields', async () => {
    const response = await createCourse().expect(201);
    expect(response.body).toMatchObject({
      error: false,
      message: 'Thành công',
      data: { code: 'CO2003', name: 'Cấu trúc dữ liệu và giải thuật', credits: 4 },
    });
    expect(response.body.data.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Object.keys(response.body.data)).toEqual(expect.arrayContaining(['created_at', 'updated_at', 'updated_by']));
    expect(response.body.data).not.toHaveProperty('createdAt');
  });

  it('accepts duplicated code only once, ignoring case', async () => {
    await createCourse({ code: 'co2003' }).expect(409);
    await createCourse({ code: 'MA1001', name: 'Giải tích 1', credits: 4 }).expect(201);
  });

  it('accepts input that used to break business checks', async () => {
    const zero = await createCourse({ code: 'ZERO1', name: 'Môn 0 tín chỉ', credits: 0 }).expect(201);
    expect(zero.body.data.credits).toBe(0);
  });

  it('rejects malformed bodies', async () => {
    await request(server()).post('/api/courses').set('Origin', origin)
      .send({ code: 'NO-CREDITS', name: 'Thiếu tín chỉ' }).expect(400);
    await request(server()).post('/api/courses').set('Origin', origin)
      .send({ code: 'X', name: 'Thừa trường', credits: 3, semester_code: '251' }).expect(400);
  });

  it('lists courses with search and pagination', async () => {
    const all = await request(server()).get('/api/courses').expect(200);
    expect(all.body.data).toHaveLength(3);
    expect(all.body.pagination).toMatchObject({ page: 1, take: 10, itemCount: 3, pageCount: 1, hasNextPage: false });

    const search = await request(server()).get('/api/courses').query('search=giải tích').expect(200);
    expect(search.body.data).toHaveLength(1);
    expect(search.body.data[0].code).toBe('MA1001');

    const page = await request(server()).get('/api/courses').query('page=2&take=2&order=DESC').expect(200);
    expect(page.body.data).toHaveLength(1);
    expect(page.body.pagination).toMatchObject({ page: 2, take: 2, pageCount: 2, hasPreviousPage: true });

    // Tra theo danh sách mã: không phân biệt hoa/thường, bỏ mã trùng, mã không tồn tại thì không trả.
    const byCodes = await request(server()).get('/api/courses').query('codes=ma1001, CO2003,co2003,NOPE&take=100').expect(200);
    expect(byCodes.body.data.map((course: { code: string }) => course.code)).toEqual(['CO2003', 'MA1001']);

    const tooMany = Array.from({ length: 101 }, (_, index) => `X${index}`).join(',');
    await request(server()).get('/api/courses').query({ codes: tooMany }).expect(400);
  });

  it('reads a course by id and by code', async () => {
    const created = await createCourse({ code: 'CO3001', name: 'Kỹ thuật phần mềm', credits: 3 }).expect(201);
    const id = created.body.data.id;
    await request(server()).get(`/api/courses/${id}`).expect(200);
    const byCode = await request(server()).get('/api/courses/by-code/co3001').expect(200);
    expect(byCode.body.data.id).toBe(id);
    await request(server()).get(`/api/courses/${randomUUID()}`).expect(404);
    await request(server()).get('/api/courses/not-a-uuid').expect(400);
  });

  it('updates a course', async () => {
    const created = await createCourse({ code: 'CO3005', name: 'Mạng máy tính', credits: 3 }).expect(201);
    const updated = await request(server())
      .patch(`/api/courses/${created.body.data.id}`)
      .set('Origin', origin)
      .send({ credits: 4 })
      .expect(200);
    expect(updated.body.data).toMatchObject({ code: 'CO3005', credits: 4 });
  });

  it('replaces and removes opened semesters', async () => {
    const created = await createCourse({ code: 'CO3061', name: 'Trí tuệ nhân tạo', credits: 3 }).expect(201);
    const id = created.body.data.id;

    const replaced = await request(server())
      .put(`/api/courses/${id}/opened-semesters`)
      .set('Origin', origin)
      .send({ semester_codes: ['252', '251'] })
      .expect(200);
    expect(replaced.body.data.map((row: { semester_code: string }) => row.semester_code)).toEqual(['251', '252']);

    await request(server())
      .put(`/api/courses/${id}/opened-semesters`)
      .set('Origin', origin)
      .send({ semester_codes: ['251', '251'] })
      .expect(400);

    await request(server()).delete(`/api/courses/${id}/opened-semesters/251`).set('Origin', origin).expect(200);
    const remaining = await request(server()).get(`/api/courses/${id}/opened-semesters`).expect(200);
    expect(remaining.body.data).toHaveLength(1);
    await request(server()).delete(`/api/courses/${id}/opened-semesters/251`).set('Origin', origin).expect(404);
  });

  it('deletes a course together with its children', async () => {
    const created = await createCourse({ code: 'CO3103', name: 'Kiểm thử phần mềm', credits: 3 }).expect(201);
    const id = created.body.data.id;
    await request(server())
      .put(`/api/courses/${id}/opened-semesters`)
      .set('Origin', origin)
      .send({ semester_codes: ['252'] })
      .expect(200);
    expect(await openedSemesters.count({ where: { course_id: id } })).toBe(1);

    await request(server()).delete(`/api/courses/${id}`).set('Origin', origin).expect(200);
    await request(server()).get(`/api/courses/${id}`).expect(404);
    expect(await openedSemesters.count({ where: { course_id: id } })).toBe(0);
  });

  it('stores the catalog fields and can clear them', async () => {
    const created = await createCourse({
      code: 'CO2005',
      name: 'Lập trình hướng đối tượng',
      credits: 3,
      description: '  Kiến thức nền tảng  ',
    }).expect(201);
    expect(created.body.data).toMatchObject({ description: 'Kiến thức nền tảng' });

    const cleared = await request(server())
      .patch(`/api/courses/${created.body.data.id}`)
      .set('Origin', origin)
      .send({ description: null })
      .expect(200);
    expect(cleared.body.data).toMatchObject({ description: null });
  });

  it('rejects the standard semester fields that belong to the curriculum', async () => {
    // Năm/kỳ khuyến nghị nằm ở môn trong chương trình (curriculum_courses), không còn trên danh mục môn.
    await createCourse({ code: 'NOSTD', name: 'Năm kỳ chuẩn', credits: 3, standard_year: 2, standard_term: 1 })
      .expect(400);
  });

  it('rejects the category field that moved to the curriculum', async () => {
    // `course_categories` là dữ liệu theo chương trình; gửi lên course bị từ chối.
    await createCourse({ code: 'MOVED', name: 'Nhóm đã chuyển', credits: 3, category: 'general' }).expect(400);
  });
});
