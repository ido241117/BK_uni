import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity({ name: 'auth_sessions' })
@Index('idx_auth_sessions_user_expires', ['userId', 'expiresAt'])
export class AuthSession {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ name: 'user_id', type: 'uuid' })
	userId: string;

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'user_id' })
	user: User;

	@Column({ name: 'token_hash', type: 'text', unique: true })
	tokenHash: string;

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt: Date;

	@Column({ name: 'expires_at', type: 'timestamptz' })
	expiresAt: Date;

	@Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
	revokedAt: Date | null;
}