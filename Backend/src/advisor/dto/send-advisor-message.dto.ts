import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** Sinh viên trả lời một câu hỏi lựa chọn (`choices`) mà AI đưa ra ở lượt trước. */
export class AdvisorChoiceAnswerDto {
  @ApiProperty({ example: 'specialization' })
  @IsString()
  @MaxLength(60)
  id!: string;

  @ApiProperty({ example: 'Bạn muốn theo chuyên ngành nào?' })
  @IsString()
  @MaxLength(500)
  question!: string;

  @ApiProperty({ type: [String], description: 'Nhãn các phương án đã chọn' })
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  values!: string[];

  @ApiPropertyOptional({ description: 'Câu trả lời tự nhập (loại text hoặc "khác")' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  text?: string;
}

export class SendAdvisorMessageDto {
  @ApiPropertyOptional({ description: 'Bỏ trống để bắt đầu cuộc trò chuyện mới' })
  @IsOptional()
  @IsUUID()
  session_id?: string;

  @ApiProperty({ example: 'Kỳ tới mình nên đăng ký những môn nào?' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message!: string;

  @ApiPropertyOptional({
    description: 'Kết quả trang Phân tích học tập do frontend tính. Bắt buộc ở tin nhắn đầu; bỏ trống để dùng bản đã lưu.',
  })
  @IsOptional()
  @IsObject()
  snapshot?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [AdvisorChoiceAnswerDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => AdvisorChoiceAnswerDto)
  answers?: AdvisorChoiceAnswerDto[];
}
