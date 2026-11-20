import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { readFileSync } from 'fs';
import { join } from 'path';
import { In, Repository } from 'typeorm';
import { CourseOpenedSemester } from '../course/entities/course-opened-semester.entity';
import { Course } from '../course/entities/course.entity';
import { CourseCategoryMember } from '../curriculum/entities/course-category-member.entity';
import { CourseCategory } from '../curriculum/entities/course-category.entity';
import { CourseGroupMember } from '../curriculum/entities/course-group-member.entity';
import { CourseGroup } from '../curriculum/entities/course-group.entity';
import { CourseRelation } from '../curriculum/entities/course-relation.entity';
import { CurriculumCourse } from '../curriculum/entities/curriculum-course.entity';
import { CurriculumSpecialization } from '../curriculum/entities/curriculum-specialization.entity';
import { Curriculum } from '../curriculum/entities/curriculum.entity';
import { StudentCourse } from '../student/entities/student-course.entity';
import { StudentProfile } from '../student/entities/student-profile.entity';
import { StudentProgressImport } from '../student/entities/student-progress-import.entity';
import { SolvePlanDto } from './dto/solve-plan.dto';
import { analyzeMybk, CatalogCourse, MybkParsed } from './mybk-check';
import { importedCodes, ImportedFile, planImportStatuses } from './mybk-import';
import { buildPlannerInput, PlannerSource } from './planner-input';
import { PlannerRunner } from './planner.runner';

/**
 * Đọc dữ liệu (chỉ đọc), ghép đầu vào, gọi bộ giải; đọc file myBK.
 * Ghi database duy nhất ở `importMybk` (T28): dòng tiến độ của chính tài khoản và trạng thái môn của tài khoản đó.
 */
@Injectable()
export class PlannerService {
  constructor(
    @InjectRepository(StudentProfile) private readonly profiles: Repository<StudentProfile>,
    @InjectRepository(StudentCourse) private readonly studentCourses: Repository<StudentCourse>,
    @InjectRepository(Curriculum) private readonly curricula: Repository<Curriculum>,
    @InjectRepository(CurriculumCourse) private readonly curriculumCourses: Repository<CurriculumCourse>,
    @InjectRepository(CourseGroup) private readonly groups: Repository<CourseGroup>,
    @InjectRepository(CourseGroupMember) private readonly groupMembers: Repository<CourseGroupMember>,
    @InjectRepository(CourseRelation) private readonly relations: Repository<CourseRelation>,
    @InjectRepository(CourseCategory) private readonly categories: Repository<CourseCategory>,
    @InjectRepository(CourseCategoryMember) private readonly categoryMembers: Repository<CourseCategoryMember>,
    @InjectRepository(CurriculumSpecialization) private readonly specializations: Repository<CurriculumSpecialization>,
    @InjectRepository(CourseOpenedSemester) private readonly opened: Repository<CourseOpenedSemester>,
    @InjectRepository(Course) private readonly courses: Repository<Course>,
    @InjectRepository(StudentProgressImport) private readonly progress: Repository<StudentProgressImport>,
    private readonly runner: PlannerRunner,
  ) {}

  async loadSource(userId: string): Promise<PlannerSource> {
    const profile = await this.profiles.findOne({ where: { user_id: userId } });
    if (!profile?.curriculum_id) {
      throw new BadRequestException('Bạn chưa chọn chương trình đào tạo trong hồ sơ, nên chưa gợi ý lộ trình được.');
    }
    const curriculumId = profile.curriculum_id;
    const curriculum = await this.curricula.findOneOrFail({ where: { id: curriculumId } });
    const [items, groups, members, relations, categories, categoryMembers, specializations, studentCourses] =
      await Promise.all([
        this.curriculumCourses.find({ where: { curriculum_id: curriculumId }, relations: { course: true } }),
        this.groups.find({ where: { curriculum_id: curriculumId } }),
        this.groupMembers.find({ where: { curriculum_id: curriculumId } }),
        this.relations.find({ where: { curriculum_id: curriculumId } }),
        this.categories.find({ where: { curriculum_id: curriculumId } }),
        this.categoryMembers.find({ where: { curriculum_id: curriculumId } }),
        this.specializations.find({ where: { curriculum_id: curriculumId } }),
        this.studentCourses.find({ where: { user_id: userId }, relations: { course: true } }),
      ]);
    const courseIds = items.map((it) => it.course_id);
    const openedSemesters = courseIds.length ? await this.opened.find({ where: { course_id: In(courseIds) } }) : [];
    const course = (c: { id: string; code: string; name: string; credits: number }) =>
      ({ id: c.id, code: c.code, name: c.name, credits: c.credits });
    return {
      curriculum: {
        code: curriculum.code, name: curriculum.name, cohort: curriculum.cohort,
        duration_years: curriculum.duration_years, min_semester_credits: curriculum.min_semester_credits,
        max_semester_credits: curriculum.max_semester_credits,
      },
      items: items.map((it) => ({ course: course(it.course), recommended_year: it.recommended_year,
        recommended_term: it.recommended_term })),
      groups: groups.map((g) => ({
        id: g.id, name: g.name, kind: g.kind, required_count: g.required_count, required_credits: g.required_credits,
        pool_scope: g.pool_scope, pool_course_credits: g.pool_course_credits, specialization_id: g.specialization_id,
        parent_group_id: g.parent_group_id,
        member_course_ids: members.filter((m) => m.group_id === g.id).map((m) => m.course_id),
      })),
      relations: relations.map((r) => ({ course_id: r.course_id, related_course_id: r.related_course_id, type: r.type })),
      categories: categories.map((c) => ({
        name: c.name, member_course_ids: categoryMembers.filter((m) => m.category_id === c.id).map((m) => m.course_id),
      })),
      specializations: specializations.map((s) => ({ id: s.id, code: s.code })),
      openedSemesters: openedSemesters.map((o) => ({ course_id: o.course_id, semester_code: o.semester_code })),
      profile: { admission_year: profile.admission_year, target_specialization_id: profile.target_specialization_id },
      studentCourses: studentCourses.filter((sc) => sc.course).map((sc) => ({ course: course(sc.course), status: sc.status })),
    };
  }

  /** Gọi `python -m planner.mybk`; lỗi đọc file thành HTTP 400 kèm câu tiếng Việt. */
  private async readMybkFile(file: Buffer): Promise<Record<string, unknown>> {
    let parsed: Record<string, unknown>;
    try {
      parsed = await this.runner.readMybk(file);
    } catch (error) {
      throw new BadGatewayException((error as Error).message);
    }
    if (parsed.status !== 'OK') {
      throw new BadRequestException((parsed.error as string) ?? 'Không đọc được file tiến độ.');
    }
    return parsed;
  }

  /**
   * T28: đọc PDF tiến độ myBK rồi, trong một transaction, ghi đè dòng tiến độ của tài khoản và ghi trạng thái
   * môn đúng như file (✓ -> Đã hoàn thành, "--" -> Chưa học). Môn không có trong file không bị đụng tới.
   * File gốc không được lưu.
   */
  async importMybk(userId: string, file: Buffer) {
    const parsed = await this.readMybkFile(file);
    if (parsed.format !== 'pdf') {
      throw new BadRequestException('Chỉ nhận file PDF "Tiến độ hoàn thành CTĐT" tải từ myBK.');
    }
    const imported = parsed as unknown as ImportedFile;
    const codes = importedCodes(imported);
    const catalog = codes.length ? await this.courses.find({ where: { code: In(codes) } }) : [];
    const plan = planImportStatuses(imported, new Map(catalog.map((c) => [c.code, c.id])));
    await this.progress.manager.transaction(async (manager) => {
      await manager.upsert(StudentProgressImport, {
        user_id: userId,
        format: 'pdf',
        official_program_code: imported.official_program_code ?? null,
        source_updated_at: imported.updated_at ?? null,
        // jsonb: TypeORM không suy được kiểu sâu của Record, ép kiểu ở đúng một chỗ này.
        data: parsed as never,
      }, { conflictPaths: ['user_id'] });
      if (plan.items.length) {
        await manager.upsert(
          StudentCourse,
          plan.items.map((it) => ({ user_id: userId, course_id: it.course_id, status: it.status })),
          { conflictPaths: ['user_id', 'course_id'] },
        );
      }
    });
    return { ...(await this.getProgress(userId)), written_courses: plan.items.length, unknown_codes: plan.unknown_codes };
  }

  /** T28: nội dung file tiến độ đã lưu của chính tài khoản, hoặc `null` nếu chưa tải file. */
  async getProgress(userId: string) {
    const row = await this.progress.findOne({ where: { user_id: userId } });
    if (!row) return { imported_at: null, data: null };
    return { imported_at: row.updated_at, data: row.data };
  }

  /** Đọc file tiến độ myBK và đối chiếu với database (chỉ đọc). File không được lưu. */
  async previewMybk(userId: string, file: Buffer) {
    const parsed = await this.readMybkFile(file);
    const result = parsed as unknown as MybkParsed;
    const codes = [...new Set(result.blocks.flatMap((b) => b.courses.map((c) => c.code)))];
    const profile = await this.profiles.findOne({ where: { user_id: userId } });
    const chosenId = profile?.curriculum_id ?? null;
    const [curricula, links, catalog, studentCourses] = await Promise.all([
      this.curricula.find(),
      this.curriculumCourses.find({ relations: { course: true } }),
      codes.length ? this.courses.find({ where: { code: In(codes) } }) : Promise.resolve([]),
      this.studentCourses.find({ where: { user_id: userId }, relations: { course: true } }),
    ]);
    const byCurriculum = new Map<string, CatalogCourse[]>();
    for (const link of links) {
      if (!link.course) continue;
      const list = byCurriculum.get(link.curriculum_id) ?? [];
      list.push({ id: link.course.id, code: link.course.code, name: link.course.name, credits: link.course.credits });
      byCurriculum.set(link.curriculum_id, list);
    }
    return analyzeMybk({
      parsed: result,
      curricula: curricula.map((c) => ({ id: c.id, code: c.code, name: c.name, cohort: c.cohort,
        courseCodes: (byCurriculum.get(c.id) ?? []).map((x) => x.code) })),
      chosenCurriculumId: chosenId,
      chosenCourses: chosenId ? byCurriculum.get(chosenId) ?? [] : [],
      catalog: catalog.map((c) => ({ id: c.id, code: c.code, name: c.name, credits: c.credits })),
      statusByCode: new Map(studentCourses.filter((s) => s.course).map((s) => [s.course.code, s.status])),
      programMap: this.programMap(),
    });
  }

  /** Bảng nối mã chương trình myBK -> mã chương trình của nhóm (file trong repo, không ở database). */
  private programMap(): Record<string, string> {
    try {
      const raw = JSON.parse(readFileSync(join(this.runner.dir, 'planner', 'data', 'mybk-program-map.json'), 'utf8'));
      return (raw.programs ?? {}) as Record<string, string>;
    } catch {
      return {};
    }
  }

  async solve(userId: string, dto: SolvePlanDto): Promise<Record<string, unknown>> {
    const input = buildPlannerInput(await this.loadSource(userId), dto);
    try {
      return await this.runner.run(input, dto.solver ?? 'cpsat');
    } catch (error) {
      throw new BadGatewayException((error as Error).message);
    }
  }
}
