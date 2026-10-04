import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Course } from './course.entity';
import { CourseRule } from './course-rule.entity';
import { Curriculum } from './curriculum.entity';
import { CurriculumTerm } from './curriculum-term.entity';
import { ElectiveGroup } from './elective-group.entity';
import { CurriculumController } from './curriculum.controller';
import { CurriculumReadController } from './curriculum-read.controller';
import { CurriculumService } from './curriculum.service';
import { StudentCourseStatus } from '../users/student-course-status.entity';
import { StudentProfile } from '../users/student-profile.entity';

@Module({
	imports: [
		TypeOrmModule.forFeature([
			Curriculum,
			CurriculumTerm,
			ElectiveGroup,
			Course,
			CourseRule,
			StudentProfile,
			StudentCourseStatus,
		]),
	],
	controllers: [CurriculumController, CurriculumReadController],
	providers: [CurriculumService],
})
export class CurriculumModule {}
