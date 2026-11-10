import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsString, MaxLength } from 'class-validator';

export class ReplaceOpenedSemestersDto {
  @ApiProperty({ type: [String], example: ['251', '252'], description: 'Danh sách mã học kỳ đã mở môn' })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(3, { each: true })
  semester_codes!: string[];
}
