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
import { CourseGroupMember } from '../src/curriculum/entities/course-group-member.entity';
import { CourseGroup } from '../src/curriculum/entities/course-group.entity';
import { CourseRelation } from '../src/curriculum/entities/course-relation.entity';
import { CurriculumCourse } from '../src/curriculum/entities/curriculum-course.entity';
import { CurriculumRegulation } from '../src/curriculum/entities/curriculum-regulation.entity';
import { Curriculum } from '../src/curriculum/entities/curriculum.entity';
import { CurriculumSpecialization } from '../src/curriculum/entities/curriculum-specialization.entity';
import { StudentCourse } from '../src/student/entities/student-course.entity';
import { StudentPlanCourse } from '../src/student/entities/student-plan-course.entity';
import { StudentProfile } from '../src/student/entities/student-profile.entity';
import { StudentRegulationStatusEntity } from '../src/student/entities/student-regulation-status.entity';
import { StudentCourseController } from '../src/student/student-course.controller';
import { StudentPlanCourseController } from '../src/student/student-plan-course.controller';
import { StudentProfileController } from '../src/student/student-profile.controller';
import { StudentRegulationStatusController } from '../src/student/student-regulation-status.controller';
import { StudentService } from '../src/student/student.service';
import { User } from '../src/user/entities/user.entity';
import { ROLE } from '../src/user/enum/role';

const origin = 'http://localhost:5173';
const studentId = randomUUID();
const entities = [
  User, Course, Curriculum, CurriculumCourse, CourseGroup, CourseGroupMember, CourseRelation,
  CurriculumRegulation, CurriculumSpecialization, StudentProfile, StudentCourse, StudentPlanCourse,
  StudentRegulationStatusEntity,
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
  controllers: [
    StudentProfileController, StudentCourseController, StudentPlanCourseController, StudentRegulationStatusController,
  ],
  providers: [StudentService],
})
class StudentTestModule {}

describe('Student API', () => {
  let app: INestApplication;
  let course: Course;
  let extraCourse: Course;
  let curriculum: Curriculum;
  let regulation: CurriculumRegulation;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [StudentTestModule] })
      .overrideGuard(JwtAuthGuard).useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = {
            id: studentId,
            email: 'minh.anh@hcmut.edu.vn',
            role: ROLE.STUDENT,
            sessionId: randomUUID(),
          };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    setupApp(app, [origin]);
    await app.init();

    const users = module.get<Repository<User>>(getRepositoryToken(User));
    await users.save(users.create({ id: studentId, email: 'minh.anh@hcmut.edu.vn', password: 'hash', role: ROLE.STUDENT }));

    const courses = module.get<Repository<Course>>(getRepositoryToken(Course));
    course = await courses.save(courses.create({ code: 'CO2003', name: 'Cấu trúc dữ liệu', credits: 4 }));
    // Môn không thuộc chương trình, dùng cho tự chọn tự do.
    extraCourse = await courses.save(courses.create({ code: 'CO9999', name: 'Tự chọn tự do', credits: 3 }));

    const curricula = module.get<Repository<Curriculum>>(getRepositoryToken(Curriculum));
    curriculum = await curricula.save(curricula.create({
      code: 'CS-2023', name: 'Khoa học máy tính', major: 'CNTT', faculty: 'CNTT',
      cohort: 2023, duration_years: 4, min_semester_credits: 1, max_semester_credits: 18,
    }));

    const assignments = module.get<Repository<CurriculumCourse>>(getRepositoryToken(CurriculumCourse));
    await assignments.save(assignments.create({
      curriculum_id: curriculum.id, course_id: course.id, recommended_year: 2, recommended_term: 1,
    }));

    const regulations = module.get<Repository<CurriculumRegulation>>(getRepositoryToken(CurriculumRegulation));
    regulation = await regulations.save(regulations.create({
      curriculum_id: curriculum.id, name: 'Chuẩn ngoại ngữ đầu ra', detail: 'Đạt B1',
    }));
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns an empty profile, then creates and updates it', async () => {
    const empty = await request(server()).get('/api/student-profiles/me').expect(200);
    expect(empty.body.data).toBeNull();

    const created = await request(server()).patch('/api/student-profiles/me').set('Origin', origin).send({
      full_name: 'Nguyễn Minh Anh',
      student_number: '2312345',
      phone: '0901234567',
      birth_date: '2005-04-18',
      admission_year: 2023,
      address: 'Quận 10, TP. Hồ Chí Minh',
      curriculum_id: curriculum.id,
      credit_target: 18,
    }).expect(200);
    expect(created.body.data).toMatchObject({
      full_name: 'Nguyễn Minh Anh', student_number: '2312345', admission_year: 2023, credit_target: 18,
      curriculum_id: curriculum.id, birth_date: '2005-04-18',
    });
    expect(Object.keys(created.body.data)).toEqual(expect.arrayContaining(['created_at', 'user_id']));

    const cleared = await request(server()).patch('/api/student-profiles/me').set('Origin', origin)
      .send({ phone: null, credit_target: null }).expect(200);
    expect(cleared.body.data).toMatchObject({ phone: null, credit_target: null, full_name: 'Nguyễn Minh Anh' });

    await request(server()).patch('/api/student-profiles/me').set('Origin', origin)
      .send({ birth_date: 'không-phải-ngày' }).expect(400);
    await request(server()).patch('/api/student-profiles/me').set('Origin', origin)
      .send({ curriculum_id: randomUUID() }).expect(400);
  });

  it('lets the student target a specialization of their own curriculum', async () => {
    const specializations = app.get<Repository<CurriculumSpecialization>>(getRepositoryToken(CurriculumSpecialization));
    const target = await specializations.save(specializations.create({
      curriculum_id: curriculum.id, code: 'CNPM', name: 'Công nghệ Phần mềm',
    }));

    const chosen = await request(server()).patch('/api/student-profiles/me').set('Origin', origin)
      .send({ target_specialization_id: target.id }).expect(200);
    expect(chosen.body.data.target_specialization_id).toBe(target.id);

    // Chuyên ngành phải thuộc chương trình của hồ sơ.
    await request(server()).patch('/api/student-profiles/me').set('Origin', origin)
      .send({ target_specialization_id: randomUUID() }).expect(400);

    // Bỏ chương trình thì chuyên ngành cũng bị bỏ chọn; khai lại chương trình để các test sau dùng.
    const dropped = await request(server()).patch('/api/student-profiles/me').set('Origin', origin)
      .send({ curriculum_id: null }).expect(200);
    expect(dropped.body.data.target_specialization_id).toBeNull();
    await request(server()).patch('/api/student-profiles/me').set('Origin', origin)
      .send({ curriculum_id: curriculum.id }).expect(200);
  });

  it('declares course status', async () => {
    const declared = await request(server()).put(`/api/student-courses/me/${course.id}`).set('Origin', origin)
      .send({ status: 'in-progress' }).expect(200);
    expect(declared.body.data).toMatchObject({ course_id: course.id, status: 'in-progress' });
    expect(declared.body.data.course.code).toBe('CO2003');

    // "Đã học nhưng rớt": cần cho quy tắc học trước (HT).
    const failed = await request(server()).put(`/api/student-courses/me/${course.id}`).set('Origin', origin)
      .send({ status: 'failed' }).expect(200);
    expect(failed.body.data.status).toBe('failed');

    const updated = await request(server()).put(`/api/student-courses/me/${course.id}`).set('Origin', origin)
      .send({ status: 'completed' }).expect(200);
    expect(updated.body.data.status).toBe('completed');

    const list = await request(server()).get('/api/student-courses/me').expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].course.code).toBe('CO2003');

    await request(server()).put(`/api/student-courses/me/${course.id}`).set('Origin', origin)
      .send({ status: 'official' }).expect(400);
    await request(server()).put(`/api/student-courses/me/${randomUUID()}`).set('Origin', origin)
      .send({ status: 'completed' }).expect(400);

    await request(server()).delete(`/api/student-courses/me/${course.id}`).set('Origin', origin).expect(200);
    await request(server()).delete(`/api/student-courses/me/${course.id}`).set('Origin', origin).expect(404);
  });

  it('declares many course statuses at once and keeps the others', async () => {
    await request(server()).put(`/api/student-courses/me/${course.id}`).set('Origin', origin)
      .send({ status: 'in-progress' }).expect(200);

    // Một môn đã khai được cập nhật, một môn mới được tạo.
    const saved = await request(server()).put('/api/student-courses/me').set('Origin', origin).send({
      items: [
        { course_id: course.id, status: 'completed' },
        { course_id: extraCourse.id, status: 'failed' },
      ],
    }).expect(200);
    const statusOf = (rows: { course_id: string; status: string }[], id: string) =>
      rows.find(row => row.course_id === id)?.status;
    expect(saved.body.data).toHaveLength(2);
    expect(statusOf(saved.body.data, course.id)).toBe('completed');
    expect(statusOf(saved.body.data, extraCourse.id)).toBe('failed');

    // Môn không tồn tại, trùng môn hoặc trạng thái sai: từ chối cả lô, không ghi gì.
    await request(server()).put('/api/student-courses/me').set('Origin', origin).send({
      items: [{ course_id: course.id, status: 'not-started' }, { course_id: randomUUID(), status: 'completed' }],
    }).expect(400);
    await request(server()).put('/api/student-courses/me').set('Origin', origin).send({
      items: [{ course_id: course.id, status: 'not-started' }, { course_id: course.id, status: 'completed' }],
    }).expect(400);
    await request(server()).put('/api/student-courses/me').set('Origin', origin).send({
      items: [{ course_id: course.id, status: 'official' }],
    }).expect(400);
    const unchanged = await request(server()).get('/api/student-courses/me').expect(200);
    expect(statusOf(unchanged.body.data, course.id)).toBe('completed');

    // Danh sách rỗng hợp lệ, không đổi gì.
    await request(server()).put('/api/student-courses/me').set('Origin', origin).send({ items: [] }).expect(200);

    await request(server()).delete(`/api/student-courses/me/${course.id}`).set('Origin', origin).expect(200);
    await request(server()).delete(`/api/student-courses/me/${extraCourse.id}`).set('Origin', origin).expect(200);
  });

  it('manages plan courses', async () => {
    const planned = await request(server())
      .put(`/api/student-plan-courses/me/${curriculum.id}/${course.id}`)
      .set('Origin', origin)
      .send({ semester_code: '262' })
      .expect(200);
    expect(planned.body.data).toMatchObject({ curriculum_id: curriculum.id, course_id: course.id, semester_code: '262' });
    expect(planned.body.data.course.code).toBe('CO2003');

    const changed = await request(server())
      .put(`/api/student-plan-courses/me/${curriculum.id}/${course.id}`)
      .set('Origin', origin)
      .send({ semester_code: '271' })
      .expect(200);
    expect(changed.body.data.id).toBe(planned.body.data.id);
    expect(changed.body.data.semester_code).toBe('271');

    const list = await request(server()).get('/api/student-plan-courses/me')
      .query({ curriculum_id: curriculum.id }).expect(200);
    expect(list.body.data).toHaveLength(1);

    // Tự chọn tự do: môn không thuộc chương trình vẫn lập kế hoạch được.
    const outside = await request(server())
      .put(`/api/student-plan-courses/me/${curriculum.id}/${extraCourse.id}`)
      .set('Origin', origin)
      .send({ semester_code: '271' })
      .expect(200);
    expect(outside.body.data.course.code).toBe('CO9999');

    const otherCurriculum = randomUUID();
    await request(server())
      .put(`/api/student-plan-courses/me/${otherCurriculum}/${course.id}`)
      .set('Origin', origin)
      .send({ semester_code: '262' })
      .expect(400);

    await request(server()).delete(`/api/student-plan-courses/me/${curriculum.id}/${extraCourse.id}`)
      .set('Origin', origin).expect(200);
    await request(server()).delete(`/api/student-plan-courses/me/${curriculum.id}/${course.id}`)
      .set('Origin', origin).expect(200);
    await request(server()).delete(`/api/student-plan-courses/me/${curriculum.id}/${course.id}`)
      .set('Origin', origin).expect(404);
  });

  it('manages regulation statuses', async () => {
    const declared = await request(server()).put(`/api/student-regulation-statuses/me/${regulation.id}`)
      .set('Origin', origin).send({ status: 'completed' }).expect(200);
    expect(declared.body.data).toMatchObject({ regulation_id: regulation.id, status: 'completed' });

    const all = await request(server()).get('/api/student-regulation-statuses/me').expect(200);
    expect(all.body.data).toHaveLength(1);
    const filtered = await request(server()).get('/api/student-regulation-statuses/me')
      .query({ curriculum_id: curriculum.id }).expect(200);
    expect(filtered.body.data).toHaveLength(1);
    const other = await request(server()).get('/api/student-regulation-statuses/me')
      .query({ curriculum_id: randomUUID() }).expect(200);
    expect(other.body.data).toHaveLength(0);

    await request(server()).put(`/api/student-regulation-statuses/me/${randomUUID()}`)
      .set('Origin', origin).send({ status: 'completed' }).expect(400);

    await request(server()).delete(`/api/student-regulation-statuses/me/${regulation.id}`)
      .set('Origin', origin).expect(200);
    await request(server()).delete(`/api/student-regulation-statuses/me/${regulation.id}`)
      .set('Origin', origin).expect(404);
  });
});
