import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialAuth1700000000000 implements MigrationInterface {
  name = 'InitialAuth1700000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schema(queryRunner);
    await queryRunner.query(`CREATE TYPE ${schema}."users_role_enum" AS ENUM ('STUDENT', 'ADMIN')`);
    await queryRunner.query(`CREATE TABLE ${schema}."users" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      "updatedBy" uuid,
      "email" varchar(255) NOT NULL,
      "password" varchar(60) NOT NULL,
      "role" ${schema}."users_role_enum" NOT NULL DEFAULT 'STUDENT',
      CONSTRAINT "PK_users" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_users_email" UNIQUE ("email")
    )`);
    await queryRunner.query(`CREATE TABLE ${schema}."auth_sessions" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      "updatedBy" uuid,
      "userId" uuid NOT NULL,
      "expiresAt" timestamptz NOT NULL,
      CONSTRAINT "PK_auth_sessions" PRIMARY KEY ("id"),
      CONSTRAINT "FK_auth_sessions_user" FOREIGN KEY ("userId") REFERENCES ${schema}."users"("id") ON DELETE CASCADE
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_auth_sessions_user" ON ${schema}."auth_sessions" ("userId")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schema(queryRunner);
    await queryRunner.query(`DROP TABLE ${schema}."auth_sessions"`);
    await queryRunner.query(`DROP TABLE ${schema}."users"`);
    await queryRunner.query(`DROP TYPE ${schema}."users_role_enum"`);
  }

  private schema(queryRunner: QueryRunner): string {
    const options = queryRunner.connection.options;
    const schema = 'schema' in options ? options.schema ?? 'public' : 'public';
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Invalid database schema');
    return `"${schema}"`;
  }
}
