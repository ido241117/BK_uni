import {
	Check,
	Column,
	CreateDateColumn,
	DeleteDateColumn,
	Entity,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from 'typeorm';
import { Course } from './course.entity';
import { Curriculum } from './curriculum.entity';

export type CourseRuleType = 'prerequisite' | 'minimum_credits';

@Entity({ name: 'course_rules' })
@Check(
	'chk_course_rules_not_self',
	'"target_course_id" <> "prerequisite_course_id"',
)
@Check(
	'chk_course_rules_shape',
	'("rule_type" = \'prerequisite\' AND "prerequisite_course_id" IS NOT NULL AND "minimum_credits" IS NULL) OR ("rule_type" = \'minimum_credits\' AND "prerequisite_course_id" IS NULL AND "minimum_credits" > 0)',
)
@Check(
	'chk_course_rules_source_override',
	'("source_document_name" IS NULL AND "source_reference" IS NULL AND "source_version" IS NULL AND "source_verified_at" IS NULL) OR ("source_document_name" IS NOT NULL AND "source_reference" IS NOT NULL AND "source_version" IS NOT NULL AND "source_verified_at" IS NOT NULL)',
)
export class CourseRule {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ name: 'curriculum_id', type: 'uuid' })
	curriculumId: string;

	@ManyToOne(() => Curriculum, { onDelete: 'RESTRICT' })
	@JoinColumn({ name: 'curriculum_id' })
	curriculum: Curriculum;

	@Column({ name: 'target_course_id', type: 'uuid' })
	targetCourseId: string;

	@ManyToOne(() => Course, { onDelete: 'RESTRICT' })
	@JoinColumn([
		{ name: 'target_course_id', referencedColumnName: 'id' },
		{ name: 'curriculum_id', referencedColumnName: 'curriculumId' },
	])
	targetCourse: Course;

	@Column({ name: 'rule_type', type: 'text' })
	ruleType: CourseRuleType;

	@Column({ name: 'prerequisite_course_id', type: 'uuid', nullable: true })
	prerequisiteCourseId: string | null;

	@ManyToOne(() => Course, { nullable: true, onDelete: 'RESTRICT' })
	@JoinColumn([
		{ name: 'prerequisite_course_id', referencedColumnName: 'id' },
		{ name: 'curriculum_id', referencedColumnName: 'curriculumId' },
	])
	prerequisiteCourse: Course | null;

	@Column({
		name: 'minimum_credits',
		type: 'numeric',
		precision: 6,
		scale: 2,
		nullable: true,
	})
	minimumCredits: string | null;

	@Column({ name: 'source_document_name', type: 'text', nullable: true })
	sourceDocumentName: string | null;

	@Column({ name: 'source_reference', type: 'text', nullable: true })
	sourceReference: string | null;

	@Column({ name: 'source_version', type: 'text', nullable: true })
	sourceVersion: string | null;

	@Column({ name: 'source_verified_at', type: 'date', nullable: true })
	sourceVerifiedAt: string | null;

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt: Date;

	@UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
	updatedAt: Date;

	@DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
	deletedAt: Date | null;
}
