import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateCourseCategoryDto {
  @ApiProperty({
    example: 'Kinh tế - Chính trị - Xã hội - Luật',
    maxLength: 255,
    description: 'Tên nhóm học phần do admin tự đặt, chỉ mang tính mô tả',
  })
  @IsString()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Danh sách ID môn (phải thuộc chương trình) để gán vào nhóm',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  course_ids?: string[];
}
