import {
	MigrationInterface,
	QueryRunner,
	Table,
	TableCheck,
	TableForeignKey,
	TableIndex,
} from 'typeorm';

export class CreateStudentCourseStatuses1791091203000 implements MigrationInterface {
	name = 'CreateStudentCourseStatuses1791091203000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.createTable(
			new Table({
				name: 'student_course_statuses',
				columns: [
					{ name: 'profile_id', type: 'uuid', isPrimary: true },
					{ name: 'curriculum_id', type: 'uuid', isPrimary: true },
					{ name: 'course_id', type: 'uuid', isPrimary: true },
					{ name: 'status', type: 'text', isNullable: false },
				],
				checks: [
					new TableCheck({
						name: 'chk_student_course_status_value',
						expression: `"status" IN ('not_started', 'in_progress', 'completed')`,
					}),
				],
				foreignKeys: [
					new TableForeignKey({
						name: 'fk_student_course_status_profile',
						columnNames: ['profile_id'],
						referencedTableName: 'student_profiles',
						referencedColumnNames: ['id'],
						onDelete: 'CASCADE',
					}),
					new TableForeignKey({
						name: 'fk_student_course_status_course',
						columnNames: ['course_id', 'curriculum_id'],
						referencedTableName: 'courses',
						referencedColumnNames: ['id', 'curriculum_id'],
						onDelete: 'RESTRICT',
					}),
				],
			}),
		);
		await queryRunner.createIndex(
			'student_course_statuses',
			new TableIndex({
				name: 'idx_student_course_statuses_profile_curriculum',
				columnNames: ['profile_id', 'curriculum_id'],
			}),
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.dropTable('student_course_statuses');
	}
}
