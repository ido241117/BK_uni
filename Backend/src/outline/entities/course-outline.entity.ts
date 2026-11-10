import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, Unique } from 'typeorm';
import { BaseEntityCustom } from '../../common/entities/base-custom.entity';
import { CourseOutlineImport } from './course-outline-import.entity';
import { CourseOutlinePrerequisite } from './course-outline-prerequisite.entity';

/**
 * Một phiên bản đề cương môn học, nhập từ nguồn ngoài (định dạng `bkuni.course-outlines`).
 *
 * Dữ liệu đề cương được giữ **tách riêng** khỏi dữ liệu hệ thống: không có khóa ngoại tới `courses`
 * (nối bằng mã môn) và việc nhập không bao giờ sửa `courses` / `course_relations`. Nhờ vậy khi hai nguồn
 * lệch nhau (ví dụ điều kiện môn), cả hai vẫn còn nguyên để đối chiếu.
 */
@Entity('course_outlines')
@Unique('UQ_course_outline_version', ['course_code', 'version'])
@Index('IDX_course_outline_code', ['course_code', 'applies_from'])
export class CourseOutline extends BaseEntityCustom {
  /** Mã môn viết hoa, ví dụ CO2003. */
  @Column({ type: 'varchar', length: 50 })
  course_code!: string;

  @Column({ type: 'varchar', length: 20 })
  version!: string;

  /** Học kỳ bắt đầu áp dụng (mã 3 số, ví dụ 261); `null` khi nguồn không hợp lệ. */
  @Column({ type: 'varchar', length: 3, nullable: true })
  applies_from!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  source_id!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  source_code!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  source_updated_at!: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  name_vi!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  name_en!: string | null;

  @Column({ type: 'double precision', nullable: true })
  credits!: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  level_code!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  course_type_code!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  faculty_code!: string | null;

  /**
   * Toàn bộ đề cương đúng như trong file nhập (một phần tử của `outlines`, kiểu `OutlineDocumentOutline`).
   * Khai báo `object` vì TypeORM không suy kiểu được cho object có index signature.
   */
  @Column({ type: 'jsonb', select: false })
  content!: object;

  /** SHA-256 của `content` để biết lần nhập sau có thay đổi không. */
  @Column({ type: 'varchar', length: 64 })
  content_hash!: string;

  /** Lần nhập gần nhất đã tạo/cập nhật bản này. */
  @Column({ type: 'uuid', nullable: true })
  import_id!: string | null;

  @ManyToOne(() => CourseOutlineImport, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'import_id', foreignKeyConstraintName: 'FK_course_outline_import' })
  import!: CourseOutlineImport | null;

  @OneToMany(() => CourseOutlinePrerequisite, prerequisite => prerequisite.outline)
  prerequisites!: CourseOutlinePrerequisite[];
}
