import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { isPostgresError, UNIQUE_VIOLATION } from '../common/database/postgres-error';
import { PageMetaDto } from '../common/dto/page-meta.dto';
import { PageDto } from '../common/dto/page.dto';
import { Order } from '../common/dto/page-options.dto';
import { CourseQueryDto } from './dto/course-query.dto';
import { CreateCourseDto } from './dto/create-course.dto';
import { ReplaceOpenedSemestersDto } from './dto/replace-opened-semesters.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { CourseOpenedSemester } from './entities/course-opened-semester.entity';
import { Course } from './entities/course.entity';

@Injectable()
export class CourseService {
  constructor(
    @InjectRepository(Course) private readonly courses: Repository<Course>,
    @InjectRepository(CourseOpenedSemester) private readonly openedSemesterRows: Repository<CourseOpenedSemester>,
  ) {}

  async findPage(query: CourseQueryDto): Promise<PageDto<Course>> {
    const direction = query.order === Order.DESC ? 'DESC' : 'ASC';
    const builder = this.courses.createQueryBuilder('course');
    const search = query.search?.trim();
    if (search) {
      builder.andWhere('(LOWER(course.code) LIKE LOWER(:search) OR LOWER(course.name) LIKE LOWER(:search))', { search: `%${search}%` });
      // Ưu tiên khớp mã môn: "PE" ra các môn PE trước "Hệ điều hành / oPErating Systems".
      builder
        .addSelect(
          `CASE
            WHEN LOWER(course.code) = LOWER(:exact) THEN 0
            WHEN LOWER(course.code) LIKE LOWER(:prefix) THEN 1
            WHEN LOWER(course.code) LIKE LOWER(:search) THEN 2
            ELSE 3
          END`,
          'search_rank',
        )
        .setParameters({ exact: search, prefix: `${search}%` })
        .orderBy('search_rank', 'ASC');
    }
    if (query.codes?.length) {
      // Dùng được index UQ_courses_code_lower.
      builder.andWhere('LOWER(course.code) IN (:...codes)', { codes: query.codes.map(code => code.toLowerCase()) });
    }
    builder
      .addOrderBy('course.code', direction)
      .addOrderBy('course.id', 'ASC')
      .skip(query.skip)
      .take(query.take);
    const [data, itemCount] = await builder.getManyAndCount();
    return new PageDto(data, new PageMetaDto({ pageOptionsDto: query, itemCount }));
  }

  async findOne(id: string): Promise<Course> {
    const course = await this.courses.findOne({ where: { id } });
    if (!course) throw new NotFoundException('Không tìm thấy môn học.');
    return course;
  }

  async findByCode(code: string): Promise<Course> {
    const course = await this.courses.createQueryBuilder('course')
      .where('LOWER(course.code) = LOWER(:code)', { code })
      .getOne();
    if (!course) throw new NotFoundException('Không tìm thấy môn học.');
    return course;
  }

  async create(dto: CreateCourseDto): Promise<Course> {
    try {
      return await this.courses.save(this.courses.create({
        code: dto.code.trim(),
        name: dto.name.trim(),
        credits: dto.credits,
        description: this.text(dto.description),
      }));
    } catch (error) {
      if (isPostgresError(error, UNIQUE_VIOLATION)) throw new ConflictException('Mã môn học đã tồn tại.');
      throw error;
    }
  }

  async update(id: string, dto: UpdateCourseDto): Promise<Course> {
    const course = await this.findOne(id);
    if (dto.code !== undefined) course.code = dto.code.trim();
    if (dto.name !== undefined) course.name = dto.name.trim();
    if (dto.credits !== undefined) course.credits = dto.credits;
    if (dto.description !== undefined) course.description = this.text(dto.description);
    try {
      return await this.courses.save(course);
    } catch (error) {
      if (isPostgresError(error, UNIQUE_VIOLATION)) throw new ConflictException('Mã môn học đã tồn tại.');
      throw error;
    }
  }

  /** Xóa môn học. Dữ liệu con (học kỳ mở, môn trong chương trình, trạng thái, kế hoạch) bị xóa theo. */
  async remove(id: string): Promise<null> {
    const result = await this.courses.delete(id);
    if (!result.affected) throw new NotFoundException('Không tìm thấy môn học.');
    return null;
  }

  async openedSemesters(courseId: string): Promise<CourseOpenedSemester[]> {
    await this.findOne(courseId);
    return this.openedSemesterRows.find({ where: { course_id: courseId }, order: { semester_code: 'ASC' } });
  }

  /** Thay toàn bộ danh sách học kỳ đã mở của môn học. */
  async replaceOpenedSemesters(courseId: string, dto: ReplaceOpenedSemestersDto): Promise<CourseOpenedSemester[]> {
    await this.findOne(courseId);
    const codes = [...new Set(dto.semester_codes.map((code) => code.trim()).filter((code) => code.length > 0))];
    await this.courses.manager.transaction(async (manager) => {
      await manager.delete(CourseOpenedSemester, { course_id: courseId });
      if (codes.length) {
        await manager.insert(
          CourseOpenedSemester,
          codes.map((semester_code) => ({ course_id: courseId, semester_code })),
        );
      }
    });
    return this.openedSemesters(courseId);
  }

  async removeOpenedSemester(courseId: string, semesterCode: string): Promise<null> {
    await this.findOne(courseId);
    const result = await this.openedSemesterRows.delete({ course_id: courseId, semester_code: semesterCode });
    if (!result.affected) throw new NotFoundException('Môn học chưa mở học kỳ này.');
    return null;
  }

  private text(value: string | null | undefined): string | null {
    if (value === undefined || value === null) return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
}
