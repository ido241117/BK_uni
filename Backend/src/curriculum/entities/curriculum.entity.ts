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
}
