import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { FOREIGN_KEY_VIOLATION, isPostgresError, UNIQUE_VIOLATION } from '../common/database/postgres-error';
import { Course } from '../course/entities/course.entity';
import { CurriculumRegulation } from '../curriculum/entities/curriculum-regulation.entity';
import { CurriculumSpecialization } from '../curriculum/entities/curriculum-specialization.entity';
import { BulkUpsertStudentCoursesDto } from './dto/bulk-upsert-student-courses.dto';
import { UpdateStudentProfileDto } from './dto/update-student-profile.dto';
import { UpsertPlanCourseDto } from './dto/upsert-plan-course.dto';
import { UpsertRegulationStatusDto } from './dto/upsert-regulation-status.dto';
import { UpsertStudentCourseDto } from './dto/upsert-student-course.dto';
import { StudentCourse } from './entities/student-course.entity';
import { StudentPlanCourse } from './entities/student-plan-course.entity';
import { StudentProfile } from './entities/student-profile.entity';
import { StudentRegulationStatusEntity } from './entities/student-regulation-status.entity';
import { StudentCourseStatus } from './enum/student-course-status';
import { isPhysicalEducationCourse, PE_GENERIC_CODES } from './physical-education';

export type PlanCourseView = {
  id: string;
  curriculum_id: string;
  course_id: string;
  semester_code: string;
  course: Course;
};

@Injectable()
export class StudentService {
  constructor(
    @InjectRepository(StudentProfile) private readonly profiles: Repository<StudentProfile>,
    @InjectRepository(CurriculumSpecialization) private readonly specializations: Repository<CurriculumSpecialization>,
    @InjectRepository(StudentCourse) private readonly studentCourses: Repository<StudentCourse>,
    @InjectRepository(StudentPlanCourse) private readonly planCourses: Repository<StudentPlanCourse>,
    @InjectRepository(StudentRegulationStatusEntity)
    private readonly regulationStatuses: Repository<StudentRegulationStatusEntity>,
  ) {}

  // Hồ sơ sinh viên

  /** Hồ sơ của chính mình, trả `null` khi chưa có. */
  findMyProfile(userId: string): Promise<StudentProfile | null> {
    return this.profiles.findOne({ where: { user_id: userId } });
  }

  /** Cập nhật hồ sơ; nếu chưa có thì tạo mới. */
  async saveMyProfile(userId: string, dto: UpdateStudentProfileDto): Promise<StudentProfile> {
    const profile = await this.profiles.findOne({ where: { user_id: userId } })
      ?? this.profiles.create({ user_id: userId });

    if (dto.full_name !== undefined) profile.full_name = this.text(dto.full_name);
    if (dto.student_number !== undefined) profile.student_number = this.text(dto.student_number);
    if (dto.phone !== undefined) profile.phone = this.text(dto.phone);
    if (dto.birth_date !== undefined) profile.birth_date = dto.birth_date ?? null;
    if (dto.admission_year !== undefined) profile.admission_year = dto.admission_year ?? null;
    if (dto.address !== undefined) profile.address = this.text(dto.address);
    if (dto.curriculum_id !== undefined) {
      const curriculumId = dto.curriculum_id ?? null;
      // Đổi chương trình mà không chọn lại chuyên ngành: chuyên ngành cũ không còn hợp lệ.
      if (curriculumId !== profile.curriculum_id && dto.target_specialization_id === undefined) {
        profile.target_specialization_id = null;
      }
      profile.curriculum_id = curriculumId;
    }
    if (dto.credit_target !== undefined) profile.credit_target = dto.credit_target ?? null;
    if (dto.target_specialization_id !== undefined) {
      const specializationId = dto.target_specialization_id ?? null;
      if (specializationId !== null) {
        const valid = profile.curriculum_id !== null && await this.specializations.exist({
          where: { id: specializationId, curriculum_id: profile.curriculum_id },
        });
        if (!valid) throw new BadRequestException('Chuyên ngành không thuộc chương trình đào tạo của hồ sơ.');
      }
      profile.target_specialization_id = specializationId;
    }

    try {
      return await this.profiles.save(profile);
    } catch (error) {
      if (isPostgresError(error, UNIQUE_VIOLATION)) throw new ConflictException('Mã số sinh viên đã được sử dụng.');
      if (isPostgresError(error, FOREIGN_KEY_VIOLATION)) throw new BadRequestException('Chương trình đào tạo không tồn tại.');
      throw error;
    }
  }

  // Trạng thái môn học

  listMyCourses(userId: string): Promise<StudentCourse[]> {
    return this.studentCourses.find({
      where: { user_id: userId },
      relations: { course: true },
      order: { course_id: 'ASC' },
    });
  }

  async upsertMyCourse(userId: string, courseId: string, dto: UpsertStudentCourseDto): Promise<StudentCourse> {
    try {
      const existing = await this.studentCourses.findOne({ where: { user_id: userId, course_id: courseId } });
      if (existing) {
        existing.status = dto.status;
        await this.studentCourses.save(existing);
      } else {
        await this.studentCourses.save(this.studentCourses.create({
          user_id: userId,
          course_id: courseId,
          status: dto.status,
        }));
      }
    } catch (error) {
      if (isPostgresError(error, FOREIGN_KEY_VIOLATION)) throw new BadRequestException('Môn học không tồn tại.');
      throw error;
    }
    await this.syncPhysicalEducation(userId, [courseId]);
    const saved = await this.studentCourses.findOne({
      where: { user_id: userId, course_id: courseId },
      relations: { course: true },
    });
    if (!saved) throw new NotFoundException('Chưa có trạng thái của môn học này.');
    return saved;
  }

  /**
   * Khai trạng thái nhiều môn cùng lúc, tất cả hoặc không gì cả (một transaction).
   * Môn chưa khai thì tạo mới, đã khai thì cập nhật; môn không có trong danh sách giữ nguyên.
   */
  async bulkUpsertMyCourses(userId: string, dto: BulkUpsertStudentCoursesDto): Promise<StudentCourse[]> {
    const courseIds = dto.items.map((item) => item.course_id);
    if (new Set(courseIds).size !== courseIds.length) {
      throw new BadRequestException('Mỗi môn chỉ được xuất hiện một lần trong danh sách.');
    }
    if (courseIds.length) {
      const found = await this.studentCourses.manager.count(Course, { where: { id: In(courseIds) } });
      if (found !== courseIds.length) throw new BadRequestException('Có môn học không tồn tại trong danh sách.');
    }

    await this.studentCourses.manager.transaction(async (manager) => {
      const existing = courseIds.length
        ? await manager.find(StudentCourse, { where: { user_id: userId, course_id: In(courseIds) } })
        : [];
      const byCourseId = new Map(existing.map((row) => [row.course_id, row]));
      const rows = dto.items.map((item) => {
        const row = byCourseId.get(item.course_id)
          ?? manager.create(StudentCourse, { user_id: userId, course_id: item.course_id });
        row.status = item.status;
        return row;
      });
      if (rows.length) await manager.save(StudentCourse, rows);
    });
    await this.syncPhysicalEducation(userId, courseIds);
    return this.listMyCourses(userId);
  }

  /**
   * Ràng buộc mềm GDTC (xem `physical-education.ts`): chỉ chạy khi lần lưu này có học phần thể thao,
   * và chỉ nâng PE1003/PE1005 lên "đã hoàn thành", không bao giờ hạ. Sửa tay PE1003/PE1005 thì giữ nguyên.
   */
  private async syncPhysicalEducation(userId: string, changedCourseIds: string[]): Promise<void> {
    if (!changedCourseIds.length) return;
    const changed = await this.studentCourses.manager.find(Course, { where: { id: In(changedCourseIds) } });
    if (!changed.some(course => isPhysicalEducationCourse(course.code))) return;

    const completed = await this.studentCourses.find({
      where: { user_id: userId, status: StudentCourseStatus.COMPLETED },
      relations: { course: true },
    });
    const sportCount = completed.filter(row => isPhysicalEducationCourse(row.course?.code)).length;
    const targets = PE_GENERIC_CODES.slice(0, Math.min(sportCount, PE_GENERIC_CODES.length));
    if (!targets.length) return;

    const genericCourses = await this.studentCourses.manager
      .createQueryBuilder(Course, 'course')
      .where('UPPER(course.code) IN (:...codes)', { codes: [...targets] })
      .getMany();
    const done = new Set(completed.map(row => row.course_id));
    const pendingIds = genericCourses.map(course => course.id).filter(id => !done.has(id));
    if (!pendingIds.length) return;

    // Môn chung đã khai trạng thái khác (đang học, chưa đạt…) thì nâng lên; chưa khai thì tạo mới.
    const existing = await this.studentCourses.find({ where: { user_id: userId, course_id: In(pendingIds) } });
    const byCourseId = new Map(existing.map(row => [row.course_id, row]));
    await this.studentCourses.save(pendingIds.map(courseId => {
      const row = byCourseId.get(courseId) ?? this.studentCourses.create({ user_id: userId, course_id: courseId });
      row.status = StudentCourseStatus.COMPLETED;
      return row;
    }));
  }

  async removeMyCourse(userId: string, courseId: string): Promise<null> {
    const result = await this.studentCourses.delete({ user_id: userId, course_id: courseId });
    if (!result.affected) throw new NotFoundException('Chưa có trạng thái của môn học này.');
    return null;
  }

  // Kế hoạch học tập

  async listMyPlanCourses(userId: string, curriculumId?: string): Promise<PlanCourseView[]> {
    const rows = await this.planCourses.find({
      where: curriculumId ? { user_id: userId, curriculum_id: curriculumId } : { user_id: userId },
      relations: { course: true },
      order: { semester_code: 'ASC', course_id: 'ASC' },
    });
    return rows.map((row) => ({
      id: row.id,
      curriculum_id: row.curriculum_id,
      course_id: row.course_id,
      semester_code: row.semester_code,
      course: row.course,
    }));
  }

  async upsertMyPlanCourse(
    userId: string,
    curriculumId: string,
    courseId: string,
    dto: UpsertPlanCourseDto,
  ): Promise<PlanCourseView> {
    try {
      const existing = await this.planCourses.findOne({
        where: { user_id: userId, curriculum_id: curriculumId, course_id: courseId },
      });
      if (existing) {
        existing.semester_code = dto.semester_code.trim();
        await this.planCourses.save(existing);
      } else {
        await this.planCourses.save(this.planCourses.create({
          user_id: userId,
          curriculum_id: curriculumId,
          course_id: courseId,
          semester_code: dto.semester_code.trim(),
        }));
      }
    } catch (error) {
      if (isPostgresError(error, FOREIGN_KEY_VIOLATION)) {
        throw new BadRequestException('Môn học hoặc chương trình đào tạo không tồn tại.');
      }
      throw error;
    }
    const rows = await this.listMyPlanCourses(userId, curriculumId);
    const saved = rows.find((row) => row.course_id === courseId);
    if (!saved) throw new NotFoundException('Môn học chưa có trong kế hoạch.');
    return saved;
  }

  async removeMyPlanCourse(userId: string, curriculumId: string, courseId: string): Promise<null> {
    const result = await this.planCourses.delete({
      user_id: userId,
      curriculum_id: curriculumId,
      course_id: courseId,
    });
    if (!result.affected) throw new NotFoundException('Môn học chưa có trong kế hoạch.');
    return null;
  }

  // Trạng thái quy định

  async listMyRegulationStatuses(userId: string, curriculumId?: string): Promise<StudentRegulationStatusEntity[]> {
    if (!curriculumId) {
      return this.regulationStatuses.find({ where: { user_id: userId }, order: { regulation_id: 'ASC' } });
    }
    const rows = await this.regulationStatuses.createQueryBuilder('status')
      .innerJoin(CurriculumRegulation, 'regulation', 'regulation.id = status.regulation_id')
      .where('status.user_id = :userId', { userId })
      .andWhere('regulation.curriculum_id = :curriculumId', { curriculumId })
      .orderBy('status.regulation_id', 'ASC')
      .getMany();
    return rows;
  }

  async upsertMyRegulationStatus(
    userId: string,
    regulationId: string,
    dto: UpsertRegulationStatusDto,
  ): Promise<StudentRegulationStatusEntity> {
    try {
      const existing = await this.regulationStatuses.findOne({
        where: { user_id: userId, regulation_id: regulationId },
      });
      if (existing) {
        existing.status = dto.status;
        return await this.regulationStatuses.save(existing);
      }
      return await this.regulationStatuses.save(this.regulationStatuses.create({
        user_id: userId,
        regulation_id: regulationId,
        status: dto.status,
      }));
    } catch (error) {
      if (isPostgresError(error, FOREIGN_KEY_VIOLATION)) throw new BadRequestException('Quy định không tồn tại.');
      throw error;
    }
  }

  async removeMyRegulationStatus(userId: string, regulationId: string): Promise<null> {
    const result = await this.regulationStatuses.delete({ user_id: userId, regulation_id: regulationId });
    if (!result.affected) throw new NotFoundException('Chưa có trạng thái của quy định này.');
    return null;
  }

  private text(value: string | null | undefined): string | null {
    if (value === undefined || value === null) return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
}
