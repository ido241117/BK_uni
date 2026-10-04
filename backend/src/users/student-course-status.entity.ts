import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'student_course_statuses' })
export class StudentCourseStatus {
  @PrimaryColumn({ name: 'profile_id', type: 'uuid' })
  profileId: string;

  @PrimaryColumn({ name: 'curriculum_id', type: 'uuid' })
  curriculumId: string;

  @PrimaryColumn({ name: 'course_id', type: 'uuid' })
  courseId: string;

  @Column({ name: 'status', type: 'text' })
  status: 'not_started' | 'in_progress' | 'completed';
}
