import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { OutlineModule } from '../outline/outline.module';
import { Course } from '../course/entities/course.entity';
import { CourseOpenedSemester } from '../course/entities/course-opened-semester.entity';
import { CourseGroup } from '../curriculum/entities/course-group.entity';
import { CourseGroupMember } from '../curriculum/entities/course-group-member.entity';
import { CourseRelation } from '../curriculum/entities/course-relation.entity';
import { CurriculumCourse } from '../curriculum/entities/curriculum-course.entity';
import { CurriculumSpecialization } from '../curriculum/entities/curriculum-specialization.entity';
import { StudentCourse } from '../student/entities/student-course.entity';
import { StudentPlanCourse } from '../student/entities/student-plan-course.entity';
import { StudentProfile } from '../student/entities/student-profile.entity';
import { AdvisorController } from './advisor.controller';
import { AdvisorService } from './advisor.service';
import { AdvisorTools } from './advisor.tools';
import { DeepSeekClient } from './deepseek.client';
import { AdvisorSession } from './entities/advisor-session.entity';
import { AdvisorStep } from './entities/advisor-step.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AdvisorSession, AdvisorStep, StudentProfile, StudentCourse, StudentPlanCourse, Course, CourseOpenedSemester,
      CurriculumCourse, CourseRelation, CourseGroup, CourseGroupMember, CurriculumSpecialization,
    ]),
    AuthModule,
    OutlineModule,
  ],
  controllers: [AdvisorController],
  providers: [AdvisorService, AdvisorTools, DeepSeekClient],
})
export class AdvisorModule {}
