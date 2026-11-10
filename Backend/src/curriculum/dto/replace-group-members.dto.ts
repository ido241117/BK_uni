import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class ReplaceGroupMembersDto {
  @ApiProperty({ type: [String], description: 'Danh sách ID môn của nhóm' })
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  course_ids!: string[];
}
