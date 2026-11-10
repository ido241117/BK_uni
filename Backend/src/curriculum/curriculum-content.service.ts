import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { FOREIGN_KEY_VIOLATION, isPostgresError, UNIQUE_VIOLATION } from '../common/database/postgres-error';
import { CourseOpenedSemester } from '../course/entities/course-opened-semester.entity';
import { Course } from '../course/entities/course.entity';
import { CurriculumService } from './curriculum.service';
import { CreateCourseCategoryDto } from './dto/create-course-category.dto';
import { CreateCourseGroupDto } from './dto/create-course-group.dto';
import { CreateCurriculumCourseDto } from './dto/create-curriculum-course.dto';
import { CreateRegulationDto } from './dto/create-regulation.dto';
import { CreateSpecializationDto } from './dto/create-specialization.dto';
import { UpdateSpecializationDto } from './dto/update-specialization.dto';
import { ReplaceCourseCategoriesDto } from './dto/replace-course-categories.dto';
import { ReplaceCourseRelationsDto } from './dto/replace-course-relations.dto';
import { ReplaceGroupMembersDto } from './dto/replace-group-members.dto';
import { UpdateCourseCategoryDto } from './dto/update-course-category.dto';
import { UpdateCourseGroupDto } from './dto/update-course-group.dto';
import { UpdateCurriculumCourseDto } from './dto/update-curriculum-course.dto';
import { UpdateRegulationDto } from './dto/update-regulation.dto';
import { CourseCategoryMember } from './entities/course-category-member.entity';
import { CourseCategory } from './entities/course-category.entity';
import { CourseGroupMember } from './entities/course-group-member.entity';
import { CourseGroup } from './entities/course-group.entity';
import { CourseRelation } from './entities/course-relation.entity';
import { CurriculumCourse } from './entities/curriculum-course.entity';
import { CurriculumRegulation } from './entities/curriculum-regulation.entity';
import { CurriculumSpecialization } from './entities/curriculum-specialization.entity';
import { CourseGroupScope } from './enum/course-group-scope';
import { CourseRelationType } from './enum/course-relation-type';

export type CourseGroupMemberView = {
  id: string;
  curriculum_id: string;
  group_id: string;
  course_id: string;
  course: Course;
};

export type CourseGroupWithMembers = CourseGroup & { members: CourseGroupMemberView[] };

export type CourseCategoryMemberView = {
  id: string;
  curriculum_id: string;
  category_id: string;
  course_id: string;
  course: Course;
};

export type CourseCategoryWithMembers = CourseCategory & { members: CourseCategoryMemberView[] };

export type SpecializationWithGroups = CurriculumSpecialization & { groups: CourseGroupWithMembers[] };

export interface CourseRelationView {
  id: string;
  curriculum_id: string;
  course_id: string;
  course_code: string;
  related_course_id: string;
  related_course_code: string;
  type: CourseRelationType;
}

@Injectable()
export class CurriculumContentService {
  constructor(
    private readonly curricula: CurriculumService,
    @InjectRepository(CurriculumCourse) private readonly assignments: Repository<CurriculumCourse>,
    @InjectRepository(CourseGroup) private readonly groups: Repository<CourseGroup>,
    @InjectRepository(CourseGroupMember) private readonly members: Repository<CourseGroupMember>,
    @InjectRepository(CourseCategory) private readonly categories: Repository<CourseCategory>,
    @InjectRepository(CourseCategoryMember) private readonly categoryMembers: Repository<CourseCategoryMember>,
    @InjectRepository(CourseRelation) private readonly relations: Repository<CourseRelation>,
    @InjectRepository(CurriculumRegulation) private readonly regulations: Repository<CurriculumRegulation>,
    @InjectRepository(CurriculumSpecialization) private readonly specializations: Repository<CurriculumSpecialization>,
    @InjectRepository(CourseOpenedSemester) private readonly openedSemesters: Repository<CourseOpenedSemester>,
  ) {}

  // Môn trong chương trình

  async listCourses(curriculumId: string): Promise<CurriculumCourse[]> {
    await this.curricula.findOne(curriculumId);
    return this.assignments.find({
      where: { curriculum_id: curriculumId },
      relations: { course: true },
      order: { recommended_year: 'ASC', recommended_term: 'ASC', course: { code: 'ASC' } },
    });
  }

  /**
   * Thêm môn vào chương trình; nếu môn đã có thì cập nhật năm và học kỳ khuyến nghị.
   * Bỏ trống (hoặc `null`) cả hai trường nghĩa là môn chưa xếp kỳ, dùng cho pool tự chọn.
   */
  async upsertCourse(curriculumId: string, dto: CreateCurriculumCourseDto): Promise<CurriculumCourse> {
    await this.curricula.findOne(curriculumId);
    const year = dto.recommended_year ?? null;
    const term = dto.recommended_term ?? null;
    this.assertSchedulePair(year, term);
    const assignment = await this.assignments.findOne({
      where: { curriculum_id: curriculumId, course_id: dto.course_id },
    });
    if (assignment) {
      assignment.recommended_year = year;
      assignment.recommended_term = term;
      return this.saveAssignment(assignment);
    }
    return this.saveAssignment(this.assignments.create({
      curriculum_id: curriculumId,
      course_id: dto.course_id,
      recommended_year: year,
      recommended_term: term,
    }));
  }

  async updateCourse(curriculumId: string, courseId: string, dto: UpdateCurriculumCourseDto): Promise<CurriculumCourse> {
    const assignment = await this.findAssignment(curriculumId, courseId);
    const year = dto.recommended_year !== undefined ? dto.recommended_year : assignment.recommended_year;
    const term = dto.recommended_term !== undefined ? dto.recommended_term : assignment.recommended_term;
    this.assertSchedulePair(year, term);
    assignment.recommended_year = year;
    assignment.recommended_term = term;
    return this.saveAssignment(assignment);
  }

  async removeCourse(curriculumId: string, courseId: string): Promise<null> {
    const result = await this.assignments.delete({ curriculum_id: curriculumId, course_id: courseId });
    if (!result.affected) throw new NotFoundException('Môn học không thuộc chương trình đào tạo.');
    return null;
  }

  // Nhóm môn

  async listGroups(curriculumId: string): Promise<CourseGroupWithMembers[]> {
    await this.curricula.findOne(curriculumId);
    const [groups, members] = await Promise.all([
      this.groups.find({ where: { curriculum_id: curriculumId }, order: { name: 'ASC' } }),
      this.loadMembers({ curriculum_id: curriculumId }),
    ]);
    // Khối gốc (xét tốt nghiệp) đứng trước, khối chuyên ngành đứng sau.
    groups.sort((a, b) => Number(a.specialization_id !== null) - Number(b.specialization_id !== null));
    return groups.map((group) => Object.assign(group, {
      members: members.filter((member) => member.group_id === group.id),
    }));
  }

  async createGroup(curriculumId: string, dto: CreateCourseGroupDto): Promise<CourseGroupWithMembers> {
    await this.curricula.findOne(curriculumId);
    const specializationId = dto.specialization_id ?? null;
    const parentGroupId = dto.parent_group_id ?? null;
    const parent = await this.resolveParentGroup(curriculumId, specializationId, parentGroupId);
    const scope = dto.pool_scope ?? CourseGroupScope.LISTED;
    // Khối chuyên ngành mặc định giữ nguyên yêu cầu của khối gốc, chỉ thu hẹp danh sách môn.
    const inherit = parent && dto.required_count == null && dto.required_credits == null;
    const requiredCount = inherit ? parent.required_count : dto.required_count ?? null;
    const requiredCredits = inherit ? parent.required_credits : dto.required_credits ?? null;
    const courseIds = dto.course_ids ?? [];
    this.assertGroupTarget(requiredCount, requiredCredits, scope);
    this.assertScopeMembers(scope, courseIds);
    if (parent) {
      if (scope !== CourseGroupScope.LISTED) {
        throw new BadRequestException('Khối chuyên ngành phải là khối "listed".');
      }
      this.assertSubsetOfParent(parent, courseIds);
      await this.assertDisjointSiblings(specializationId!, parent.id, courseIds, null);
    }
    try {
      const group = await this.groups.manager.transaction(async (manager) => {
        const saved = await manager.save(manager.create(CourseGroup, {
          curriculum_id: curriculumId,
          name: dto.name.trim(),
          kind: dto.kind,
          required_count: requiredCount,
          required_credits: requiredCredits,
          pool_scope: scope,
          pool_course_credits: dto.pool_course_credits ?? null,
          specialization_id: specializationId,
          parent_group_id: parentGroupId,
        }));
        if (scope === CourseGroupScope.LISTED) {
          await this.writeMembers(manager, curriculumId, saved.id, courseIds).catch((error) => {
            throw this.translate(error);
          });
        }
        return saved;
      });
      return await this.findGroup(curriculumId, group.id);
    } catch (error) {
      this.translate(error);
    }
  }

  async updateGroup(curriculumId: string, groupId: string, dto: UpdateCourseGroupDto): Promise<CourseGroupWithMembers> {
    const group = await this.findGroup(curriculumId, groupId);
    const scope = dto.pool_scope ?? group.pool_scope;
    const requiredCount = dto.required_count !== undefined ? dto.required_count : group.required_count;
    const requiredCredits = dto.required_credits !== undefined ? dto.required_credits : group.required_credits;
    this.assertGroupTarget(requiredCount, requiredCredits, scope);
    this.assertScopeMembers(scope, dto.course_ids ?? []);
    if (group.parent_group_id) {
      if (scope !== CourseGroupScope.LISTED) {
        throw new BadRequestException('Khối chuyên ngành phải là khối "listed".');
      }
      if (dto.course_ids !== undefined) {
        this.assertSubsetOfParent(await this.findGroup(curriculumId, group.parent_group_id), dto.course_ids);
        await this.assertDisjointSiblings(group.specialization_id!, group.parent_group_id, dto.course_ids, groupId);
      }
    } else if (scope === CourseGroupScope.ANY && await this.groups.exist({ where: { parent_group_id: groupId } })) {
      throw new BadRequestException('Khối đang được chuyên ngành thu hẹp nên không chuyển sang "any" được.');
    }
    try {
      await this.groups.manager.transaction(async (manager) => {
        if (dto.name !== undefined) group.name = dto.name.trim();
        if (dto.kind !== undefined) group.kind = dto.kind;
        group.required_count = requiredCount;
        group.required_credits = requiredCredits;
        group.pool_scope = scope;
        if (dto.pool_course_credits !== undefined) group.pool_course_credits = dto.pool_course_credits;
        await manager.save(group);
        if (scope === CourseGroupScope.ANY) {
          // Khối "any" không có thành viên; chuyển từ "listed" sang phải dọn thành viên cũ.
          await manager.delete(CourseGroupMember, { group_id: groupId });
        } else if (dto.course_ids !== undefined) {
          await this.writeMembers(manager, curriculumId, groupId, dto.course_ids);
          await this.pruneChildMembers(manager, groupId, dto.course_ids);
        }
      });
      return await this.findGroup(curriculumId, groupId);
    } catch (error) {
      this.translate(error);
    }
  }

  async removeGroup(curriculumId: string, groupId: string): Promise<null> {
    const result = await this.groups.delete({ id: groupId, curriculum_id: curriculumId });
    if (!result.affected) throw new NotFoundException('Không tìm thấy nhóm môn.');
    return null;
  }

  async listGroupMembers(curriculumId: string, groupId: string): Promise<CourseGroupMemberView[]> {
    await this.findGroup(curriculumId, groupId);
    return this.loadMembers({ group_id: groupId });
  }

  async replaceGroupMembers(curriculumId: string, groupId: string, dto: ReplaceGroupMembersDto): Promise<CourseGroupWithMembers> {
    const group = await this.findGroup(curriculumId, groupId);
    if (group.pool_scope === CourseGroupScope.ANY) {
      throw new BadRequestException('Khối "any" không có danh sách môn.');
    }
    if (group.parent_group_id) {
      this.assertSubsetOfParent(await this.findGroup(curriculumId, group.parent_group_id), dto.course_ids);
      await this.assertDisjointSiblings(group.specialization_id!, group.parent_group_id, dto.course_ids, groupId);
    }
    try {
      await this.groups.manager.transaction(async (manager) => {
        await this.writeMembers(manager, curriculumId, groupId, dto.course_ids);
        await this.pruneChildMembers(manager, groupId, dto.course_ids);
      });
      return await this.findGroup(curriculumId, groupId);
    } catch (error) {
      this.translate(error);
    }
  }

  // Nhóm học phần (mô tả)

  async listCategories(curriculumId: string): Promise<CourseCategoryWithMembers[]> {
    await this.curricula.findOne(curriculumId);
    const [categories, members] = await Promise.all([
      this.categories.find({ where: { curriculum_id: curriculumId }, order: { name: 'ASC' } }),
      this.loadCategoryMembers({ curriculum_id: curriculumId }),
    ]);
    return categories.map((category) => Object.assign(category, {
      members: members.filter((member) => member.category_id === category.id),
    }));
  }

  async createCategory(curriculumId: string, dto: CreateCourseCategoryDto): Promise<CourseCategoryWithMembers> {
    await this.curricula.findOne(curriculumId);
    const name = this.categoryName(dto.name);
    await this.assertCategoryCourses(curriculumId, dto.course_ids ?? []);
    try {
      const category = await this.categories.manager.transaction(async (manager) => {
        const saved = await manager.save(manager.create(CourseCategory, {
          curriculum_id: curriculumId,
          name,
        }));
        if (dto.course_ids !== undefined) {
          await this.writeCategoryMembers(manager, curriculumId, saved.id, dto.course_ids);
        }
        return saved;
      });
      return await this.findCategory(curriculumId, category.id);
    } catch (error) {
      this.translateCategory(error);
    }
  }

  async updateCategory(
    curriculumId: string,
    categoryId: string,
    dto: UpdateCourseCategoryDto,
  ): Promise<CourseCategoryWithMembers> {
    const category = await this.findCategory(curriculumId, categoryId);
    if (dto.course_ids !== undefined) {
      await this.assertCategoryCourses(curriculumId, dto.course_ids);
    }
    try {
      await this.categories.manager.transaction(async (manager) => {
        if (dto.name !== undefined) {
          category.name = this.categoryName(dto.name);
          await manager.save(category);
        }
        if (dto.course_ids !== undefined) {
          await this.writeCategoryMembers(manager, curriculumId, categoryId, dto.course_ids);
        }
      });
      return await this.findCategory(curriculumId, categoryId);
    } catch (error) {
      this.translateCategory(error);
    }
  }

  async removeCategory(curriculumId: string, categoryId: string): Promise<null> {
    const result = await this.categories.delete({ id: categoryId, curriculum_id: curriculumId });
    if (!result.affected) throw new NotFoundException('Không tìm thấy nhóm học phần.');
    return null;
  }

  /** Gán một môn vào nhiều nhóm học phần (thay toàn bộ nhóm hiện có của môn). */
  async replaceCourseCategories(
    curriculumId: string,
    courseId: string,
    dto: ReplaceCourseCategoriesDto,
  ): Promise<CourseCategoryMemberView[]> {
    await this.findAssignment(curriculumId, courseId);
    const ids = [...new Set(dto.category_ids)];
    if (ids.length) {
      const found = await this.categories.count({
        where: { curriculum_id: curriculumId, id: In(ids) },
      });
      if (found !== ids.length) {
        throw new BadRequestException('Nhóm học phần không thuộc chương trình đào tạo.');
      }
    }
    await this.categories.manager.transaction(async (manager) => {
      await manager.delete(CourseCategoryMember, { curriculum_id: curriculumId, course_id: courseId });
      if (!ids.length) return;
      await manager.insert(CourseCategoryMember, ids.map((category_id) => ({
        curriculum_id: curriculumId,
        category_id,
        course_id: courseId,
      })));
    });
    return this.loadCategoryMembers({ curriculum_id: curriculumId, course_id: courseId });
  }

  // Chuyên ngành

  /** Chuyên ngành kèm các khối chuyên ngành (khối con có thành viên) của từng chuyên ngành. */
  async listSpecializations(curriculumId: string): Promise<SpecializationWithGroups[]> {
    const [specializations, groups] = await Promise.all([
      this.specializations.find({ where: { curriculum_id: curriculumId }, order: { code: 'ASC' } }),
      this.listGroups(curriculumId),
    ]);
    return specializations.map((specialization) => Object.assign(specialization, {
      groups: groups.filter((group) => group.specialization_id === specialization.id),
    }));
  }

  async createSpecialization(curriculumId: string, dto: CreateSpecializationDto): Promise<SpecializationWithGroups> {
    await this.curricula.findOne(curriculumId);
    try {
      const saved = await this.specializations.save(this.specializations.create({
        curriculum_id: curriculumId,
        code: this.requiredText(dto.code, 'Mã chuyên ngành'),
        name: this.requiredText(dto.name, 'Tên chuyên ngành'),
        description: dto.description?.trim() || null,
      }));
      return await this.findSpecialization(curriculumId, saved.id);
    } catch (error) {
      this.translateSpecialization(error);
    }
  }

  async updateSpecialization(
    curriculumId: string,
    specializationId: string,
    dto: UpdateSpecializationDto,
  ): Promise<SpecializationWithGroups> {
    const specialization = await this.specializations.findOne({
      where: { id: specializationId, curriculum_id: curriculumId },
    });
    if (!specialization) throw new NotFoundException('Không tìm thấy chuyên ngành.');
    if (dto.code !== undefined) specialization.code = this.requiredText(dto.code, 'Mã chuyên ngành');
    if (dto.name !== undefined) specialization.name = this.requiredText(dto.name, 'Tên chuyên ngành');
    if (dto.description !== undefined) specialization.description = dto.description?.trim() || null;
    try {
      await this.specializations.save(specialization);
      return await this.findSpecialization(curriculumId, specializationId);
    } catch (error) {
      this.translateSpecialization(error);
    }
  }

  /** Xóa chuyên ngành kéo theo các khối chuyên ngành; hồ sơ đang chọn chuyên ngành này về `null`. */
  async removeSpecialization(curriculumId: string, specializationId: string): Promise<null> {
    const result = await this.specializations.delete({ id: specializationId, curriculum_id: curriculumId });
    if (!result.affected) throw new NotFoundException('Không tìm thấy chuyên ngành.');
    return null;
  }

  // Quan hệ môn học

  async listRelations(curriculumId: string, courseId?: string): Promise<CourseRelationView[]> {
    await this.curricula.findOne(curriculumId);
    const rows = await this.relations.find({
      where: courseId ? { curriculum_id: curriculumId, course_id: courseId } : { curriculum_id: curriculumId },
      relations: { curriculum_course: { course: true }, related_curriculum_course: { course: true } },
      order: { course_id: 'ASC', type: 'ASC' },
    });
    return rows.map((row) => ({
      id: row.id,
      curriculum_id: row.curriculum_id,
      course_id: row.course_id,
      course_code: row.curriculum_course.course.code,
      related_course_id: row.related_course_id,
      related_course_code: row.related_curriculum_course.course.code,
      type: row.type,
    }));
  }

  /** Thay quan hệ tiên quyết và/hoặc khuyến nghị của một môn. Trường nào không gửi thì giữ nguyên. */
  async replaceCourseRelations(
    curriculumId: string,
    courseId: string,
    dto: ReplaceCourseRelationsDto,
  ): Promise<CourseRelationView[]> {
    await this.findAssignment(curriculumId, courseId);
    try {
      const byType: [CourseRelationType, string[] | undefined][] = [
        [CourseRelationType.PREREQUISITE, dto.prerequisite_course_ids],
        [CourseRelationType.PRIOR, dto.prior_course_ids],
        [CourseRelationType.COREQUISITE, dto.corequisite_course_ids],
        [CourseRelationType.RECOMMENDED, dto.recommended_course_ids],
      ];
      await this.relations.manager.transaction(async (manager) => {
        for (const [type, relatedIds] of byType) {
          if (relatedIds !== undefined) await this.writeRelations(manager, curriculumId, courseId, type, relatedIds);
        }
      });
    } catch (error) {
      this.translate(error);
    }
    return this.listRelations(curriculumId, courseId);
  }

  // Học kỳ mở lớp

  /**
   * Học kỳ đã mở lớp của mọi môn trong chương trình (gồm cả môn của các khối tự chọn, vì thành viên
   * khối luôn là môn của chương trình). Một lần gọi thay cho N lần `GET /courses/:id/opened-semesters`.
   */
  async listOpenedSemesters(curriculumId: string): Promise<{ course_id: string; semester_code: string }[]> {
    await this.curricula.findOne(curriculumId);
    const rows = await this.openedSemesters.createQueryBuilder('opened')
      .innerJoin(
        CurriculumCourse,
        'assignment',
        'assignment.course_id = opened.course_id AND assignment.curriculum_id = :curriculumId',
        { curriculumId },
      )
      .orderBy('opened.course_id', 'ASC')
      .addOrderBy('opened.semester_code', 'ASC')
      .getMany();
    return rows.map((row) => ({ course_id: row.course_id, semester_code: row.semester_code }));
  }

  // Quy định

  async listRegulations(curriculumId: string): Promise<CurriculumRegulation[]> {
    await this.curricula.findOne(curriculumId);
    return this.regulations.find({ where: { curriculum_id: curriculumId }, order: { name: 'ASC' } });
  }

  async createRegulation(curriculumId: string, dto: CreateRegulationDto): Promise<CurriculumRegulation> {
    await this.curricula.findOne(curriculumId);
    return this.regulations.save(this.regulations.create({
      curriculum_id: curriculumId,
      name: dto.name.trim(),
      detail: dto.detail ?? null,
    }));
  }

  async updateRegulation(curriculumId: string, regulationId: string, dto: UpdateRegulationDto): Promise<CurriculumRegulation> {
    const regulation = await this.findRegulation(curriculumId, regulationId);
    if (dto.name !== undefined) regulation.name = dto.name.trim();
    if (dto.detail !== undefined) regulation.detail = dto.detail;
    return this.regulations.save(regulation);
  }

  async removeRegulation(curriculumId: string, regulationId: string): Promise<null> {
    const result = await this.regulations.delete({ id: regulationId, curriculum_id: curriculumId });
    if (!result.affected) throw new NotFoundException('Không tìm thấy quy định.');
    return null;
  }

  // Nội bộ

  private async findAssignment(curriculumId: string, courseId: string): Promise<CurriculumCourse> {
    const assignment = await this.assignments.findOne({
      where: { curriculum_id: curriculumId, course_id: courseId },
      relations: { course: true },
    });
    if (!assignment) throw new NotFoundException('Môn học không thuộc chương trình đào tạo.');
    return assignment;
  }

  private async saveAssignment(assignment: CurriculumCourse): Promise<CurriculumCourse> {
    try {
      const saved = await this.assignments.save(assignment);
      return await this.findAssignment(saved.curriculum_id, saved.course_id);
    } catch (error) {
      this.translate(error);
    }
  }

  private async findGroup(curriculumId: string, groupId: string): Promise<CourseGroupWithMembers> {
    const group = await this.groups.findOne({ where: { id: groupId, curriculum_id: curriculumId } });
    if (!group) throw new NotFoundException('Không tìm thấy nhóm môn.');
    const members = await this.loadMembers({ group_id: groupId });
    return Object.assign(group, { members });
  }

  private async loadMembers(where: { curriculum_id?: string; group_id?: string }): Promise<CourseGroupMemberView[]> {
    const members = await this.members.find({
      where,
      relations: { curriculum_course: { course: true } },
      order: { course_id: 'ASC' },
    });
    return members.map((member) => ({
      id: member.id,
      curriculum_id: member.curriculum_id,
      group_id: member.group_id,
      course_id: member.course_id,
      course: member.curriculum_course.course,
    }));
  }

  private async findCategory(curriculumId: string, categoryId: string): Promise<CourseCategoryWithMembers> {
    const category = await this.categories.findOne({ where: { id: categoryId, curriculum_id: curriculumId } });
    if (!category) throw new NotFoundException('Không tìm thấy nhóm học phần.');
    const members = await this.loadCategoryMembers({ category_id: categoryId });
    return Object.assign(category, { members });
  }

  private async loadCategoryMembers(
    where: { curriculum_id?: string; category_id?: string; course_id?: string },
  ): Promise<CourseCategoryMemberView[]> {
    const members = await this.categoryMembers.find({
      where,
      relations: { curriculum_course: { course: true } },
      order: { course_id: 'ASC' },
    });
    return members.map((member) => ({
      id: member.id,
      curriculum_id: member.curriculum_id,
      category_id: member.category_id,
      course_id: member.course_id,
      course: member.curriculum_course.course,
    }));
  }

  private async findSpecialization(curriculumId: string, specializationId: string): Promise<SpecializationWithGroups> {
    const specialization = await this.specializations.findOne({
      where: { id: specializationId, curriculum_id: curriculumId },
    });
    if (!specialization) throw new NotFoundException('Không tìm thấy chuyên ngành.');
    const groups = await this.listGroups(curriculumId);
    return Object.assign(specialization, {
      groups: groups.filter((group) => group.specialization_id === specializationId),
    });
  }

  private async findRegulation(curriculumId: string, regulationId: string): Promise<CurriculumRegulation> {
    const regulation = await this.regulations.findOne({ where: { id: regulationId, curriculum_id: curriculumId } });
    if (!regulation) throw new NotFoundException('Không tìm thấy quy định.');
    return regulation;
  }

  private async writeMembers(
    manager: EntityManager,
    curriculumId: string,
    groupId: string,
    courseIds: string[],
  ): Promise<void> {
    const codes = [...new Set(courseIds)];
    await manager.delete(CourseGroupMember, { group_id: groupId });
    if (!codes.length) return;
    await manager.insert(CourseGroupMember, codes.map((course_id) => ({
      curriculum_id: curriculumId,
      group_id: groupId,
      course_id,
    })));
  }

  private async writeCategoryMembers(
    manager: EntityManager,
    curriculumId: string,
    categoryId: string,
    courseIds: string[],
  ): Promise<void> {
    const codes = [...new Set(courseIds)];
    await manager.delete(CourseCategoryMember, { category_id: categoryId });
    if (!codes.length) return;
    await manager.insert(CourseCategoryMember, codes.map((course_id) => ({
      curriculum_id: curriculumId,
      category_id: categoryId,
      course_id,
    })));
  }

  private async writeRelations(
    manager: EntityManager,
    curriculumId: string,
    courseId: string,
    type: CourseRelationType,
    relatedCourseIds: string[],
  ): Promise<void> {
    const codes = [...new Set(relatedCourseIds)];
    await manager.delete(CourseRelation, { curriculum_id: curriculumId, course_id: courseId, type });
    if (!codes.length) return;
    await manager.insert(CourseRelation, codes.map((related_course_id) => ({
      curriculum_id: curriculumId,
      course_id: courseId,
      related_course_id,
      type,
    })));
  }

  /**
   * Kiểm tra cặp chuyên ngành/khối gốc khi tạo khối chuyên ngành; trả `null` với khối gốc.
   * Chỉ cho thu hẹp một khối gốc "listed" (không lồng nhiều cấp).
   */
  private async resolveParentGroup(
    curriculumId: string,
    specializationId: string | null,
    parentGroupId: string | null,
  ): Promise<CourseGroupWithMembers | null> {
    if ((specializationId === null) !== (parentGroupId === null)) {
      throw new BadRequestException('specialization_id và parent_group_id phải cùng có hoặc cùng bỏ trống.');
    }
    if (specializationId === null || parentGroupId === null) return null;
    const specialization = await this.specializations.exist({
      where: { id: specializationId, curriculum_id: curriculumId },
    });
    if (!specialization) throw new BadRequestException('Chuyên ngành không thuộc chương trình đào tạo.');
    const parent = await this.groups.findOne({ where: { id: parentGroupId, curriculum_id: curriculumId } });
    if (!parent) throw new BadRequestException('Khối gốc không thuộc chương trình đào tạo.');
    if (parent.parent_group_id) throw new BadRequestException('Khối gốc phải là khối xét tốt nghiệp, không phải khối chuyên ngành.');
    if (parent.pool_scope !== CourseGroupScope.LISTED) throw new BadRequestException('Chỉ thu hẹp được khối "listed".');
    return this.findGroup(curriculumId, parentGroupId);
  }

  private assertSubsetOfParent(parent: CourseGroupWithMembers, courseIds: string[]): void {
    const allowed = new Set(parent.members.map((member) => member.course_id));
    if (courseIds.some((courseId) => !allowed.has(courseId))) {
      throw new BadRequestException(`Môn của khối chuyên ngành phải thuộc khối gốc "${parent.name}".`);
    }
  }

  /**
   * Các khối con của cùng chuyên ngành trên cùng khối gốc (ví dụ "bắt buộc" và "tự chọn") không được
   * trùng môn; nếu trùng, một môn có thể được đếm cho cả hai khối khi xét chuyên ngành.
   */
  private async assertDisjointSiblings(
    specializationId: string,
    parentGroupId: string,
    courseIds: string[],
    selfGroupId: string | null,
  ): Promise<void> {
    if (!courseIds.length) return;
    const siblings = await this.groups.find({
      where: { specialization_id: specializationId, parent_group_id: parentGroupId },
      select: { id: true, name: true },
    });
    const others = siblings.filter((sibling) => sibling.id !== selfGroupId);
    if (!others.length) return;
    const clash = await this.members.findOne({
      where: { group_id: In(others.map((sibling) => sibling.id)), course_id: In([...new Set(courseIds)]) },
    });
    if (clash) {
      const name = others.find((sibling) => sibling.id === clash.group_id)?.name ?? '';
      throw new BadRequestException(
        `Môn đã thuộc khối "${name}" của cùng chuyên ngành trên cùng khối gốc; các khối con không được trùng môn.`,
      );
    }
  }

  /** Bỏ khỏi các khối chuyên ngành những môn không còn trong khối gốc. */
  private async pruneChildMembers(manager: EntityManager, groupId: string, courseIds: string[]): Promise<void> {
    const children = await manager.find(CourseGroup, { where: { parent_group_id: groupId }, select: { id: true } });
    if (!children.length) return;
    const query = manager.createQueryBuilder().delete().from(CourseGroupMember)
      .where('group_id IN (:...children)', { children: children.map((child) => child.id) });
    if (courseIds.length) query.andWhere('course_id NOT IN (:...courseIds)', { courseIds });
    await query.execute();
  }

  private assertSchedulePair(year: number | null, term: number | null): void {
    if ((year === null) !== (term === null)) {
      throw new BadRequestException('Năm và học kỳ khuyến nghị phải cùng có hoặc cùng bỏ trống.');
    }
  }

  private assertGroupTarget(
    requiredCount: number | null,
    requiredCredits: number | null,
    scope: CourseGroupScope,
  ): void {
    if (!requiredCount && !requiredCredits) {
      throw new BadRequestException('Nhóm môn phải có ít nhất một ràng buộc: required_count hoặc required_credits.');
    }
    if (scope === CourseGroupScope.ANY && !requiredCredits) {
      throw new BadRequestException('Khối "any" phải khai báo required_credits.');
    }
  }

  private assertScopeMembers(scope: CourseGroupScope, courseIds: string[]): void {
    if (scope === CourseGroupScope.ANY && courseIds.length > 0) {
      throw new BadRequestException('Khối "any" không nhận danh sách môn; bỏ course_ids.');
    }
  }

  private categoryName(value: string): string {
    const name = value.trim();
    if (!name) throw new BadRequestException('Tên nhóm học phần không được để trống.');
    return name;
  }

  /** Nhóm học phần chỉ chứa môn đã thuộc chương trình. */
  private async assertCategoryCourses(curriculumId: string, courseIds: string[]): Promise<void> {
    const ids = [...new Set(courseIds)];
    if (!ids.length) return;
    const found = await this.assignments.count({
      where: { curriculum_id: curriculumId, course_id: In(ids) },
    });
    if (found !== ids.length) {
      throw new BadRequestException('Môn học phải thuộc chương trình trước khi xếp vào nhóm học phần.');
    }
  }

  private translate(error: unknown): never {
    if (isPostgresError(error, UNIQUE_VIOLATION)) {
      throw new ConflictException('Dữ liệu bị trùng: tên nhóm đã tồn tại hoặc môn đã có trong nhóm.');
    }
    if (isPostgresError(error, FOREIGN_KEY_VIOLATION)) {
      throw new BadRequestException('Môn học, chương trình hoặc nhóm môn không tồn tại.');
    }
    throw error;
  }

  private requiredText(value: string, label: string): string {
    const text = value.trim();
    if (!text) throw new BadRequestException(`${label} không được để trống.`);
    return text;
  }

  private translateSpecialization(error: unknown): never {
    if (isPostgresError(error, UNIQUE_VIOLATION)) {
      throw new ConflictException('Mã chuyên ngành đã tồn tại trong chương trình.');
    }
    throw error;
  }

  private translateCategory(error: unknown): never {
    if (isPostgresError(error, UNIQUE_VIOLATION)) {
      throw new ConflictException('Tên nhóm học phần đã tồn tại trong chương trình.');
    }
    if (isPostgresError(error, FOREIGN_KEY_VIOLATION)) {
      throw new BadRequestException('Môn học phải thuộc chương trình trước khi xếp vào nhóm học phần.');
    }
    throw error;
  }
}
