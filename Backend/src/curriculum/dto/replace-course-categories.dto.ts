import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class ReplaceCourseCategoriesDto {
  @ApiProperty({
    type: [String],
    description: 'ID các nhóm học phần mà môn thuộc về; gửi mảng rỗng để bỏ hết nhóm',
  })
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  category_ids!: string[];
}
