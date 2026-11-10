import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntityCustom } from '../../common/entities/base-custom.entity';
import { Curriculum } from './curriculum.entity';

/**
 * Nhóm học phần mang tính **mô tả** (ví dụ khối kiến thức của một chương trình).
 * Tên do admin tự đặt nên cùng một môn có thể nằm ở nhóm tên khác nhau ở các chương trình.
 * Không có ràng buộc số môn/tín chỉ như `course_groups`.
 */
@Entity('course_categories')
@Index('UQ_course_categories_name_lower', { synchronize: false })
@Unique('UQ_course_category_id_curriculum', ['id', 'curriculum_id'])
export class CourseCategory extends BaseEntityCustom {
  @Column({ type: 'uuid' })
  curriculum_id!: string;

  @ManyToOne(() => Curriculum, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'curriculum_id', foreignKeyConstraintName: 'FK_course_category_curriculum' })
  curriculum!: Curriculum;

  @Column({ type: 'varchar', length: 255 })
  name!: string;
}
