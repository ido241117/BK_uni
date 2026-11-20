import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nội dung file tiến độ myBK (PDF) đã đọc, mỗi tài khoản một dòng (T28, giai đoạn 9).
 * Dùng để hiện lại đúng trang tiến độ của myBK: khối, môn, đạt/chưa, điểm, ghi chú, điều kiện tốt nghiệp,
 * thông tin sinh viên. Tải file mới thì ghi đè dòng cũ. File gốc không được lưu.
 */
export class StudentProgressImports1795600000000 implements MigrationInterface {
  name = 'StudentProgressImports1795600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schema(queryRunner);
    const table = (name: string) => `${schema}."${name}"`;
    await queryRunner.query(`
      CREATE TABLE ${table('student_progress_imports')} (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_by" uuid,
        "user_id" uuid NOT NULL,
        "format" character varying(10) NOT NULL,
        "official_program_code" character varying(100),
        "source_updated_at" date,
        "data" jsonb NOT NULL,
        CONSTRAINT "PK_student_progress_imports" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_student_progress_import_user" UNIQUE ("user_id"),
        CONSTRAINT "FK_student_progress_import_user" FOREIGN KEY ("user_id")
          REFERENCES ${table('users')}("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE ${this.schema(queryRunner)}."student_progress_imports"`);
  }

  private schema(queryRunner: QueryRunner): string {
    const options = queryRunner.connection.options;
    const schema = 'schema' in options ? options.schema ?? 'public' : 'public';
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Invalid database schema');
    return `"${schema}"`;
  }
}
