import {
	Check,
	Column,
	DeleteDateColumn,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
	Unique,
} from 'typeorm';
import { Curriculum } from './curriculum.entity';

@Entity({ name: 'elective_groups' })
@Unique('uq_elective_groups_id_curriculum', ['id', 'curriculumId'])
@Index('uq_elective_groups_active_name', { synchronize: false })
@Check(
	'chk_elective_groups_threshold',
	'"required_credits" IS NOT NULL OR "required_courses" IS NOT NULL',
)
@Check(
	'chk_elective_groups_positive_thresholds',
	'("required_credits" IS NULL OR "required_credits" > 0) AND ("required_courses" IS NULL OR "required_courses" > 0)',
)
export class ElectiveGroup {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ name: 'curriculum_id', type: 'uuid' })
	curriculumId: string;

	@ManyToOne(() => Curriculum, (curriculum) => curriculum.electiveGroups, {
		onDelete: 'RESTRICT',
	})
	@JoinColumn({ name: 'curriculum_id' })
	curriculum: Curriculum;

	@Column({ type: 'text' })
	name: string;

	@Column({
		name: 'required_credits',
		type: 'numeric',
		precision: 6,
		scale: 2,
		nullable: true,
	})
	requiredCredits: string | null;

	@Column({ name: 'required_courses', type: 'integer', nullable: true })
	requiredCourses: number | null;

	@Column({ name: 'sort_order', type: 'integer' })
	sortOrder: number;

	@DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
	deletedAt: Date | null;
}
