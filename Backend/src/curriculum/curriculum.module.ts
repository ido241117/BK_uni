import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { CourseOpenedSemester } from '../course/entities/course-opened-semester.entity';
import { CurriculumContentController } from './curriculum-content.controller';
import { CurriculumContentService } from './curriculum-content.service';
import { CurriculumController } from './curriculum.controller';
import { CurriculumService } from './curriculum.service';
import { CourseCategoryMember } from './entities/course-category-member.entity';
import { CourseCategory } from './entities/course-category.entity';
import { CourseGroupMember } from './entities/course-group-member.entity';
import { CourseGroup } from './entities/course-group.entity';
import { CourseRelation } from './entities/course-relation.entity';
import { CurriculumCourse } from './entities/curriculum-course.entity';
import { CurriculumRegulation } from './entities/curriculum-regulation.entity';
import { CurriculumSpecialization } from './entities/curriculum-specialization.entity';
import { Curriculum } from './entities/curriculum.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Curriculum, CurriculumCourse, CourseGroup, CourseGroupMember, CourseCategory, CourseCategoryMember,
      CourseRelation, CurriculumRegulation, CurriculumSpecialization, CourseOpenedSemester,
    ]),
    AuthModule,
  ],
  controllers: [CurriculumController, CurriculumContentController],
  providers: [CurriculumService, CurriculumContentService],
  exports: [CurriculumService, CurriculumContentService],
})
export class CurriculumModule {}
