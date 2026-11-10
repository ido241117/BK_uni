import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntityCustom } from '../../common/entities/base-custom.entity';
import { AdvisorSession } from './advisor-session.entity';

/**
 * Vai trò của một bước trong trajectory.
 *
 * - `system`, `context`, `user`, `assistant`, `tool`: được gửi lại cho model ở các lượt sau
 *   (`context` được ghép vào tin nhắn `user` ngay sau nó).
 * - `answer`: câu trả lời cuối đã chuẩn hóa để giao diện hiển thị, không gửi lại cho model.
 * - `error`: lỗi khi gọi model/tool, không gửi lại cho model.
 */
export const ADVISOR_STEP_ROLES = ['system', 'context', 'user', 'assistant', 'tool', 'answer', 'error'] as const;
export type AdvisorStepRole = (typeof ADVISOR_STEP_ROLES)[number];

export interface StoredToolCall {
  id: string;
  name: string;
  arguments: string;
}

@Entity('advisor_steps')
@Unique('UQ_advisor_step_seq', ['session_id', 'seq'])
export class AdvisorStep extends BaseEntityCustom {
  @Column({ type: 'uuid' })
  session_id!: string;

  @ManyToOne(() => AdvisorSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id', foreignKeyConstraintName: 'FK_advisor_step_session' })
  session!: AdvisorSession;

  /** Lượt hỏi-đáp (bắt đầu từ 1). */
  @Column({ type: 'integer' })
  turn!: number;

  /** Thứ tự tuyệt đối trong cuộc trò chuyện. */
  @Column({ type: 'integer' })
  seq!: number;

  @Column({ type: 'varchar', length: 20 })
  role!: AdvisorStepRole;

  /** Nội dung đúng như đã gửi/nhận với model (tool: chuỗi JSON kết quả). */
  @Column({ type: 'text', nullable: true })
  content!: string | null;

  /** Chuỗi suy luận (`reasoning_content`) của model ở chế độ thinking. */
  @Column({ type: 'text', nullable: true })
  reasoning!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  tool_calls!: StoredToolCall[] | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  tool_call_id!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  tool_name!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  tool_args!: unknown;

  /** Dữ liệu có cấu trúc cho giao diện: kết quả tool, câu trả lời cuối, thông tin context. */
  @Column({ type: 'jsonb', nullable: true })
  data!: unknown;

  @Column({ type: 'integer', nullable: true })
  prompt_tokens!: number | null;

  @Column({ type: 'integer', nullable: true })
  completion_tokens!: number | null;

  @Column({ type: 'integer', nullable: true })
  cache_hit_tokens!: number | null;

  @Column({ type: 'integer', nullable: true })
  duration_ms!: number | null;
}
