import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Course } from '../curricula/course.entity';
import { Curriculum } from '../curricula/curriculum.entity';
import { StudentCourseStatus } from './student-course-status.entity';
import { StudentProfile } from './student-profile.entity';
import { StudentProfileController } from './student-profile.controller';
import { StudentProfileService } from './student-profile.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([
			StudentProfile,
			StudentCourseStatus,
			Curriculum,
			Course,
		]),
	],
	controllers: [StudentProfileController],
	providers: [StudentProfileService],
})
export class StudentProfileModule { }
