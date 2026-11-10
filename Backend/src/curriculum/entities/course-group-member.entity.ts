import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntityCustom } from '../../common/entities/base-custom.entity';
import { CurriculumCourse } from './curriculum-course.entity';
import { CourseGroup } from './course-group.entity';

@Entity('course_group_members')
@Unique('UQ_course_group_member_group', ['group_id', 'course_id'])
export class CourseGroupMember extends BaseEntityCustom {
  @Column({ type: 'uuid' })
  curriculum_id!: string;

  @Column({ type: 'uuid' })
  group_id!: string;

  @Column({ type: 'uuid' })
  course_id!: string;

  @ManyToOne(() => CourseGroup, { onDelete: 'CASCADE' })
  @JoinColumn([
    { name: 'group_id', referencedColumnName: 'id', foreignKeyConstraintName: 'FK_group_member_group' },
    { name: 'curriculum_id', referencedColumnName: 'curriculum_id', foreignKeyConstraintName: 'FK_group_member_group' },
  ])
  group!: CourseGroup;

  @ManyToOne(() => CurriculumCourse, { onDelete: 'CASCADE' })
  @JoinColumn([
    { name: 'curriculum_id', referencedColumnName: 'curriculum_id', foreignKeyConstraintName: 'FK_group_member_assignment' },
    { name: 'course_id', referencedColumnName: 'course_id', foreignKeyConstraintName: 'FK_group_member_assignment' },
  ])
  curriculum_course!: CurriculumCourse;
}
