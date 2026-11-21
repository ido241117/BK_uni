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

  /**
   * Nguồn dữ liệu (`mybk`) và mã CTĐT myBK (vd `DH_CQ_MT_KHM_2023`), cùng mã ở dòng "Ngành:" của PDF tiến độ.
   * Cột do migration `CurriculumSourceAndGroupSemester1795600000000` (nhánh main) tạo, đã chạy trên Supabase;
   * nhánh này chỉ khai để đọc. Bỏ khi gộp main (entity bên main đã có).
   */
  @Column({ type: 'varchar', length: 20, nullable: true })
  source_system!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  source_code!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  source_version!: string | null;

  /** Tổng tín chỉ tốt nghiệp (myBK). Cột cũng do migration bên main tạo. */
  @Column({ type: 'integer', nullable: true })
  total_credits!: number | null;
}
