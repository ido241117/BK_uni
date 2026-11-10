import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntityCustom } from '../../common/entities/base-custom.entity';
import { Course } from '../../course/entities/course.entity';
import { Curriculum } from './curriculum.entity';

@Entity('curriculum_courses')
@Unique('UQ_curriculum_course', ['curriculum_id', 'course_id'])
export class CurriculumCourse extends BaseEntityCustom {
  @Column({ type: 'uuid' })
  curriculum_id!: string;

  @ManyToOne(() => Curriculum, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'curriculum_id', foreignKeyConstraintName: 'FK_curriculum_course_curriculum' })
  curriculum!: Curriculum;

  @Column({ type: 'uuid' })
  course_id!: string;

  @ManyToOne(() => Course, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'course_id', foreignKeyConstraintName: 'FK_curriculum_course_course' })
  course!: Course;

  /** Năm khuyến nghị; `null` với môn trong pool tự chọn (không xếp kỳ cố định). */
  @Column({ type: 'integer', nullable: true })
  recommended_year!: number | null;

  /** Học kỳ khuyến nghị; `null` với môn trong pool tự chọn. */
  @Column({ type: 'integer', nullable: true })
  recommended_term!: number | null;
}
