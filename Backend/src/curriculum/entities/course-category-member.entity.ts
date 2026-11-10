import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntityCustom } from '../../common/entities/base-custom.entity';
import { CurriculumCourse } from './curriculum-course.entity';
import { CourseCategory } from './course-category.entity';

@Entity('course_category_members')
@Unique('UQ_course_category_member', ['category_id', 'course_id'])
export class CourseCategoryMember extends BaseEntityCustom {
  @Column({ type: 'uuid' })
  curriculum_id!: string;

  @Column({ type: 'uuid' })
  category_id!: string;

  @Column({ type: 'uuid' })
  course_id!: string;

  @ManyToOne(() => CourseCategory, { onDelete: 'CASCADE' })
  @JoinColumn([
    { name: 'category_id', referencedColumnName: 'id', foreignKeyConstraintName: 'FK_category_member_category' },
    { name: 'curriculum_id', referencedColumnName: 'curriculum_id', foreignKeyConstraintName: 'FK_category_member_category' },
  ])
  category!: CourseCategory;

  @ManyToOne(() => CurriculumCourse, { onDelete: 'CASCADE' })
  @JoinColumn([
    { name: 'curriculum_id', referencedColumnName: 'curriculum_id', foreignKeyConstraintName: 'FK_category_member_assignment' },
    { name: 'course_id', referencedColumnName: 'course_id', foreignKeyConstraintName: 'FK_category_member_assignment' },
  ])
  curriculum_course!: CurriculumCourse;
}
