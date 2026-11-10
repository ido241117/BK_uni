import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bảng đề cương môn học nhập từ nguồn ngoài (định dạng bkuni.course-outlines).
 *
 * Cố ý tách khỏi dữ liệu hệ thống: không có khóa ngoại tới `courses` (nối bằng mã môn, nên đề cương của
 * môn chưa có trong danh mục vẫn được lưu) và điều kiện môn của đề cương nằm ở bảng riêng, không ghi đè
 * `course_relations`.
 */
export class CourseOutlines1795200000000 implements MigrationInterface {
  name = 'CourseOutlines1795200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schema(queryRunner);
    const table = (name: string) => `${schema}."${name}"`;
    const base =
      `"id" uuid NOT NULL DEFAULT gen_random_uuid(), ` +
      `"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
      `"updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
      `"updated_by" uuid, `;

    await queryRunner.query(
      `CREATE TABLE ${table('course_outline_imports')} (${base}` +
      `"created_by" uuid, ` +
      `"channel" character varying(10) NOT NULL, ` +
      `"format_version" integer NOT NULL, ` +
      `"source" character varying(500), ` +
      `"generated_at" TIMESTAMP WITH TIME ZONE, ` +
      `"part" integer, "parts" integer, ` +
      `"received" integer NOT NULL, "created" integer NOT NULL, "updated" integer NOT NULL, ` +
      `"unchanged" integer NOT NULL, "skipped" integer NOT NULL, ` +
      `"issues" jsonb NOT NULL DEFAULT '[]', ` +
      `CONSTRAINT "PK_course_outline_imports" PRIMARY KEY ("id"), ` +
      `CONSTRAINT "CHK_outline_import_channel" CHECK ("channel" IN ('api', 'cli')), ` +
      `CONSTRAINT "FK_outline_import_user" FOREIGN KEY ("created_by") REFERENCES ${table('users')}("id") ON DELETE SET NULL)`,
    );

    await queryRunner.query(
      `CREATE TABLE ${table('course_outlines')} (${base}` +
      `"course_code" character varying(50) NOT NULL, ` +
      `"version" character varying(20) NOT NULL, ` +
      `"applies_from" character varying(3), ` +
      `"source_id" character varying(50), ` +
      `"source_code" character varying(100), ` +
      `"source_updated_at" TIMESTAMP WITH TIME ZONE, ` +
      `"name_vi" character varying(500), "name_en" character varying(500), ` +
      `"credits" double precision, ` +
      `"level_code" character varying(20), "course_type_code" character varying(20), "faculty_code" character varying(20), ` +
      `"content" jsonb NOT NULL, ` +
      `"content_hash" character varying(64) NOT NULL, ` +
      `"import_id" uuid, ` +
      `CONSTRAINT "PK_course_outlines" PRIMARY KEY ("id"), ` +
      `CONSTRAINT "UQ_course_outline_version" UNIQUE ("course_code", "version"), ` +
      `CONSTRAINT "CHK_course_outline_code_upper" CHECK ("course_code" = upper("course_code")), ` +
      `CONSTRAINT "CHK_course_outline_applies_from" CHECK ("applies_from" IS NULL OR "applies_from" ~ '^[0-9]{2}[123]$'), ` +
      `CONSTRAINT "FK_course_outline_import" FOREIGN KEY ("import_id") REFERENCES ${table('course_outline_imports')}("id") ON DELETE SET NULL)`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_course_outline_code" ON ${table('course_outlines')} ("course_code", "applies_from")`);

    await queryRunner.query(
      `CREATE TABLE ${table('course_outline_prerequisites')} (${base}` +
      `"outline_id" uuid NOT NULL, ` +
      `"type" character varying(20), ` +
      `"type_raw" character varying(20), ` +
      `"related_course_code" character varying(50) NOT NULL, ` +
      `CONSTRAINT "PK_course_outline_prerequisites" PRIMARY KEY ("id"), ` +
      `CONSTRAINT "CHK_outline_prerequisite_type" CHECK ("type" IS NULL OR "type" IN ('prerequisite', 'prior', 'corequisite', 'recommended')), ` +
      `CONSTRAINT "FK_outline_prerequisite_outline" FOREIGN KEY ("outline_id") REFERENCES ${table('course_outlines')}("id") ON DELETE CASCADE)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_outline_prerequisite_outline" ON ${table('course_outline_prerequisites')} ("outline_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schema(queryRunner);
    await queryRunner.query(`DROP TABLE ${schema}."course_outline_prerequisites"`);
    await queryRunner.query(`DROP TABLE ${schema}."course_outlines"`);
    await queryRunner.query(`DROP TABLE ${schema}."course_outline_imports"`);
  }

  private schema(queryRunner: QueryRunner): string {
    const options = queryRunner.connection.options;
    const schema = 'schema' in options ? options.schema ?? 'public' : 'public';
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Invalid database schema');
    return `"${schema}"`;
  }
}
