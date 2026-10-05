import {
	Check,
	Column,
	DeleteDateColumn,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	OneToMany,
} from 'typeorm';
import { BaseEntityCustom } from '../common/entities/base-custom.entity';
import { User } from '../users/user.entity';
import { Course } from './course.entity';
import { CurriculumTerm } from './curriculum-term.entity';
import { ElectiveGroup } from './elective-group.entity';

@Entity({ name: 'curricula' })
@Index('uq_curricula_active_name', { synchronize: false })
@Check(
	'chk_curricula_recommendation_settings_all_or_none',
	'("total_credits_target" IS NULL AND "minimum_semester_credits" IS NULL AND "maximum_semester_credits" IS NULL) OR ("total_credits_target" IS NOT NULL AND "minimum_semester_credits" IS NOT NULL AND "maximum_semester_credits" IS NOT NULL)',
)
@Check(
	'chk_curricula_recommendation_settings_valid',
	'"total_credits_target" IS NULL OR ("total_credits_target" > 0 AND "minimum_semester_credits" >= 0 AND "maximum_semester_credits" > 0 AND "minimum_semester_credits" <= "maximum_semester_credits")',
)
export class Curriculum extends BaseEntityCustom {
	@Column({ type: 'text' })
	name: string;

	@Column({ type: 'text', nullable: true })
	description: string | null;

	@Column({
		name: 'total_credits_target',
		type: 'numeric',
		precision: 7,
		scale: 2,
		nullable: true,
	})
	totalCreditsTarget: string | null;

	@Column({
		name: 'minimum_semester_credits',
		type: 'numeric',
		precision: 5,
		scale: 2,
		nullable: true,
	})
	minimumSemesterCredits: string | null;

	@Column({
		name: 'maximum_semester_credits',
		type: 'numeric',
		precision: 5,
		scale: 2,
		nullable: true,
	})
	maximumSemesterCredits: string | null;

	@Column({ name: 'created_by', type: 'uuid' })
	createdBy: string;

	@ManyToOne(() => User, { onDelete: 'RESTRICT' })
	@JoinColumn({ name: 'created_by' })
	creator: User;

	@Column({ name: 'source_document_name', type: 'text' })
	sourceDocumentName: string;

	@Column({ name: 'source_reference', type: 'text' })
	sourceReference: string;

	@Column({ name: 'source_version', type: 'text' })
	sourceVersion: string;

	@Column({ name: 'source_verified_at', type: 'date' })
	sourceVerifiedAt: string;

	@DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
	deletedAt: Date | null;

	@OneToMany(() => CurriculumTerm, (term) => term.curriculum)
	terms: CurriculumTerm[];

	@OneToMany(() => ElectiveGroup, (group) => group.curriculum)
	electiveGroups: ElectiveGroup[];

	@OneToMany(() => Course, (course) => course.curriculum)
	courses: Course[];
}
