import { ExecutionContext, INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataType, newDb } from 'pg-mem';
import request from 'supertest';
import { Repository } from 'typeorm';
import { AdvisorController } from '../src/advisor/advisor.controller';
import { AdvisorService } from '../src/advisor/advisor.service';
import { AdvisorTools } from '../src/advisor/advisor.tools';
import { DeepSeekClient, type ChatOptions, type ChatResult } from '../src/advisor/deepseek.client';
import { AdvisorSession } from '../src/advisor/entities/advisor-session.entity';
import { AdvisorStep } from '../src/advisor/entities/advisor-step.entity';
import { setupApp } from '../src/app.setup';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { Course } from '../src/course/entities/course.entity';
import { CourseOpenedSemester } from '../src/course/entities/course-opened-semester.entity';
import { CourseGroupMember } from '../src/curriculum/entities/course-group-member.entity';
import { CourseGroup } from '../src/curriculum/entities/course-group.entity';
import { CourseRelation } from '../src/curriculum/entities/course-relation.entity';
import { CurriculumCourse } from '../src/curriculum/entities/curriculum-course.entity';
import { Curriculum } from '../src/curriculum/entities/curriculum.entity';
import { CurriculumSpecialization } from '../src/curriculum/entities/curriculum-specialization.entity';
import { CourseRelationType } from '../src/curriculum/enum/course-relation-type';
import { CourseOutlineImport } from '../src/outline/entities/course-outline-import.entity';
import { CourseOutlinePrerequisite } from '../src/outline/entities/course-outline-prerequisite.entity';
import { CourseOutline } from '../src/outline/entities/course-outline.entity';
import { OutlineService } from '../src/outline/outline.service';
import { StudentCourse } from '../src/student/entities/student-course.entity';
import { StudentPlanCourse } from '../src/student/entities/student-plan-course.entity';
import { StudentProfile } from '../src/student/entities/student-profile.entity';
import { StudentCourseStatus } from '../src/student/enum/student-course-status';
import { User } from '../src/user/entities/user.entity';
import { ROLE } from '../src/user/enum/role';

const origin = 'http://localhost:5173';
const studentId = randomUUID();
const entities = [
  User, Course, CourseOpenedSemester, Curriculum, CurriculumCourse, CourseGroup, CourseGroupMember, CourseRelation,
  CurriculumSpecialization, StudentProfile, StudentCourse, StudentPlanCourse, AdvisorSession, AdvisorStep,
  CourseOutline, CourseOutlinePrerequisite, CourseOutlineImport,
];

/** DeepSeek giả: trả lần lượt các kết quả đã soạn và ghi lại mọi request để kiểm tra. */
class FakeDeepSeek {
  readonly calls: ChatOptions[] = [];
  private queue: Partial<ChatResult>[] = [];
  isConfigured = true;
  model = 'fake-model';

  script(...results: Partial<ChatResult>[]) {
    this.queue.push(...results);
  }

  async chat(options: ChatOptions): Promise<ChatResult> {
    this.calls.push(JSON.parse(JSON.stringify(options)) as ChatOptions);
    const next = this.queue.shift();
    if (!next) throw new Error('Hết kịch bản');
    return {
      content: null, reasoning: null, toolCalls: [], finishReason: 'stop',
      promptTokens: 100, completionTokens: 20, cacheHitTokens: 50, durationMs: 5, ...next,
    };
  }
}

const call = (id: string, name: string, args: unknown) => ({
  id, type: 'function' as const, function: { name, arguments: JSON.stringify(args) },
});

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
  controllers: [AdvisorController],
  providers: [AdvisorService, AdvisorTools, DeepSeekClient, OutlineService],
})
class AdvisorTestModule {}

describe('Advisor API', () => {
  let app: INestApplication;
  const fake = new FakeDeepSeek();
  const server = () => app.getHttpServer();
  const snapshot = {
    current: '261',
    next: '262',
    overview: { capacity: 18 },
    eligible_next: [{ code: 'CO2003', name: 'Cấu trúc dữ liệu', credits: 4 }],
    blocked_next: [{ code: 'CO3001', name: 'Công nghệ phần mềm', credits: 3, missing: ['CO2003'] }],
    electives: [],
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AdvisorTestModule] })
      .overrideProvider(DeepSeekClient).useValue(fake)
      .overrideGuard(JwtAuthGuard).useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = { id: studentId, email: 'sv@hcmut.edu.vn', role: ROLE.STUDENT, sessionId: randomUUID() };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    setupApp(app, [origin]);
    await app.init();

    const repo = <T extends object>(entity: new () => T) => module.get<Repository<T>>(getRepositoryToken(entity));
    await repo(User).save({ id: studentId, email: 'sv@hcmut.edu.vn', password: 'hash', role: ROLE.STUDENT });
    const [dsa, se] = await repo(Course).save([
      { code: 'CO2003', name: 'Cấu trúc dữ liệu', credits: 4 },
      { code: 'CO3001', name: 'Công nghệ phần mềm', credits: 3 },
    ]);
    const curriculum = await repo(Curriculum).save({
      code: 'CS-2023', name: 'Khoa học máy tính', major: 'CNTT', faculty: 'CNTT',
      cohort: 2023, duration_years: 4, min_semester_credits: 1, max_semester_credits: 18,
    });
    await repo(CurriculumCourse).save([
      { curriculum_id: curriculum.id, course_id: dsa.id, recommended_year: 2, recommended_term: 1 },
      { curriculum_id: curriculum.id, course_id: se.id, recommended_year: 3, recommended_term: 1 },
    ]);
    await repo(CourseRelation).save({
      curriculum_id: curriculum.id, course_id: se.id, related_course_id: dsa.id, type: CourseRelationType.PREREQUISITE,
    });
    // CO2003 mở đủ 4 kỳ 2 gần nhất; CO3001 chỉ mở kỳ 1. Dữ liệu chưa có HK 262.
    await repo(CourseOpenedSemester).save([
      ...['222', '232', '242', '252'].map(code => ({ course_id: dsa.id, semester_code: code })),
      ...['231', '241', '251', '261'].map(code => ({ course_id: se.id, semester_code: code })),
    ]);
    await repo(StudentProfile).save({ user_id: studentId, curriculum_id: curriculum.id, admission_year: 2023 });
    await repo(StudentCourse).save({ user_id: studentId, course_id: dsa.id, status: StudentCourseStatus.FAILED });

    // Đề cương CO2003 (bản áp dụng từ HK 261) với nội dung có chủ đề "đệ quy" và một điều kiện chỉ có trong đề cương.
    const outline = await repo(CourseOutline).save({
      course_code: 'CO2003', version: '14.1', applies_from: '261', name_vi: 'Cấu trúc Dữ liệu và Giải Thuật', credits: 4,
      content_hash: 'h',
      content: {
        course_code: 'CO2003', version: '14.1', applies_from: '261',
        name: { vi: 'Cấu trúc Dữ liệu và Giải Thuật', en: 'Data Structures and Algorithms' },
        objectives: { vi: 'Sử dụng các cấu trúc dữ liệu nền tảng.', en: null },
        summary: { vi: 'Rèn luyện kỹ thuật lập trình đệ quy; danh sách, cây, đồ thị.', en: null },
        hours: { total_periods: 200, total_study_hours: 182.5, breakdown: { theory: 30, lab: 30 } },
        credit_breakdown: { theory: 2, lab: 1, assignment: 1 },
        assessment: {
          weights: { lab: 10, assignment: 30, midterm: 10, final_exam: 50 },
          midterm: { format: { code: 'TN2', name: { vi: 'Trắc nghiệm (chấm máy)', en: null } }, duration_minutes: 60 },
          final_exam: { format: { code: 'TN2', name: { vi: 'Trắc nghiệm (chấm máy)', en: null } }, duration_minutes: 90 },
          other: null,
        },
        learning_outcomes: [{ key: 'LO:L.O.1', code: 'L.O.1', level: 1, parent_code: null, framework: 'LO', name: { vi: 'Phân tích độ phức tạp', en: null } }],
        sessions: [{ order: 1, label: '1', content: { vi: 'Giới thiệu, ôn con trỏ', en: null }, items: [] }],
      },
    });
    await repo(CourseOutlinePrerequisite).save({ outline_id: outline.id, type: 'prior', type_raw: 'HT', related_course_code: 'CO1023' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('runs tools, rejects an invented course code, then stores a verified JSON answer', async () => {
    fake.script(
      {
        reasoning: 'Cần xem CO2003 và lịch mở lớp.',
        toolCalls: [
          call('c1', 'get_course_detail', { code: 'co2003' }),
          call('c2', 'check_offering', { codes: ['CO2003', 'CO3001'] }),
        ],
      },
      {
        reasoning: 'Trả lời.',
        toolCalls: [call('c3', 'submit_answer', {
          message: 'Bạn nên **học lại CO2003**.',
          recommendations: [{ code: 'CO2003', reason: 'Học lại', priority: 'high' }, { code: 'XX9999', reason: 'bịa', priority: 'low' }],
          choices: [],
          suggestions: [],
        })],
      },
      {
        reasoning: 'Bỏ mã sai.',
        toolCalls: [call('c4', 'submit_answer', {
          message: 'Bạn nên **học lại CO2003**.',
          recommendations: [{ code: 'CO2003', reason: 'Học lại', priority: 'high' }],
          choices: [{
            id: 'credits', question: 'Kỳ tới bạn muốn học bao nhiêu tín chỉ?', type: 'single',
            options: [{ value: '14', label: '14 TC' }, { value: '18', label: '18 TC' }],
          }],
          suggestions: ['Có nên học hè không?'],
        })],
      },
    );

    const response = await request(server()).post('/api/advisor/messages').set('Origin', origin)
      .send({ message: 'Kỳ tới học gì?', snapshot }).expect(201);
    const steps = response.body.data.steps as AdvisorStep[];
    expect(steps.map(step => step.role)).toEqual([
      'system', 'context', 'user', 'assistant', 'tool', 'tool', 'assistant', 'tool', 'assistant', 'tool', 'answer',
    ]);

    const detail = steps[4].data as Record<string, unknown>;
    expect(detail).toMatchObject({ code: 'CO2003', student_status: 'chưa đạt' });
    expect(detail.unlocks).toEqual([{ code: 'CO3001', type: expect.stringContaining('tiên quyết') }]);

    const offering = steps[5].data as { has_data_for_semester: boolean; results: { code: string; verdict: string }[] };
    expect(offering.has_data_for_semester).toBe(false);
    expect(offering.results.map(item => [item.code, item.verdict])).toEqual([['CO2003', 'likely'], ['CO3001', 'never']]);

    expect(steps[7].data).toMatchObject({ ok: false, errors: [expect.stringContaining('XX9999')] });

    const answer = steps[10].data as { source: string; recommendations: unknown[]; choices: unknown[] };
    expect(answer.source).toBe('tool');
    expect(answer.recommendations).toEqual([expect.objectContaining({
      code: 'CO2003', name: 'Cấu trúc dữ liệu', credits: 4, eligible: true, in_curriculum: true,
      offering: expect.objectContaining({ semester: '262', verdict: 'likely', opened_same_term_recent: ['252', '242', '232', '222'] }),
    })]);
    expect(answer.choices[0]).toMatchObject({ id: 'credits', type: 'single' });

    // Mỗi vòng sau gửi lại reasoning_content và kết quả tool cho model.
    const third = fake.calls[2].messages;
    expect(third[0].role).toBe('system');
    expect(third[1].content).toContain('<context>');
    expect(third.filter(message => message.role === 'assistant').every(message => message.reasoning_content)).toBe(true);
    expect(third.filter(message => message.role === 'tool').map(message => message.tool_call_id)).toEqual(['c1', 'c2', 'c3']);
  });

  it('reads course outlines, searches outline content and attaches outline data to recommendations', async () => {
    fake.calls.length = 0;
    fake.script(
      {
        toolCalls: [
          call('o1', 'get_course_outline', { code: 'co2003' }),
          call('o2', 'search_curriculum_courses', { query: 'de quy' }),
          call('o3', 'get_course_detail', { code: 'CO2003' }),
          call('o4', 'get_course_outline', { code: 'CO3001' }),
        ],
      },
      {
        toolCalls: [call('o5', 'submit_answer', {
          message: 'CO2003 học về đệ quy, thi trắc nghiệm 90 phút.',
          recommendations: [{ code: 'CO2003', reason: 'Học lại', priority: 'high' }],
          choices: [],
          suggestions: [],
        })],
      },
    );

    const response = await request(server()).post('/api/advisor/messages').set('Origin', origin)
      .send({ message: 'Môn nào học về đệ quy?', snapshot: { ...snapshot, outline_coverage: { with_outline: 1, total: 2 } } }).expect(201);
    const steps = response.body.data.steps as AdvisorStep[];
    const tool = (id: string) => steps.find(step => step.tool_call_id === id)!.data as Record<string, unknown>;

    expect(tool('o1')).toMatchObject({
      code: 'CO2003', version: '14.1', note: 'Bản áp dụng cho HK 262',
      summary: expect.stringContaining('đệ quy'),
      prerequisites_in_outline: [{ code: 'CO1023', type: expect.stringContaining('học trước') }],
      prerequisites_in_curriculum: [],
      learning_outcomes: [{ code: 'L.O.1', name: 'Phân tích độ phức tạp' }],
      sessions: [{ label: '1', content: 'Giới thiệu, ôn con trỏ' }],
    });
    expect((tool('o1').assessment as { weights: unknown }).weights).toEqual({ lab: 10, assignment: 30, midterm: 10, final_exam: 50 });
    expect(tool('o2')).toMatchObject({ total: 1, results: [{ code: 'CO2003', matched_in: 'nội dung đề cương' }] });
    expect(tool('o3')).toMatchObject({
      outline: { version: '14.1', study_hours: 182.5, has_lab: true, final_exam: { format: 'Trắc nghiệm (chấm máy)', duration_minutes: 90 } },
      outline_prerequisites: [{ code: 'CO1023', type: expect.stringContaining('học trước') }],
    });
    expect(tool('o4')).toEqual({ error: 'Môn CO3001 chưa có đề cương trong hệ thống' });

    const answer = steps.at(-1)!.data as { recommendations: { code: string; outline: unknown }[] };
    expect(answer.recommendations[0]).toMatchObject({ code: 'CO2003', outline: { has_lab: true, study_hours: 182.5 } });
    // Context mới có độ phủ đề cương.
    expect(fake.calls[0].messages.at(-1)?.content).toContain('outline_coverage');
  });

  it('replays history on the next turn and falls back to JSON mode when the model answers in plain text', async () => {
    const sessions = (await request(server()).get('/api/advisor/sessions').expect(200)).body.data as AdvisorSession[];
    const first = sessions.find(session => session.title === 'Kỳ tới học gì?')!;
    expect(first).toBeDefined();
    fake.calls.length = 0;
    fake.script(
      { content: 'Nên chọn 14 TC vì bạn đang học lại CO2003.' },
      { content: JSON.stringify({ message: 'Chọn **14 TC** là hợp lý.', recommendations: [{ code: 'CO2003', reason: 'Học lại', priority: 'high' }], choices: [], suggestions: [] }) },
    );

    const response = await request(server()).post('/api/advisor/messages').set('Origin', origin).send({
      session_id: first.id,
      message: 'Mình đã trả lời các câu hỏi.',
      answers: [{ id: 'credits', question: 'Kỳ tới bạn muốn học bao nhiêu tín chỉ?', values: ['14 TC'] }],
    }).expect(201);
    const steps = response.body.data.steps as AdvisorStep[];
    // Snapshot không đổi nên không gửi lại context.
    expect(steps.map(step => step.role)).toEqual(['user', 'assistant', 'assistant', 'answer']);
    expect(steps[0].content).toContain('[Trả lời lựa chọn]');
    expect(steps[3].data).toMatchObject({ source: 'json_mode', message: 'Chọn **14 TC** là hợp lý.' });

    const replayed = fake.calls[0].messages;
    expect(replayed.filter(message => message.role === 'user')).toHaveLength(2);
    expect(replayed.at(-1)?.content).toContain('14 TC');
    expect(fake.calls[1]).toMatchObject({ json: true, thinking: false });

    const detail = await request(server()).get(`/api/advisor/sessions/${first.id}`).expect(200);
    expect(detail.body.data.steps).toHaveLength(15);
    expect(detail.body.data.snapshot).toBeUndefined();
  });
});
