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
import { CourseOpenedSemester } from '../src/course/entities/course-opened-semester.entity';
import { Course } from '../src/course/entities/course.entity';
import { CurriculumContentController } from '../src/curriculum/curriculum-content.controller';
import { CurriculumContentService } from '../src/curriculum/curriculum-content.service';
import { CurriculumController } from '../src/curriculum/curriculum.controller';
import { CurriculumService } from '../src/curriculum/curriculum.service';
import { CourseCategoryMember } from '../src/curriculum/entities/course-category-member.entity';
import { CourseCategory } from '../src/curriculum/entities/course-category.entity';
import { CourseGroupMember } from '../src/curriculum/entities/course-group-member.entity';
import { CourseGroup } from '../src/curriculum/entities/course-group.entity';
import { CourseRelation } from '../src/curriculum/entities/course-relation.entity';
import { CurriculumCourse } from '../src/curriculum/entities/curriculum-course.entity';
import { CurriculumRegulation } from '../src/curriculum/entities/curriculum-regulation.entity';
import { Curriculum } from '../src/curriculum/entities/curriculum.entity';
import { CurriculumSpecialization } from '../src/curriculum/entities/curriculum-specialization.entity';

const origin = 'http://localhost:5173';
const entities = [
  Curriculum, CurriculumCourse, CourseGroup, CourseGroupMember, CourseCategory, CourseCategoryMember,
  CourseRelation, CurriculumRegulation, CurriculumSpecialization, Course, CourseOpenedSemester,
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
  controllers: [CurriculumController, CurriculumContentController],
  providers: [CurriculumService, CurriculumContentService],
})
class CurriculumTestModule {}

describe('Curriculum API', () => {
  let app: INestApplication;
  let curriculumId: string;
  let courseA: Course;
  let courseB: Course;
  let groupId: string;
  let regulationId: string;
  let openedSemesters: Repository<CourseOpenedSemester>;
  let outsider: Course;
  const server = () => app.getHttpServer();
  const url = (suffix = '') => `/api/curricula/${curriculumId}${suffix}`;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [CurriculumTestModule] })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    setupApp(app, [origin]);
    await app.init();
    const dataSource = module.get(DataSource);
    await dataSource.query('CREATE UNIQUE INDEX "UQ_curricula_code_lower" ON "curricula" (lower("code"))');
    await dataSource.query('CREATE UNIQUE INDEX "UQ_course_groups_name_lower" ON "course_groups" ("curriculum_id", lower("name"))');
    await dataSource.query('CREATE UNIQUE INDEX "UQ_course_categories_name_lower" ON "course_categories" ("curriculum_id", lower("name"))');
    await dataSource.query('CREATE UNIQUE INDEX "UQ_curriculum_specializations_code_lower" ON "curriculum_specializations" ("curriculum_id", lower("code"))');
    const courses = module.get<Repository<Course>>(getRepositoryToken(Course));
    courseA = await courses.save(courses.create({ code: 'CO2003', name: 'Cấu trúc dữ liệu', credits: 4 }));
    courseB = await courses.save(courses.create({ code: 'CO2013', name: 'Cơ sở dữ liệu', credits: 3 }));
    outsider = await courses.save(courses.create({ code: 'XX9999', name: 'Môn ngoài chương trình', credits: 3 }));
    openedSemesters = module.get<Repository<CourseOpenedSemester>>(getRepositoryToken(CourseOpenedSemester));
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates and lists curricula', async () => {
    const created = await request(server()).post('/api/curricula').set('Origin', origin).send({
      code: 'CS-2023',
      name: 'Khoa học máy tính',
      major: 'Công nghệ thông tin',
      faculty: 'Công nghệ thông tin',
      cohort: 2023,
      duration_years: 4,
      min_semester_credits: 1,
      max_semester_credits: 18,
    }).expect(201);
    expect(created.body.data).toMatchObject({ code: 'CS-2023', cohort: 2023, duration_years: 4 });
    expect(Object.keys(created.body.data)).toEqual(expect.arrayContaining(['created_at', 'min_semester_credits']));
    curriculumId = created.body.data.id;

    await request(server()).post('/api/curricula').set('Origin', origin).send({
      code: 'cs-2023', name: 'Trùng mã', major: 'CNTT', faculty: 'CNTT',
      cohort: 2023, duration_years: 4, min_semester_credits: 1, max_semester_credits: 18,
    }).expect(409);

    const list = await request(server()).get('/api/curricula').query('search=khoa học').expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.pagination).toMatchObject({ itemCount: 1 });

    const detail = await request(server()).get(`/api/curricula/${curriculumId}`).expect(200);
    expect(detail.body.data.id).toBe(curriculumId);
    await request(server()).get(`/api/curricula/${randomUUID()}`).expect(404);
  });

  it('adds courses to the curriculum and upserts duplicates', async () => {
    const added = await request(server()).post(url('/courses')).set('Origin', origin)
      .send({ course_id: courseA.id, recommended_year: 2, recommended_term: 1 }).expect(201);
    expect(added.body.data).toMatchObject({ course_id: courseA.id, recommended_year: 2, recommended_term: 1 });
    expect(added.body.data.course.code).toBe('CO2003');

    await request(server()).post(url('/courses')).set('Origin', origin)
      .send({ course_id: courseB.id, recommended_year: 2, recommended_term: 2 }).expect(201);

    const upserted = await request(server()).post(url('/courses')).set('Origin', origin)
      .send({ course_id: courseA.id, recommended_year: 3, recommended_term: 2 }).expect(201);
    expect(upserted.body.data).toMatchObject({ recommended_year: 3, recommended_term: 2 });

    const list = await request(server()).get(url('/courses')).expect(200);
    expect(list.body.data).toHaveLength(2);
    expect(list.body.data[0]).toHaveProperty('course');
  });

  it('updates and rejects unknown assignments', async () => {
    const patched = await request(server()).patch(url(`/courses/${courseA.id}`)).set('Origin', origin)
      .send({ recommended_term: 3 }).expect(200);
    expect(patched.body.data).toMatchObject({ recommended_year: 3, recommended_term: 3 });
    await request(server()).patch(url(`/courses/${randomUUID()}`)).set('Origin', origin)
      .send({ recommended_term: 1 }).expect(404);
  });

  it('creates groups with members, allows a course in several groups, blocks duplicate names', async () => {
    const created = await request(server()).post(url('/groups')).set('Origin', origin)
      .send({ name: 'Cơ sở ngành', kind: 'required', required_count: 2, course_ids: [courseA.id] }).expect(201);
    expect(created.body.data).toMatchObject({ name: 'Cơ sở ngành', kind: 'required', required_count: 2 });
    expect(created.body.data.members).toHaveLength(1);
    expect(created.body.data.members[0].course.code).toBe('CO2003');
    groupId = created.body.data.id;

    await request(server()).post(url('/groups')).set('Origin', origin)
      .send({ name: 'Cơ sở ngành', kind: 'required', required_count: 1 }).expect(409);

    // Một môn được nằm trong nhiều khối; chỉ lặp trong cùng một khối mới bị chặn.
    const second = await request(server()).post(url('/groups')).set('Origin', origin)
      .send({ name: 'Nhóm khác', kind: 'elective', required_credits: 4, course_ids: [courseA.id] }).expect(201);
    expect(second.body.data).toMatchObject({ required_count: null, required_credits: 4, pool_scope: 'listed' });
  });

  it('treats the recommended schedule as optional and supports "any" credit blocks', async () => {
    // Môn trong pool tự chọn: thuộc chương trình nhưng chưa xếp kỳ.
    const added = await request(server()).post(url('/courses')).set('Origin', origin)
      .send({ course_id: courseB.id }).expect(201);
    expect(added.body.data.recommended_year).toBeNull();
    expect(added.body.data.recommended_term).toBeNull();

    // Nửa vời (chỉ năm hoặc chỉ kỳ) bị từ chối.
    await request(server()).post(url('/courses')).set('Origin', origin)
      .send({ course_id: courseA.id, recommended_year: 2 }).expect(400);

    // Khối tự chọn tự do: mọi môn 3 tín chỉ, không khai báo thành viên.
    const freeBlock = await request(server()).post(url('/groups')).set('Origin', origin)
      .send({
        name: 'Tự chọn tự do', kind: 'elective', pool_scope: 'any',
        required_credits: 9, pool_course_credits: 3,
      }).expect(201);
    expect(freeBlock.body.data).toMatchObject({
      pool_scope: 'any', required_credits: 9, required_count: null, pool_course_credits: 3,
    });
    expect(freeBlock.body.data.members).toHaveLength(0);

    // Khối "any" không nhận danh sách môn, và phải có ràng buộc tín chỉ.
    await request(server()).post(url('/groups')).set('Origin', origin)
      .send({ name: 'Any có môn', kind: 'elective', pool_scope: 'any', required_credits: 9, course_ids: [courseA.id] })
      .expect(400);
    await request(server()).post(url('/groups')).set('Origin', origin)
      .send({ name: 'Any thiếu tín chỉ', kind: 'elective', pool_scope: 'any' }).expect(400);
    await request(server()).post(url('/groups')).set('Origin', origin)
      .send({ name: 'Thiếu ràng buộc', kind: 'elective' }).expect(400);
  });

  it('replaces group members', async () => {
    const members = await request(server()).get(url(`/groups/${groupId}/members`)).expect(200);
    expect(members.body.data).toHaveLength(1);

    const replaced = await request(server()).put(url(`/groups/${groupId}/members`)).set('Origin', origin)
      .send({ course_ids: [courseA.id, courseB.id] }).expect(200);
    expect(replaced.body.data.members.map((row: { course_id: string }) => row.course_id))
      .toEqual(expect.arrayContaining([courseA.id, courseB.id]));

    const groups = await request(server()).get(url('/groups')).expect(200);
    const group = groups.body.data.find((row: { id: string }) => row.id === groupId);
    expect(group.members).toHaveLength(2);
  });

  it('models optional specializations as child groups narrowing a root group', async () => {
    const created = await request(server()).post(url('/specializations')).set('Origin', origin)
      .send({ code: 'CNPM', name: 'Công nghệ Phần mềm' }).expect(201);
    expect(created.body.data).toMatchObject({ code: 'CNPM', description: null, groups: [] });
    const specializationId = created.body.data.id;
    await request(server()).post(url('/specializations')).set('Origin', origin)
      .send({ code: 'cnpm', name: 'Trùng mã' }).expect(409);

    // Khối chuyên ngành kế thừa yêu cầu của khối gốc khi không khai báo.
    const child = await request(server()).post(url('/groups')).set('Origin', origin).send({
      name: 'Cơ sở ngành - CNPM', kind: 'elective',
      specialization_id: specializationId, parent_group_id: groupId, course_ids: [courseA.id],
    }).expect(201);
    expect(child.body.data).toMatchObject({
      specialization_id: specializationId, parent_group_id: groupId, required_count: 2, pool_scope: 'listed',
    });
    const childId = child.body.data.id;

    // Phải gửi cả cặp; môn phải thuộc khối gốc; không lồng nhiều cấp.
    await request(server()).post(url('/groups')).set('Origin', origin)
      .send({ name: 'Thiếu khối gốc', kind: 'elective', required_count: 1, specialization_id: specializationId })
      .expect(400);
    await request(server()).post(url('/groups')).set('Origin', origin).send({
      name: 'Ngoài khối gốc', kind: 'elective', specialization_id: specializationId, parent_group_id: groupId,
      course_ids: [randomUUID()],
    }).expect(400);
    await request(server()).post(url('/groups')).set('Origin', origin).send({
      name: 'Lồng cấp', kind: 'elective', specialization_id: specializationId, parent_group_id: childId,
    }).expect(400);

    // Một chuyên ngành được thu hẹp cùng khối gốc bằng nhiều khối con (bắt buộc + tự chọn),
    // nhưng các khối con đó không được trùng môn.
    const sibling = await request(server()).post(url('/groups')).set('Origin', origin).send({
      name: 'Khối con thứ hai', kind: 'required', required_count: 1,
      specialization_id: specializationId, parent_group_id: groupId, course_ids: [courseB.id],
    }).expect(201);
    const siblingId = sibling.body.data.id;
    await request(server()).post(url('/groups')).set('Origin', origin).send({
      name: 'Khối con trùng môn', kind: 'elective', required_count: 1,
      specialization_id: specializationId, parent_group_id: groupId, course_ids: [courseA.id],
    }).expect(400);
    await request(server()).put(url(`/groups/${siblingId}/members`)).set('Origin', origin)
      .send({ course_ids: [courseA.id, courseB.id] }).expect(400);
    await request(server()).patch(url(`/groups/${siblingId}`)).set('Origin', origin)
      .send({ course_ids: [courseA.id] }).expect(400);
    await request(server()).put(url(`/groups/${siblingId}/members`)).set('Origin', origin)
      .send({ course_ids: [courseB.id] }).expect(200);
    await request(server()).delete(url(`/groups/${siblingId}`)).set('Origin', origin).expect(200);

    // Liên kết cố định sau khi tạo; thành viên mới vẫn phải thuộc khối gốc.
    await request(server()).patch(url(`/groups/${childId}`)).set('Origin', origin)
      .send({ parent_group_id: null }).expect(400);
    await request(server()).put(url(`/groups/${childId}/members`)).set('Origin', origin)
      .send({ course_ids: [randomUUID()] }).expect(400);

    // Khối gốc lên trước trong danh sách nhóm.
    const groups = await request(server()).get(url('/groups')).expect(200);
    const order = groups.body.data.map((row: { specialization_id: string | null }) => row.specialization_id);
    expect(order[order.length - 1]).toBe(specializationId);
    expect(order.slice(0, -1).every((value: string | null) => value === null)).toBe(true);

    // Thu hẹp khối gốc thì khối chuyên ngành mất các môn không còn trong khối gốc.
    await request(server()).put(url(`/groups/${groupId}/members`)).set('Origin', origin)
      .send({ course_ids: [courseB.id] }).expect(200);
    const listed = await request(server()).get(url('/specializations')).expect(200);
    expect(listed.body.data).toHaveLength(1);
    expect(listed.body.data[0].groups.map((row: { id: string }) => row.id)).toEqual([childId]);
    expect(listed.body.data[0].groups[0].members).toHaveLength(0);
    await request(server()).put(url(`/groups/${groupId}/members`)).set('Origin', origin)
      .send({ course_ids: [courseA.id, courseB.id] }).expect(200);

    const patched = await request(server()).patch(url(`/specializations/${specializationId}`)).set('Origin', origin)
      .send({ description: 'Chọn đủ 5 môn nhóm C trong danh sách' }).expect(200);
    expect(patched.body.data).toMatchObject({ code: 'CNPM', description: 'Chọn đủ 5 môn nhóm C trong danh sách' });

    // Xóa chuyên ngành kéo theo khối chuyên ngành, khối gốc giữ nguyên.
    await request(server()).delete(url(`/specializations/${specializationId}`)).set('Origin', origin).expect(200);
    await request(server()).get(url(`/groups/${childId}/members`)).expect(404);
    await request(server()).get(url(`/groups/${groupId}/members`)).expect(200);
  });

  it('manages descriptive course categories with free-form names', async () => {
    const created = await request(server()).post(url('/categories')).set('Origin', origin)
      .send({ name: 'Kinh tế - Chính trị - Xã hội - Luật', course_ids: [courseA.id] }).expect(201);
    expect(created.body.data).toMatchObject({ name: 'Kinh tế - Chính trị - Xã hội - Luật' });
    expect(created.body.data.members).toHaveLength(1);
    expect(created.body.data.members[0].course.code).toBe('CO2003');
    const categoryId = created.body.data.id;

    // Tên nhóm duy nhất trong chương trình, không phân biệt hoa thường.
    await request(server()).post(url('/categories')).set('Origin', origin)
      .send({ name: 'kinh tế - chính trị - xã hội - luật' }).expect(409);
    await request(server()).post(url('/categories')).set('Origin', origin).send({ name: '   ' }).expect(400);
    // Môn phải thuộc chương trình trước khi vào nhóm.
    await request(server()).post(url('/categories')).set('Origin', origin)
      .send({ name: 'Nhóm ngoài chương trình', course_ids: [randomUUID()] }).expect(400);

    // Đổi tên tự do (không bị giới hạn bởi enum) và thay toàn bộ môn của nhóm.
    const patched = await request(server()).patch(url(`/categories/${categoryId}`)).set('Origin', origin)
      .send({ name: 'Chính trị, Kinh tế, Văn hóa, Xã hội', course_ids: [courseA.id, courseB.id] }).expect(200);
    expect(patched.body.data.name).toBe('Chính trị, Kinh tế, Văn hóa, Xã hội');
    expect(patched.body.data.members.map((row: { course_id: string }) => row.course_id))
      .toEqual(expect.arrayContaining([courseA.id, courseB.id]));

    const list = await request(server()).get(url('/categories')).expect(200);
    expect(list.body.data).toHaveLength(1);

    await request(server()).delete(url(`/categories/${categoryId}`)).set('Origin', origin).expect(200);
    await request(server()).delete(url(`/categories/${categoryId}`)).set('Origin', origin).expect(404);
  });

  it('lets one course belong to several course categories', async () => {
    const first = await request(server()).post(url('/categories')).set('Origin', origin)
      .send({ name: 'Nhóm A', course_ids: [courseA.id] }).expect(201);
    const second = await request(server()).post(url('/categories')).set('Origin', origin)
      .send({ name: 'Nhóm B', course_ids: [courseA.id] }).expect(201);

    const list = await request(server()).get(url('/categories')).expect(200);
    const groupsOfA = list.body.data.filter((category: { members: { course_id: string }[] }) =>
      category.members.some(member => member.course_id === courseA.id));
    expect(groupsOfA.map((category: { name: string }) => category.name).sort()).toEqual(['Nhóm A', 'Nhóm B']);

    // Xoá một nhóm không ảnh hưởng nhóm còn lại.
    await request(server()).delete(url(`/categories/${first.body.data.id}`)).set('Origin', origin).expect(200);
    const remaining = await request(server()).get(url('/categories')).expect(200);
    expect(remaining.body.data.map((category: { name: string }) => category.name)).toEqual(['Nhóm B']);

    await request(server()).delete(url(`/categories/${second.body.data.id}`)).set('Origin', origin).expect(200);
  });

  it('replaces every course category of one course', async () => {
    const first = await request(server()).post(url('/categories')).set('Origin', origin)
      .send({ name: 'Nhóm C1' }).expect(201);
    const second = await request(server()).post(url('/categories')).set('Origin', origin)
      .send({ name: 'Nhóm C2' }).expect(201);

    const placed = await request(server()).put(url(`/courses/${courseA.id}/categories`)).set('Origin', origin)
      .send({ category_ids: [first.body.data.id, second.body.data.id] }).expect(200);
    expect(placed.body.data.map((row: { category_id: string }) => row.category_id))
      .toEqual(expect.arrayContaining([first.body.data.id, second.body.data.id]));

    const list = await request(server()).get(url('/categories')).expect(200);
    const names = list.body.data
      .filter((category: { members: { course_id: string }[] }) =>
        category.members.some(member => member.course_id === courseA.id))
      .map((category: { name: string }) => category.name)
      .sort();
    expect(names).toEqual(['Nhóm C1', 'Nhóm C2']);

    // Nhóm không thuộc chương trình bị từ chối.
    await request(server()).put(url(`/courses/${courseA.id}/categories`)).set('Origin', origin)
      .send({ category_ids: [randomUUID()] }).expect(400);

    // Mảng rỗng bỏ hết nhóm của môn.
    const cleared = await request(server()).put(url(`/courses/${courseA.id}/categories`)).set('Origin', origin)
      .send({ category_ids: [] }).expect(200);
    expect(cleared.body.data).toHaveLength(0);

    await request(server()).delete(url(`/categories/${first.body.data.id}`)).set('Origin', origin).expect(200);
    await request(server()).delete(url(`/categories/${second.body.data.id}`)).set('Origin', origin).expect(200);
  });

  it('replaces course relations', async () => {
    await request(server()).put(url(`/courses/${courseA.id}/relations`)).set('Origin', origin)
      .send({ prerequisite_course_ids: [], recommended_course_ids: [courseB.id] }).expect(200);

    const relations = await request(server()).get(url(`/courses/${courseA.id}/relations`)).expect(200);
    expect(relations.body.data).toHaveLength(1);
    expect(relations.body.data[0]).toMatchObject({
      course_code: 'CO2003', related_course_code: 'CO2013', type: 'recommended',
    });

    await request(server()).put(url(`/courses/${courseA.id}/relations`)).set('Origin', origin)
      .send({ prerequisite_course_ids: [courseB.id] }).expect(200);
    const all = await request(server()).get(url('/relations')).expect(200);
    expect(all.body.data.map((row: { type: string }) => row.type).sort()).toEqual(['prerequisite', 'recommended']);

    // HT và SHT: cùng một cặp môn có thể mang nhiều loại; trường không gửi giữ nguyên.
    await request(server()).put(url(`/courses/${courseA.id}/relations`)).set('Origin', origin)
      .send({ prior_course_ids: [courseB.id], corequisite_course_ids: [courseB.id] }).expect(200);
    const four = await request(server()).get(url(`/courses/${courseA.id}/relations`)).expect(200);
    expect(four.body.data.map((row: { type: string }) => row.type).sort())
      .toEqual(['corequisite', 'prerequisite', 'prior', 'recommended']);

    const cleared = await request(server()).put(url(`/courses/${courseA.id}/relations`)).set('Origin', origin)
      .send({ prior_course_ids: [], corequisite_course_ids: [] }).expect(200);
    expect(cleared.body.data.map((row: { type: string }) => row.type).sort()).toEqual(['prerequisite', 'recommended']);
  });

  it('lists opened semesters of curriculum courses only', async () => {
    await openedSemesters.save([
      { course_id: courseA.id, semester_code: '252' },
      { course_id: courseA.id, semester_code: '241' },
      { course_id: outsider.id, semester_code: '251' },
    ]);
    const response = await request(server()).get(url('/opened-semesters')).expect(200);
    expect(response.body.data).toEqual([
      { course_id: courseA.id, semester_code: '241' },
      { course_id: courseA.id, semester_code: '252' },
    ]);
  });

  it('manages regulations', async () => {
    const created = await request(server()).post(url('/regulations')).set('Origin', origin)
      .send({ name: 'Chuẩn ngoại ngữ đầu ra' }).expect(201);
    expect(created.body.data.detail).toBeNull();
    regulationId = created.body.data.id;

    const patched = await request(server()).patch(url(`/regulations/${regulationId}`)).set('Origin', origin)
      .send({ detail: 'Đạt B1' }).expect(200);
    expect(patched.body.data.detail).toBe('Đạt B1');

    const list = await request(server()).get(url('/regulations')).expect(200);
    expect(list.body.data).toHaveLength(1);
    await request(server()).delete(url(`/regulations/${regulationId}`)).set('Origin', origin).expect(200);
    await request(server()).delete(url(`/regulations/${regulationId}`)).set('Origin', origin).expect(404);
  });

  it('removes a course from the curriculum together with its group member row', async () => {
    await request(server()).delete(url(`/courses/${courseB.id}`)).set('Origin', origin).expect(200);
    const groups = await request(server()).get(url('/groups')).expect(200);
    const group = groups.body.data.find((row: { id: string }) => row.id === groupId);
    expect(group.members.map((row: { course_id: string }) => row.course_id)).toEqual([courseA.id]);
    const relations = await request(server()).get(url('/relations')).expect(200);
    expect(relations.body.data.every((row: { related_course_id: string }) => row.related_course_id !== courseB.id)).toBe(true);
  });

  it('deletes the curriculum and all of its children', async () => {
    await request(server()).delete(`/api/curricula/${curriculumId}`).set('Origin', origin).expect(200);
    await request(server()).get(`/api/curricula/${curriculumId}`).expect(404);
    await request(server()).get(url('/groups')).expect(404);
  });
});
