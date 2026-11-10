import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntityCustom } from '../../common/entities/base-custom.entity';
import { Curriculum } from './curriculum.entity';

@Entity('curriculum_regulations')
export class CurriculumRegulation extends BaseEntityCustom {
  @Column({ type: 'uuid' })
  curriculum_id!: string;

  @ManyToOne(() => Curriculum, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'curriculum_id', foreignKeyConstraintName: 'FK_regulation_curriculum' })
  curriculum!: Curriculum;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  detail!: string | null;
}
