import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntityCustom } from '../../common/entities/base-custom.entity';
import { CurriculumRegulation } from '../../curriculum/entities/curriculum-regulation.entity';
import { User } from '../../user/entities/user.entity';
import { StudentRegulationStatus } from '../enum/student-regulation-status';

@Entity('student_regulation_statuses')
@Unique('UQ_student_regulation_status', ['user_id', 'regulation_id'])
export class StudentRegulationStatusEntity extends BaseEntityCustom {
  @Column({ type: 'uuid' })
  user_id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'FK_student_regulation_user' })
  user!: User;

  @Column({ type: 'uuid' })
  regulation_id!: string;

  @ManyToOne(() => CurriculumRegulation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'regulation_id', foreignKeyConstraintName: 'FK_student_regulation_regulation' })
  regulation!: CurriculumRegulation;

  @Column({ type: 'enum', enum: StudentRegulationStatus, enumName: 'student_regulation_status_enum', default: StudentRegulationStatus.NOT_STARTED })
  status!: StudentRegulationStatus;
}
