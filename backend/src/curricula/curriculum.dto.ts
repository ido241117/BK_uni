import { Type } from 'class-transformer';
import {
	IsDateString,
	IsDefined,
	IsIn,
	IsInt,
	IsNumber,
	IsOptional,
	IsString,
	IsUUID,
	Length,
	Max,
	Min,
	ValidateNested,
} from 'class-validator';

export class CurriculumSourceDto {
	@IsString()
	@Length(1, 500)
	documentName: string;

	@IsString()
	@Length(1, 2000)
	reference: string;

	@IsString()
	@Length(1, 120)
	version: string;

	@IsDateString()
	verifiedAt: string;
}

export class CreateCurriculumDto {
	@IsString()
	@Length(1, 160)
	name: string;

	@IsOptional()
	@IsString()
	@Length(0, 2000)
	description?: string | null;

	@IsDefined()
	@ValidateNested()
	@Type(() => CurriculumSourceDto)
	source: CurriculumSourceDto;
}

export class UpdateCurriculumDto {
	@IsOptional()
	@IsString()
	@Length(1, 160)
	name?: string;

	@IsOptional()
	@IsString()
	@Length(0, 2000)
	description?: string | null;

	@IsOptional()
	@ValidateNested()
	@Type(() => CurriculumSourceDto)
	source?: CurriculumSourceDto;
}

export class ListCurriculaQueryDto {
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(100)
	limit = 20;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(0)
	offset = 0;

	@IsOptional()
	@IsString()
	@Length(0, 120)
	q?: string;
}

export class CreateTermDto {
	@IsString()
	@Length(1, 80)
	code: string;

	@IsString()
	@Length(1, 160)
	name: string;

	@Type(() => Number)
	@IsInt()
	@Min(0)
	sortOrder: number;
}

export class UpdateTermDto {
	@IsOptional()
	@IsString()
	@Length(1, 80)
	code?: string;

	@IsOptional()
	@IsString()
	@Length(1, 160)
	name?: string;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(0)
	sortOrder?: number;
}

export class CreateElectiveGroupDto {
	@IsString()
	@Length(1, 160)
	name: string;

	@Type(() => Number)
	@IsInt()
	@Min(0)
	sortOrder: number;

	@IsOptional()
	@Type(() => Number)
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0.01)
	@Max(9999.99)
	requiredCredits?: number;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(2147483647)
	requiredCourses?: number;
}

export class UpdateElectiveGroupDto {
	@IsOptional()
	@IsString()
	@Length(1, 160)
	name?: string;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(0)
	sortOrder?: number;

	@IsOptional()
	@Type(() => Number)
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0.01)
	@Max(9999.99)
	requiredCredits?: number | null;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(2147483647)
	requiredCourses?: number | null;
}

export class CreateCourseDto {
	@IsString()
	@Length(1, 80)
	code: string;

	@IsOptional()
	@IsString()
	@Length(1, 80)
	version?: string;

	@IsString()
	@Length(1, 300)
	name: string;

	@IsOptional()
	@IsString()
	@Length(1, 300)
	nameEn?: string | null;

	@Type(() => Number)
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	@Max(999.99)
	credits: number;

	@IsUUID()
	termId: string;

	@IsIn(['required', 'elective'])
	requirementType: 'required' | 'elective';

	@IsOptional()
	@IsUUID()
	electiveGroupId?: string | null;
}

export class UpdateCourseDto {
	@IsOptional()
	@IsString()
	@Length(1, 80)
	code?: string;

	@IsOptional()
	@IsString()
	@Length(1, 80)
	version?: string;

	@IsOptional()
	@IsString()
	@Length(1, 300)
	name?: string;

	@IsOptional()
	@IsString()
	@Length(1, 300)
	nameEn?: string | null;

	@IsOptional()
	@Type(() => Number)
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	@Max(999.99)
	credits?: number;

	@IsOptional()
	@IsUUID()
	termId?: string;

	@IsOptional()
	@IsIn(['required', 'elective'])
	requirementType?: 'required' | 'elective';

	@IsOptional()
	@IsUUID()
	electiveGroupId?: string | null;
}

export class CourseRuleSourceDto extends CurriculumSourceDto { }

export class CreateCourseRuleDto {
	@IsIn(['prerequisite', 'minimum_credits'])
	type: 'prerequisite' | 'minimum_credits';

	@IsOptional()
	@IsUUID()
	prerequisiteCourseId?: string;

	@IsOptional()
	@Type(() => Number)
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0.01)
	@Max(9999.99)
	minimumCredits?: number;

	@IsOptional()
	@ValidateNested()
	@Type(() => CourseRuleSourceDto)
	source?: CourseRuleSourceDto;
}

export class UpdateCourseRuleDto {
	@IsOptional()
	@IsIn(['prerequisite', 'minimum_credits'])
	type?: 'prerequisite' | 'minimum_credits';

	@IsOptional()
	@IsUUID()
	prerequisiteCourseId?: string;

	@IsOptional()
	@Type(() => Number)
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0.01)
	@Max(9999.99)
	minimumCredits?: number;

	@IsOptional()
	@ValidateNested()
	@Type(() => CourseRuleSourceDto)
	source?: CourseRuleSourceDto | null;
}

export class CurriculumIdParamDto {
	@IsUUID()
	curriculumId: string;
}

export class CourseIdParamDto {
	@IsUUID()
	curriculumId: string;

	@IsUUID()
	courseId: string;
}

export class CourseListQueryDto extends ListCurriculaQueryDto {
	@IsOptional()
	@IsUUID()
	termId?: string;

	@IsOptional()
	@IsIn(['required', 'elective'])
	requirementType?: 'required' | 'elective';
}
