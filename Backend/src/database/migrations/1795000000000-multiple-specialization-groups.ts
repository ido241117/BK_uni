import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cho một chuyên ngành thu hẹp cùng một khối gốc bằng **nhiều** khối con.
 *
 * Ví dụ ngành Quản lý Công nghiệp: khối gốc "Nhóm B" chọn 15 TC trong 27 môn; chuyên ngành
 * Chuỗi cung ứng cần 3 môn bắt buộc **và** 6 TC trong 6 môn khác -> hai khối con trên cùng
 * khối gốc. Ràng buộc unique (specialization_id, parent_group_id) cũ chặn trường hợp này.
 * Việc các khối con anh em không trùng môn do service kiểm tra.
 */
export class MultipleSpecializationGroups1795000000000 implements MigrationInterface {
  name = 'MultipleSpecializationGroups1795000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE ${this.table(queryRunner)} DROP CONSTRAINT "UQ_course_group_specialization_parent"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = this.table(queryRunner);
    // Giữ khối con tạo sớm nhất của mỗi cặp chuyên ngành/khối gốc, bỏ các khối con thêm sau.
    await queryRunner.query(
      `DELETE FROM ${table} AS g USING ${table} AS keep ` +
      `WHERE g."specialization_id" IS NOT NULL ` +
      `AND keep."specialization_id" = g."specialization_id" AND keep."parent_group_id" = g."parent_group_id" ` +
      `AND (keep."created_at", keep."id") < (g."created_at", g."id")`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table} ADD CONSTRAINT "UQ_course_group_specialization_parent" ` +
      `UNIQUE ("specialization_id", "parent_group_id")`,
    );
  }

  private table(queryRunner: QueryRunner): string {
    const options = queryRunner.connection.options;
    const schema = 'schema' in options ? options.schema ?? 'public' : 'public';
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Invalid database schema');
    return `"${schema}"."course_groups"`;
  }
}
