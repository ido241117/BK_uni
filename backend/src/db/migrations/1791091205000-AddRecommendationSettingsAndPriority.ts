import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRecommendationSettingsAndPriority1791091205000 implements MigrationInterface {
	name = 'AddRecommendationSettingsAndPriority1791091205000';

	private qualifiedTable(queryRunner: QueryRunner, tableName: string): string {
		const schema =
			(queryRunner.connection.options as { schema?: string }).schema ??
			'public';
		const quote = (identifier: string) =>
			`"${identifier.replaceAll('"', '""')}"`;
		return `${quote(schema)}.${quote(tableName)}`;
	}

	public async up(queryRunner: QueryRunner): Promise<void> {
		const curricula = this.qualifiedTable(queryRunner, 'curricula');
		const courses = this.qualifiedTable(queryRunner, 'courses');
		const terms = this.qualifiedTable(queryRunner, 'curriculum_terms');

		await queryRunner.query(
			`ALTER TABLE ${curricula}
			ADD COLUMN "total_credits_target" numeric(7,2),
			ADD COLUMN "minimum_semester_credits" numeric(5,2),
			ADD COLUMN "maximum_semester_credits" numeric(5,2)`,
		);
		await queryRunner.query(
			`ALTER TABLE ${curricula}
			ADD CONSTRAINT "chk_curricula_recommendation_settings_all_or_none"
			CHECK (("total_credits_target" IS NULL AND "minimum_semester_credits" IS NULL AND "maximum_semester_credits" IS NULL) OR ("total_credits_target" IS NOT NULL AND "minimum_semester_credits" IS NOT NULL AND "maximum_semester_credits" IS NOT NULL)),
			ADD CONSTRAINT "chk_curricula_recommendation_settings_valid"
			CHECK ("total_credits_target" IS NULL OR ("total_credits_target" > 0 AND "minimum_semester_credits" >= 0 AND "maximum_semester_credits" > 0 AND "minimum_semester_credits" <= "maximum_semester_credits"))`,
		);

		await queryRunner.query(
			`ALTER TABLE ${courses} ADD COLUMN "recommendation_priority" integer`,
		);
		await queryRunner.query(
			`WITH ranked_courses AS (
				SELECT course.id,
					(ROW_NUMBER() OVER (
						PARTITION BY course.curriculum_id, course.requirement_type
						ORDER BY term.sort_order, course.course_code, course.course_version, course.id
					) - 1)::integer AS priority
				FROM ${courses} course
				INNER JOIN ${terms} term
					ON term.id = course.term_id
					AND term.curriculum_id = course.curriculum_id
			)
			UPDATE ${courses} course
			SET recommendation_priority = ranked_courses.priority
			FROM ranked_courses
			WHERE course.id = ranked_courses.id`,
		);
		await queryRunner.query(
			`ALTER TABLE ${courses}
			ALTER COLUMN "recommendation_priority" SET NOT NULL,
			ADD CONSTRAINT "chk_courses_recommendation_priority_nonnegative"
			CHECK ("recommendation_priority" >= 0)`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		const curricula = this.qualifiedTable(queryRunner, 'curricula');
		const courses = this.qualifiedTable(queryRunner, 'courses');

		await queryRunner.query(
			`ALTER TABLE ${courses}
			DROP CONSTRAINT "chk_courses_recommendation_priority_nonnegative",
			DROP COLUMN "recommendation_priority"`,
		);
		await queryRunner.query(
			`ALTER TABLE ${curricula}
			DROP CONSTRAINT "chk_curricula_recommendation_settings_all_or_none",
			DROP CONSTRAINT "chk_curricula_recommendation_settings_valid",
			DROP COLUMN "total_credits_target",
			DROP COLUMN "minimum_semester_credits",
			DROP COLUMN "maximum_semester_credits"`,
		);
	}
}
