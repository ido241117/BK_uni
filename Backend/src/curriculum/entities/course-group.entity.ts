import { Check, Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntityCustom } from '../../common/entities/base-custom.entity';
import { CourseGroupKind } from '../enum/course-group-kind';
import { CourseGroupScope } from '../enum/course-group-scope';
import { Curriculum } from './curriculum.entity';
import { CurriculumSpecialization } from './curriculum-specialization.entity';

/**
 * Khối yêu cầu của chương trình. Có hai loại:
 *
 * - **Khối gốc** (`specialization_id = null`): tính vào chuẩn tốt nghiệp và tổng tín chỉ.
 * - **Khối chuyên ngành** (`specialization_id` và `parent_group_id` cùng có): thu hẹp danh sách
 *   môn của một khối gốc để xét chuyên ngành. **Không** cộng thêm tín chỉ; môn sinh viên học
 *   vẫn chỉ tính một lần vào khối gốc. Một chuyên ngành có thể thu hẹp cùng một khối gốc bằng
 *   nhiều khối con (ví dụ "3 môn bắt buộc" + "chọn 6 TC"); các khối con đó không được trùng môn.
 */
@Entity('course_groups')
@Index('UQ_course_groups_name_lower', { synchronize: false })
@Unique('UQ_course_group_id_curriculum', ['id', 'curriculum_id'])
@Check('CHK_course_group_specialization_parent', '("specialization_id" IS NULL) = ("parent_group_id" IS NULL)')
export class CourseGroup extends BaseEntityCustom {
  @Column({ type: 'uuid' })
  curriculum_id!: string;

  @ManyToOne(() => Curriculum, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'curriculum_id', foreignKeyConstraintName: 'FK_course_group_curriculum' })
  curriculum!: Curriculum;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'enum', enum: CourseGroupKind, enumName: 'course_group_kind_enum' })
  kind!: CourseGroupKind;

  /** Số môn phải chọn; `null` khi khối chỉ ràng buộc theo tín chỉ. */
  @Column({ type: 'integer', nullable: true })
  required_count!: number | null;

  /** Số tín chỉ tối thiểu phải đạt; `null` khi khối chỉ ràng buộc theo số môn. */
  @Column({ type: 'integer', nullable: true })
  required_credits!: number | null;

  @Column({ type: 'varchar', length: 10, default: CourseGroupScope.LISTED })
  pool_scope!: CourseGroupScope;

  /** Chỉ nhận môn có đúng số tín chỉ này (dùng cho khối `any`); `null` là không lọc. */
  @Column({ type: 'integer', nullable: true })
  pool_course_credits!: number | null;

  /** Chuyên ngành mà khối này phục vụ; `null` với khối gốc (xét tốt nghiệp). */
  @Column({ type: 'uuid', nullable: true })
  specialization_id!: string | null;

  @ManyToOne(() => CurriculumSpecialization, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn([
    { name: 'specialization_id', referencedColumnName: 'id', foreignKeyConstraintName: 'FK_course_group_specialization' },
    { name: 'curriculum_id', referencedColumnName: 'curriculum_id', foreignKeyConstraintName: 'FK_course_group_specialization' },
  ])
  specialization!: CurriculumSpecialization | null;

  /** Khối gốc mà khối chuyên ngành thu hẹp; thành viên phải là tập con của khối gốc. */
  @Column({ type: 'uuid', nullable: true })
  parent_group_id!: string | null;

  @ManyToOne(() => CourseGroup, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn([
    { name: 'parent_group_id', referencedColumnName: 'id', foreignKeyConstraintName: 'FK_course_group_parent' },
    { name: 'curriculum_id', referencedColumnName: 'curriculum_id', foreignKeyConstraintName: 'FK_course_group_parent' },
  ])
  parent_group!: CourseGroup | null;
}
