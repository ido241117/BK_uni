import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Giới thiệu chương trình đào tạo lấy từ API myBK `v2/curriculums` (npm run curriculum:sync-profiles).
 *
 * - `curricula.name_en`: tên tiếng Anh của chương trình.
 * - `curricula.profile`: các đoạn giới thiệu (mô tả ngành, cơ hội việc làm, đối tượng tuyển sinh, quá trình đào tạo,
 *   cách đánh giá) theo `vi`/`en`, đã chuyển HTML của myBK sang văn bản thuần.
 * - `curricula.profile_source_code`: mã CTĐT myBK cung cấp `profile`. Khác `source_code` khi bản ghi gốc không có
 *   phần giới thiệu (CTĐT khóa 2023 kiểu cũ) và phải mượn từ khóa gần nhất cùng ngành.
 * - `curricula.source_synced_at`: thời điểm myBK đồng bộ bản ghi gốc lần cuối (`lastSyncedAt`).
 */
export class CurriculumProfile1795700000000 implements MigrationInterface {
  name = 'CurriculumProfile1795700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE ${this.table(queryRunner, 'curricula')}
        ADD COLUMN "name_en" character varying(255),
        ADD COLUMN "profile" jsonb,
        ADD COLUMN "profile_source_code" character varying(100),
        ADD COLUMN "source_synced_at" TIMESTAMP WITH TIME ZONE,
        ADD CONSTRAINT "CHK_curriculum_profile_object" CHECK ("profile" IS NULL OR jsonb_typeof("profile") = 'object')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE ${this.table(queryRunner, 'curricula')}
        DROP CONSTRAINT "CHK_curriculum_profile_object",
        DROP COLUMN "source_synced_at",
        DROP COLUMN "profile_source_code",
        DROP COLUMN "profile",
        DROP COLUMN "name_en"
    `);
  }

  private table(queryRunner: QueryRunner, name: string): string {
    const options = queryRunner.connection.options;
    const schema = 'schema' in options ? options.schema ?? 'public' : 'public';
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Invalid database schema');
    return `"${schema}"."${name}"`;
  }
}
