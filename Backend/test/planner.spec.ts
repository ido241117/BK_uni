import { ExecutionContext, INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { join } from 'path';
import { DataType, newDb } from 'pg-mem';
import request from 'supertest';
import { ObjectLiteral, Repository } from 'typeorm';
import { setupApp } from '../src/app.setup';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { Course } from '../src/course/entities/course.entity';
import { CourseOpenedSemester } from '../src/course/entities/course-opened-semester.entity';
import { CourseCategory } from '../src/curriculum/entities/course-category.entity';
import { CourseCategoryMember } from '../src/curriculum/entities/course-category-member.entity';
import { CourseGroupMember } from '../src/curriculum/entities/course-group-member.entity';
import { CourseGroup } from '../src/curriculum/entities/course-group.entity';
import { CourseRelation } from '../src/curriculum/entities/course-relation.entity';
import { CurriculumCourse } from '../src/curriculum/entities/curriculum-course.entity';
import { CurriculumRegulation } from '../src/curriculum/entities/curriculum-regulation.entity';
import { CurriculumSpecialization } from '../src/curriculum/entities/curriculum-specialization.entity';
import { Curriculum } from '../src/curriculum/entities/curriculum.entity';
import { CourseGroupKind } from '../src/curriculum/enum/course-group-kind';
import { CourseRelationType } from '../src/curriculum/enum/course-relation-type';
import { buildPlannerInput, semestersFor } from '../src/planner/planner-input';
import { PlannerController } from '../src/planner/planner.controller';
import { PlannerRunner } from '../src/planner/planner.runner';
import { PlannerService } from '../src/planner/planner.service';
import { StudentCourse } from '../src/student/entities/student-course.entity';
import { StudentProfile } from '../src/student/entities/student-profile.entity';
import { StudentCourseStatus } from '../src/student/enum/student-course-status';
import { User } from '../src/user/entities/user.entity';
import { ROLE } from '../src/user/enum/role';

const origin = 'http://localhost:5173';
const studentId = randomUUID();
const entities = [
  User, Course, CourseOpenedSemester, Curriculum, CurriculumCourse, CourseGroup, CourseGroupMember, CourseRelation,
  CourseCategory, CourseCategoryMember, CurriculumRegulation, CurriculumSpecialization, StudentProfile, StudentCourse,
];
const PIPELINE = join(__dirname, '..', '..', 'pipeline');
const hasPython = existsSync(join(PIPELINE, '.venv', 'Scripts', 'python.exe')) || existsSync(join(PIPELINE, '.venv', 'bin', 'python'));

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
  controllers: [PlannerController],
  providers: [PlannerService, PlannerRunner],
})
class PlannerTestModule {}

describe('Planner API (POST /api/plans/solve)', () => {
  let app: INestApplication;
  let runner: PlannerRunner;
  let service: PlannerService;
  let curriculumId: string;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [PlannerTestModule] })
      .overrideGuard(JwtAuthGuard).useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = { id: studentId, email: 's@example.edu', role: ROLE.STUDENT,
            sessionId: randomUUID() };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    setupApp(app, [origin]);
    await app.init();
    runner = module.get(PlannerRunner);
    service = module.get(PlannerService);

    const repo = <T extends ObjectLiteral>(entity: new () => T) => module.get<Repository<T>>(getRepositoryToken(entity));
    await repo(User).save({ id: studentId, email: 's@example.edu', password: 'hash', role: ROLE.STUDENT });
    // Chuong trinh bia, giong pipeline/planner/fixtures/toy.json.
    const specs: [string, number, number | null][] = [
      ['MA101', 3, 1], ['CS101', 3, 1], ['MA102', 3, 1], ['CS102', 3, 1], ['CS201', 4, 2], ['CS202', 3, 2],
      ['MA201', 3, 2], ['CS301', 3, 2], ['CS302', 3, 2], ['CS401', 2, 3],
      ['EL301', 3, null], ['EL302', 3, null], ['EL303', 3, null], ['EL304', 3, null],
    ];
    const course: Record<string, Course> = {};
    for (const [code, credits] of specs) {
      course[code] = await repo(Course).save({ code, name: `Mon ${code}`, credits });
    }
    const curriculum = await repo(Curriculum).save({
      code: 'TOY-2025', name: 'Chuong trinh do choi', major: 'X', faculty: 'X', cohort: 2025, duration_years: 3,
      min_semester_credits: 3, max_semester_credits: 12,
    });
    curriculumId = curriculum.id;
    for (const [code, , year] of specs) {
      await repo(CurriculumCourse).save({ curriculum_id: curriculum.id, course_id: course[code].id,
        recommended_year: year, recommended_term: year ? 1 : null });
    }
    const group = await repo(CourseGroup).save({ curriculum_id: curriculum.id, name: 'Tu chon',
      kind: CourseGroupKind.ELECTIVE, required_credits: 6 });
    for (const code of ['EL301', 'EL302', 'EL303', 'EL304']) {
      await repo(CourseGroupMember).save({ curriculum_id: curriculum.id, group_id: group.id, course_id: course[code].id });
    }
    const rels: [string, string, CourseRelationType][] = [
      ['CS102', 'CS101', CourseRelationType.PREREQUISITE], ['MA201', 'MA102', CourseRelationType.PREREQUISITE],
      ['CS201', 'CS102', CourseRelationType.PREREQUISITE], ['CS301', 'CS201', CourseRelationType.PREREQUISITE],
      ['CS301', 'CS202', CourseRelationType.COREQUISITE], ['CS302', 'CS201', CourseRelationType.PREREQUISITE],
      ['CS401', 'CS301', CourseRelationType.PREREQUISITE], ['CS401', 'CS302', CourseRelationType.PREREQUISITE],
      ['EL301', 'MA201', CourseRelationType.PREREQUISITE], ['EL302', 'CS302', CourseRelationType.PREREQUISITE],
      ['EL303', 'CS301', CourseRelationType.COREQUISITE], ['EL304', 'MA102', CourseRelationType.RECOMMENDED],
    ];
    for (const [c, r, type] of rels) {
      await repo(CourseRelation).save({ curriculum_id: curriculum.id, course_id: course[c].id,
        related_course_id: course[r].id, type });
    }
    const statuses: [string, StudentCourseStatus][] = [
      ['MA101', StudentCourseStatus.COMPLETED], ['CS101', StudentCourseStatus.COMPLETED],
      ['CS102', StudentCourseStatus.COMPLETED], ['MA102', StudentCourseStatus.FAILED],
      ['CS201', StudentCourseStatus.IN_PROGRESS], ['CS202', StudentCourseStatus.IN_PROGRESS],
    ];
    for (const [code, status] of statuses) {
      await repo(StudentCourse).save({ user_id: studentId, course_id: course[code].id, status });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('refuses when the student has not chosen a curriculum', async () => {
    const res = await request(server()).post('/api/plans/solve').set('Origin', origin).send({}).expect(400);
    expect(JSON.stringify(res.body)).toContain('chưa chọn chương trình');
  });

  it('builds solver input from the database without personal data', async () => {
    await app.get<Repository<StudentProfile>>(getRepositoryToken(StudentProfile)).save({
      user_id: studentId, full_name: 'Ten That', student_number: '2399999', admission_year: 2025,
      curriculum_id: curriculumId,
    });
    const spy = jest.spyOn(runner, 'run').mockResolvedValue({ status: 'OPTIMAL' });
    await request(server()).post('/api/plans/solve').set('Origin', origin)
      .send({ max_credits: 9, in_progress_results: { CS201: 'fail' }, summer_opt_in: ['263'] }).expect(200);
    const [input, solver] = spy.mock.calls[0] as [Record<string, any>, string];
    spy.mockRestore();
    expect(solver).toBe('cpsat');
    expect(input.course_groups[0].members).toEqual(
      ['CS101', 'CS102', 'CS201', 'CS202', 'CS301', 'CS302', 'CS401', 'MA101', 'MA102', 'MA201']);
    expect(input.course_relations).toContainEqual(
      { course_code: 'CS301', related_course_code: 'CS202', type: 'corequisite', source: 'curriculum' });
    expect(input.scenario).toMatchObject({ max_credits: 9, summer_opt_in: ['263'],
      in_progress_results: { CS201: 'fail', CS202: 'pass' } });
    expect(input.curriculum.cohort).toBe(2025);
    const text = JSON.stringify(input);
    expect(text).not.toContain('Ten That');
    expect(text).not.toContain('2399999');
  });

  it('rejects unknown request fields', async () => {
    await request(server()).post('/api/plans/solve').set('Origin', origin).send({ hack: 1 }).expect(400);
  });

  (hasPython ? it : it.skip)('runs the real Python solver with real rules (11-25 TC, course level)', async () => {
    const today = new Date('2026-11-19T00:00:00Z'); // ky 261
    const profiles = app.get<Repository<StudentProfile>>(getRepositoryToken(StudentProfile));
    // Khoa 2025: ky 262 la nam 2, chi hoc duoc MA102 (3 TC). 11 TC la mem (19/11): co lo trinh,
    // khong hoc thua, kem ghi chu ky 262 duoi 11 TC.
    await profiles.update({ user_id: studentId }, { admission_year: 2025 });
    const short = await runner.run(buildPlannerInput(await service.loadSource(studentId), {}, today), 'cpsat');
    expect(short).toMatchObject({ status: 'OPTIMAL', graduation_semester: '272', violations: [] });
    expect((short.warnings as string[]).some((w) => w.startsWith('Kỳ 262 chỉ 3 TC'))).toBe(true);
    // Khoa 2024: ky 262 la nam 3. 262 phai du 11 TC: CS301, CS302, MA102, EL303 (12); 271 con 8 TC.
    await profiles.update({ user_id: studentId }, { admission_year: 2024 });
    const input = buildPlannerInput(await service.loadSource(studentId), {}, today);
    const cpsat = await runner.run(input, 'cpsat');
    const clingo = await runner.run(input, 'clingo');
    expect(cpsat).toMatchObject({ status: 'OPTIMAL', graduation_semester: '271', violations: [] });
    expect(clingo).toMatchObject({ status: 'OPTIMAL', graduation_semester: '271', violations: [] });
    expect((cpsat.warnings as string[]).some((w) => w.startsWith('Kỳ cuối 271 chỉ 8 TC'))).toBe(true);
  }, 120000);

  it('generates enough semesters around the current one', () => {
    const sems = semestersFor(2023, '261');
    expect(sems.slice(0, 3)).toEqual(['231', '232', '233']);
    expect(sems.filter((s) => !s.endsWith('3')).length).toBeGreaterThanOrEqual(12);
    expect(sems.indexOf('261')).toBeGreaterThan(0);
  });
});
