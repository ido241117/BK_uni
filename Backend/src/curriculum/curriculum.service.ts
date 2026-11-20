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
import { CurriculumProfileDto } from './dto/curriculum-profile.dto';
import { Curriculum, CURRICULUM_PROFILE_FIELDS, CurriculumProfile, CurriculumProfileText } from './entities/curriculum.entity';

@Injectable()
export class CurriculumService {
  constructor(@InjectRepository(Curriculum) private readonly curricula: Repository<Curriculum>) {}

  async findPage(query: CurriculumQueryDto): Promise<PageDto<Curriculum>> {
    const direction = query.order === Order.DESC ? 'DESC' : 'ASC';
    const builder = this.curricula.createQueryBuilder('curriculum');
    const search = query.search?.trim();
    if (search) {
      builder.where(
        'LOWER(curriculum.code) LIKE LOWER(:search) OR LOWER(curriculum.name) LIKE LOWER(:search) OR LOWER(curriculum.faculty) LIKE LOWER(:search) OR LOWER(curriculum.name_en) LIKE LOWER(:search)',
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

  /** Như `findOne`, kèm phần giới thiệu `profile` (cột không nằm trong select mặc định). */
  async findDetail(id: string): Promise<Curriculum> {
    const curriculum = await this.curricula
      .createQueryBuilder('curriculum')
      .addSelect('curriculum.profile')
      .where('curriculum.id = :id', { id })
      .getOne();
    if (!curriculum) throw new NotFoundException('Không tìm thấy chương trình đào tạo.');
    curriculum.profile ??= null;
    return curriculum;
  }

  async create(dto: CreateCurriculumDto): Promise<Curriculum> {
    try {
      const created = await this.curricula.save(this.curricula.create({
        code: dto.code.trim(),
        name: dto.name.trim(),
        major: dto.major.trim(),
        faculty: dto.faculty.trim(),
        cohort: dto.cohort,
        duration_years: dto.duration_years,
        min_semester_credits: dto.min_semester_credits,
        max_semester_credits: dto.max_semester_credits,
        description: dto.description ?? null,
        total_credits: dto.total_credits ?? null,
        specialization_required: dto.specialization_required ?? false,
        source_system: dto.source_system?.trim() || null,
        source_code: dto.source_code?.trim() || null,
        source_id: dto.source_id ?? null,
        source_version: dto.source_version?.trim() || null,
        name_en: dto.name_en?.trim() || null,
        profile: normalizeProfile(dto.profile),
        profile_source_code: dto.profile_source_code?.trim() || null,
      }));
      return await this.findDetail(created.id);
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
    if (dto.total_credits !== undefined) curriculum.total_credits = dto.total_credits;
    if (dto.specialization_required !== undefined) curriculum.specialization_required = dto.specialization_required;
    if (dto.source_system !== undefined) curriculum.source_system = dto.source_system?.trim() || null;
    if (dto.source_code !== undefined) curriculum.source_code = dto.source_code?.trim() || null;
    if (dto.source_id !== undefined) curriculum.source_id = dto.source_id;
    if (dto.source_version !== undefined) curriculum.source_version = dto.source_version?.trim() || null;
    if (dto.name_en !== undefined) curriculum.name_en = dto.name_en?.trim() || null;
    if (dto.profile !== undefined) curriculum.profile = normalizeProfile(dto.profile);
    if (dto.profile_source_code !== undefined) curriculum.profile_source_code = dto.profile_source_code?.trim() || null;
    try {
      await this.curricula.save(curriculum);
      return await this.findDetail(id);
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

/** Bỏ khoảng trắng thừa và trường rỗng; không còn nội dung nào thì lưu `null`. */
function normalizeProfile(profile: CurriculumProfileDto | null | undefined): CurriculumProfile | null {
  if (!profile) return null;
  const result: CurriculumProfile = {};
  for (const lang of ['vi', 'en'] as const) {
    const text: CurriculumProfileText = {};
    for (const field of CURRICULUM_PROFILE_FIELDS) {
      const value = profile[lang]?.[field]?.trim();
      if (value) text[field] = value;
    }
    if (Object.keys(text).length) result[lang] = text;
  }
  return Object.keys(result).length ? result : null;
}
