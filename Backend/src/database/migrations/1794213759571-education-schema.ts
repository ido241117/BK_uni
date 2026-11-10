import { MigrationInterface, QueryRunner } from "typeorm";

export class EducationSchema1794213759571 implements MigrationInterface {
    name = 'EducationSchema1794213759571'

    public async up(queryRunner: QueryRunner): Promise<void> {
        const schema = this.schema(queryRunner);
        await queryRunner.query(`CREATE TABLE ${schema}."courses" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedBy" uuid, "code" character varying(50) NOT NULL, "name" character varying(255) NOT NULL, "credits" integer NOT NULL, CONSTRAINT "CHK_courses_credits" CHECK ("credits" > 0), CONSTRAINT "PK_3f70a487cc718ad8eda4e6d58c9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE ${schema}."course_opened_semesters" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedBy" uuid, "courseId" uuid NOT NULL, "semesterCode" character varying(3) NOT NULL, CONSTRAINT "UQ_course_opened_semester" UNIQUE ("courseId", "semesterCode"), CONSTRAINT "CHK_course_opened_semester_code" CHECK ("semesterCode" ~ '^[0-9]{2}[123]$'), CONSTRAINT "PK_f89e555f6aa8193ab98d3caf5c1" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE ${schema}."curricula" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedBy" uuid, "code" character varying(50) NOT NULL, "name" character varying(255) NOT NULL, "major" character varying(255) NOT NULL, "faculty" character varying(255) NOT NULL, "cohort" integer NOT NULL, "durationYears" integer NOT NULL, "minSemesterCredits" integer NOT NULL, "maxSemesterCredits" integer NOT NULL, "description" text, CONSTRAINT "CHK_curricula_credit_limits" CHECK ("minSemesterCredits" >= 0 AND "maxSemesterCredits" >= "minSemesterCredits"), CONSTRAINT "CHK_curricula_cohort" CHECK ("cohort" BETWEEN 2000 AND 2099), CONSTRAINT "CHK_curricula_duration" CHECK ("durationYears" > 0), CONSTRAINT "PK_7c5dd2066e2bbf3b6ad0a71c567" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE ${schema}."curriculum_courses" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedBy" uuid, "curriculumId" uuid NOT NULL, "courseId" uuid NOT NULL, "recommendedYear" integer NOT NULL, "recommendedTerm" integer NOT NULL, CONSTRAINT "UQ_curriculum_course" UNIQUE ("curriculumId", "courseId"), CONSTRAINT "CHK_curriculum_course_term" CHECK ("recommendedTerm" IN (1, 2, 3)), CONSTRAINT "CHK_curriculum_course_year" CHECK ("recommendedYear" > 0), CONSTRAINT "PK_c1da7e5e440e1985553b1038dcb" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE ${schema}."course_group_kind_enum" AS ENUM('required', 'elective')`);
        await queryRunner.query(`CREATE TABLE ${schema}."course_groups" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedBy" uuid, "curriculumId" uuid NOT NULL, "name" character varying(255) NOT NULL, "kind" ${schema}."course_group_kind_enum" NOT NULL, "requiredCount" integer NOT NULL, CONSTRAINT "UQ_course_group_id_curriculum" UNIQUE ("id", "curriculumId"), CONSTRAINT "CHK_course_group_count" CHECK ("requiredCount" > 0), CONSTRAINT "PK_9722c03add9ea0dca5c69447398" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE ${schema}."course_group_members" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedBy" uuid, "curriculumId" uuid NOT NULL, "groupId" uuid NOT NULL, "courseId" uuid NOT NULL, CONSTRAINT "UQ_course_group_member_curriculum_course" UNIQUE ("curriculumId", "courseId"), CONSTRAINT "PK_85b85996a4d4c27c45938513abf" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE ${schema}."course_relation_type_enum" AS ENUM('prerequisite', 'recommended')`);
        await queryRunner.query(`CREATE TABLE ${schema}."course_relations" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedBy" uuid, "curriculumId" uuid NOT NULL, "courseId" uuid NOT NULL, "relatedCourseId" uuid NOT NULL, "type" ${schema}."course_relation_type_enum" NOT NULL, CONSTRAINT "UQ_course_relation" UNIQUE ("curriculumId", "courseId", "relatedCourseId", "type"), CONSTRAINT "CHK_course_relation_distinct" CHECK ("courseId" <> "relatedCourseId"), CONSTRAINT "PK_3798bbbd444521373cc246bf1b1" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE ${schema}."curriculum_regulations" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedBy" uuid, "curriculumId" uuid NOT NULL, "name" character varying(255) NOT NULL, "detail" text NOT NULL, CONSTRAINT "PK_12b7a6eb75b1380b390afea98a2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE ${schema}."student_profiles" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedBy" uuid, "userId" uuid NOT NULL, "fullName" character varying(255), "studentNumber" character varying(50), "phone" character varying(30), "birthDate" date, "admissionYear" integer, "address" text, "curriculumId" uuid, "creditTarget" integer, CONSTRAINT "UQ_student_profile_number" UNIQUE ("studentNumber"), CONSTRAINT "REL_064d129936a1e821d637ee8c88" UNIQUE ("userId"), CONSTRAINT "CHK_student_profile_credit_target" CHECK ("creditTarget" IS NULL OR "creditTarget" > 0), CONSTRAINT "CHK_student_profile_admission_year" CHECK ("admissionYear" IS NULL OR "admissionYear" BETWEEN 2000 AND 2099), CONSTRAINT "PK_5ed0a32eeaddfe812fb326177d0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE ${schema}."student_course_status_enum" AS ENUM('not-started', 'in-progress', 'completed')`);
        await queryRunner.query(`CREATE TABLE ${schema}."student_courses" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedBy" uuid, "userId" uuid NOT NULL, "courseId" uuid NOT NULL, "status" ${schema}."student_course_status_enum" NOT NULL DEFAULT 'not-started', CONSTRAINT "UQ_student_course" UNIQUE ("userId", "courseId"), CONSTRAINT "PK_6c63b56af68884a5a69dde6a32d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE ${schema}."student_plan_courses" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedBy" uuid, "userId" uuid NOT NULL, "curriculumId" uuid NOT NULL, "courseId" uuid NOT NULL, "semesterCode" character varying(3) NOT NULL, CONSTRAINT "UQ_student_plan_course" UNIQUE ("userId", "curriculumId", "courseId"), CONSTRAINT "CHK_student_plan_semester_code" CHECK ("semesterCode" ~ '^[0-9]{2}[123]$'), CONSTRAINT "PK_dc37ee8eeedd3e9810430168e4f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE ${schema}."student_regulation_status_enum" AS ENUM('not-started', 'completed')`);
        await queryRunner.query(`CREATE TABLE ${schema}."student_regulation_statuses" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedBy" uuid, "userId" uuid NOT NULL, "regulationId" uuid NOT NULL, "status" ${schema}."student_regulation_status_enum" NOT NULL DEFAULT 'not-started', CONSTRAINT "UQ_student_regulation_status" UNIQUE ("userId", "regulationId"), CONSTRAINT "PK_15b696cafb414f89b324a2de53e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE ${schema}."course_opened_semesters" ADD CONSTRAINT "FK_opened_semester_course" FOREIGN KEY ("courseId") REFERENCES ${schema}."courses"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE ${schema}."curriculum_courses" ADD CONSTRAINT "FK_curriculum_course_curriculum" FOREIGN KEY ("curriculumId") REFERENCES ${schema}."curricula"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE ${schema}."curriculum_courses" ADD CONSTRAINT "FK_curriculum_course_course" FOREIGN KEY ("courseId") REFERENCES ${schema}."courses"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE ${schema}."course_groups" ADD CONSTRAINT "FK_course_group_curriculum" FOREIGN KEY ("curriculumId") REFERENCES ${schema}."curricula"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE ${schema}."course_group_members" ADD CONSTRAINT "FK_group_member_group" FOREIGN KEY ("groupId", "curriculumId") REFERENCES ${schema}."course_groups"("id","curriculumId") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE ${schema}."course_group_members" ADD CONSTRAINT "FK_group_member_assignment" FOREIGN KEY ("curriculumId", "courseId") REFERENCES ${schema}."curriculum_courses"("curriculumId","courseId") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE ${schema}."course_relations" ADD CONSTRAINT "FK_course_relation_course" FOREIGN KEY ("curriculumId", "courseId") REFERENCES ${schema}."curriculum_courses"("curriculumId","courseId") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE ${schema}."course_relations" ADD CONSTRAINT "FK_course_relation_related" FOREIGN KEY ("curriculumId", "relatedCourseId") REFERENCES ${schema}."curriculum_courses"("curriculumId","courseId") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE ${schema}."curriculum_regulations" ADD CONSTRAINT "FK_regulation_curriculum" FOREIGN KEY ("curriculumId") REFERENCES ${schema}."curricula"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE ${schema}."student_profiles" ADD CONSTRAINT "FK_student_profile_user" FOREIGN KEY ("userId") REFERENCES ${schema}."users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE ${schema}."student_profiles" ADD CONSTRAINT "FK_student_profile_curriculum" FOREIGN KEY ("curriculumId") REFERENCES ${schema}."curricula"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE ${schema}."student_courses" ADD CONSTRAINT "FK_student_course_user" FOREIGN KEY ("userId") REFERENCES ${schema}."users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE ${schema}."student_courses" ADD CONSTRAINT "FK_student_course_course" FOREIGN KEY ("courseId") REFERENCES ${schema}."courses"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE ${schema}."student_plan_courses" ADD CONSTRAINT "FK_student_plan_user" FOREIGN KEY ("userId") REFERENCES ${schema}."users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE ${schema}."student_plan_courses" ADD CONSTRAINT "FK_student_plan_assignment" FOREIGN KEY ("curriculumId", "courseId") REFERENCES ${schema}."curriculum_courses"("curriculumId","courseId") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE ${schema}."student_regulation_statuses" ADD CONSTRAINT "FK_student_regulation_user" FOREIGN KEY ("userId") REFERENCES ${schema}."users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE ${schema}."student_regulation_statuses" ADD CONSTRAINT "FK_student_regulation_regulation" FOREIGN KEY ("regulationId") REFERENCES ${schema}."curriculum_regulations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_courses_code_lower" ON ${schema}."courses" (lower("code"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_curricula_code_lower" ON ${schema}."curricula" (lower("code"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_course_groups_name_lower" ON ${schema}."course_groups" ("curriculumId", lower("name"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const schema = this.schema(queryRunner);
        await queryRunner.query(`ALTER TABLE ${schema}."student_regulation_statuses" DROP CONSTRAINT "FK_student_regulation_regulation"`);
        await queryRunner.query(`ALTER TABLE ${schema}."student_regulation_statuses" DROP CONSTRAINT "FK_student_regulation_user"`);
        await queryRunner.query(`ALTER TABLE ${schema}."student_plan_courses" DROP CONSTRAINT "FK_student_plan_assignment"`);
        await queryRunner.query(`ALTER TABLE ${schema}."student_plan_courses" DROP CONSTRAINT "FK_student_plan_user"`);
        await queryRunner.query(`ALTER TABLE ${schema}."student_courses" DROP CONSTRAINT "FK_student_course_course"`);
        await queryRunner.query(`ALTER TABLE ${schema}."student_courses" DROP CONSTRAINT "FK_student_course_user"`);
        await queryRunner.query(`ALTER TABLE ${schema}."student_profiles" DROP CONSTRAINT "FK_student_profile_curriculum"`);
        await queryRunner.query(`ALTER TABLE ${schema}."student_profiles" DROP CONSTRAINT "FK_student_profile_user"`);
        await queryRunner.query(`ALTER TABLE ${schema}."curriculum_regulations" DROP CONSTRAINT "FK_regulation_curriculum"`);
        await queryRunner.query(`ALTER TABLE ${schema}."course_relations" DROP CONSTRAINT "FK_course_relation_related"`);
        await queryRunner.query(`ALTER TABLE ${schema}."course_relations" DROP CONSTRAINT "FK_course_relation_course"`);
        await queryRunner.query(`ALTER TABLE ${schema}."course_group_members" DROP CONSTRAINT "FK_group_member_assignment"`);
        await queryRunner.query(`ALTER TABLE ${schema}."course_group_members" DROP CONSTRAINT "FK_group_member_group"`);
        await queryRunner.query(`ALTER TABLE ${schema}."course_groups" DROP CONSTRAINT "FK_course_group_curriculum"`);
        await queryRunner.query(`ALTER TABLE ${schema}."curriculum_courses" DROP CONSTRAINT "FK_curriculum_course_course"`);
        await queryRunner.query(`ALTER TABLE ${schema}."curriculum_courses" DROP CONSTRAINT "FK_curriculum_course_curriculum"`);
        await queryRunner.query(`ALTER TABLE ${schema}."course_opened_semesters" DROP CONSTRAINT "FK_opened_semester_course"`);
        await queryRunner.query(`DROP TABLE ${schema}."student_regulation_statuses"`);
        await queryRunner.query(`DROP TYPE ${schema}."student_regulation_status_enum"`);
        await queryRunner.query(`DROP TABLE ${schema}."student_plan_courses"`);
        await queryRunner.query(`DROP TABLE ${schema}."student_courses"`);
        await queryRunner.query(`DROP TYPE ${schema}."student_course_status_enum"`);
        await queryRunner.query(`DROP TABLE ${schema}."student_profiles"`);
        await queryRunner.query(`DROP TABLE ${schema}."curriculum_regulations"`);
        await queryRunner.query(`DROP TABLE ${schema}."course_relations"`);
        await queryRunner.query(`DROP TYPE ${schema}."course_relation_type_enum"`);
        await queryRunner.query(`DROP TABLE ${schema}."course_group_members"`);
        await queryRunner.query(`DROP TABLE ${schema}."course_groups"`);
        await queryRunner.query(`DROP TYPE ${schema}."course_group_kind_enum"`);
        await queryRunner.query(`DROP TABLE ${schema}."curriculum_courses"`);
        await queryRunner.query(`DROP TABLE ${schema}."curricula"`);
        await queryRunner.query(`DROP TABLE ${schema}."course_opened_semesters"`);
        await queryRunner.query(`DROP TABLE ${schema}."courses"`);
    }

    private schema(queryRunner: QueryRunner): string {
        const options = queryRunner.connection.options;
        const schema = 'schema' in options ? options.schema ?? 'public' : 'public';
        if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Invalid database schema');
        return `"${schema}"`;
    }
}
