import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import { BaseEntityCustom } from '../../common/entities/base-custom.entity';
import { User } from '../../user/entities/user.entity';

/**
 * Nội dung file tiến độ myBK đã đọc (JSON của `python -m planner.mybk`), mỗi tài khoản một dòng.
 * Có cả họ tên, MSSV, điểm (người duyệt chốt 20/11); chỉ trả cho chính tài khoản đó.
 */
@Entity('student_progress_imports')
export class StudentProgressImport extends BaseEntityCustom {
  @Column({ type: 'uuid', unique: true })
  user_id!: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'FK_student_progress_import_user' })
  user!: User;

  @Column({ type: 'varchar', length: 10 })
  format!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  official_program_code!: string | null;

  @Column({ type: 'date', nullable: true })
  source_updated_at!: string | null;

  @Column({ type: 'jsonb' })
  data!: Record<string, unknown>;
}
