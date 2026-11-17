import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { CourseRelation } from '../curriculum/entities/course-relation.entity';
import { CurriculumCourse } from '../curriculum/entities/curriculum-course.entity';
import { Curriculum } from '../curriculum/entities/curriculum.entity';
import { CourseOutlineImport } from './entities/course-outline-import.entity';
import { CourseOutlinePrerequisite } from './entities/course-outline-prerequisite.entity';
import { CourseOutline } from './entities/course-outline.entity';
import { OutlineImportService } from './outline-import.service';
import { OutlineController } from './outline.controller';
import { OutlineService } from './outline.service';
import { ElasticsearchClient } from './search/elasticsearch.client';
import { OutlineSearchService } from './search/outline-search.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CourseOutline, CourseOutlinePrerequisite, CourseOutlineImport, Curriculum, CurriculumCourse, CourseRelation,
    ]),
    AuthModule,
  ],
  controllers: [OutlineController],
  providers: [OutlineService, OutlineImportService, ElasticsearchClient, OutlineSearchService],
  exports: [OutlineService, OutlineSearchService],
})
export class OutlineModule {}
