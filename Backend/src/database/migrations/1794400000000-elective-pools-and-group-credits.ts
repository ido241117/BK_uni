import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Mô hình hoá lại yêu cầu của chương trình đào tạo:
 *
 * 1. `curriculum_courses.recommended_year/term` trở thành **tùy chọn** để một môn có thể thuộc
 *    chương trình mà chưa xếp kỳ (môn trong pool tự chọn rải rác nhiều học kỳ).
 * 2. `course_groups` có thêm `required_credits`, `pool_scope`, `pool_course_credits` để diễn đạt
 *    yêu cầu theo tín chỉ và khối "chọn gì cũng được".
 * 3. Bỏ ràng buộc "một môn chỉ thuộc một nhóm" (đổi sang unique trong từng nhóm) để một môn có thể
 *    nằm trong nhiều khối.
 * 4. `student_plan_courses` không còn bắt buộc môn phải thuộc chương trình, phục vụ tự chọn tự do
 *    (có thể lấy môn của chương trình khác).
 */
export class ElectivePoolsAndGroupCredits1794400000000 implements MigrationInterface {
  name = 'ElectivePoolsAndGroupCredits1794400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schema(queryRunner);
    const table = (name: string) => `${schema}."${name}"`;

    // 1. Vị trí khuyến nghị là tùy chọn.
    await queryRunner.query(
      `ALTER TABLE ${table('curriculum_courses')} ` +
      `ALTER COLUMN "recommended_year" DROP NOT NULL, ` +
      `ALTER COLUMN "recommended_term" DROP NOT NULL`,
    );

    // 2. Khối yêu cầu tính theo tín chỉ, có phạm vi môn.
    await queryRunner.query(
      `ALTER TABLE ${table('course_groups')} ` +
      `ALTER COLUMN "required_count" DROP NOT NULL, ` +
      `ADD COLUMN "required_credits" integer, ` +
      `ADD COLUMN "pool_scope" varchar(10) NOT NULL DEFAULT 'listed', ` +
      `ADD COLUMN "pool_course_credits" integer`,
    );

    // 3. Một môn được nằm trong nhiều khối, nhưng không lặp trong cùng một khối.
    await queryRunner.query(
      `ALTER TABLE ${table('course_group_members')} ` +
      `DROP CONSTRAINT "UQ_course_group_member_curriculum_course"`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table('course_group_members')} ` +
      `ADD CONSTRAINT "UQ_course_group_member_group" UNIQUE ("group_id", "course_id")`,
    );

    // 4. Kế hoạch học tập có thể chứa môn ngoài chương trình (tự chọn tự do).
    await queryRunner.query(
      `ALTER TABLE ${table('student_plan_courses')} DROP CONSTRAINT "FK_student_plan_assignment"`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table('student_plan_courses')} ` +
      `ADD CONSTRAINT "FK_student_plan_curriculum" FOREIGN KEY ("curriculum_id") ` +
      `REFERENCES ${table('curricula')} ("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table('student_plan_courses')} ` +
      `ADD CONSTRAINT "FK_student_plan_course_course" FOREIGN KEY ("course_id") ` +
      `REFERENCES ${table('courses')} ("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // 5. Dữ liệu cũ: môn thuộc khối tự chọn không còn kỳ khuyến nghị giả.
    await queryRunner.query(
      `UPDATE ${table('curriculum_courses')} cc ` +
      `SET "recommended_year" = NULL, "recommended_term" = NULL ` +
      `WHERE EXISTS (` +
      `SELECT 1 FROM ${table('course_group_members')} m ` +
      `JOIN ${table('course_groups')} g ON g."id" = m."group_id" ` +
      `WHERE m."curriculum_id" = cc."curriculum_id" AND m."course_id" = cc."course_id" ` +
      `AND g."kind" = 'elective')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schema(queryRunner);
    const table = (name: string) => `${schema}."${name}"`;

    // Trả dữ liệu về dạng cũ trước khi siết NOT NULL.
    await queryRunner.query(
      `UPDATE ${table('curriculum_courses')} ` +
      `SET "recommended_year" = COALESCE("recommended_year", 1), ` +
      `"recommended_term" = COALESCE("recommended_term", 1)`,
    );
    await queryRunner.query(
      `UPDATE ${table('course_groups')} ` +
      `SET "required_count" = COALESCE("required_count", 1)`,
    );

    await queryRunner.query(
      `ALTER TABLE ${table('curriculum_courses')} ` +
      `ALTER COLUMN "recommended_year" SET NOT NULL, ` +
      `ALTER COLUMN "recommended_term" SET NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE ${table('course_groups')} ` +
      `ALTER COLUMN "required_count" SET NOT NULL, ` +
      `DROP COLUMN "required_credits", ` +
      `DROP COLUMN "pool_scope", ` +
      `DROP COLUMN "pool_course_credits"`,
    );

    await queryRunner.query(
      `ALTER TABLE ${table('course_group_members')} DROP CONSTRAINT "UQ_course_group_member_group"`,
    );
    // Bản cũ chỉ cho một môn thuộc một nhóm: giữ lại một dòng trước khi dựng lại unique cũ.
    await queryRunner.query(
      `DELETE FROM ${table('course_group_members')} a USING ${table('course_group_members')} b ` +
      `WHERE a."ctid" > b."ctid" AND a."curriculum_id" = b."curriculum_id" AND a."course_id" = b."course_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table('course_group_members')} ` +
      `ADD CONSTRAINT "UQ_course_group_member_curriculum_course" UNIQUE ("curriculum_id", "course_id")`,
    );

    await queryRunner.query(
      `ALTER TABLE ${table('student_plan_courses')} DROP CONSTRAINT "FK_student_plan_course_course"`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table('student_plan_courses')} DROP CONSTRAINT "FK_student_plan_curriculum"`,
    );
    // Bản cũ bắt môn trong kế hoạch phải thuộc chương trình: bỏ các dòng không thoả trước khi dựng lại.
    await queryRunner.query(
      `DELETE FROM ${table('student_plan_courses')} p WHERE NOT EXISTS (` +
      `SELECT 1 FROM ${table('curriculum_courses')} cc ` +
      `WHERE cc."curriculum_id" = p."curriculum_id" AND cc."course_id" = p."course_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table('student_plan_courses')} ` +
      `ADD CONSTRAINT "FK_student_plan_assignment" FOREIGN KEY ("curriculum_id", "course_id") ` +
      `REFERENCES ${table('curriculum_courses')} ("curriculum_id", "course_id") ` +
      `ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  private schema(queryRunner: QueryRunner): string {
    const options = queryRunner.connection.options;
    const schema = 'schema' in options ? options.schema ?? 'public' : 'public';
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Invalid database schema');
    return `"${schema}"`;
  }
}
