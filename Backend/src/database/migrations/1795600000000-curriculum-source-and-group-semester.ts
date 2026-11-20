import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Chương trình đào tạo lấy tự động từ API myBK (Scraper/curriculum/build-from-mybk.cjs) thay cho PDF.
 *
 * - `curricula.total_credits`: tổng tín chỉ tốt nghiệp khai báo trên myBK (để đối chiếu với tổng các khối).
 * - `curricula.specialization_required`: myBK mô hình chuyên ngành là CTĐT con cộng tín chỉ; khi không có
 *   chuyên ngành "chung" thì sinh viên phải đạt đúng một chuyên ngành mới đủ điều kiện tốt nghiệp.
 * - `curricula.source_*`: bản ghi nguồn (hệ thống, mã CTĐT, id, phiên bản) để đồng bộ lại đúng chỗ.
 * - `course_groups.recommended_year/term`: kỳ gợi ý bắt đầu học khối tự chọn (kế hoạch giảng dạy có xếp kỳ
 *   cho cả môn tự chọn; trước đây chỉ ghi được vào tên khối).
 */
export class CurriculumSourceAndGroupSemester1795600000000 implements MigrationInterface {
  name = 'CurriculumSourceAndGroupSemester1795600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const curricula = this.table(queryRunner, 'curricula');
    const groups = this.table(queryRunner, 'course_groups');
    await queryRunner.query(`
      ALTER TABLE ${curricula}
        ADD COLUMN "total_credits" integer,
        ADD COLUMN "specialization_required" boolean NOT NULL DEFAULT false,
        ADD COLUMN "source_system" character varying(20),
        ADD COLUMN "source_code" character varying(100),
        ADD COLUMN "source_id" integer,
        ADD COLUMN "source_version" character varying(100),
        ADD CONSTRAINT "CHK_curriculum_total_credits" CHECK ("total_credits" IS NULL OR "total_credits" > 0)
    `);
    await queryRunner.query(`
      ALTER TABLE ${groups}
        ADD COLUMN "recommended_year" integer,
        ADD COLUMN "recommended_term" integer,
        ADD CONSTRAINT "CHK_course_group_recommended_semester" CHECK (
          ("recommended_year" IS NULL) = ("recommended_term" IS NULL)
          AND ("recommended_year" IS NULL OR "recommended_year" >= 1)
          AND ("recommended_term" IS NULL OR "recommended_term" BETWEEN 1 AND 3)
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE ${this.table(queryRunner, 'course_groups')}
        DROP CONSTRAINT "CHK_course_group_recommended_semester",
        DROP COLUMN "recommended_term",
        DROP COLUMN "recommended_year"
    `);
    await queryRunner.query(`
      ALTER TABLE ${this.table(queryRunner, 'curricula')}
        DROP CONSTRAINT "CHK_curriculum_total_credits",
        DROP COLUMN "source_version",
        DROP COLUMN "source_id",
        DROP COLUMN "source_code",
        DROP COLUMN "source_system",
        DROP COLUMN "specialization_required",
        DROP COLUMN "total_credits"
    `);
  }

  private table(queryRunner: QueryRunner, name: string): string {
    const options = queryRunner.connection.options;
    const schema = 'schema' in options ? options.schema ?? 'public' : 'public';
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Invalid database schema');
    return `"${schema}"."${name}"`;
  }
}
