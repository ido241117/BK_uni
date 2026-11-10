import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntityCustom } from '../../common/entities/base-custom.entity';
import { User } from '../../user/entities/user.entity';

/** Một cuộc trò chuyện "Tư vấn với AI" của sinh viên; các bước nằm ở `advisor_steps`. */
@Entity('advisor_sessions')
@Index('IDX_advisor_session_user', ['user_id', 'updated_at'])
export class AdvisorSession extends BaseEntityCustom {
  @Column({ type: 'uuid' })
  user_id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'FK_advisor_session_user' })
  user!: User;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  /** Ảnh chụp kết quả trang "Phân tích học tập" gửi kèm tin nhắn gần nhất (frontend tự tính). */
  @Column({ type: 'jsonb', nullable: true, select: false })
  snapshot!: Record<string, unknown> | null;

  /** Mã băm của `snapshot` để biết lần sau có cần gửi lại context cho model không. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  snapshot_hash!: string | null;

  @Column({ type: 'varchar', length: 100 })
  model!: string;
}
