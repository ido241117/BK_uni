import 'dotenv/config';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { DbTestRecord } from '../db-test/entities/db-test-record.entity';
import { AuthSession } from '../users/auth-session.entity';
import { StudentProfile } from '../users/student-profile.entity';
import { User } from '../users/user.entity';

async function verifyMigrations() {
	const database = process.env.DB_TEST_NAME;
	if (
		!database ||
		database === process.env.DB_NAME ||
		!/(^|[_-])test([_-]|$)/i.test(database)
	) {
		throw new Error(
			'DB_TEST_NAME must name a dedicated test database and differ from DB_NAME.',
		);
	}

	const schema = `migration_verify_${randomUUID().replaceAll('-', '')}`;
	const credentials = {
		host: process.env.DB_HOST || 'localhost',
		port: Number(process.env.DB_PORT || 5432),
		user: process.env.DB_USERNAME,
		password: process.env.DB_PASSWORD,
		database,
	};
	const admin = new Client(credentials);
	let dataSource: DataSource | undefined;

	await admin.connect();
	try {
		await admin.query(`CREATE SCHEMA "${schema}"`);
		await admin.query(
			`CREATE TABLE "${schema}"."db_test_records" (id uuid PRIMARY KEY, title varchar(120) NOT NULL, description text, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now())`,
		);
		await admin.query(
			`INSERT INTO "${schema}"."db_test_records" (id, title, "createdAt", "updatedAt") VALUES ('00000000-0000-4000-8000-000000000001', 'migration fixture', '2026-10-04 00:00:00', '2026-10-04 00:00:00')`,
		);
		dataSource = new DataSource({
			type: 'postgres',
			host: credentials.host,
			port: credentials.port,
			username: credentials.user,
			password: credentials.password,
			database: credentials.database,
			schema,
			entities: [DbTestRecord, User, AuthSession, StudentProfile],
			migrations: [join(__dirname, '../db/migrations/*{.ts,.js}')],
			migrationsTableName: 'typeorm_migrations',
			synchronize: false,
			logging: false,
		});
		await dataSource.initialize();

		await dataSource.runMigrations();
		await assertEntityColumns(dataSource, admin, schema);
		const adoptedRecord = await admin.query(
			`SELECT title, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS created_at_utc FROM "${schema}"."db_test_records" WHERE id = '00000000-0000-4000-8000-000000000001'`,
		);
		const adopted = adoptedRecord.rows[0] as
			{ title?: unknown; created_at_utc?: unknown } | undefined;
		const adoptedUtc = adopted?.created_at_utc;
		if (
			adoptedRecord.rowCount !== 1 ||
			adopted?.title !== 'migration fixture' ||
			adoptedUtc !== '2026-10-04 00:00:00'
		) {
			throw new Error('Legacy smoke-test data was not preserved in UTC.');
		}

		for (let index = dataSource.migrations.length; index > 0; index -= 1) {
			await dataSource.undoLastMigration();
		}
		const afterDown = await admin.query(
			' SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name = ANY($2)',
			[
				schema,
				['db_test_records', 'users', 'auth_sessions', 'student_profiles'],
			],
		);
		if (afterDown.rowCount !== 0) {
			throw new Error('Migration down did not remove all baseline tables.');
		}

		await dataSource.runMigrations();
		await assertEntityColumns(dataSource, admin, schema);
		console.log(
			'Migration verification passed: up -> down -> up; entity columns match.',
		);
	} finally {
		if (dataSource?.isInitialized) await dataSource.destroy();
		await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
		await admin.end();
	}
}

async function assertEntityColumns(
	dataSource: DataSource,
	admin: Client,
	schema: string,
) {
	for (const entity of [DbTestRecord, User, AuthSession, StudentProfile]) {
		const metadata = dataSource.getMetadata(entity);
		const expectedColumns = metadata.columns
			.map((column) => ({
				name: column.databaseName,
				type: normalizeType(String(column.type)),
				nullable: column.isNullable,
				length: column.length ? column.length : null,
			}))
			.sort((left, right) => left.name.localeCompare(right.name));
		const result = await admin.query(
			' SELECT column_name, data_type, is_nullable, character_maximum_length FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY column_name',
			[schema, metadata.tableName],
		);
		const actualColumns = result.rows.map(
			(row: {
				column_name: string;
				data_type: string;
				is_nullable: 'YES' | 'NO';
				character_maximum_length: number | null;
			}) => ({
				name: row.column_name,
				type: normalizeType(row.data_type),
				nullable: row.is_nullable === 'YES',
				length: row.character_maximum_length?.toString() ?? null,
			}),
		);
		if (JSON.stringify(actualColumns) !== JSON.stringify(expectedColumns)) {
			throw new Error(
				`Migrated schema does not match ${metadata.name}: ${JSON.stringify(actualColumns)}`,
			);
		}
	}
}

function normalizeType(type: string) {
	if (type === 'timestamptz') return 'timestamp with time zone';
	if (type === 'varchar') return 'character varying';
	return type;
}

verifyMigrations().catch((error: unknown) => {
	console.error(error);
	process.exitCode = 1;
});
