import {
	Column,
	DeleteDateColumn,
	Entity,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
	Unique,
} from 'typeorm';
import { Curriculum } from './curriculum.entity';

@Entity({ name: 'curriculum_terms' })
@Unique('uq_curriculum_terms_id_curriculum', ['id', 'curriculumId'])
@Unique('uq_curriculum_terms_code', ['curriculumId', 'termCode'])
@Unique('uq_curriculum_terms_sort_order', ['curriculumId', 'sortOrder'])
export class CurriculumTerm {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ name: 'curriculum_id', type: 'uuid' })
	curriculumId: string;

	@ManyToOne(() => Curriculum, (curriculum) => curriculum.terms, {
		onDelete: 'RESTRICT',
	})
	@JoinColumn({ name: 'curriculum_id' })
	curriculum: Curriculum;

	@Column({ name: 'term_code', type: 'text' })
	termCode: string;

	@Column({ type: 'text' })
	name: string;

	@Column({ name: 'sort_order', type: 'integer' })
	sortOrder: number;

	@DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
	deletedAt: Date | null;
}
