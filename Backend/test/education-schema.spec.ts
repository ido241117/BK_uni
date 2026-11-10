import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { entities } from '../src/database/entities';
import { InitialAuth1700000000000 } from '../src/database/migrations/1700000000000-initial-auth';
import { EducationSchema1794213759571 } from '../src/database/migrations/1794213759571-education-schema';
import { SnakeCaseAndCascade1794300000000 } from '../src/database/migrations/1794300000000-snake-case-and-cascade';
import { ElectivePoolsAndGroupCredits1794400000000 } from '../src/database/migrations/1794400000000-elective-pools-and-group-credits';
import { CourseCatalogFields1794500000000 } from '../src/database/migrations/1794500000000-course-catalog-fields';
import { CourseCategories1794600000000 } from '../src/database/migrations/1794600000000-course-categories';
import { CurriculumSpecializations1794700000000 } from '../src/database/migrations/1794700000000-curriculum-specializations';
import { PriorCorequisiteRelations1794800000000 } from '../src/database/migrations/1794800000000-prior-corequisite-relations';
import { DropCourseStandardSemester1794900000000 } from '../src/database/migrations/1794900000000-drop-course-standard-semester';
import { MultipleSpecializationGroups1795000000000 } from '../src/database/migrations/1795000000000-multiple-specialization-groups';

const databaseUrl = process.env.BK_TEST_DATABASE_URL;

(databaseUrl ? describe : describe.skip)('Education schema on PostgreSQL', () => {
  let db: DataSource;
  const schema = `education_test_${randomUUID().replace(/-/g, '')}`;
  const table = (name: string) => `"${schema}"."${name}"`;
  const user = randomUUID();
  const curriculum = randomUUID();
  const otherCurriculum = randomUUID();
  const course = randomUUID();
  const otherCourse = randomUUID();
  const group = randomUUID();
  const otherGroup = randomUUID();
  const regulation = randomUUID();
  const category = randomUUID();

  beforeAll(async () => {
    if (!databaseUrl || new URL(databaseUrl).pathname !== '/bk_uni_test') {
      throw new Error('Tests require a dedicated bk_uni_test database');
    }
    db = await new DataSource({
      type: 'postgres', url: databaseUrl, schema, entities,
      migrations: [
        InitialAuth1700000000000,
        EducationSchema1794213759571,
        SnakeCaseAndCascade1794300000000,
        ElectivePoolsAndGroupCredits1794400000000,
        CourseCatalogFields1794500000000,
        CourseCategories1794600000000,
        CurriculumSpecializations1794700000000,
        PriorCorequisiteRelations1794800000000,
        DropCourseStandardSemester1794900000000,
        MultipleSpecializationGroups1795000000000,
      ],
      uuidExtension: 'pgcrypto', installExtensions: false,
    }).initialize();
    await db.query(`CREATE SCHEMA "${schema}"`);
    await db.runMigrations();
  });

  afterAll(async () => {
    if (db?.isInitialized) {
      await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await db.destroy();
    }
  });

  it('creates tables matching TypeORM entities', async () => {
    const diff = await db.driver.createSchemaBuilder().log();
    expect(diff.upQueries.map((item) => item.query)).toEqual([]);
  });

  it('uses snake_case column names', async () => {
    const rows: { column_name: string }[] = await db.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'student_profiles'`,
      [schema],
    );
    const columns = rows.map((row) => row.column_name);
    expect(columns).toEqual(expect.arrayContaining([
      'id', 'created_at', 'updated_at', 'updated_by', 'user_id', 'full_name', 'student_number',
      'phone', 'birth_date', 'admission_year', 'address', 'curriculum_id', 'credit_target',
    ]));
  });

  it('accepts profiles and learning data with valid relationships', async () => {
    await db.query(`INSERT INTO ${table('users')} ("id", "email", "password") VALUES ($1, 'student@example.com', 'hash')`, [user]);
    await db.query(`INSERT INTO ${table('student_profiles')} ("user_id") VALUES ($1)`, [user]);
    await db.query(`INSERT INTO ${table('curricula')} ("id", "code", "name", "major", "faculty", "cohort", "duration_years", "min_semester_credits", "max_semester_credits") VALUES ($1,'CS','CS','IT','IT',2023,4,1,18), ($2,'SE','SE','IT','IT',2023,4,1,18)`, [curriculum, otherCurriculum]);
    await db.query(`INSERT INTO ${table('courses')} ("id", "code", "name", "credits") VALUES ($1,'CO1','Course 1',3), ($2,'CO2','Course 2',3)`, [course, otherCourse]);
    await db.query(`INSERT INTO ${table('curriculum_courses')} ("curriculum_id","course_id","recommended_year","recommended_term") VALUES ($1,$2,2,1),($1,$3,2,2),($4,$2,1,1)`, [curriculum, course, otherCourse, otherCurriculum]);
    await db.query(`INSERT INTO ${table('course_groups')} ("id","curriculum_id","name","kind","required_count") VALUES ($1,$2,'Nhóm 1','required',1),($3,$2,'Nhóm 2','elective',1)`, [group, curriculum, otherGroup]);
    await db.query(`INSERT INTO ${table('course_group_members')} ("curriculum_id","group_id","course_id") VALUES ($1,$2,$3)`, [curriculum, group, course]);
    await db.query(`INSERT INTO ${table('course_relations')} ("curriculum_id","course_id","related_course_id","type") VALUES ($1,$2,$3,'prerequisite')`, [curriculum, course, otherCourse]);
    await db.query(`INSERT INTO ${table('course_opened_semesters')} ("course_id","semester_code") VALUES ($1,'261')`, [course]);
    await db.query(`INSERT INTO ${table('curriculum_regulations')} ("id","curriculum_id","name","detail") VALUES ($1,$2,'Ngoại ngữ','Quy định')`, [regulation, curriculum]);
    await db.query(`INSERT INTO ${table('student_courses')} ("user_id","course_id","status") VALUES ($1,$2,'in-progress')`, [user, course]);
    await db.query(`INSERT INTO ${table('student_plan_courses')} ("user_id","curriculum_id","course_id","semester_code") VALUES ($1,$2,$3,'262')`, [user, curriculum, course]);
    await db.query(`INSERT INTO ${table('student_regulation_statuses')} ("user_id","regulation_id","status") VALUES ($1,$2,'completed')`, [user, regulation]);
  });

  it('accepts input that used to be blocked by business checks', async () => {
    await db.query(`INSERT INTO ${table('courses')} ("code","name","credits") VALUES ('ZERO','Zero credits',0)`);
    await db.query(`INSERT INTO ${table('course_opened_semesters')} ("course_id","semester_code") VALUES ($1,'999')`, [course]);
    await db.query(`INSERT INTO ${table('curriculum_regulations')} ("curriculum_id","name","detail") VALUES ($1,'Không nội dung', NULL)`, [curriculum]);
    await db.query(`INSERT INTO ${table('course_relations')} ("curriculum_id","course_id","related_course_id","type") VALUES ($1,$2,$2,'recommended')`, [curriculum, course]);
    await db.query(`DELETE FROM ${table('course_relations')} WHERE "curriculum_id" = $1 AND "course_id" = $2 AND "related_course_id" = $2`, [curriculum, course]);
  });

  it('accepts elective pools: no fixed term, several groups per course, plan outside curriculum', async () => {
    // Môn thuộc chương trình nhưng chưa xếp kỳ (pool tự chọn).
    await db.query(
      `INSERT INTO ${table('curriculum_courses')} ("curriculum_id","course_id","recommended_year","recommended_term") VALUES ($1,$2,NULL,NULL)`,
      [curriculum, otherCourse],
    );
    // Cùng một môn được nằm ở hai nhóm khác nhau...
    await db.query(
      `INSERT INTO ${table('course_group_members')} ("curriculum_id","group_id","course_id") VALUES ($1,$2,$3)`,
      [curriculum, otherGroup, course],
    );
    // ...nhưng không lặp trong cùng một nhóm.
    await expect(db.query(
      `INSERT INTO ${table('course_group_members')} ("curriculum_id","group_id","course_id") VALUES ($1,$2,$3)`,
      [curriculum, otherGroup, course],
    )).rejects.toThrow();
    // Kế hoạch học tập có thể chứa môn ngoài chương trình (tự chọn tự do).
    await db.query(
      `INSERT INTO ${table('student_plan_courses')} ("user_id","curriculum_id","course_id","semester_code") VALUES ($1,$2,$3,'261')`,
      [user, otherCurriculum, otherCourse],
    );
  });

  it('rejects duplicate, invalid and cross-curriculum data', async () => {
    await expect(db.query(`INSERT INTO ${table('courses')} ("code","name","credits") VALUES ('co1','Duplicate',3)`)).rejects.toThrow();
    await expect(db.query(`INSERT INTO ${table('course_group_members')} ("curriculum_id","group_id","course_id") VALUES ($1,$2,$3)`, [otherCurriculum, group, course])).rejects.toThrow();
    await expect(db.query(`INSERT INTO ${table('course_relations')} ("curriculum_id","course_id","related_course_id","type") VALUES ($1,$2,$3,'prerequisite')`, [otherCurriculum, course, otherCourse])).rejects.toThrow();
    await expect(db.query(`INSERT INTO ${table('student_plan_courses')} ("user_id","curriculum_id","course_id","semester_code") VALUES ($1,$2,$3,'261')`, [user, randomUUID(), otherCourse])).rejects.toThrow();
    await expect(db.query(`INSERT INTO ${table('student_courses')} ("user_id","course_id","status") VALUES ($1,$2,'official')`, [user, otherCourse])).rejects.toThrow();
  });

  it('describes course categories per curriculum', async () => {
    await db.query(
      `INSERT INTO ${table('course_categories')} ("id","curriculum_id","name") ` +
      `VALUES ($1,$2,'Kinh tế - Chính trị - Xã hội - Luật')`,
      [category, curriculum],
    );
    await db.query(
      `INSERT INTO ${table('course_category_members')} ("curriculum_id","category_id","course_id") VALUES ($1,$2,$3)`,
      [curriculum, category, course],
    );
    // Tên nhóm duy nhất trong một chương trình, so sánh không phân biệt hoa thường...
    await expect(db.query(
      `INSERT INTO ${table('course_categories')} ("curriculum_id","name") ` +
      `VALUES ($1,'kinh tế - chính trị - xã hội - luật')`,
      [curriculum],
    )).rejects.toThrow();
    // ...nhưng chương trình khác được dùng lại đúng tên đó.
    await db.query(
      `INSERT INTO ${table('course_categories')} ("curriculum_id","name") ` +
      `VALUES ($1,'Kinh tế - Chính trị - Xã hội - Luật')`,
      [otherCurriculum],
    );
    // Môn trong nhóm phải thuộc đúng chương trình của nhóm.
    await expect(db.query(
      `INSERT INTO ${table('course_category_members')} ("curriculum_id","category_id","course_id") VALUES ($1,$2,$3)`,
      [otherCurriculum, category, otherCourse],
    )).rejects.toThrow();
  });

  it('deletes children when the parent row is removed', async () => {
    await db.query(`DELETE FROM ${table('courses')} WHERE "id" = $1`, [course]);
    const opened = await db.query(`SELECT 1 FROM ${table('course_opened_semesters')} WHERE "course_id" = $1`, [course]);
    const plans = await db.query(`SELECT 1 FROM ${table('student_plan_courses')} WHERE "course_id" = $1`, [course]);
    const members = await db.query(`SELECT 1 FROM ${table('course_group_members')} WHERE "course_id" = $1`, [course]);
    const categoryMembers = await db.query(`SELECT 1 FROM ${table('course_category_members')} WHERE "course_id" = $1`, [course]);
    expect(opened).toEqual([]);
    expect(plans).toEqual([]);
    expect(members).toEqual([]);
    expect(categoryMembers).toEqual([]);
  });

  it('can revert and reapply the latest migration', async () => {
    await db.undoLastMigration();
    const tables: { table_name: string }[] = await db.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ` +
      `AND table_name IN ('course_categories', 'course_category_members')`,
      [schema],
    );
    expect(tables).toHaveLength(0);
    await db.runMigrations();
    expect((await db.driver.createSchemaBuilder().log()).upQueries).toEqual([]);
  });
});
