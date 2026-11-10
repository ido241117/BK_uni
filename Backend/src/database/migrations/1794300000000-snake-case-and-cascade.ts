import { MigrationInterface, QueryRunner } from 'typeorm';

type Rename = [table: string, from: string, to: string];

type ForeignKey = {
  table: string;
  constraint: string;
  columns: string[];
  referencedTable: string;
  referencedColumns: string[];
  onDelete: 'CASCADE' | 'SET NULL';
};

const BASE_COLUMNS = ['createdAt', 'updatedAt', 'updatedBy'];
const BASE_COLUMN_NAMES = ['created_at', 'updated_at', 'updated_by'];
const BASE_TABLES = [
  'users', 'auth_sessions', 'courses', 'course_opened_semesters', 'curricula', 'curriculum_courses',
  'course_groups', 'course_group_members', 'course_relations', 'curriculum_regulations',
  'student_profiles', 'student_courses', 'student_plan_courses', 'student_regulation_statuses',
];

const RENAMES: Rename[] = [
  ['auth_sessions', 'userId', 'user_id'],
  ['auth_sessions', 'expiresAt', 'expires_at'],
  ['course_opened_semesters', 'courseId', 'course_id'],
  ['course_opened_semesters', 'semesterCode', 'semester_code'],
  ['curricula', 'durationYears', 'duration_years'],
  ['curricula', 'minSemesterCredits', 'min_semester_credits'],
  ['curricula', 'maxSemesterCredits', 'max_semester_credits'],
  ['curriculum_courses', 'curriculumId', 'curriculum_id'],
  ['curriculum_courses', 'courseId', 'course_id'],
  ['curriculum_courses', 'recommendedYear', 'recommended_year'],
  ['curriculum_courses', 'recommendedTerm', 'recommended_term'],
  ['course_groups', 'curriculumId', 'curriculum_id'],
  ['course_groups', 'requiredCount', 'required_count'],
  ['course_group_members', 'curriculumId', 'curriculum_id'],
  ['course_group_members', 'groupId', 'group_id'],
  ['course_group_members', 'courseId', 'course_id'],
  ['course_relations', 'curriculumId', 'curriculum_id'],
  ['course_relations', 'courseId', 'course_id'],
  ['course_relations', 'relatedCourseId', 'related_course_id'],
  ['curriculum_regulations', 'curriculumId', 'curriculum_id'],
  ['student_profiles', 'userId', 'user_id'],
  ['student_profiles', 'fullName', 'full_name'],
  ['student_profiles', 'studentNumber', 'student_number'],
  ['student_profiles', 'birthDate', 'birth_date'],
  ['student_profiles', 'admissionYear', 'admission_year'],
  ['student_profiles', 'curriculumId', 'curriculum_id'],
  ['student_profiles', 'creditTarget', 'credit_target'],
  ['student_courses', 'userId', 'user_id'],
  ['student_courses', 'courseId', 'course_id'],
  ['student_plan_courses', 'userId', 'user_id'],
  ['student_plan_courses', 'curriculumId', 'curriculum_id'],
  ['student_plan_courses', 'courseId', 'course_id'],
  ['student_plan_courses', 'semesterCode', 'semester_code'],
  ['student_regulation_statuses', 'userId', 'user_id'],
  ['student_regulation_statuses', 'regulationId', 'regulation_id'],
];

const CHECKS: [table: string, constraint: string][] = [
  ['courses', 'CHK_courses_credits'],
  ['course_opened_semesters', 'CHK_course_opened_semester_code'],
  ['curricula', 'CHK_curricula_credit_limits'],
  ['curricula', 'CHK_curricula_cohort'],
  ['curricula', 'CHK_curricula_duration'],
  ['curriculum_courses', 'CHK_curriculum_course_term'],
  ['curriculum_courses', 'CHK_curriculum_course_year'],
  ['course_groups', 'CHK_course_group_count'],
  ['course_relations', 'CHK_course_relation_distinct'],
  ['student_profiles', 'CHK_student_profile_credit_target'],
  ['student_profiles', 'CHK_student_profile_admission_year'],
  ['student_plan_courses', 'CHK_student_plan_semester_code'],
];

const FOREIGN_KEYS: ForeignKey[] = [
  { table: 'course_opened_semesters', constraint: 'FK_opened_semester_course', columns: ['course_id'], referencedTable: 'courses', referencedColumns: ['id'], onDelete: 'CASCADE' },
  { table: 'curriculum_courses', constraint: 'FK_curriculum_course_curriculum', columns: ['curriculum_id'], referencedTable: 'curricula', referencedColumns: ['id'], onDelete: 'CASCADE' },
  { table: 'curriculum_courses', constraint: 'FK_curriculum_course_course', columns: ['course_id'], referencedTable: 'courses', referencedColumns: ['id'], onDelete: 'CASCADE' },
  { table: 'course_groups', constraint: 'FK_course_group_curriculum', columns: ['curriculum_id'], referencedTable: 'curricula', referencedColumns: ['id'], onDelete: 'CASCADE' },
  { table: 'course_group_members', constraint: 'FK_group_member_group', columns: ['group_id', 'curriculum_id'], referencedTable: 'course_groups', referencedColumns: ['id', 'curriculum_id'], onDelete: 'CASCADE' },
  { table: 'course_group_members', constraint: 'FK_group_member_assignment', columns: ['curriculum_id', 'course_id'], referencedTable: 'curriculum_courses', referencedColumns: ['curriculum_id', 'course_id'], onDelete: 'CASCADE' },
  { table: 'course_relations', constraint: 'FK_course_relation_course', columns: ['curriculum_id', 'course_id'], referencedTable: 'curriculum_courses', referencedColumns: ['curriculum_id', 'course_id'], onDelete: 'CASCADE' },
  { table: 'course_relations', constraint: 'FK_course_relation_related', columns: ['curriculum_id', 'related_course_id'], referencedTable: 'curriculum_courses', referencedColumns: ['curriculum_id', 'course_id'], onDelete: 'CASCADE' },
  { table: 'curriculum_regulations', constraint: 'FK_regulation_curriculum', columns: ['curriculum_id'], referencedTable: 'curricula', referencedColumns: ['id'], onDelete: 'CASCADE' },
  { table: 'student_profiles', constraint: 'FK_student_profile_user', columns: ['user_id'], referencedTable: 'users', referencedColumns: ['id'], onDelete: 'CASCADE' },
  { table: 'student_profiles', constraint: 'FK_student_profile_curriculum', columns: ['curriculum_id'], referencedTable: 'curricula', referencedColumns: ['id'], onDelete: 'SET NULL' },
  { table: 'student_courses', constraint: 'FK_student_course_user', columns: ['user_id'], referencedTable: 'users', referencedColumns: ['id'], onDelete: 'CASCADE' },
  { table: 'student_courses', constraint: 'FK_student_course_course', columns: ['course_id'], referencedTable: 'courses', referencedColumns: ['id'], onDelete: 'CASCADE' },
  { table: 'student_plan_courses', constraint: 'FK_student_plan_user', columns: ['user_id'], referencedTable: 'users', referencedColumns: ['id'], onDelete: 'CASCADE' },
  { table: 'student_plan_courses', constraint: 'FK_student_plan_assignment', columns: ['curriculum_id', 'course_id'], referencedTable: 'curriculum_courses', referencedColumns: ['curriculum_id', 'course_id'], onDelete: 'CASCADE' },
  { table: 'student_regulation_statuses', constraint: 'FK_student_regulation_user', columns: ['user_id'], referencedTable: 'users', referencedColumns: ['id'], onDelete: 'CASCADE' },
  { table: 'student_regulation_statuses', constraint: 'FK_student_regulation_regulation', columns: ['regulation_id'], referencedTable: 'curriculum_regulations', referencedColumns: ['id'], onDelete: 'CASCADE' },
];

const LOCAL_CHECKS: [table: string, constraint: string, expression: string][] = [
  ['courses', 'CHK_courses_credits', '"credits" > 0'],
  ['course_opened_semesters', 'CHK_course_opened_semester_code', `"semester_code" ~ '^[0-9]{2}[123]$'`],
  ['curricula', 'CHK_curricula_duration', '"duration_years" > 0'],
  ['curricula', 'CHK_curricula_cohort', '"cohort" BETWEEN 2000 AND 2099'],
  ['curricula', 'CHK_curricula_credit_limits', '"min_semester_credits" >= 0 AND "max_semester_credits" >= "min_semester_credits"'],
  ['curriculum_courses', 'CHK_curriculum_course_year', '"recommended_year" > 0'],
  ['curriculum_courses', 'CHK_curriculum_course_term', '"recommended_term" IN (1, 2, 3)'],
  ['course_groups', 'CHK_course_group_count', '"required_count" > 0'],
  ['course_relations', 'CHK_course_relation_distinct', '"course_id" <> "related_course_id"'],
  ['student_profiles', 'CHK_student_profile_admission_year', '"admission_year" IS NULL OR "admission_year" BETWEEN 2000 AND 2099'],
  ['student_profiles', 'CHK_student_profile_credit_target', '"credit_target" IS NULL OR "credit_target" > 0'],
  ['student_plan_courses', 'CHK_student_plan_semester_code', `"semester_code" ~ '^[0-9]{2}[123]$'`],
];

/**
 * Chuyển toàn bộ cột sang snake_case, bỏ các CHECK constraint nghiệp vụ và đổi khóa ngoại
 * sang ON DELETE CASCADE để xóa cha tự xóa con. Schema không còn chặn dữ liệu đầu vào;
 * phần kiểm tra nghiệp vụ (nếu cần) do tầng service quyết định.
 */
export class SnakeCaseAndCascade1794300000000 implements MigrationInterface {
  name = 'SnakeCaseAndCascade1794300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schema(queryRunner);
    const table = (name: string) => `${schema}."${name}"`;

    for (const name of BASE_TABLES) {
      for (let index = 0; index < BASE_COLUMNS.length; index += 1) {
        await queryRunner.query(`ALTER TABLE ${table(name)} RENAME COLUMN "${BASE_COLUMNS[index]}" TO "${BASE_COLUMN_NAMES[index]}"`);
      }
    }

    for (const [name, from, to] of RENAMES) {
      await queryRunner.query(`ALTER TABLE ${table(name)} RENAME COLUMN "${from}" TO "${to}"`);
    }

    for (const [name, constraint] of CHECKS) {
      await queryRunner.query(`ALTER TABLE ${table(name)} DROP CONSTRAINT "${constraint}"`);
    }

    await queryRunner.query(`ALTER TABLE ${table('curriculum_regulations')} ALTER COLUMN "detail" DROP NOT NULL`);

    for (const key of FOREIGN_KEYS) {
      await queryRunner.query(`ALTER TABLE ${table(key.table)} DROP CONSTRAINT "${key.constraint}"`);
      await queryRunner.query(
        `ALTER TABLE ${table(key.table)} ADD CONSTRAINT "${key.constraint}" FOREIGN KEY (${this.columns(key.columns)}) ` +
        `REFERENCES ${table(key.referencedTable)} (${this.columns(key.referencedColumns)}) ON DELETE ${key.onDelete} ON UPDATE NO ACTION`,
      );
    }

    // Tên constraint do TypeORM sinh ra phụ thuộc tên cột, nên phải đổi theo sau khi rename.
    await queryRunner.query(`ALTER TABLE ${table('users')} RENAME CONSTRAINT "UQ_users_email" TO "UQ_97672ac88f789774dd47f7c8be3"`);
    await queryRunner.query(`ALTER TABLE ${table('student_profiles')} RENAME CONSTRAINT "REL_064d129936a1e821d637ee8c88" TO "REL_cef016a0d95e26ae7c0f167ec2"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schema(queryRunner);
    const table = (name: string) => `${schema}."${name}"`;

    await queryRunner.query(`ALTER TABLE ${table('student_profiles')} RENAME CONSTRAINT "REL_cef016a0d95e26ae7c0f167ec2" TO "REL_064d129936a1e821d637ee8c88"`);
    await queryRunner.query(`ALTER TABLE ${table('users')} RENAME CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" TO "UQ_users_email"`);

    for (const [name, constraint, expression] of LOCAL_CHECKS) {
      await queryRunner.query(`ALTER TABLE ${table(name)} ADD CONSTRAINT "${constraint}" CHECK (${expression})`);
    }

    await queryRunner.query(`UPDATE ${table('curriculum_regulations')} SET "detail" = '' WHERE "detail" IS NULL`);
    await queryRunner.query(`ALTER TABLE ${table('curriculum_regulations')} ALTER COLUMN "detail" SET NOT NULL`);

    for (const key of FOREIGN_KEYS) {
      await queryRunner.query(`ALTER TABLE ${table(key.table)} DROP CONSTRAINT "${key.constraint}"`);
      await queryRunner.query(
        `ALTER TABLE ${table(key.table)} ADD CONSTRAINT "${key.constraint}" FOREIGN KEY (${this.columns(key.columns)}) ` +
        `REFERENCES ${table(key.referencedTable)} (${this.columns(key.referencedColumns)}) ON DELETE RESTRICT ON UPDATE NO ACTION`,
      );
    }

    for (const [name, from, to] of [...RENAMES].reverse()) {
      await queryRunner.query(`ALTER TABLE ${table(name)} RENAME COLUMN "${to}" TO "${from}"`);
    }

    for (const name of BASE_TABLES) {
      for (let index = BASE_COLUMNS.length - 1; index >= 0; index -= 1) {
        await queryRunner.query(`ALTER TABLE ${table(name)} RENAME COLUMN "${BASE_COLUMN_NAMES[index]}" TO "${BASE_COLUMNS[index]}"`);
      }
    }
  }

  private columns(columns: string[]): string {
    return columns.map((column) => `"${column}"`).join(', ');
  }

  private schema(queryRunner: QueryRunner): string {
    const options = queryRunner.connection.options;
    const schema = 'schema' in options ? options.schema ?? 'public' : 'public';
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Invalid database schema');
    return `"${schema}"`;
  }
}
