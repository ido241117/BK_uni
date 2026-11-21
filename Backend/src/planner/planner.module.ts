import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { CourseOpenedSemester } from '../course/entities/course-opened-semester.entity';
import { Course } from '../course/entities/course.entity';
import { CourseCategoryMember } from '../curriculum/entities/course-category-member.entity';
import { CourseCategory } from '../curriculum/entities/course-category.entity';
import { CourseGroupMember } from '../curriculum/entities/course-group-member.entity';
import { CourseGroup } from '../curriculum/entities/course-group.entity';
import { CourseRelation } from '../curriculum/entities/course-relation.entity';
import { CurriculumCourse } from '../curriculum/entities/curriculum-course.entity';
import { CurriculumRegulation } from '../curriculum/entities/curriculum-regulation.entity';
import { CurriculumSpecialization } from '../curriculum/entities/curriculum-specialization.entity';
import { Curriculum } from '../curriculum/entities/curriculum.entity';
import { StudentCourse } from '../student/entities/student-course.entity';
import { StudentProfile } from '../student/entities/student-profile.entity';
import { StudentProgressImport } from '../student/entities/student-progress-import.entity';
import { PlannerController } from './planner.controller';
import { PlannerRunner } from './planner.runner';
import { PlannerService } from './planner.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StudentProfile, StudentCourse, Curriculum, CurriculumCourse, CourseGroup, CourseGroupMember, CourseRelation,
      CourseCategory, CourseCategoryMember, CurriculumSpecialization, CourseOpenedSemester, Course,
      StudentProgressImport, CurriculumRegulation,
    ]),
    AuthModule,
  ],
  controllers: [PlannerController],
  providers: [PlannerService, PlannerRunner],
})
export class PlannerModule {}
