import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { isPostgresError, UNIQUE_VIOLATION } from '../common/database/postgres-error';
import { PageMetaDto } from '../common/dto/page-meta.dto';
import { PageDto } from '../common/dto/page.dto';
import { Order } from '../common/dto/page-options.dto';
import { CreateCurriculumDto } from './dto/create-curriculum.dto';
import { CurriculumQueryDto } from './dto/curriculum-query.dto';
import { UpdateCurriculumDto } from './dto/update-curriculum.dto';
import { Curriculum } from './entities/curriculum.entity';

@Injectable()
export class CurriculumService {
  constructor(@InjectRepository(Curriculum) private readonly curricula: Repository<Curriculum>) {}

  async findPage(query: CurriculumQueryDto): Promise<PageDto<Curriculum>> {
    const direction = query.order === Order.DESC ? 'DESC' : 'ASC';
    const builder = this.curricula.createQueryBuilder('curriculum');
    const search = query.search?.trim();
    if (search) {
      builder.where(
        'LOWER(curriculum.code) LIKE LOWER(:search) OR LOWER(curriculum.name) LIKE LOWER(:search) OR LOWER(curriculum.faculty) LIKE LOWER(:search)',
        { search: `%${search}%` },
      );
    }
    builder
      .orderBy('curriculum.code', direction)
      .addOrderBy('curriculum.id', 'ASC')
      .skip(query.skip)
      .take(query.take);
    const [data, itemCount] = await builder.getManyAndCount();
    return new PageDto(data, new PageMetaDto({ pageOptionsDto: query, itemCount }));
  }

  async findOne(id: string): Promise<Curriculum> {
    const curriculum = await this.curricula.findOne({ where: { id } });
    if (!curriculum) throw new NotFoundException('Không tìm thấy chương trình đào tạo.');
    return curriculum;
  }

  async create(dto: CreateCurriculumDto): Promise<Curriculum> {
    try {
      return await this.curricula.save(this.curricula.create({
        code: dto.code.trim(),
        name: dto.name.trim(),
        major: dto.major.trim(),
        faculty: dto.faculty.trim(),
        cohort: dto.cohort,
        duration_years: dto.duration_years,
        min_semester_credits: dto.min_semester_credits,
        max_semester_credits: dto.max_semester_credits,
        description: dto.description ?? null,
      }));
    } catch (error) {
      if (isPostgresError(error, UNIQUE_VIOLATION)) throw new ConflictException('Mã chương trình đã tồn tại.');
      throw error;
    }
  }

  async update(id: string, dto: UpdateCurriculumDto): Promise<Curriculum> {
    const curriculum = await this.findOne(id);
    if (dto.code !== undefined) curriculum.code = dto.code.trim();
    if (dto.name !== undefined) curriculum.name = dto.name.trim();
    if (dto.major !== undefined) curriculum.major = dto.major.trim();
    if (dto.faculty !== undefined) curriculum.faculty = dto.faculty.trim();
    if (dto.cohort !== undefined) curriculum.cohort = dto.cohort;
    if (dto.duration_years !== undefined) curriculum.duration_years = dto.duration_years;
    if (dto.min_semester_credits !== undefined) curriculum.min_semester_credits = dto.min_semester_credits;
    if (dto.max_semester_credits !== undefined) curriculum.max_semester_credits = dto.max_semester_credits;
    if (dto.description !== undefined) curriculum.description = dto.description;
    try {
      return await this.curricula.save(curriculum);
    } catch (error) {
      if (isPostgresError(error, UNIQUE_VIOLATION)) throw new ConflictException('Mã chương trình đã tồn tại.');
      throw error;
    }
  }

  /** Xóa chương trình. Môn, nhóm, quan hệ, quy định và kế hoạch liên quan bị xóa theo. */
  async remove(id: string): Promise<null> {
    const result = await this.curricula.delete(id);
    if (!result.affected) throw new NotFoundException('Không tìm thấy chương trình đào tạo.');
    return null;
  }
}
