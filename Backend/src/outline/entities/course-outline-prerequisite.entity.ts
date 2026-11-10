import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntityCustom } from '../../common/entities/base-custom.entity';
import { CourseOutline } from './course-outline.entity';

/**
 * Điều kiện môn do **đề cương** khai (theo môn, theo phiên bản). Tách thành dòng riêng để đối chiếu
 * bằng SQL với `course_relations` (điều kiện do chương trình đào tạo khai). Hai nguồn không ghi đè nhau.
 */
@Entity('course_outline_prerequisites')
@Index('IDX_outline_prerequisite_outline', ['outline_id'])
export class CourseOutlinePrerequisite extends BaseEntityCustom {
  @Column({ type: 'uuid' })
  outline_id!: string;

  @ManyToOne(() => CourseOutline, outline => outline.prerequisites, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'outline_id', foreignKeyConstraintName: 'FK_outline_prerequisite_outline' })
  outline!: CourseOutline;

  /** Cùng giá trị với `CourseRelationType`; `null` khi nguồn có loại lạ (xem `type_raw`). */
  @Column({ type: 'varchar', length: 20, nullable: true })
  type!: string | null;

  /** Mã gốc ở nguồn: TQ, HT, SHT, KN. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  type_raw!: string | null;

  @Column({ type: 'varchar', length: 50 })
  related_course_code!: string;
}
