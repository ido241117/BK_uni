import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntityCustom } from '../../common/entities/base-custom.entity';
import { Course } from './course.entity';

@Entity('course_opened_semesters')
@Unique('UQ_course_opened_semester', ['course_id', 'semester_code'])
export class CourseOpenedSemester extends BaseEntityCustom {
  @Column({ type: 'uuid' })
  course_id!: string;

  @ManyToOne(() => Course, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'course_id', foreignKeyConstraintName: 'FK_opened_semester_course' })
  course!: Course;

  @Column({ type: 'varchar', length: 3 })
  semester_code!: string;
}
