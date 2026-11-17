import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

export class UpsertPlanCourseDto {
  @ApiProperty({ example: '262', maxLength: 3, description: 'Mã học kỳ dự kiến, ví dụ 262' })
  @IsString()
  @MaxLength(3)
  @Matches(/^[0-9]{2}[123]$/, { message: 'Mã học kỳ phải có dạng YYH, ví dụ 251.' })
  semester_code!: string;
}
