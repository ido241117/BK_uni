import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Chuyển "nhóm học phần" khỏi `courses` sang bảng riêng theo chương trình:
 *
 * - `course_categories`: tên nhóm do admin tự đặt (không hard-code enum), duy nhất
 *   trong một chương trình (so sánh không phân biệt hoa thường).
 * - `course_category_members`: môn thuộc một nhóm; môn phải có trong chương trình
 *   (`curriculum_courses`), xóa môn khỏi chương trình/nhóm sẽ tự xóa thành viên.
 * - Bảng mới chỉ mang tính mô tả, không có ràng buộc số môn/tín chỉ như `course_groups`.
 *
 * `courses.category` được bỏ vì cùng một môn có thể mang tên nhóm khác nhau ở từng chương trình.
 */
export class CourseCategories1794600000000 implements MigrationInterface {
  name = 'CourseCategories1794600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schema(queryRunner);
    const table = (name: string) => `${schema}."${name}"`;

    await queryRunner.query(
      `CREATE TABLE ${table('course_categories')} (` +
      `"id" uuid NOT NULL DEFAULT gen_random_uuid(), ` +
      `"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
      `"updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
      `"updated_by" uuid, ` +
      `"curriculum_id" uuid NOT NULL, ` +
      `"name" character varying(255) NOT NULL, ` +
      `CONSTRAINT "UQ_course_category_id_curriculum" UNIQUE ("id", "curriculum_id"), ` +
      `CONSTRAINT "PK_626794960514393da07e942f8d0" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `CREATE TABLE ${table('course_category_members')} (` +
      `"id" uuid NOT NULL DEFAULT gen_random_uuid(), ` +
      `"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
      `"updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
      `"updated_by" uuid, ` +
      `"curriculum_id" uuid NOT NULL, ` +
      `"category_id" uuid NOT NULL, ` +
      `"course_id" uuid NOT NULL, ` +
      `CONSTRAINT "UQ_course_category_member" UNIQUE ("category_id", "course_id"), ` +
      `CONSTRAINT "PK_33b8f85b60e4dd4b81c74326daa" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `ALTER TABLE ${table('course_categories')} ADD CONSTRAINT "FK_course_category_curriculum" ` +
      `FOREIGN KEY ("curriculum_id") REFERENCES ${table('curricula')} ("id") ` +
      `ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table('course_category_members')} ADD CONSTRAINT "FK_category_member_category" ` +
      `FOREIGN KEY ("category_id", "curriculum_id") REFERENCES ${table('course_categories')} ("id", "curriculum_id") ` +
      `ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table('course_category_members')} ADD CONSTRAINT "FK_category_member_assignment" ` +
      `FOREIGN KEY ("curriculum_id", "course_id") REFERENCES ${table('curriculum_courses')} ("curriculum_id", "course_id") ` +
      `ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_course_categories_name_lower" ON ${table('course_categories')} ` +
      `("curriculum_id", lower("name"))`,
    );

    // Nhóm học phần giờ thuộc chương trình, không còn là thuộc tính của môn dùng chung.
    await queryRunner.query(`ALTER TABLE ${table('courses')} DROP COLUMN "category"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schema(queryRunner);
    const table = (name: string) => `${schema}."${name}"`;

    await queryRunner.query(`ALTER TABLE ${table('courses')} ADD COLUMN "category" varchar(20)`);
    await queryRunner.query(`DROP TABLE ${table('course_category_members')}`);
    await queryRunner.query(`DROP TABLE ${table('course_categories')}`);
  }

  private schema(queryRunner: QueryRunner): string {
    const options = queryRunner.connection.options;
    const schema = 'schema' in options ? options.schema ?? 'public' : 'public';
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Invalid database schema');
    return `"${schema}"`;
  }
}
