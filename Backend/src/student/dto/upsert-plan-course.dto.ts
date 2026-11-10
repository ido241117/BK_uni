import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class UpsertPlanCourseDto {
  @ApiProperty({ example: '262', maxLength: 3, description: 'Mã học kỳ dự kiến, ví dụ 262' })
  @IsString()
  @MaxLength(3)
  semester_code!: string;
}
