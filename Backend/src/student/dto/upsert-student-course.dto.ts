import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { StudentCourseStatus } from '../enum/student-course-status';

export class UpsertStudentCourseDto {
  @ApiProperty({ enum: StudentCourseStatus, example: StudentCourseStatus.IN_PROGRESS })
  @IsEnum(StudentCourseStatus)
  status!: StudentCourseStatus;
}
