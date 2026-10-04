import { Type } from 'class-transformer';
import {
	ArrayMaxSize,
	IsArray,
	IsIn,
	IsOptional,
	IsString,
	IsUUID,
	Length,
	ValidateNested,
} from 'class-validator';

export class UpdateStudentProfileDto {
	@IsOptional()
	@IsString()
	@Length(1, 160)
	displayName?: string | null;

	@IsOptional()
	@IsUUID()
	curriculumId?: string | null;
}

export class CourseStatusItemDto {
	@IsUUID()
	courseId: string;

	@IsIn(['not_started', 'in_progress', 'completed'])
	status: 'not_started' | 'in_progress' | 'completed';
}

export class UpdateCourseStatusesDto {
	@IsArray()
	@ArrayMaxSize(500)
	@ValidateNested({ each: true })
	@Type(() => CourseStatusItemDto)
	items: CourseStatusItemDto[];
}
