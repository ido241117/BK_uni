import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntityCustom } from '../../common/entities/base-custom.entity';
import { User } from '../../user/entities/user.entity';

@Entity('auth_sessions')
export class AuthSession extends BaseEntityCustom {
  @Index('IDX_auth_sessions_user')
  @Column({ type: 'uuid' })
  user_id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'FK_auth_sessions_user' })
  user!: User;

  @Column({ type: 'timestamptz' })
  expires_at!: Date;
}
