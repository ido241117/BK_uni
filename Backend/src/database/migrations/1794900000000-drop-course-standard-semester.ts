import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bỏ năm/học kỳ chuẩn khỏi danh mục môn dùng chung.
 *
 * Vị trí năm/kỳ của một môn phụ thuộc từng chương trình nên đã nằm ở
 * `curriculum_courses.recommended_year/term`; hai cột trên `courses` trùng ý nghĩa,
 * không được đọc ở đâu và chưa có dữ liệu.
 */
export class DropCourseStandardSemester1794900000000 implements MigrationInterface {
  name = 'DropCourseStandardSemester1794900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE ${this.table(queryRunner)} DROP COLUMN "standard_year", DROP COLUMN "standard_term"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE ${this.table(queryRunner)} ADD COLUMN "standard_year" integer, ADD COLUMN "standard_term" integer`,
    );
  }

  private table(queryRunner: QueryRunner): string {
    const options = queryRunner.connection.options;
    const schema = 'schema' in options ? options.schema ?? 'public' : 'public';
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Invalid database schema');
    return `"${schema}"."courses"`;
  }
}
