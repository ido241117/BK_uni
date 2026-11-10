import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntityCustom } from '../../common/entities/base-custom.entity';
import { Course } from '../../course/entities/course.entity';
import { Curriculum } from '../../curriculum/entities/curriculum.entity';
import { User } from '../../user/entities/user.entity';

/**
 * Môn sinh viên dự kiến học trong một học kỳ của chương trình.
 * Môn không bắt buộc phải thuộc chương trình (tự chọn tự do có thể lấy môn ngoài chương trình);
 * chương trình chỉ là ngữ cảnh lập kế hoạch.
 */
@Entity('student_plan_courses')
@Unique('UQ_student_plan_course', ['user_id', 'curriculum_id', 'course_id'])
export class StudentPlanCourse extends BaseEntityCustom {
  @Column({ type: 'uuid' })
  user_id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'FK_student_plan_user' })
  user!: User;

  @Column({ type: 'uuid' })
  curriculum_id!: string;

  @ManyToOne(() => Curriculum, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'curriculum_id', foreignKeyConstraintName: 'FK_student_plan_curriculum' })
  curriculum!: Curriculum;

  @Column({ type: 'uuid' })
  course_id!: string;

  @ManyToOne(() => Course, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'course_id', foreignKeyConstraintName: 'FK_student_plan_course_course' })
  course!: Course;

  @Column({ type: 'varchar', length: 3 })
  semester_code!: string;
}
