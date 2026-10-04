import {
	MigrationInterface,
	QueryRunner,
	Table,
	TableCheck,
	TableForeignKey,
	TableIndex,
	TableUnique,
} from 'typeorm';

export class CreateCurriculumStructure1791091202000 implements MigrationInterface {
	name = 'CreateCurriculumStructure1791091202000';

	private qualifiedTable(queryRunner: QueryRunner, tableName: string): string {
		const schema =
			(queryRunner.connection.options as { schema?: string }).schema ??
			'public';
		const quote = (identifier: string) =>
			`"${identifier.replaceAll('"', '""')}"`;
		return `${quote(schema)}.${quote(tableName)}`;
	}

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.createTable(
			new Table({
				name: 'curricula',
				columns: [
					{
						name: 'id',
						type: 'uuid',
						isPrimary: true,
						default: 'uuid_generate_v4()',
					},
					{ name: 'name', type: 'text', isNullable: false },
					{ name: 'description', type: 'text', isNullable: true },
					{ name: 'created_by', type: 'uuid', isNullable: false },
					{ name: 'source_document_name', type: 'text', isNullable: false },
					{ name: 'source_reference', type: 'text', isNullable: false },
					{ name: 'source_version', type: 'text', isNullable: false },
					{ name: 'source_verified_at', type: 'date', isNullable: false },
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
						name: 'fk_curricula_created_by',
						columnNames: ['created_by'],
						referencedTableName: 'users',
						referencedColumnNames: ['id'],
						onDelete: 'RESTRICT',
					}),
				],
			}),
		);
		await queryRunner.query(
			`CREATE UNIQUE INDEX "uq_curricula_active_name" ON ${this.qualifiedTable(queryRunner, 'curricula')} (lower(trim("name"))) WHERE "deleted_at" IS NULL`,
		);

		await queryRunner.createTable(
			new Table({
				name: 'curriculum_terms',
				columns: [
					{
						name: 'id',
						type: 'uuid',
						isPrimary: true,
						default: 'uuid_generate_v4()',
					},
					{ name: 'curriculum_id', type: 'uuid', isNullable: false },
					{ name: 'term_code', type: 'text', isNullable: false },
					{ name: 'name', type: 'text', isNullable: false },
					{ name: 'sort_order', type: 'integer', isNullable: false },
					{ name: 'deleted_at', type: 'timestamptz', isNullable: true },
				],
				foreignKeys: [
					new TableForeignKey({
						name: 'fk_curriculum_terms_curriculum',
						columnNames: ['curriculum_id'],
						referencedTableName: 'curricula',
						referencedColumnNames: ['id'],
						onDelete: 'RESTRICT',
					}),
				],
				uniques: [
					new TableUnique({
						name: 'uq_curriculum_terms_id_curriculum',
						columnNames: ['id', 'curriculum_id'],
					}),
					new TableUnique({
						name: 'uq_curriculum_terms_code',
						columnNames: ['curriculum_id', 'term_code'],
					}),
					new TableUnique({
						name: 'uq_curriculum_terms_sort_order',
						columnNames: ['curriculum_id', 'sort_order'],
					}),
				],
			}),
		);

		await queryRunner.createTable(
			new Table({
				name: 'elective_groups',
				columns: [
					{
						name: 'id',
						type: 'uuid',
						isPrimary: true,
						default: 'uuid_generate_v4()',
					},
					{ name: 'curriculum_id', type: 'uuid', isNullable: false },
					{ name: 'name', type: 'text', isNullable: false },
					{
						name: 'required_credits',
						type: 'numeric',
						precision: 6,
						scale: 2,
						isNullable: true,
					},
					{ name: 'required_courses', type: 'integer', isNullable: true },
					{ name: 'sort_order', type: 'integer', isNullable: false },
					{ name: 'deleted_at', type: 'timestamptz', isNullable: true },
				],
				foreignKeys: [
					new TableForeignKey({
						name: 'fk_elective_groups_curriculum',
						columnNames: ['curriculum_id'],
						referencedTableName: 'curricula',
						referencedColumnNames: ['id'],
						onDelete: 'RESTRICT',
					}),
				],
				uniques: [
					new TableUnique({
						name: 'uq_elective_groups_id_curriculum',
						columnNames: ['id', 'curriculum_id'],
					}),
				],
				checks: [
					new TableCheck({
						name: 'chk_elective_groups_threshold',
						expression:
							'"required_credits" IS NOT NULL OR "required_courses" IS NOT NULL',
					}),
					new TableCheck({
						name: 'chk_elective_groups_positive_thresholds',
						expression:
							'("required_credits" IS NULL OR "required_credits" > 0) AND ("required_courses" IS NULL OR "required_courses" > 0)',
					}),
				],
			}),
		);
		await queryRunner.query(
			`CREATE UNIQUE INDEX "uq_elective_groups_active_name" ON ${this.qualifiedTable(queryRunner, 'elective_groups')} ("curriculum_id", lower(trim("name"))) WHERE "deleted_at" IS NULL`,
		);

		await queryRunner.createTable(
			new Table({
				name: 'courses',
				columns: [
					{
						name: 'id',
						type: 'uuid',
						isPrimary: true,
						default: 'uuid_generate_v4()',
					},
					{ name: 'curriculum_id', type: 'uuid', isNullable: false },
					{ name: 'course_code', type: 'text', isNullable: false },
					{
						name: 'course_version',
						type: 'text',
						default: "'1'",
						isNullable: false,
					},
					{ name: 'name', type: 'text', isNullable: false },
					{ name: 'name_en', type: 'text', isNullable: true },
					{
						name: 'credits',
						type: 'numeric',
						precision: 5,
						scale: 2,
						isNullable: false,
					},
					{ name: 'term_id', type: 'uuid', isNullable: false },
					{ name: 'requirement_type', type: 'text', isNullable: false },
					{ name: 'elective_group_id', type: 'uuid', isNullable: true },
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
						name: 'fk_courses_curriculum',
						columnNames: ['curriculum_id'],
						referencedTableName: 'curricula',
						referencedColumnNames: ['id'],
						onDelete: 'RESTRICT',
					}),
					new TableForeignKey({
						name: 'fk_courses_term_scope',
						columnNames: ['term_id', 'curriculum_id'],
						referencedTableName: 'curriculum_terms',
						referencedColumnNames: ['id', 'curriculum_id'],
						onDelete: 'RESTRICT',
					}),
					new TableForeignKey({
						name: 'fk_courses_elective_group_scope',
						columnNames: ['elective_group_id', 'curriculum_id'],
						referencedTableName: 'elective_groups',
						referencedColumnNames: ['id', 'curriculum_id'],
						onDelete: 'RESTRICT',
					}),
				],
				uniques: [
					new TableUnique({
						name: 'uq_courses_id_curriculum',
						columnNames: ['id', 'curriculum_id'],
					}),
				],
				checks: [
					new TableCheck({
						name: 'chk_courses_credits_nonnegative',
						expression: '"credits" >= 0',
					}),
					new TableCheck({
						name: 'chk_courses_requirement_group',
						expression:
							'("requirement_type" = \'required\' AND "elective_group_id" IS NULL) OR ("requirement_type" = \'elective\' AND "elective_group_id" IS NOT NULL)',
					}),
				],
			}),
		);
		await queryRunner.createIndex(
			'courses',
			new TableIndex({
				name: 'uq_courses_active_identity',
				columnNames: ['curriculum_id', 'course_code', 'course_version'],
				isUnique: true,
				where: 'deleted_at IS NULL',
			}),
		);
		await queryRunner.createIndex(
			'courses',
			new TableIndex({
				name: 'idx_courses_active_curriculum_term_code',
				columnNames: ['curriculum_id', 'term_id', 'course_code'],
				where: 'deleted_at IS NULL',
			}),
		);
		await queryRunner.query(
			`CREATE INDEX "idx_courses_active_curriculum_name" ON ${this.qualifiedTable(queryRunner, 'courses')} ("curriculum_id", lower("name")) WHERE "deleted_at" IS NULL`,
		);

		await queryRunner.createTable(
			new Table({
				name: 'course_rules',
				columns: [
					{
						name: 'id',
						type: 'uuid',
						isPrimary: true,
						default: 'uuid_generate_v4()',
					},
					{ name: 'curriculum_id', type: 'uuid', isNullable: false },
					{ name: 'target_course_id', type: 'uuid', isNullable: false },
					{ name: 'rule_type', type: 'text', isNullable: false },
					{ name: 'prerequisite_course_id', type: 'uuid', isNullable: true },
					{
						name: 'minimum_credits',
						type: 'numeric',
						precision: 6,
						scale: 2,
						isNullable: true,
					},
					{ name: 'source_document_name', type: 'text', isNullable: true },
					{ name: 'source_reference', type: 'text', isNullable: true },
					{ name: 'source_version', type: 'text', isNullable: true },
					{ name: 'source_verified_at', type: 'date', isNullable: true },
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
						name: 'fk_course_rules_curriculum',
						columnNames: ['curriculum_id'],
						referencedTableName: 'curricula',
						referencedColumnNames: ['id'],
						onDelete: 'RESTRICT',
					}),
					new TableForeignKey({
						name: 'fk_course_rules_target_scope',
						columnNames: ['target_course_id', 'curriculum_id'],
						referencedTableName: 'courses',
						referencedColumnNames: ['id', 'curriculum_id'],
						onDelete: 'RESTRICT',
					}),
					new TableForeignKey({
						name: 'fk_course_rules_prerequisite_scope',
						columnNames: ['prerequisite_course_id', 'curriculum_id'],
						referencedTableName: 'courses',
						referencedColumnNames: ['id', 'curriculum_id'],
						onDelete: 'RESTRICT',
					}),
				],
				checks: [
					new TableCheck({
						name: 'chk_course_rules_not_self',
						expression: '"target_course_id" <> "prerequisite_course_id"',
					}),
					new TableCheck({
						name: 'chk_course_rules_shape',
						expression:
							'("rule_type" = \'prerequisite\' AND "prerequisite_course_id" IS NOT NULL AND "minimum_credits" IS NULL) OR ("rule_type" = \'minimum_credits\' AND "prerequisite_course_id" IS NULL AND "minimum_credits" > 0)',
					}),
					new TableCheck({
						name: 'chk_course_rules_source_override',
						expression:
							'("source_document_name" IS NULL AND "source_reference" IS NULL AND "source_version" IS NULL AND "source_verified_at" IS NULL) OR ("source_document_name" IS NOT NULL AND "source_reference" IS NOT NULL AND "source_version" IS NOT NULL AND "source_verified_at" IS NOT NULL)',
					}),
				],
			}),
		);
		await queryRunner.createIndex(
			'course_rules',
			new TableIndex({
				name: 'idx_course_rules_active_curriculum_target',
				columnNames: ['curriculum_id', 'target_course_id'],
				where: 'deleted_at IS NULL',
			}),
		);

		await queryRunner.createForeignKey(
			'student_profiles',
			new TableForeignKey({
				name: 'fk_student_profiles_curriculum_id',
				columnNames: ['curriculum_id'],
				referencedTableName: 'curricula',
				referencedColumnNames: ['id'],
				onDelete: 'RESTRICT',
			}),
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.dropForeignKey(
			'student_profiles',
			'fk_student_profiles_curriculum_id',
		);
		await queryRunner.dropTable('course_rules');
		await queryRunner.dropTable('courses');
		await queryRunner.dropTable('elective_groups');
		await queryRunner.dropTable('curriculum_terms');
		await queryRunner.dropTable('curricula');
	}
}
