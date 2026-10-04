import { Column, Entity, Index } from 'typeorm';
import { BaseEntityCustom } from '../common/entities/base-custom.entity';

export type UserRole = 'student' | 'admin';

@Entity({ name: 'users' })
export class User extends BaseEntityCustom {
	@Column({ type: 'text' })
	@Index('uq_users_email_lower', { synchronize: false })
	email: string;

	@Column({ name: 'password_hash', type: 'text' })
	passwordHash: string;

	@Column({ type: 'text', default: 'student' })
	role: UserRole;
}
