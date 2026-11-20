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
import { analyzeMybk, MybkParsed } from '../src/planner/mybk-check';
import { buildPlannerInput, semestersFor } from '../src/planner/planner-input';
import { PlannerController } from '../src/planner/planner.controller';
import { PlannerRunner } from '../src/planner/planner.runner';
import { PlannerService } from '../src/planner/planner.service';
import { StudentCourse } from '../src/student/entities/student-course.entity';
import { StudentProfile } from '../src/student/entities/student-profile.entity';
import { StudentProgressImport } from '../src/student/entities/student-progress-import.entity';
import { StudentCourseStatus } from '../src/student/enum/student-course-status';
import { User } from '../src/user/entities/user.entity';
import { ROLE } from '../src/user/enum/role';

const origin = 'http://localhost:5173';
const studentId = randomUUID();
const entities = [
  User, Course, CourseOpenedSemester, Curriculum, CurriculumCourse, CourseGroup, CourseGroupMember, CourseRelation,
  CourseCategory, CourseCategoryMember, CurriculumRegulation, CurriculumSpecialization, StudentProfile, StudentCourse,
  StudentProgressImport,
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

  it('adds offering history, myBK scores and graduation conditions for the ASP engine', async () => {
    const repo = <T extends ObjectLiteral>(entity: new () => T) => app.get<Repository<T>>(getRepositoryToken(entity));
    const ma201 = await repo(Course).findOneByOrFail({ code: 'MA201' });
    await repo(CourseOpenedSemester).save([{ course_id: ma201.id, semester_code: '252' },
      { course_id: ma201.id, semester_code: '242' }]);
    await repo(StudentProgressImport).save({
      user_id: studentId, format: 'pdf', official_program_code: null, source_updated_at: null,
      data: {
        student: { full_name: 'Ten That', student_number: '2399999', gpa_10: '7.10' },
        blocks: [{ name: 'A', courses: [
          { code: 'MA101', name: 'Giai tich', score: '8.5', letter: 'A', passed: true },
          { code: 'MA102', name: 'Dai so', score: '3.0', letter: 'F', passed: false },
          { code: 'CS301', name: 'Chua hoc', score: null, letter: null, passed: false },
        ] }],
        graduation_conditions: [{ code: 'ENG_GC_600', name: 'Tieng Anh', passed: true }],
      },
    });
    const spy = jest.spyOn(runner, 'run').mockResolvedValue({ status: 'OPTIMAL' });
    await request(server()).post('/api/plans/solve').set('Origin', origin)
      .send({ solver: 'clingo', skip_semesters: ['262'] }).expect(200);
    type AspInput = { opened_semesters: Record<string, string[]>; scenario: { skip_semesters?: string[] };
      student: { scores: unknown[]; graduation_conditions: unknown[] } };
    const [input] = spy.mock.calls[0] as unknown as [AspInput, string];
    spy.mockRestore();
    expect(input.opened_semesters.MA201).toEqual(['242', '252']);
    expect(input.student.scores).toEqual([
      { code: 'MA101', score: '8.5', letter: 'A' }, { code: 'MA102', score: '3.0', letter: 'F' }]);
    expect(input.student.graduation_conditions).toEqual([{ code: 'ENG_GC_600', passed: true }]);
    expect(input.scenario.skip_semesters).toEqual(['262']);
    const text = JSON.stringify(input);
    expect(text).not.toContain('Ten That');
    expect(text).not.toContain('2399999');
    expect(text).not.toContain('Giai tich');
  });

  it('treats ENG_GC_600 and SA4001 as graduation conditions without an "E." category', () => {
    const c = (code: string, credits: number) => ({ id: code, code, name: code, credits });
    const input = buildPlannerInput({
      curriculum: { code: 'X', name: 'X', cohort: 2023, duration_years: 4, min_semester_credits: 14, max_semester_credits: 21 },
      items: [c('CO1005', 3), c('ENG_GC_600', 0), c('SA4001', 0)].map((course) => ({ course, recommended_year: 1, recommended_term: 1 })),
      groups: [], relations: [], categories: [], specializations: [], openedSemesters: [],
      profile: { admission_year: 2023, target_specialization_id: null }, studentCourses: [],
    }, {}, new Date('2026-11-20T00:00:00Z'));
    expect(input.conditions).toEqual(['ENG_GC_600', 'SA4001']);
    expect((input.course_groups[0] as { members: string[] }).members).toEqual(['CO1005']);
  });

  it('rejects a malformed skip_semesters entry', async () => {
    await request(server()).post('/api/plans/solve').set('Origin', origin)
      .send({ skip_semesters: ['26'] }).expect(400);
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

  // File myBK bia (da doc), cung dinh dang pipeline/planner/mybk.py tra ve.
  const parsedMybk = (codes: [string, number, string][]): MybkParsed => ({
    status: 'OK', format: 'xlsx', official_program_code: null, total_required: 36, total_earned: 0,
    exported_semester: '261', checks: [{ id: 'total_earned', ok: true, detail: 'x' }],
    blocks: [{ name: '(1) A', kind: 'BB', required_credits: 0, earned_credits: 0,
      courses: codes.filter(([, , k]) => k !== 'NGOAICTDT').map(([code, credits]) => ({ code, credits, passed: true, free_elective: false })) },
    { name: '(2) NGOAICTDT', kind: 'NGOAICTDT', required_credits: 0, earned_credits: 0,
      courses: codes.filter(([, , k]) => k === 'NGOAICTDT').map(([code, credits]) => ({ code, credits, passed: true, free_elective: true })) }],
  });

  it('previews a myBK file: detects program, proposes statuses, checks data (no DB writes)', async () => {
    const spy = jest.spyOn(runner, 'readMybk').mockResolvedValue(parsedMybk([
      ['MA101', 3, 'BB'], ['CS101', 3, 'BB'], ['CS102', 4, 'BB'], ['CS201', 4, 'BB'], ['ZZ9999', 3, 'BB'],
      ['XX1000', 3, 'NGOAICTDT'],
    ]) as unknown as Record<string, unknown>);
    const res = await request(server()).post('/api/plans/mybk/preview').set('Origin', origin)
      .attach('file', Buffer.from('PK fake'), 'Mon_hoc.xlsx').expect(200);
    spy.mockRestore();
    const data = res.body.data ?? res.body;
    expect(data.detection.best.code).toBe('TOY-2025');
    expect(data.detection.chosen.coverage).toBeCloseTo(4 / 5);
    expect(data.data_check.unknown_codes).toEqual(['ZZ9999', 'XX1000']);
    expect(data.data_check.not_in_curriculum).toContainEqual({ code: 'ZZ9999', block: '(1) A', in_catalog: false });
    expect(data.data_check.credit_mismatches).toEqual([{ code: 'CS102', file_credits: 4, web_credits: 3 }]);
    expect(data.passed.map((p: { code: string }) => p.code)).toEqual(['MA101', 'CS101', 'CS102', 'CS201']);
    const cs201 = data.passed.find((p: { code: string }) => p.code === 'CS201');
    expect(cs201.current_status).toBe('in-progress');
    const notPassed = data.not_passed.map((p: { code: string }) => p.code);
    expect(notPassed).toContain('MA102');
    expect(notPassed).not.toContain('MA101');
    const statuses = await app.get<Repository<StudentCourse>>(getRepositoryToken(StudentCourse)).count();
    expect(statuses).toBe(6);
  });

  it('refuses a myBK upload without a file', async () => {
    await request(server()).post('/api/plans/mybk/preview').set('Origin', origin).expect(400);
  });

  (hasPython ? it : it.skip)('returns 400 with a readable message for a non-myBK file (real Python)', async () => {
    const res = await request(server()).post('/api/plans/mybk/preview').set('Origin', origin)
      .attach('file', Buffer.from('not an excel file'), 'x.xlsx').expect(400);
    expect(JSON.stringify(res.body)).toContain('PDF hoặc Excel');
  }, 30000);

  it('warns when the chosen program matches clearly worse than another one', () => {
    const out = analyzeMybk({
      parsed: parsedMybk([['A1', 3, 'BB'], ['A2', 3, 'BB'], ['A3', 3, 'BB'], ['A4', 3, 'BB']]),
      curricula: [{ id: 'p1', code: 'P-2023', name: 'P', cohort: 2023, courseCodes: ['A1', 'A2', 'A3', 'A4'] },
        { id: 'p2', code: 'P-2024', name: 'P', cohort: 2024, courseCodes: ['A1', 'A2'] }],
      chosenCurriculumId: 'p2', chosenCourses: [], catalog: [], statusByCode: new Map(), programMap: {},
    });
    expect(out.detection.best?.code).toBe('P-2023');
    expect(out.detection.warning).toContain('P-2024');
    expect(out.detection.warning).toContain('P-2023');
    const mapped = analyzeMybk({
      parsed: { ...parsedMybk([['A1', 3, 'BB']]), official_program_code: 'DH_X' },
      curricula: [{ id: 'p1', code: 'P-2023', name: 'P', cohort: 2023, courseCodes: ['A1'] },
        { id: 'p2', code: 'P-2024', name: 'P', cohort: 2024, courseCodes: ['A1'] }],
      chosenCurriculumId: 'p2', chosenCourses: [], catalog: [], statusByCode: new Map(), programMap: { DH_X: 'P-2023' },
    });
    expect(mapped.detection.method).toBe('program_code');
    expect(mapped.detection.warning).toContain('P-2023');
  });

  it('handles a PDF (lists not-passed courses and graduation conditions)', () => {
    const parsed: MybkParsed = {
      ...parsedMybk([]), format: 'pdf', official_program_code: 'DH_X_2023', cohort_hint: 2023,
      graduation_conditions: [{ code: 'ENG_GC_600', passed: false }],
      blocks: [{ name: 'Toan', kind: 'BB', required_credits: 6, earned_credits: 3, courses: [
        { code: 'A1', credits: 3, passed: true, free_elective: false },
        { code: 'A2', credits: 3, passed: false, free_elective: false }] }],
    };
    const course = (code: string) => ({ id: `id-${code}`, code, name: code, credits: 3 });
    const out = analyzeMybk({
      parsed, curricula: [{ id: 'p1', code: 'P-2023', name: 'P', cohort: 2023, courseCodes: ['A1', 'A2', 'A3'] }],
      chosenCurriculumId: 'p1', chosenCourses: ['A1', 'A2', 'A3'].map(course), catalog: ['A1', 'A2'].map(course),
      statusByCode: new Map([['A2', 'in-progress']]), programMap: { DH_X_2023: 'P-2023' },
    });
    expect(out.detection.method).toBe('program_code');
    expect(out.detection.warning).toBeNull();
    expect(out.passed.map((p) => p.code)).toEqual(['A1']);
    expect(out.not_passed.map((p) => [p.code, p.current_status])).toEqual([['A2', 'in-progress'], ['A3', null]]);
    expect(out.data_check.missing_in_file).toEqual(['A3']);
    expect(out.file.graduation_conditions).toEqual([{ code: 'ENG_GC_600', passed: false }]);
    expect(out.file.lists_only_passed).toBe(false);
  });

  it('breaks ties between cohorts with identical course lists by the cohort in the file', () => {
    const curricula = [2019, 2023, 2024].map((y) => ({ id: `k${y}`, code: `K-${y}`, name: 'K', cohort: y,
      courseCodes: ['A1', 'A2'] }));
    const parsed = { ...parsedMybk([['A1', 3, 'BB'], ['A2', 3, 'BB']]), cohort_hint: 2023 };
    const none = analyzeMybk({ parsed, curricula, chosenCurriculumId: null, chosenCourses: [], catalog: [],
      statusByCode: new Map(), programMap: {} });
    expect(none.detection.best?.code).toBe('K-2023');
    const wrong = analyzeMybk({ parsed, curricula, chosenCurriculumId: 'k2024', chosenCourses: [], catalog: [],
      statusByCode: new Map(), programMap: {} });
    expect(wrong.detection.best?.code).toBe('K-2023');
    expect(wrong.detection.warning).toContain('khóa 2023');
    const right = analyzeMybk({ parsed, curricula, chosenCurriculumId: 'k2023', chosenCourses: [], catalog: [],
      statusByCode: new Map(), programMap: {} });
    expect(right.detection.warning).toBeNull();
  });

  it('generates enough semesters around the current one', () => {
    const sems = semestersFor(2023, '261');
    expect(sems.slice(0, 3)).toEqual(['231', '232', '233']);
    expect(sems.filter((s) => !s.endsWith('3')).length).toBeGreaterThanOrEqual(12);
    expect(sems.indexOf('261')).toBeGreaterThan(0);
  });
});
