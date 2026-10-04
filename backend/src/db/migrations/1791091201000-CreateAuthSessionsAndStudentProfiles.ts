import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableCheck,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateAuthSessionsAndStudentProfiles1791091201000 implements MigrationInterface {
  name = 'CreateAuthSessionsAndStudentProfiles1791091201000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createCheckConstraint(
      'users',
      new TableCheck({
        name: 'chk_users_role',
        expression: `"role" IN ('student', 'admin')`,
      }),
    );
    await queryRunner.createTable(
      new Table({
        name: 'auth_sessions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          { name: 'user_id', type: 'uuid', isNullable: false },
          { name: 'token_hash', type: 'text', isNullable: false },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
          { name: 'expires_at', type: 'timestamptz', isNullable: false },
          { name: 'revoked_at', type: 'timestamptz', isNullable: true },
        ],
        foreignKeys: [
          new TableForeignKey({
            name: 'fk_auth_sessions_user_id',
            columnNames: ['user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
        ],
      }),
    );
    await queryRunner.createIndex(
      'auth_sessions',
      new TableIndex({
        name: 'uq_auth_sessions_token_hash',
        columnNames: ['token_hash'],
        isUnique: true,
      }),
    );
    await queryRunner.createIndex(
      'auth_sessions',
      new TableIndex({
        name: 'idx_auth_sessions_user_expires',
        columnNames: ['user_id', 'expires_at'],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'student_profiles',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          { name: 'user_id', type: 'uuid', isNullable: false },
          { name: 'display_name', type: 'text', isNullable: true },
          { name: 'curriculum_id', type: 'uuid', isNullable: true },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
          { name: 'deleted_at', type: 'timestamptz', isNullable: true },
        ],
        foreignKeys: [
          new TableForeignKey({
            name: 'fk_student_profiles_user_id',
            columnNames: ['user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
        ],
      }),
    );
    await queryRunner.createIndex(
      'student_profiles',
      new TableIndex({
        name: 'uq_student_profiles_user_id',
        columnNames: ['user_id'],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('student_profiles');
    await queryRunner.dropTable('auth_sessions');
    await queryRunner.dropCheckConstraint('users', 'chk_users_role');
  }
}
