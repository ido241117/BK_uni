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
		if (!(await queryRunner.hasTable('db_test_records'))) {
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
		} else {
			for (const [legacyName, currentName] of [
				['createdAt', 'created_at'],
				['updatedAt', 'updated_at'],
			] as const) {
				if (
					(await queryRunner.hasColumn('db_test_records', legacyName)) &&
					!(await queryRunner.hasColumn('db_test_records', currentName))
				) {
					await queryRunner.renameColumn(
						'db_test_records',
						legacyName,
						currentName,
					);
				}
			}

			const dbTestSchema =
				(queryRunner.connection.options as { schema?: string }).schema ??
				'public';
			const quoteIdentifier = (identifier: string) =>
				`"${identifier.replaceAll('"', '""')}"`;
			const table = `${quoteIdentifier(dbTestSchema)}.${quoteIdentifier('db_test_records')}`;
			for (const columnName of ['created_at', 'updated_at']) {
				const columnRows = (await queryRunner.query(
					' SELECT data_type FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3',
					[dbTestSchema, 'db_test_records', columnName],
				)) as { data_type: string }[];
				if (columnRows[0]?.data_type === 'timestamp without time zone') {
					const quotedColumn = quoteIdentifier(columnName);
					await queryRunner.query(
						`ALTER TABLE ${table} ALTER COLUMN ${quotedColumn} DROP DEFAULT, ALTER COLUMN ${quotedColumn} TYPE timestamptz USING ${quotedColumn} AT TIME ZONE 'UTC', ALTER COLUMN ${quotedColumn} SET DEFAULT now()`,
					);
				}
			}
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.dropTable('db_test_records');
		await queryRunner.dropTable('users');
	}
}
