import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateCourseGroupDto } from './create-course-group.dto';

/** Liên kết chuyên ngành/khối gốc cố định sau khi tạo; muốn đổi thì xóa và tạo lại khối. */
export class UpdateCourseGroupDto extends PartialType(
  OmitType(CreateCourseGroupDto, ['specialization_id', 'parent_group_id'] as const),
) {}
