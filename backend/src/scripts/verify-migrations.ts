import 'dotenv/config';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { Course } from '../curricula/course.entity';
import { AnalysisRun } from '../analysis/analysis-run.entity';
import { CourseRule } from '../curricula/course-rule.entity';
import { Curriculum } from '../curricula/curriculum.entity';
import { CurriculumTerm } from '../curricula/curriculum-term.entity';
import { ElectiveGroup } from '../curricula/elective-group.entity';
import { DbTestRecord } from '../db-test/entities/db-test-record.entity';
import { AuthSession } from '../users/auth-session.entity';
import { StudentCourseStatus } from '../users/student-course-status.entity';
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
			entities: [
				DbTestRecord,
				AnalysisRun,
				User,
				AuthSession,
				StudentProfile,
				StudentCourseStatus,
				Curriculum,
				CurriculumTerm,
				ElectiveGroup,
				Course,
				CourseRule,
			],
			migrations: [join(__dirname, '../db/migrations/*{.ts,.js}')],
			migrationsTableName: 'typeorm_migrations',
			synchronize: false,
			logging: false,
		});
		await dataSource.initialize();

		await dataSource.runMigrations();
		await assertEntityColumns(dataSource, admin, schema);
		await assertCurriculumConstraints(admin, schema);
		await assertRecommendationConstraints(admin, schema);
		await assertRecommendationBackfill(dataSource, admin, schema);
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
				[
					'db_test_records',
					'users',
					'auth_sessions',
					'student_profiles',
					'student_course_statuses',
					'analysis_runs',
					'curricula',
					'curriculum_terms',
					'elective_groups',
					'courses',
					'course_rules',
				],
			],
		);
		if (afterDown.rowCount !== 0) {
			throw new Error('Migration down did not remove all baseline tables.');
		}

		await dataSource.runMigrations();
		await assertEntityColumns(dataSource, admin, schema);
		await assertCurriculumConstraints(admin, schema);
		console.log(
			'Migration verification passed: up -> down -> up; entity columns match.',
		);
	} finally {
		if (dataSource?.isInitialized) await dataSource.destroy();
		await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
		await admin.end();
	}
}

async function assertCurriculumConstraints(admin: Client, schema: string) {
	const constraints = await admin.query(
		'SELECT constraint_name FROM information_schema.table_constraints WHERE constraint_schema = $1',
		[schema],
	);
	const constraintNames = new Set(
		constraints.rows.map(
			(row: { constraint_name: string }) => row.constraint_name,
		),
	);
	const requiredConstraints = [
		'fk_student_profiles_curriculum_id',
		'fk_courses_term_scope',
		'fk_courses_elective_group_scope',
		'fk_course_rules_target_scope',
		'fk_course_rules_prerequisite_scope',
		'chk_elective_groups_threshold',
		'chk_courses_requirement_group',
		'chk_courses_recommendation_priority_nonnegative',
		'chk_curricula_recommendation_settings_all_or_none',
		'chk_curricula_recommendation_settings_valid',
		'chk_course_rules_shape',
		'chk_course_rules_source_override',
	];
	const missingConstraints = requiredConstraints.filter(
		(name) => !constraintNames.has(name),
	);
	if (missingConstraints.length) {
		throw new Error(
			`Missing curriculum constraints: ${missingConstraints.join(', ')}`,
		);
	}

	const indexes = await admin.query(
		'SELECT indexname FROM pg_indexes WHERE schemaname = $1',
		[schema],
	);
	const indexNames = new Set(
		indexes.rows.map((row: { indexname: string }) => row.indexname),
	);
	const requiredIndexes = [
		'uq_curricula_active_name',
		'uq_elective_groups_active_name',
		'uq_courses_active_identity',
		'idx_courses_active_curriculum_name',
		'idx_course_rules_active_curriculum_target',
	];
	const missingIndexes = requiredIndexes.filter(
		(name) => !indexNames.has(name),
	);
	if (missingIndexes.length) {
		throw new Error(`Missing curriculum indexes: ${missingIndexes.join(', ')}`);
	}
}

async function assertRecommendationConstraints(admin: Client, schema: string) {
	const users = `"${schema}"."users"`;
	const curricula = `"${schema}"."curricula"`;
	const terms = `"${schema}"."curriculum_terms"`;
	const courses = `"${schema}"."courses"`;
	const userId = randomUUID();
	const curriculumId = randomUUID();
	const termId = randomUUID();

	await admin.query('BEGIN');
	try {
		await admin.query(
			`INSERT INTO ${users} (id, email, password_hash, role) VALUES ($1, $2, $3, 'admin')`,
			[userId, `${userId}@migration.test`, 'migration-test-hash'],
		);
		await admin.query(
			`INSERT INTO ${curricula} (id, name, created_by, source_document_name, source_reference, source_version, source_verified_at)
			VALUES ($1, 'constraint fixture', $2, 'fixture', 'test', '1', '2026-10-05')`,
			[curriculumId, userId],
		);
		await admin.query(
			`INSERT INTO ${terms} (id, curriculum_id, term_code, name, sort_order) VALUES ($1, $2, 'T1', 'Term 1', 1)`,
			[termId, curriculumId],
		);

		await assertRejectedByConstraint(
			admin,
			'chk_curricula_recommendation_settings_all_or_none',
			`INSERT INTO ${curricula} (id, name, created_by, source_document_name, source_reference, source_version, source_verified_at, total_credits_target)
			VALUES ($1, 'partial settings fixture', $2, 'fixture', 'test', '1', '2026-10-05', 120)`,
			[randomUUID(), userId],
		);
		await assertRejectedByConstraint(
			admin,
			'chk_curricula_recommendation_settings_valid',
			`INSERT INTO ${curricula} (id, name, created_by, source_document_name, source_reference, source_version, source_verified_at, total_credits_target, minimum_semester_credits, maximum_semester_credits)
			VALUES ($1, 'invalid range fixture', $2, 'fixture', 'test', '1', '2026-10-05', 120, 20, 10)`,
			[randomUUID(), userId],
		);
		await assertRejectedByConstraint(
			admin,
			'chk_courses_recommendation_priority_nonnegative',
			`INSERT INTO ${courses} (curriculum_id, course_code, name, credits, term_id, requirement_type, recommendation_priority)
			VALUES ($1, 'TEST-1', 'Priority fixture', 3, $2, 'required', -1)`,
			[curriculumId, termId],
		);
	} finally {
		await admin.query('ROLLBACK');
	}
}

async function assertRecommendationBackfill(
	dataSource: DataSource,
	admin: Client,
	schema: string,
) {
	const users = `"${schema}"."users"`;
	const profiles = `"${schema}"."student_profiles"`;
	const curricula = `"${schema}"."curricula"`;
	const terms = `"${schema}"."curriculum_terms"`;
	const groups = `"${schema}"."elective_groups"`;
	const courses = `"${schema}"."courses"`;
	const statuses = `"${schema}"."student_course_statuses"`;
	const analysisRuns = `"${schema}"."analysis_runs"`;

	await dataSource.undoLastMigration();

	const userId = randomUUID();
	const profileId = randomUUID();
	const curriculumId = randomUUID();
	const secondCurriculumId = randomUUID();
	const firstTermId = randomUUID();
	const secondTermId = randomUUID();
	const otherCurriculumTermId = randomUUID();
	const electiveGroupId = randomUUID();
	const courseIds = {
		firstCodeVersion: randomUUID(),
		secondCodeVersion: randomUUID(),
		laterCode: randomUUID(),
		laterTerm: randomUUID(),
		elective: randomUUID(),
		otherCurriculum: randomUUID(),
	};
	const analysisRunId = randomUUID();
	const inputSnapshot = {
		courseId: courseIds.firstCodeVersion,
		sentinel: 'input',
	};
	const resultSnapshot = {
		courseId: courseIds.firstCodeVersion,
		sentinel: 'result',
	};

	await admin.query(
		`INSERT INTO ${users} (id, email, password_hash, role) VALUES ($1, $2, $3, 'student')`,
		[userId, `${userId}@backfill.test`, 'migration-test-hash'],
	);
	await admin.query(
		`INSERT INTO ${curricula} (id, name, created_by, source_document_name, source_reference, source_version, source_verified_at)
		VALUES ($1, 'backfill fixture', $3, 'fixture', 'test', '1', '2026-10-05'),
			($2, 'second backfill fixture', $3, 'fixture', 'test', '1', '2026-10-05')`,
		[curriculumId, secondCurriculumId, userId],
	);
	await admin.query(
		`INSERT INTO ${terms} (id, curriculum_id, term_code, name, sort_order) VALUES
			($1, $3, 'T1', 'Term 1', 1),
			($2, $3, 'T2', 'Term 2', 2),
			($4, $5, 'T1', 'Term 1', 1)`,
		[
			firstTermId,
			secondTermId,
			curriculumId,
			otherCurriculumTermId,
			secondCurriculumId,
		],
	);
	await admin.query(
		`INSERT INTO ${groups} (id, curriculum_id, name, required_credits, sort_order) VALUES ($1, $2, 'Elective fixture', 3, 1)`,
		[electiveGroupId, curriculumId],
	);
	await admin.query(
		`INSERT INTO ${courses} (id, curriculum_id, course_code, course_version, name, credits, term_id, requirement_type, elective_group_id) VALUES
			($1, $6, 'A', '1', 'Earlier code v1', 3, $7, 'required', NULL),
			($2, $6, 'A', '2', 'Earlier code v2', 3, $7, 'required', NULL),
			($3, $6, 'Z', '1', 'Earlier term Z', 3, $7, 'required', NULL),
			($4, $6, 'B', '1', 'Later term B', 3, $8, 'required', NULL),
			($5, $6, 'E', '1', 'Elective', 3, $7, 'elective', $9),
			($10, $11, 'B', '1', 'Other curriculum', 3, $12, 'required', NULL)`,
		[
			courseIds.firstCodeVersion,
			courseIds.secondCodeVersion,
			courseIds.laterCode,
			courseIds.laterTerm,
			courseIds.elective,
			curriculumId,
			firstTermId,
			secondTermId,
			electiveGroupId,
			courseIds.otherCurriculum,
			secondCurriculumId,
			otherCurriculumTermId,
		],
	);
	await admin.query(
		`INSERT INTO ${profiles} (id, user_id, display_name, curriculum_id) VALUES ($1, $2, 'Backfill fixture', $3)`,
		[profileId, userId, curriculumId],
	);
	await admin.query(
		`INSERT INTO ${statuses} (profile_id, curriculum_id, course_id, status) VALUES ($1, $2, $3, 'completed')`,
		[profileId, curriculumId, courseIds.firstCodeVersion],
	);
	await admin.query(
		`INSERT INTO ${analysisRuns} (id, profile_id, curriculum_id, input_snapshot, result_snapshot, ruleset_version) VALUES ($1, $2, $3, $4, $5, 'backfill-test')`,
		[analysisRunId, profileId, curriculumId, inputSnapshot, resultSnapshot],
	);
	const identityRowsBefore = await admin.query(
		`SELECT id, course_code, course_version FROM ${courses} WHERE id = ANY($1::uuid[]) ORDER BY id`,
		[[...Object.values(courseIds)]],
	);

	await dataSource.runMigrations();

	const backfilled = await admin.query(
		`SELECT id, course_code, course_version, recommendation_priority FROM ${courses} WHERE curriculum_id = ANY($1::uuid[])`,
		[[curriculumId, secondCurriculumId]],
	);
	const expectedPriorities = new Map<string, number>([
		[courseIds.firstCodeVersion, 0],
		[courseIds.secondCodeVersion, 1],
		[courseIds.laterCode, 2],
		[courseIds.laterTerm, 3],
		[courseIds.elective, 0],
		[courseIds.otherCurriculum, 0],
	]);
	if (
		backfilled.rowCount !== expectedPriorities.size ||
		backfilled.rows.some(
			(row: { id: string; recommendation_priority: number }) =>
				expectedPriorities.get(row.id) !== row.recommendation_priority,
		)
	) {
		throw new Error('Recommendation priority backfill was not deterministic.');
	}

	const identityRowsAfter = await admin.query(
		`SELECT id, course_code, course_version FROM ${courses} WHERE id = ANY($1::uuid[]) ORDER BY id`,
		[[...expectedPriorities.keys()]],
	);
	if (
		identityRowsBefore.rowCount !== expectedPriorities.size ||
		JSON.stringify(identityRowsAfter.rows) !==
		JSON.stringify(identityRowsBefore.rows)
	) {
		throw new Error('Recommendation migration changed course identity.');
	}
	const status = await admin.query(
		`SELECT status FROM ${statuses} WHERE profile_id = $1 AND course_id = $2`,
		[profileId, courseIds.firstCodeVersion],
	);
	const snapshots = await admin.query(
		`SELECT input_snapshot, result_snapshot, ruleset_version FROM ${analysisRuns} WHERE id = $1`,
		[analysisRunId],
	);
	if (
		status.rows[0]?.status !== 'completed' ||
		JSON.stringify(snapshots.rows[0]) !==
		JSON.stringify({
			input_snapshot: inputSnapshot,
			result_snapshot: resultSnapshot,
			ruleset_version: 'backfill-test',
		})
	) {
		throw new Error(
			'Recommendation migration changed status or analysis snapshots.',
		);
	}
}

async function assertRejectedByConstraint(
	admin: Client,
	constraintName: string,
	statement: string,
	values: unknown[],
) {
	await admin.query('SAVEPOINT verify_expected_constraint');
	try {
		await admin.query(statement, values);
	} catch (error) {
		const databaseError = error as { code?: string; constraint?: string };
		await admin.query('ROLLBACK TO SAVEPOINT verify_expected_constraint');
		await admin.query('RELEASE SAVEPOINT verify_expected_constraint');
		if (
			databaseError.code !== '23514' ||
			databaseError.constraint !== constraintName
		) {
			throw new Error(
				`Expected ${constraintName} to reject invalid data; received ${databaseError.constraint ?? databaseError.code ?? 'an unknown error'}.`,
			);
		}
		return;
	}
	await admin.query('RELEASE SAVEPOINT verify_expected_constraint');
	throw new Error(`Expected ${constraintName} to reject invalid data.`);
}

async function assertEntityColumns(
	dataSource: DataSource,
	admin: Client,
	schema: string,
) {
	for (const entity of [
		DbTestRecord,
		AnalysisRun,
		User,
		AuthSession,
		StudentProfile,
		StudentCourseStatus,
		Curriculum,
		CurriculumTerm,
		ElectiveGroup,
		Course,
		CourseRule,
	]) {
		const metadata = dataSource.getMetadata(entity);
		const expectedColumns = metadata.columns
			.map((column) => {
				const isNumeric = ['numeric', 'decimal'].includes(String(column.type));
				return {
					name: column.databaseName,
					type: normalizeType(String(column.type)),
					nullable: column.isNullable,
					length: column.length ? column.length : null,
					precision: isNumeric ? (column.precision?.toString() ?? null) : null,
					scale: isNumeric ? (column.scale?.toString() ?? null) : null,
				};
			})
			.sort((left, right) => left.name.localeCompare(right.name));
		const result = await admin.query(
			' SELECT column_name, data_type, is_nullable, character_maximum_length, numeric_precision, numeric_scale FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY column_name',
			[schema, metadata.tableName],
		);
		const actualColumns = result.rows.map(
			(row: {
				column_name: string;
				data_type: string;
				is_nullable: 'YES' | 'NO';
				character_maximum_length: number | null;
				numeric_precision: number | null;
				numeric_scale: number | null;
			}) => {
				const isNumeric = ['numeric', 'decimal'].includes(row.data_type);
				return {
					name: row.column_name,
					type: normalizeType(row.data_type),
					nullable: row.is_nullable === 'YES',
					length: row.character_maximum_length?.toString() ?? null,
					precision: isNumeric
						? (row.numeric_precision?.toString() ?? null)
						: null,
					scale: isNumeric ? (row.numeric_scale?.toString() ?? null) : null,
				};
			},
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
