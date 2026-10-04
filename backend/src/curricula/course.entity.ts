import {
	Check,
	Column,
	CreateDateColumn,
	DeleteDateColumn,
	Entity,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
	Unique,
	UpdateDateColumn,
} from 'typeorm';
import { Curriculum } from './curriculum.entity';
import { CurriculumTerm } from './curriculum-term.entity';
import { ElectiveGroup } from './elective-group.entity';

export type CourseRequirementType = 'required' | 'elective';

@Entity({ name: 'courses' })
@Unique('uq_courses_id_curriculum', ['id', 'curriculumId'])
@Check('chk_courses_credits_nonnegative', '"credits" >= 0')
@Check(
	'chk_courses_requirement_group',
	'("requirement_type" = \'required\' AND "elective_group_id" IS NULL) OR ("requirement_type" = \'elective\' AND "elective_group_id" IS NOT NULL)',
)
export class Course {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ name: 'curriculum_id', type: 'uuid' })
	curriculumId: string;

	@ManyToOne(() => Curriculum, (curriculum) => curriculum.courses, {
		onDelete: 'RESTRICT',
	})
	@JoinColumn({ name: 'curriculum_id' })
	curriculum: Curriculum;

	@Column({ name: 'course_code', type: 'text' })
	courseCode: string;

	@Column({ name: 'course_version', type: 'text', default: '1' })
	courseVersion: string;

	@Column({ type: 'text' })
	name: string;

	@Column({ name: 'name_en', type: 'text', nullable: true })
	nameEn: string | null;

	@Column({ type: 'numeric', precision: 5, scale: 2 })
	credits: string;

	@Column({ name: 'term_id', type: 'uuid' })
	termId: string;

	@ManyToOne(() => CurriculumTerm, { onDelete: 'RESTRICT' })
	@JoinColumn([
		{ name: 'term_id', referencedColumnName: 'id' },
		{ name: 'curriculum_id', referencedColumnName: 'curriculumId' },
	])
	term: CurriculumTerm;

	@Column({ name: 'requirement_type', type: 'text' })
	requirementType: CourseRequirementType;

	@Column({ name: 'elective_group_id', type: 'uuid', nullable: true })
	electiveGroupId: string | null;

	@ManyToOne(() => ElectiveGroup, { nullable: true, onDelete: 'RESTRICT' })
	@JoinColumn([
		{ name: 'elective_group_id', referencedColumnName: 'id' },
		{ name: 'curriculum_id', referencedColumnName: 'curriculumId' },
	])
	electiveGroup: ElectiveGroup | null;

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt: Date;

	@UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
	updatedAt: Date;

	@DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
	deletedAt: Date | null;
}
