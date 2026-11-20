import { Column, Entity, Index } from 'typeorm';
import { BaseEntityCustom } from '../../common/entities/base-custom.entity';

@Entity('curricula')
@Index('UQ_curricula_code_lower', { synchronize: false })
export class Curriculum extends BaseEntityCustom {
  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 255 })
  major!: string;

  @Column({ type: 'varchar', length: 255 })
  faculty!: string;

  @Column({ type: 'integer' })
  cohort!: number;

  @Column({ type: 'integer' })
  duration_years!: number;

  @Column({ type: 'integer' })
  min_semester_credits!: number;

  @Column({ type: 'integer' })
  max_semester_credits!: number;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  /** Tổng tín chỉ tốt nghiệp khai báo ở nguồn; `null` khi không rõ (tính từ các khối). */
  @Column({ type: 'integer', nullable: true })
  total_credits!: number | null;

  /**
   * `true` khi sinh viên phải đạt đúng một chuyên ngành mới đủ điều kiện tốt nghiệp (myBK: các chuyên ngành là
   * CTĐT con cộng tín chỉ, không có chuyên ngành "chung"). `false`: chuyên ngành là tùy chọn.
   */
  @Column({ type: 'boolean', default: false })
  specialization_required!: boolean;

  /** Hệ thống nguồn của dữ liệu (vd `mybk`); `null` với chương trình nhập tay. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  source_system!: string | null;

  /** Mã CTĐT ở nguồn, vd `DH_CQ_MT_NG_KHM_2023`. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  source_code!: string | null;

  /** Id CTĐT ở nguồn. */
  @Column({ type: 'integer', nullable: true })
  source_id!: number | null;

  /** Phiên bản CTĐT ở nguồn, vd `DH_CQ_MT_NG_KHM_2023.v01`. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  source_version!: string | null;
}
