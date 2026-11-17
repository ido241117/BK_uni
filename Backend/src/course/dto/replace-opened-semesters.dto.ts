import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsString, Matches, MaxLength } from 'class-validator';

export class ReplaceOpenedSemestersDto {
  @ApiProperty({ type: [String], example: ['251', '252'], description: 'Danh sách mã học kỳ đã mở môn' })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(3, { each: true })
  @Matches(/^[0-9]{2}[123]$/, { each: true, message: 'Mã học kỳ phải có dạng YYH, ví dụ 251.' })
  semester_codes!: string[];
}
