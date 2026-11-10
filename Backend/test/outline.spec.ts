import { ExecutionContext, INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataType, newDb } from 'pg-mem';
import request from 'supertest';
import { Repository } from 'typeorm';
import { setupApp } from '../src/app.setup';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { Course } from '../src/course/entities/course.entity';
import { CourseRelation } from '../src/curriculum/entities/course-relation.entity';
import { CurriculumCourse } from '../src/curriculum/entities/curriculum-course.entity';
import { Curriculum } from '../src/curriculum/entities/curriculum.entity';
import { CourseRelationType } from '../src/curriculum/enum/course-relation-type';
import { CourseOutlineImport } from '../src/outline/entities/course-outline-import.entity';
import { CourseOutlinePrerequisite } from '../src/outline/entities/course-outline-prerequisite.entity';
import { CourseOutline } from '../src/outline/entities/course-outline.entity';
import { OutlineImportService } from '../src/outline/outline-import.service';
import { OutlineController } from '../src/outline/outline.controller';
import { OutlineService } from '../src/outline/outline.service';
import { User } from '../src/user/entities/user.entity';
import { ROLE } from '../src/user/enum/role';

const origin = 'http://localhost:5173';
const adminId = randomUUID();
let currentRole: ROLE = ROLE.ADMIN;
const entities = [
  User, Course, Curriculum, CurriculumCourse, CourseRelation, CourseOutline, CourseOutlinePrerequisite, CourseOutlineImport,
];

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
          type: 'postgres', entities, synchronize: true, uuidExtension: 'pgcrypto', installExtensions: false,
        }).initialize();
      },
    }),
    TypeOrmModule.forFeature(entities),
  ],
  controllers: [OutlineController],
  providers: [OutlineService, OutlineImportService],
})
class OutlineTestModule {}

const outline = (code: string, version: string, appliesFrom: string | null, extra: Record<string, unknown> = {}) => ({
  source_id: `${code}-${version}`,
  source_code: `DCMH.${code}.${version}`,
  course_code: code,
  version,
  applies_from: appliesFrom,
  updated_at: '2026-05-28T11:06:00+07:00',
  name: { vi: `Môn ${code}`, en: null },
  credits: 3,
  level: { code: 'DH', name: { vi: 'Đại học', en: 'Undergraduate' } },
  course_type: { code: 'CSN', name: null },
  faculty: { code: 'MT', name: null },
  prerequisites: [],
  learning_outcomes: [{ key: 'LO:L.O.1', code: 'L.O.1', level: 1, parent_code: null, framework: 'LO', name: { vi: 'Hiểu', en: null } }],
  sessions: [{ order: 1, label: '1', content: { vi: 'Giới thiệu', en: null }, items: [] }],
  ...extra,
});

const documentOf = (outlines: unknown[]) => ({
  format: 'bkuni.course-outlines',
  format_version: 1,
  generated_at: '2026-11-11T05:40:00.000Z',
  source: 'test',
  part: 1,
  parts: 1,
  count: outlines.length,
  includes_lecturers: false,
  outlines,
});

describe('Course outlines API', () => {
  let app: INestApplication;
  let curriculum: Curriculum;
  let courses: Repository<Course>;
  let relations: Repository<CourseRelation>;
  const server = () => app.getHttpServer();
  const post = (body: unknown) => request(server()).post('/api/course-outlines/import').set('Origin', origin).send(body as object);

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [OutlineTestModule] })
      .overrideGuard(JwtAuthGuard).useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = { id: adminId, email: 'admin@bkuni.local', role: currentRole, sessionId: randomUUID() };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    setupApp(app, [origin]);
    await app.init();

    const repo = <T extends object>(entity: new () => T) => module.get<Repository<T>>(getRepositoryToken(entity));
    await repo(User).save({ id: adminId, email: 'admin@bkuni.local', password: 'hash', role: ROLE.ADMIN });
    courses = repo(Course);
    relations = repo(CourseRelation);
    const [dsa, ai] = await courses.save([
      { code: 'CO2003', name: 'Cấu trúc dữ liệu (tên trong hệ thống)', credits: 4 },
      { code: 'CO3135', name: 'Lập trình cho AI', credits: 3 },
    ]);
    curriculum = await repo(Curriculum).save({
      code: 'CS-2023', name: 'KHMT', major: 'CNTT', faculty: 'CNTT', cohort: 2023, duration_years: 4,
      min_semester_credits: 11, max_semester_credits: 24,
    });
    await repo(CurriculumCourse).save([
      { curriculum_id: curriculum.id, course_id: dsa.id, recommended_year: 2, recommended_term: 1 },
      { curriculum_id: curriculum.id, course_id: ai.id, recommended_year: null, recommended_term: null },
    ]);
    await relations.save({ curriculum_id: curriculum.id, course_id: ai.id, related_course_id: dsa.id, type: CourseRelationType.PREREQUISITE });
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects non-admins and documents in an unknown format', async () => {
    currentRole = ROLE.STUDENT;
    await post(documentOf([])).expect(403);
    currentRole = ROLE.ADMIN;
    const wrong = await post({ ...documentOf([]), format_version: 2 }).expect(400);
    expect(wrong.body.message).toContain('format_version');
  });

  it('creates outlines, skips invalid ones and leaves system data untouched', async () => {
    const response = await post(documentOf([
      outline('CO2003', '13.1', '261'),
      outline('CO2003', '14.1', '261', { course_code: 'co2003' }),
      outline('CO2003', '15.1', '263'),
      outline('CO3135', '4.1', '261', {
        prerequisites: [
          { type: 'recommended', type_raw: 'KN', course_code: 'CO2003', course_name: null },
          { type: 'prior', type_raw: 'HT', course_code: 'CO1027', course_name: null },
        ],
      }),
      outline('BAD CODE', '1.1', '261'),
      outline('CO1027', '9.1', 'HK262'),
      outline('CO2003', '13.1', '261'),
    ])).expect(201);

    expect(response.body.data).toMatchObject({ received: 7, created: 4, updated: 0, unchanged: 0, skipped: 3 });
    expect(response.body.data.issues.map((issue: { index: number }) => issue.index)).toEqual([4, 5, 6]);

    // Dữ liệu hệ thống giữ nguyên.
    expect(await courses.count()).toBe(2);
    expect((await courses.findOneByOrFail({ code: 'CO2003' })).name).toBe('Cấu trúc dữ liệu (tên trong hệ thống)');
    expect(await relations.count()).toBe(1);
  });

  it('is idempotent and updates only changed outlines, replacing their prerequisites', async () => {
    const again = await post(documentOf([outline('CO2003', '13.1', '261'), outline('CO2003', '14.1', '261')])).expect(201);
    expect(again.body.data).toMatchObject({ created: 0, updated: 0, unchanged: 2 });

    const changed = await post(documentOf([
      outline('CO3135', '4.1', '261', { prerequisites: [{ type: 'recommended', type_raw: 'KN', course_code: 'CO2003' }] }),
    ])).expect(201);
    expect(changed.body.data).toMatchObject({ created: 0, updated: 1, unchanged: 0 });

    const detail = await request(server()).get('/api/course-outlines/by-code/CO3135?semester=262').expect(200);
    expect(detail.body.data.selected.prerequisites.map((item: { related_course_code: string }) => item.related_course_code)).toEqual(['CO2003']);
  });

  it('picks the outline that applies to a semester and lists every version', async () => {
    const response = await request(server()).get('/api/course-outlines/by-code/co2003?semester=262').expect(200);
    expect(response.body.data.selected).toMatchObject({ version: '14.1', applies_from: '261', name_vi: 'Môn CO2003' });
    expect(response.body.data.selected.content.sessions).toHaveLength(1);
    expect(response.body.data.versions.map((item: { version: string }) => item.version)).toEqual(['13.1', '14.1', '15.1']);
    expect(response.body.data.versions[0].content).toBeUndefined();

    const older = response.body.data.versions.find((item: { version: string }) => item.version === '13.1');
    const byId = await request(server()).get(`/api/course-outlines/${older.id}`).expect(200);
    expect(byId.body.data).toMatchObject({ version: '13.1', prerequisites: [] });
    expect(byId.body.data.content.course_code).toBe('CO2003');
    await request(server()).get(`/api/course-outlines/${randomUUID()}`).expect(404);

    const future = await request(server()).get('/api/course-outlines/by-code/CO2003?semester=263').expect(200);
    expect(future.body.data.selected.version).toBe('15.1');
    await request(server()).get('/api/course-outlines/by-code/XX9999').expect(404);
  });

  it('reports prerequisite discrepancies without changing either source', async () => {
    const response = await request(server())
      .get(`/api/course-outlines/discrepancies?curriculum_id=${curriculum.id}&semester=262`).expect(200);
    expect(response.body.data.summary).toEqual({ courses: 2, with_outline: 2, matching: 1, different: 1 });
    expect(response.body.data.items).toEqual([expect.objectContaining({
      course_code: 'CO3135',
      outline: expect.objectContaining({ version: '4.1' }),
      only_in_outline: [],
      only_in_curriculum: [],
      type_mismatch: [{ related_course_code: 'CO2003', outline_type: 'recommended', curriculum_type: 'prerequisite' }],
    })]);
    expect(await relations.count()).toBe(1);

    const summaries = await request(server())
      .get(`/api/course-outlines/summaries?curriculum_id=${curriculum.id}&semester=262`).expect(200);
    expect(summaries.body.data.items.map((item: { course_code: string; version: string }) => `${item.course_code}@${item.version}`).sort())
      .toEqual(['CO2003@14.1', 'CO3135@4.1']);
    expect(summaries.body.data.items.find((item: { course_code: string }) => item.course_code === 'CO3135').prerequisites)
      .toEqual([{ type: 'recommended', related_course_code: 'CO2003' }]);

    const imports = await request(server()).get('/api/course-outlines/imports').expect(200);
    // File sai định dạng bị từ chối trước khi ghi nhật ký, nên chỉ có 3 lần nhập.
    expect(imports.body.data).toHaveLength(3);
    expect(imports.body.data[0]).toMatchObject({ channel: 'api', created_by: adminId });
  });
});
