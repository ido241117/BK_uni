import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tối ưu lưu trữ (báo cáo mục 4.1, kịch bản đo ở db-lab/sql/41-storage.sql).
 *
 * - `course_outlines.content` chuyển thuật toán nén TOAST từ pglz sang lz4: đọc khóa JSONB nhanh hơn ~3 lần,
 *   dung lượng chỉ tăng ~3%. SET COMPRESSION chỉ áp cho giá trị ghi mới nên phải ghi lại toàn bộ cột
 *   (`content::text::jsonb` buộc PostgreSQL giải nén rồi nén lại; sao chép thẳng datum thì giữ nguyên pglz).
 * - FILLFACTOR 90 cho các bảng sinh viên cập nhật liên tục: chừa chỗ trống trên mỗi trang để UPDATE được ghi
 *   theo kiểu HOT (không phải sửa index).
 * - Ràng buộc CHECK cho các miền giá trị đang chỉ được kiểm ở tầng ứng dụng.
 * - Thu thập lại thống kê cho planner (bảng `courses` đang ước lượng 1.886 dòng trong khi có 5.328).
 */
export class StorageTuning1795300000000 implements MigrationInterface {
  name = 'StorageTuning1795300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const t = (name: string) => `${this.schema(queryRunner)}."${name}"`;

    await queryRunner.query(`ALTER TABLE ${t('course_outlines')} ALTER COLUMN "content" SET COMPRESSION lz4`);
    await queryRunner.query(`UPDATE ${t('course_outlines')} SET "content" = "content"::text::jsonb`);

    for (const table of ['student_courses', 'student_plan_courses', 'student_regulation_statuses']) {
      await queryRunner.query(`ALTER TABLE ${t(table)} SET (fillfactor = 90)`);
    }

    const semester = `'^[0-9]{2}[123]$'`;
    await queryRunner.query(
      `ALTER TABLE ${t('courses')} ADD CONSTRAINT "CHK_course_credits" CHECK ("credits" BETWEEN 0 AND 60)`,
    );
    await queryRunner.query(
      `ALTER TABLE ${t('course_opened_semesters')} ADD CONSTRAINT "CHK_opened_semester_code" ` +
      `CHECK ("semester_code" ~ ${semester})`,
    );
    await queryRunner.query(
      `ALTER TABLE ${t('student_plan_courses')} ADD CONSTRAINT "CHK_plan_semester_code" ` +
      `CHECK ("semester_code" ~ ${semester})`,
    );
    await queryRunner.query(
      `ALTER TABLE ${t('curriculum_courses')} ADD CONSTRAINT "CHK_curriculum_course_recommended" ` +
      `CHECK (("recommended_year" IS NULL OR "recommended_year" BETWEEN 1 AND 10) ` +
      `AND ("recommended_term" IS NULL OR "recommended_term" BETWEEN 1 AND 3))`,
    );

    for (const table of ['courses', 'curriculum_courses', 'course_opened_semesters', 'course_outlines']) {
      await queryRunner.query(`ANALYZE ${t(table)}`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const t = (name: string) => `${this.schema(queryRunner)}."${name}"`;
    await queryRunner.query(`ALTER TABLE ${t('curriculum_courses')} DROP CONSTRAINT "CHK_curriculum_course_recommended"`);
    await queryRunner.query(`ALTER TABLE ${t('student_plan_courses')} DROP CONSTRAINT "CHK_plan_semester_code"`);
    await queryRunner.query(`ALTER TABLE ${t('course_opened_semesters')} DROP CONSTRAINT "CHK_opened_semester_code"`);
    await queryRunner.query(`ALTER TABLE ${t('courses')} DROP CONSTRAINT "CHK_course_credits"`);
    for (const table of ['student_courses', 'student_plan_courses', 'student_regulation_statuses']) {
      await queryRunner.query(`ALTER TABLE ${t(table)} RESET (fillfactor)`);
    }
    await queryRunner.query(`ALTER TABLE ${t('course_outlines')} ALTER COLUMN "content" SET COMPRESSION pglz`);
  }

  private schema(queryRunner: QueryRunner): string {
    const options = queryRunner.connection.options;
    const schema = 'schema' in options ? options.schema ?? 'public' : 'public';
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Invalid database schema');
    return `"${schema}"`;
  }
}
