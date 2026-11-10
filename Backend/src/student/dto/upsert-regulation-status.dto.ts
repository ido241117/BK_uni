import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { StudentRegulationStatus } from '../enum/student-regulation-status';

export class UpsertRegulationStatusDto {
  @ApiProperty({ enum: StudentRegulationStatus, example: StudentRegulationStatus.COMPLETED })
  @IsEnum(StudentRegulationStatus)
  status!: StudentRegulationStatus;
}
