import {
	Column,
	DeleteDateColumn,
	Entity,
	Index,
	JoinColumn,
	OneToOne,
} from 'typeorm';
import { BaseEntityCustom } from '../common/entities/base-custom.entity';
import { User } from './user.entity';

@Entity({ name: 'student_profiles' })
export class StudentProfile extends BaseEntityCustom {
	@Index('uq_student_profiles_user_id', { unique: true })
	@Column({ name: 'user_id', type: 'uuid' })
	userId: string;

	@OneToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'user_id' })
	user: User;

	@Column({ name: 'display_name', type: 'text', nullable: true })
	displayName: string | null;

	@Column({ name: 'curriculum_id', type: 'uuid', nullable: true })
	curriculumId: string | null;

	@DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
	deletedAt: Date | null;
}