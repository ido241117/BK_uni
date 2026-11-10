import { Column, Entity, Index } from 'typeorm';
import { BaseEntityCustom } from '../../common/entities/base-custom.entity';

@Entity('courses')
@Index('UQ_courses_code_lower', { synchronize: false })
export class Course extends BaseEntityCustom {
  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  /** Mô tả ngắn hiển thị dưới tên môn trong danh sách. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  description!: string | null;

  @Column({ type: 'integer' })
  credits!: number;
}
