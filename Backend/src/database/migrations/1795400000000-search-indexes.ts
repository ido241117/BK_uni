import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Index cho truy vấn (báo cáo mục 4.2, kịch bản đo ở db-lab/sql/42-query.sql).
 *
 * CourseService.findPage tìm môn bằng `LOWER(code) LIKE '%x%' OR LOWER(name) LIKE '%x%'`. B-tree không dùng
 * được cho mẫu có `%` ở đầu nên mọi lần tìm đều Seq Scan. Index GIN trên trigram (pg_trgm) của đúng biểu thức
 * `lower(...)` cho phép planner dùng Bitmap Index Scan + BitmapOr cho cả hai vế OR.
 *
 * `auth_sessions.expires_at` được lọc khi dọn phiên hết hạn.
 */
export class SearchIndexes1795400000000 implements MigrationInterface {
  name = 'SearchIndexes1795400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const t = (name: string) => `${this.schema(queryRunner)}."${name}"`;
    // Supabase đặt extension trong schema "extensions"; PostgreSQL thường thì dùng schema mặc định.
    const [{ has_extensions_schema }] = await queryRunner.query(
      `SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions') AS has_extensions_schema`,
    );
    await queryRunner.query(
      `CREATE EXTENSION IF NOT EXISTS pg_trgm${has_extensions_schema ? ' WITH SCHEMA extensions' : ''}`,
    );
    const [{ nspname }] = await queryRunner.query(
      `SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'pg_trgm'`,
    );
    const ops = `"${nspname}".gin_trgm_ops`;

    await queryRunner.query(`CREATE INDEX "IDX_courses_code_trgm" ON ${t('courses')} USING gin (lower("code") ${ops})`);
    await queryRunner.query(`CREATE INDEX "IDX_courses_name_trgm" ON ${t('courses')} USING gin (lower("name") ${ops})`);
    await queryRunner.query(`CREATE INDEX "IDX_auth_sessions_expires" ON ${t('auth_sessions')} ("expires_at")`);
    await queryRunner.query(`ANALYZE ${t('courses')}`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schema(queryRunner);
    await queryRunner.query(`DROP INDEX ${schema}."IDX_auth_sessions_expires"`);
    await queryRunner.query(`DROP INDEX ${schema}."IDX_courses_name_trgm"`);
    await queryRunner.query(`DROP INDEX ${schema}."IDX_courses_code_trgm"`);
  }

  private schema(queryRunner: QueryRunner): string {
    const options = queryRunner.connection.options;
    const schema = 'schema' in options ? options.schema ?? 'public' : 'public';
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Invalid database schema');
    return `"${schema}"`;
  }
}
