import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntityCustom } from '../../common/entities/base-custom.entity';
import { CourseRelationType } from '../enum/course-relation-type';
import { CurriculumCourse } from './curriculum-course.entity';

@Entity('course_relations')
@Unique('UQ_course_relation', ['curriculum_id', 'course_id', 'related_course_id', 'type'])
export class CourseRelation extends BaseEntityCustom {
  @Column({ type: 'uuid' })
  curriculum_id!: string;

  @Column({ type: 'uuid' })
  course_id!: string;

  @Column({ type: 'uuid' })
  related_course_id!: string;

  @Column({ type: 'enum', enum: CourseRelationType, enumName: 'course_relation_type_enum' })
  type!: CourseRelationType;

  @ManyToOne(() => CurriculumCourse, { onDelete: 'CASCADE' })
  @JoinColumn([
    { name: 'curriculum_id', referencedColumnName: 'curriculum_id', foreignKeyConstraintName: 'FK_course_relation_course' },
    { name: 'course_id', referencedColumnName: 'course_id', foreignKeyConstraintName: 'FK_course_relation_course' },
  ])
  curriculum_course!: CurriculumCourse;

  @ManyToOne(() => CurriculumCourse, { onDelete: 'CASCADE' })
  @JoinColumn([
    { name: 'curriculum_id', referencedColumnName: 'curriculum_id', foreignKeyConstraintName: 'FK_course_relation_related' },
    { name: 'related_course_id', referencedColumnName: 'course_id', foreignKeyConstraintName: 'FK_course_relation_related' },
  ])
  related_curriculum_course!: CurriculumCourse;
}
