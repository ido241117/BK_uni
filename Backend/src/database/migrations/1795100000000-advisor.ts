import { MigrationInterface, QueryRunner } from 'typeorm';

/** Lưu cuộc trò chuyện "Tư vấn với AI" và từng bước (system/context/user/assistant/tool) để xem lại trajectory. */
export class Advisor1795100000000 implements MigrationInterface {
  name = 'Advisor1795100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schema(queryRunner);
    const table = (name: string) => `${schema}."${name}"`;

    await queryRunner.query(`
      CREATE TABLE ${table('advisor_sessions')} (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_by" uuid,
        "user_id" uuid NOT NULL,
        "title" character varying(255) NOT NULL,
        "snapshot" jsonb,
        "snapshot_hash" character varying(64),
        "model" character varying(100) NOT NULL,
        CONSTRAINT "PK_advisor_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_advisor_session_user" FOREIGN KEY ("user_id")
          REFERENCES ${table('users')}("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_advisor_session_user" ON ${table('advisor_sessions')} ("user_id", "updated_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE ${table('advisor_steps')} (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_by" uuid,
        "session_id" uuid NOT NULL,
        "turn" integer NOT NULL,
        "seq" integer NOT NULL,
        "role" character varying(20) NOT NULL,
        "content" text,
        "reasoning" text,
        "tool_calls" jsonb,
        "tool_call_id" character varying(100),
        "tool_name" character varying(100),
        "tool_args" jsonb,
        "data" jsonb,
        "prompt_tokens" integer,
        "completion_tokens" integer,
        "cache_hit_tokens" integer,
        "duration_ms" integer,
        CONSTRAINT "PK_advisor_steps" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_advisor_step_seq" UNIQUE ("session_id", "seq"),
        CONSTRAINT "CHK_advisor_step_role"
          CHECK ("role" IN ('system', 'context', 'user', 'assistant', 'tool', 'answer', 'error')),
        CONSTRAINT "FK_advisor_step_session" FOREIGN KEY ("session_id")
          REFERENCES ${table('advisor_sessions')}("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schema(queryRunner);
    await queryRunner.query(`DROP TABLE ${schema}."advisor_steps"`);
    await queryRunner.query(`DROP TABLE ${schema}."advisor_sessions"`);
  }

  private schema(queryRunner: QueryRunner): string {
    const options = queryRunner.connection.options;
    const schema = 'schema' in options ? options.schema ?? 'public' : 'public';
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Invalid database schema');
    return `"${schema}"`;
  }
}
