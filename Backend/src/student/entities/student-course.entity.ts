import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntityCustom } from '../../common/entities/base-custom.entity';
import { Course } from '../../course/entities/course.entity';
import { User } from '../../user/entities/user.entity';
import { StudentCourseStatus } from '../enum/student-course-status';

@Entity('student_courses')
@Unique('UQ_student_course', ['user_id', 'course_id'])
export class StudentCourse extends BaseEntityCustom {
  @Column({ type: 'uuid' })
  user_id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'FK_student_course_user' })
  user!: User;

  @Column({ type: 'uuid' })
  course_id!: string;

  @ManyToOne(() => Course, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'course_id', foreignKeyConstraintName: 'FK_student_course_course' })
  course!: Course;

  @Column({ type: 'enum', enum: StudentCourseStatus, enumName: 'student_course_status_enum', default: StudentCourseStatus.NOT_STARTED })
  status!: StudentCourseStatus;
}
