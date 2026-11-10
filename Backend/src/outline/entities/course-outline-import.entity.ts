import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntityCustom } from '../../common/entities/base-custom.entity';
import { User } from '../../user/entities/user.entity';

export interface OutlineImportIssue {
  index: number;
  course_code: string | null;
  version: string | null;
  errors: string[];
}

/** Nhật ký mỗi lần nhập một file `bkuni.course-outlines` (qua API hoặc dòng lệnh). */
@Entity('course_outline_imports')
export class CourseOutlineImport extends BaseEntityCustom {
  /** Người nhập qua API; `null` khi nhập bằng dòng lệnh. */
  @Column({ type: 'uuid', nullable: true })
  created_by!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by', foreignKeyConstraintName: 'FK_outline_import_user' })
  creator!: User | null;

  /** `api` hoặc `cli`. */
  @Column({ type: 'varchar', length: 10 })
  channel!: string;

  @Column({ type: 'integer' })
  format_version!: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  source!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  generated_at!: Date | null;

  @Column({ type: 'integer', nullable: true })
  part!: number | null;

  @Column({ type: 'integer', nullable: true })
  parts!: number | null;

  @Column({ type: 'integer' })
  received!: number;

  @Column({ type: 'integer' })
  created!: number;

  @Column({ type: 'integer' })
  updated!: number;

  @Column({ type: 'integer' })
  unchanged!: number;

  @Column({ type: 'integer' })
  skipped!: number;

  /** Đề cương bị bỏ qua vì không hợp lệ (tối đa 200 mục). */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  issues!: OutlineImportIssue[];
}
