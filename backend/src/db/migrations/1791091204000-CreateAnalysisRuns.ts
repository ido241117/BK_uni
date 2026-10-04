import {
	MigrationInterface,
	QueryRunner,
	Table,
	TableForeignKey,
	TableIndex,
} from 'typeorm';

export class CreateAnalysisRuns1791091204000 implements MigrationInterface {
	name = 'CreateAnalysisRuns1791091204000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.createTable(
			new Table({
				name: 'analysis_runs',
				columns: [
					{
						name: 'id',
						type: 'uuid',
						isPrimary: true,
						default: 'uuid_generate_v4()',
					},
					{ name: 'profile_id', type: 'uuid', isNullable: false },
					{ name: 'curriculum_id', type: 'uuid', isNullable: false },
					{ name: 'input_snapshot', type: 'jsonb', isNullable: false },
					{ name: 'result_snapshot', type: 'jsonb', isNullable: false },
					{ name: 'ruleset_version', type: 'text', isNullable: false },
					{
						name: 'created_at',
						type: 'timestamptz',
						default: 'now()',
						isNullable: false,
					},
				],
				foreignKeys: [
					new TableForeignKey({
						name: 'fk_analysis_runs_profile',
						columnNames: ['profile_id'],
						referencedTableName: 'student_profiles',
						referencedColumnNames: ['id'],
						onDelete: 'RESTRICT',
					}),
					new TableForeignKey({
						name: 'fk_analysis_runs_curriculum',
						columnNames: ['curriculum_id'],
						referencedTableName: 'curricula',
						referencedColumnNames: ['id'],
						onDelete: 'RESTRICT',
					}),
				],
			}),
		);
		await queryRunner.createIndex(
			'analysis_runs',
			new TableIndex({
				name: 'idx_analysis_runs_profile_created',
				columnNames: ['profile_id', 'created_at'],
			}),
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.dropTable('analysis_runs');
	}
}