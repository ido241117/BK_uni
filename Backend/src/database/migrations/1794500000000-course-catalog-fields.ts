import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bổ sung thông tin danh mục cho môn học: mô tả ngắn, nhóm học phần và vị trí chuẩn
 * (năm + học kỳ) trong chương trình. Tất cả đều tùy chọn:
 * - môn cũ vẫn hợp lệ khi chưa phân nhóm;
 * - môn tự chọn rải rác nhiều kỳ (chọn x trong y) để trống năm/kỳ chuẩn.
 */
export class CourseCatalogFields1794500000000 implements MigrationInterface {
  name = 'CourseCatalogFields1794500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = this.table(queryRunner);
    await queryRunner.query(
      `ALTER TABLE ${table} ` +
      `ADD COLUMN "description" varchar(255), ` +
      `ADD COLUMN "category" varchar(20), ` +
      `ADD COLUMN "standard_year" integer, ` +
      `ADD COLUMN "standard_term" integer`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = this.table(queryRunner);
    await queryRunner.query(
      `ALTER TABLE ${table} ` +
      `DROP COLUMN "description", ` +
      `DROP COLUMN "category", ` +
      `DROP COLUMN "standard_year", ` +
      `DROP COLUMN "standard_term"`,
    );
  }

  private table(queryRunner: QueryRunner): string {
    const options = queryRunner.connection.options;
    const schema = 'schema' in options ? options.schema ?? 'public' : 'public';
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Invalid database schema');
    return `"${schema}"."courses"`;
  }
}
