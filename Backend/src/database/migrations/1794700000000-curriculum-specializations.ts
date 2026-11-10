import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Chuyên ngành (không bắt buộc) của chương trình đào tạo.
 *
 * - `curriculum_specializations`: danh sách chuyên ngành, mã duy nhất trong chương trình.
 * - `course_groups.specialization_id` + `parent_group_id`: khối chuyên ngành thu hẹp một khối gốc
 *   (ví dụ nhóm C 5/44 môn -> nhóm C của CNPM 5/9 môn). Hai cột cùng có hoặc cùng `null`;
 *   khối gốc (`null`) mới tính vào chuẩn tốt nghiệp, khối chuyên ngành không cộng tín chỉ.
 * - `student_profiles.target_specialization_id`: chuyên ngành sinh viên hướng tới.
 */
export class CurriculumSpecializations1794700000000 implements MigrationInterface {
  name = 'CurriculumSpecializations1794700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schema(queryRunner);
    const table = (name: string) => `${schema}."${name}"`;

    await queryRunner.query(
      `CREATE TABLE ${table('curriculum_specializations')} (` +
      `"id" uuid NOT NULL DEFAULT gen_random_uuid(), ` +
      `"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
      `"updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
      `"updated_by" uuid, ` +
      `"curriculum_id" uuid NOT NULL, ` +
      `"code" character varying(50) NOT NULL, ` +
      `"name" character varying(255) NOT NULL, ` +
      `"description" character varying(1000), ` +
      `CONSTRAINT "UQ_curriculum_specialization_id_curriculum" UNIQUE ("id", "curriculum_id"), ` +
      `CONSTRAINT "PK_curriculum_specializations" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table('curriculum_specializations')} ADD CONSTRAINT "FK_curriculum_specialization_curriculum" ` +
      `FOREIGN KEY ("curriculum_id") REFERENCES ${table('curricula')} ("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_curriculum_specializations_code_lower" ON ${table('curriculum_specializations')} ` +
      `("curriculum_id", lower("code"))`,
    );

    await queryRunner.query(
      `ALTER TABLE ${table('course_groups')} ADD COLUMN "specialization_id" uuid, ADD COLUMN "parent_group_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table('course_groups')} ADD CONSTRAINT "CHK_course_group_specialization_parent" ` +
      `CHECK (("specialization_id" IS NULL) = ("parent_group_id" IS NULL))`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table('course_groups')} ADD CONSTRAINT "UQ_course_group_specialization_parent" ` +
      `UNIQUE ("specialization_id", "parent_group_id")`,
    );
    // Khóa ngoại kép kèm curriculum_id: chuyên ngành và khối gốc phải cùng chương trình với khối con.
    await queryRunner.query(
      `ALTER TABLE ${table('course_groups')} ADD CONSTRAINT "FK_course_group_specialization" ` +
      `FOREIGN KEY ("specialization_id", "curriculum_id") ` +
      `REFERENCES ${table('curriculum_specializations')} ("id", "curriculum_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table('course_groups')} ADD CONSTRAINT "FK_course_group_parent" ` +
      `FOREIGN KEY ("parent_group_id", "curriculum_id") ` +
      `REFERENCES ${table('course_groups')} ("id", "curriculum_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(`ALTER TABLE ${table('student_profiles')} ADD COLUMN "target_specialization_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE ${table('student_profiles')} ADD CONSTRAINT "FK_student_profile_specialization" ` +
      `FOREIGN KEY ("target_specialization_id") REFERENCES ${table('curriculum_specializations')} ("id") ` +
      `ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schema(queryRunner);
    const table = (name: string) => `${schema}."${name}"`;

    await queryRunner.query(`ALTER TABLE ${table('student_profiles')} DROP CONSTRAINT "FK_student_profile_specialization"`);
    await queryRunner.query(`ALTER TABLE ${table('student_profiles')} DROP COLUMN "target_specialization_id"`);
    // Khối chuyên ngành không có nghĩa khi bỏ cột liên kết, xóa trước để tránh lẫn với khối gốc.
    await queryRunner.query(`DELETE FROM ${table('course_groups')} WHERE "specialization_id" IS NOT NULL`);
    await queryRunner.query(`ALTER TABLE ${table('course_groups')} DROP CONSTRAINT "FK_course_group_parent"`);
    await queryRunner.query(`ALTER TABLE ${table('course_groups')} DROP CONSTRAINT "FK_course_group_specialization"`);
    await queryRunner.query(`ALTER TABLE ${table('course_groups')} DROP CONSTRAINT "UQ_course_group_specialization_parent"`);
    await queryRunner.query(`ALTER TABLE ${table('course_groups')} DROP CONSTRAINT "CHK_course_group_specialization_parent"`);
    await queryRunner.query(
      `ALTER TABLE ${table('course_groups')} DROP COLUMN "parent_group_id", DROP COLUMN "specialization_id"`,
    );
    await queryRunner.query(`DROP TABLE ${table('curriculum_specializations')}`);
  }

  private schema(queryRunner: QueryRunner): string {
    const options = queryRunner.connection.options;
    const schema = 'schema' in options ? options.schema ?? 'public' : 'public';
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Invalid database schema');
    return `"${schema}"`;
  }
}
