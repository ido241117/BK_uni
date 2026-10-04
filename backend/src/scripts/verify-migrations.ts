import 'dotenv/config';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { DbTestRecord } from '../db-test/entities/db-test-record.entity';
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
		dataSource = new DataSource({
			type: 'postgres',
			host: credentials.host,
			port: credentials.port,
			username: credentials.user,
			password: credentials.password,
			database: credentials.database,
			schema,
			entities: [DbTestRecord, User],
			migrations: [join(__dirname, '../db/migrations/*{.ts,.js}')],
			migrationsTableName: 'typeorm_migrations',
			synchronize: false,
			logging: false,
		});
		await dataSource.initialize();

		await dataSource.runMigrations();
		await assertEntityColumns(dataSource, admin, schema);

		await dataSource.undoLastMigration();
		const afterDown = await admin.query(
			' SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name = ANY($2)',
			[schema, ['db_test_records', 'users']],
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
	for (const entity of [DbTestRecord, User]) {
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
