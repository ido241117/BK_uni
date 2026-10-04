import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class InitialDbTestRecords1791091200000 implements MigrationInterface {
	name = 'InitialDbTestRecords1791091200000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.createTable(
			new Table({
				name: 'users',
				columns: [
					{
						name: 'id',
						type: 'uuid',
						isPrimary: true,
						default: 'uuid_generate_v4()',
					},
					{ name: 'email', type: 'text', isNullable: false },
					{ name: 'password_hash', type: 'text', isNullable: false },
					{
						name: 'role',
						type: 'text',
						default: "'student'",
						isNullable: false,
					},
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
				],
			}),
		);
		const schema =
			(queryRunner.connection.options as { schema?: string }).schema ??
			'public';
		const quoteIdentifier = (identifier: string) =>
			`"${identifier.replaceAll('"', '""')}"`;
		const usersTable = `${quoteIdentifier(schema)}.${quoteIdentifier('users')}`;
		await queryRunner.query(
			`CREATE UNIQUE INDEX "uq_users_email_lower" ON ${usersTable} (lower("email"))`,
		);
		await queryRunner.createTable(
			new Table({
				name: 'db_test_records',
				columns: [
					{
						name: 'id',
						type: 'uuid',
						isPrimary: true,
						default: 'uuid_generate_v4()',
					},
					{
						name: 'title',
						type: 'varchar',
						length: '120',
						isNullable: false,
					},
					{
						name: 'description',
						type: 'text',
						isNullable: true,
					},
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
				],
			}),
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.dropTable('db_test_records');
		await queryRunner.dropTable('users');
	}
}
