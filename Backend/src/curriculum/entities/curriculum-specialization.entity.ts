import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntityCustom } from '../../common/entities/base-custom.entity';
import { Curriculum } from './curriculum.entity';

/**
 * Chuyên ngành **không bắt buộc** của một chương trình.
 *
 * Chuyên ngành không thêm tín chỉ vào chuẩn tốt nghiệp: nó chỉ thu hẹp một số khối tự chọn
 * gốc (ví dụ "chọn 5 trong 44 môn nhóm C" thành "chọn 5 trong 9 môn nhóm C của CNPM").
 * Mỗi phần thu hẹp là một `course_groups` có `specialization_id` và `parent_group_id`.
 * Sinh viên đạt chuyên ngành khi thỏa mọi khối con của chuyên ngành đó.
 */
@Entity('curriculum_specializations')
@Index('UQ_curriculum_specializations_code_lower', { synchronize: false })
@Unique('UQ_curriculum_specialization_id_curriculum', ['id', 'curriculum_id'])
export class CurriculumSpecialization extends BaseEntityCustom {
  @Column({ type: 'uuid' })
  curriculum_id!: string;

  @ManyToOne(() => Curriculum, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'curriculum_id', foreignKeyConstraintName: 'FK_curriculum_specialization_curriculum' })
  curriculum!: Curriculum;

  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  description!: string | null;
}
