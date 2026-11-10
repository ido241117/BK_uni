import { Column, Entity, JoinColumn, ManyToOne, OneToOne, Unique } from 'typeorm';
import { BaseEntityCustom } from '../../common/entities/base-custom.entity';
import { Curriculum } from '../../curriculum/entities/curriculum.entity';
import { CurriculumSpecialization } from '../../curriculum/entities/curriculum-specialization.entity';
import { User } from '../../user/entities/user.entity';

@Entity('student_profiles')
@Unique('UQ_student_profile_number', ['student_number'])
export class StudentProfile extends BaseEntityCustom {
  @Column({ type: 'uuid' })
  user_id!: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'FK_student_profile_user' })
  user!: User;

  @Column({ type: 'varchar', length: 255, nullable: true })
  full_name!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  student_number!: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone!: string | null;

  @Column({ type: 'date', nullable: true })
  birth_date!: string | null;

  @Column({ type: 'integer', nullable: true })
  admission_year!: number | null;

  @Column({ type: 'text', nullable: true })
  address!: string | null;

  @Column({ type: 'uuid', nullable: true })
  curriculum_id!: string | null;

  @ManyToOne(() => Curriculum, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'curriculum_id', foreignKeyConstraintName: 'FK_student_profile_curriculum' })
  curriculum!: Curriculum | null;

  @Column({ type: 'integer', nullable: true })
  credit_target!: number | null;

  /** Chuyên ngành sinh viên muốn hướng tới (không bắt buộc); phải thuộc `curriculum_id`. */
  @Column({ type: 'uuid', nullable: true })
  target_specialization_id!: string | null;

  @ManyToOne(() => CurriculumSpecialization, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'target_specialization_id', foreignKeyConstraintName: 'FK_student_profile_specialization' })
  target_specialization!: CurriculumSpecialization | null;
}
