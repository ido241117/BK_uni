import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bổ sung hai loại quan hệ môn theo ghi chú của kế hoạch giảng dạy:
 *
 * - `prior` (HT - học trước): môn liên quan phải **đã học**, rớt vẫn được.
 * - `corequisite` (SHT - song hành/trước): môn liên quan đã học trước hoặc học cùng học kỳ.
 *
 * Để xét được HT, trạng thái môn của sinh viên cần phân biệt "đã học nhưng rớt": thêm `failed`.
 */
export class PriorCorequisiteRelations1794800000000 implements MigrationInterface {
  name = 'PriorCorequisiteRelations1794800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schema(queryRunner);
    await queryRunner.query(`ALTER TYPE ${schema}."course_relation_type_enum" ADD VALUE IF NOT EXISTS 'prior'`);
    await queryRunner.query(`ALTER TYPE ${schema}."course_relation_type_enum" ADD VALUE IF NOT EXISTS 'corequisite'`);
    await queryRunner.query(`ALTER TYPE ${schema}."student_course_status_enum" ADD VALUE IF NOT EXISTS 'failed'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schema(queryRunner);
    const table = (name: string) => `${schema}."${name}"`;

    // Postgres không xóa được giá trị enum: bỏ dữ liệu dùng giá trị mới rồi dựng lại kiểu.
    await queryRunner.query(`DELETE FROM ${table('course_relations')} WHERE "type" IN ('prior', 'corequisite')`);
    await queryRunner.query(`ALTER TYPE ${schema}."course_relation_type_enum" RENAME TO "course_relation_type_enum_old"`);
    await queryRunner.query(`CREATE TYPE ${schema}."course_relation_type_enum" AS ENUM('prerequisite', 'recommended')`);
    await queryRunner.query(
      `ALTER TABLE ${table('course_relations')} ALTER COLUMN "type" TYPE ${schema}."course_relation_type_enum" ` +
      `USING "type"::text::${schema}."course_relation_type_enum"`,
    );
    await queryRunner.query(`DROP TYPE ${schema}."course_relation_type_enum_old"`);

    await queryRunner.query(`UPDATE ${table('student_courses')} SET "status" = 'not-started' WHERE "status" = 'failed'`);
    await queryRunner.query(`ALTER TABLE ${table('student_courses')} ALTER COLUMN "status" DROP DEFAULT`);
    await queryRunner.query(`ALTER TYPE ${schema}."student_course_status_enum" RENAME TO "student_course_status_enum_old"`);
    await queryRunner.query(
      `CREATE TYPE ${schema}."student_course_status_enum" AS ENUM('not-started', 'in-progress', 'completed')`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table('student_courses')} ALTER COLUMN "status" TYPE ${schema}."student_course_status_enum" ` +
      `USING "status"::text::${schema}."student_course_status_enum"`,
    );
    await queryRunner.query(`ALTER TABLE ${table('student_courses')} ALTER COLUMN "status" SET DEFAULT 'not-started'`);
    await queryRunner.query(`DROP TYPE ${schema}."student_course_status_enum_old"`);
  }

  private schema(queryRunner: QueryRunner): string {
    const options = queryRunner.connection.options;
    const schema = 'schema' in options ? options.schema ?? 'public' : 'public';
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Invalid database schema');
    return `"${schema}"`;
  }
}
