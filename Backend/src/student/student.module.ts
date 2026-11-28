import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { CurriculumSpecialization } from '../curriculum/entities/curriculum-specialization.entity';
import { StudentCourse } from './entities/student-course.entity';
import { StudentProfile } from './entities/student-profile.entity';
import { StudentRegulationStatusEntity } from './entities/student-regulation-status.entity';
import { StudentCourseController } from './student-course.controller';
import { StudentProfileController } from './student-profile.controller';
import { StudentRegulationStatusController } from './student-regulation-status.controller';
import { StudentService } from './student.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StudentProfile, StudentCourse, StudentRegulationStatusEntity, CurriculumSpecialization,
    ]),
    AuthModule,
  ],
  controllers: [
    StudentProfileController,
    StudentCourseController,
    StudentRegulationStatusController,
  ],
  providers: [StudentService],
  exports: [StudentService],
})
export class StudentModule {}
