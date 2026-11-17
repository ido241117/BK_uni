import { MigrationInterface, QueryRunner } from 'typeorm';

/** Bảng dữ liệu đào tạo do quản trị viên (hoặc script import) thay đổi, cần lưu vết. */
const AUDITED_TABLES = [
  'courses',
  'curricula',
  'curriculum_courses',
  'course_relations',
  'course_groups',
  'course_group_members',
  'curriculum_regulations',
  'course_opened_semesters',
  'users',
] as const;

/**
 * Nhật ký thay đổi ở tầng CSDL (báo cáo mục 4.3, NFR-7 Auditability).
 *
 * Trigger AFTER ... FOR EACH ROW ghi một dòng vào `audit_log` trong CÙNG transaction với câu lệnh gây ra
 * thay đổi: transaction rollback thì dòng nhật ký cũng biến mất, commit thì nhật ký và dữ liệu cùng bền
 * vững. Vì nằm ở CSDL nên bắt được cả thay đổi từ script (create-curriculum, seed...) chứ không chỉ qua API.
 *
 * - UPDATE chỉ lưu các cột thực sự đổi (không tính updated_at) và bỏ qua UPDATE không đổi gì.
 * - Cột `password` của `users` không bao giờ được ghi vào nhật ký.
 * - `actor` lấy từ `SET LOCAL app.user_id` nếu ứng dụng đặt, nếu không thì để trống; `db_user` và
 *   `application_name` cho biết phiên nào đã sửa.
 */
export class AuditLog1795500000000 implements MigrationInterface {
  name = 'AuditLog1795500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schema(queryRunner);
    await queryRunner.query(
      `CREATE TABLE ${schema}."audit_log" (` +
      `"id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, ` +
      `"occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
      `"txid" bigint NOT NULL DEFAULT txid_current(), ` +
      `"table_name" character varying(63) NOT NULL, ` +
      `"operation" character varying(6) NOT NULL, ` +
      `"row_id" uuid, ` +
      `"old_data" jsonb, ` +
      `"new_data" jsonb, ` +
      `"actor" uuid, ` +
      `"db_user" character varying(63) NOT NULL DEFAULT current_user, ` +
      `"application_name" character varying(128) DEFAULT current_setting('application_name', true), ` +
      `CONSTRAINT "CHK_audit_operation" CHECK ("operation" IN ('INSERT', 'UPDATE', 'DELETE')))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_audit_log_row" ON ${schema}."audit_log" ("table_name", "row_id", "occurred_at")`);
    await queryRunner.query(`CREATE INDEX "IDX_audit_log_time" ON ${schema}."audit_log" USING brin ("occurred_at")`);

    await queryRunner.query(`
      CREATE FUNCTION ${schema}."audit_row_change"() RETURNS trigger
      LANGUAGE plpgsql AS $fn$
      DECLARE
        old_row jsonb := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) - 'password' END;
        new_row jsonb := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) - 'password' END;
        changed jsonb;
        actor_setting text := nullif(current_setting('app.user_id', true), '');
      BEGIN
        IF TG_OP = 'UPDATE' THEN
          SELECT coalesce(jsonb_object_agg(n.key, n.value), '{}'::jsonb) INTO changed
          FROM jsonb_each(new_row) n
          WHERE n.key <> 'updated_at' AND n.value IS DISTINCT FROM old_row -> n.key;
          IF changed = '{}'::jsonb THEN
            RETURN NULL;
          END IF;
          old_row := (SELECT jsonb_object_agg(key, old_row -> key) FROM jsonb_object_keys(changed) key);
          new_row := changed;
        END IF;
        INSERT INTO ${schema}."audit_log" ("table_name", "operation", "row_id", "old_data", "new_data", "actor")
        VALUES (TG_TABLE_NAME, TG_OP, coalesce((new_row ->> 'id'), (old_row ->> 'id'), (to_jsonb(OLD) ->> 'id'))::uuid,
                old_row, new_row, actor_setting::uuid);
        RETURN NULL;
      END
      $fn$`);

    for (const table of AUDITED_TABLES) {
      await queryRunner.query(
        `CREATE TRIGGER "TRG_audit_${table}" AFTER INSERT OR UPDATE OR DELETE ON ${schema}."${table}" ` +
        `FOR EACH ROW EXECUTE FUNCTION ${schema}."audit_row_change"()`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schema(queryRunner);
    for (const table of AUDITED_TABLES) {
      await queryRunner.query(`DROP TRIGGER "TRG_audit_${table}" ON ${schema}."${table}"`);
    }
    await queryRunner.query(`DROP FUNCTION ${schema}."audit_row_change"()`);
    await queryRunner.query(`DROP TABLE ${schema}."audit_log"`);
  }

  private schema(queryRunner: QueryRunner): string {
    const options = queryRunner.connection.options;
    const schema = 'schema' in options ? options.schema ?? 'public' : 'public';
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Invalid database schema');
    return `"${schema}"`;
  }
}
