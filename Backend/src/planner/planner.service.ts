import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { readFileSync } from 'fs';
import { join } from 'path';
import { In, Not, Repository } from 'typeorm';
import { CourseOpenedSemester } from '../course/entities/course-opened-semester.entity';
import { Course } from '../course/entities/course.entity';
import { CourseCategoryMember } from '../curriculum/entities/course-category-member.entity';
import { CourseCategory } from '../curriculum/entities/course-category.entity';
import { CourseGroupMember } from '../curriculum/entities/course-group-member.entity';
import { CourseGroup } from '../curriculum/entities/course-group.entity';
import { CourseRelation } from '../curriculum/entities/course-relation.entity';
import { CurriculumCourse } from '../curriculum/entities/curriculum-course.entity';
import { CurriculumRegulation } from '../curriculum/entities/curriculum-regulation.entity';
import { CurriculumSpecialization } from '../curriculum/entities/curriculum-specialization.entity';
import { Curriculum } from '../curriculum/entities/curriculum.entity';
import { StudentCourse } from '../student/entities/student-course.entity';
import { StudentProfile } from '../student/entities/student-profile.entity';
import { StudentProgressImport } from '../student/entities/student-progress-import.entity';
import { SolvePlanDto } from './dto/solve-plan.dto';
import { analyzeMybk, CatalogCourse, MybkParsed } from './mybk-check';
import { importedCodes, ImportedFile, planImportStatuses } from './mybk-import';
import { certificateCourses, reviewMybk, ReviewCurriculum, ReviewFile } from './mybk-review';
import { currentSemester } from '../advisor/semester';
import { AdjustMybkDto } from './dto/adjust-mybk.dto';
import { InterestTag, interestTagsFor } from './interest-tags';
import { buildPlannerInput, PlannerSource, progressFromImport, savedCurrentSemester } from './planner-input';
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
    @InjectRepository(CurriculumRegulation) private readonly regulations: Repository<CurriculumRegulation>,
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
    const progressRow = await this.progress.findOne({ where: { user_id: userId } });
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
      progress: progressFromImport(progressRow?.data),
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
  /** PDF "Tiến độ hoàn thành CTĐT", hoặc chữ dán từ trang đó (frontend gửi thành file .txt; `format: 'text'`, 21/11). */
  private async readMybkPdf(file: Buffer) {
    const parsed = await this.readMybkFile(file);
    if (parsed.format !== 'pdf' && parsed.format !== 'text') {
      throw new BadRequestException('Chỉ nhận file PDF "Tiến độ hoàn thành CTĐT" của myBK, hoặc nội dung trang đó dán vào.');
    }
    return parsed;
  }

  /** Chương trình có `source_code` = mã CTĐT myBK của file (132 chương trình, không trùng mã, kiểm 21/11). */
  private findBySourceCode(code: unknown) {
    return typeof code === 'string' && code ? this.curricula.findOne({ where: { source_code: code } }) : Promise.resolve(null);
  }

  /**
   * T32: đọc PDF, tìm chương trình theo mã myBK, liệt kê mâu thuẫn và trạng thái môn sẽ đổi. Không ghi gì.
   * Trả cả nội dung file (`file`, gồm thông tin sinh viên) để sinh viên xem trước khi xác nhận.
   */
  async reviewMybk(userId: string, file: Buffer) {
    const parsed = await this.readMybkPdf(file);
    const reviewFile = parsed as unknown as ReviewFile;
    const codes = importedCodes(parsed as unknown as ImportedFile);
    const [matched, profile, previous, studentCourses, catalog] = await Promise.all([
      this.findBySourceCode(parsed.official_program_code),
      this.profiles.findOne({ where: { user_id: userId } }),
      this.progress.findOne({ where: { user_id: userId }, select: { id: true } }),
      this.studentCourses.find({ where: { user_id: userId }, relations: { course: true } }),
      codes.length ? this.courses.find({ where: { code: In(codes) } }) : Promise.resolve([]),
    ]);
    let curriculum: ReviewCurriculum | null = null;
    if (matched) {
      const [items, regulations] = await Promise.all([
        this.curriculumCourses.find({ where: { curriculum_id: matched.id }, relations: { course: true } }),
        this.regulations.find({ where: { curriculum_id: matched.id } }),
      ]);
      curriculum = {
        id: matched.id, code: matched.code, name: matched.name, cohort: matched.cohort,
        source_code: matched.source_code, source_version: matched.source_version,
        total_credits: matched.total_credits,
        courses: items.filter((it) => it.course)
          .map((it) => ({ code: it.course.code, name: it.course.name, credits: it.course.credits })),
        regulations: regulations.map((r) => ({ name: r.name, detail: r.detail })),
      };
    }
    const chosen = profile?.curriculum_id
      ? await this.curricula.findOne({ where: { id: profile.curriculum_id } }) : null;
    const catalogMap = new Map(catalog.map((c) => [c.code, { name: c.name, credits: c.credits }]));
    const review = reviewMybk({
      file: reviewFile,
      matched: curriculum,
      profileCurriculum: chosen
        ? { id: chosen.id, code: chosen.code, name: chosen.name, source_code: chosen.source_code } : null,
      catalog: catalogMap,
      webStatus: new Map(studentCourses.filter((sc) => sc.course).map((sc) => [sc.course.code, sc.status])),
      webNames: new Map(studentCourses.filter((sc) => sc.course).map((sc) => [sc.course.code, sc.course.name])),
      hasPreviousImport: !!previous,
    });
    return { ...review, file: parsed };
  }

  async importMybk(userId: string, file: Buffer, applyCurriculum = false) {
    const parsed = await this.readMybkPdf(file);
    const imported = parsed as unknown as ImportedFile;
    // Chương trình của file (theo mã myBK): để đặt vào hồ sơ khi được yêu cầu, và để nối mã chứng chỉ (CCGDTC).
    const found = await this.findBySourceCode(imported.official_program_code);
    if (applyCurriculum && !found) {
      throw new BadRequestException(`Không có chương trình nào trên web mang mã myBK ${imported.official_program_code ?? '(trống)'}.`);
    }
    const matched = applyCurriculum ? found : null;
    let certs: ReturnType<typeof certificateCourses> = [];
    if (found) {
      const [items, regulations] = await Promise.all([
        this.curriculumCourses.find({ where: { curriculum_id: found.id }, relations: { course: true } }),
        this.regulations.find({ where: { curriculum_id: found.id } }),
      ]);
      certs = certificateCourses(
        [...imported.blocks.flatMap((b) => b.courses), ...(imported.graduation_conditions ?? [])],
        { courses: items.filter((it) => it.course).map((it) => ({ code: it.course.code })), regulations },
      );
    }
    // CCGDTC đạt → PE1003, PE1005 "Đã hoàn thành" (người duyệt 21/11).
    const extra = certs.flatMap((e) => e.codes.map((code) => ({ code, passed: e.passed })));
    const codes = [...new Set([...importedCodes(imported), ...extra.map((e) => e.code)])];
    const catalog = codes.length ? await this.courses.find({ where: { code: In(codes) } }) : [];
    const planned = planImportStatuses(imported, new Map(catalog.map((c) => [c.code, c.id])), extra);
    const certCodes = new Set(certs.map((e) => e.file_code));
    const plan = { ...planned, unknown_codes: planned.unknown_codes.filter((c) => !certCodes.has(c)) };
    // Phần sinh viên khai trên web (học kỳ hiện tại...) giữ nguyên khi nhập lại file.
    const previous = await this.progress.findOne({ where: { user_id: userId } });
    const web = (previous?.data as { web?: unknown } | undefined)?.web;
    await this.progress.manager.transaction(async (manager) => {
      await manager.upsert(StudentProgressImport, {
        user_id: userId,
        format: String(parsed.format), // 'pdf' | 'text' (cột varchar(10))
        official_program_code: imported.official_program_code ?? null,
        source_updated_at: imported.updated_at ?? null,
        // jsonb: TypeORM không suy được kiểu sâu của Record, ép kiểu ở đúng một chỗ này.
        data: (web ? { ...parsed, web } : parsed) as never,
      }, { conflictPaths: ['user_id'] });
      if (plan.items.length) {
        await manager.upsert(
          StudentCourse,
          plan.items.map((it) => ({ user_id: userId, course_id: it.course_id, status: it.status })),
          { conflictPaths: ['user_id', 'course_id'] },
        );
      }
      // Người duyệt 21/11: sau mỗi lần nhập, trạng thái môn trên web theo đúng file mới. Môn file không nhắc tới
      // (sót từ lần nhập trước, hoặc hiệu chỉnh tay) bị xóa = mặc định Chưa học; sinh viên hiệu chỉnh lại nếu cần.
      const keep = plan.items.map((it) => it.course_id);
      await manager.delete(StudentCourse, keep.length ? { user_id: userId, course_id: Not(In(keep)) } : { user_id: userId });
      if (matched) {
        const profile = await manager.findOne(StudentProfile, { where: { user_id: userId } });
        if (!profile) {
          await manager.insert(StudentProfile, { user_id: userId, curriculum_id: matched.id });
        } else if (profile.curriculum_id !== matched.id) {
          // Chuyên ngành mục tiêu thuộc chương trình cũ: bỏ khi đổi chương trình.
          await manager.update(StudentProfile, { user_id: userId },
            { curriculum_id: matched.id, target_specialization_id: null });
        }
      }
    });
    return { ...(await this.getProgress(userId)), written_courses: plan.items.length, unknown_codes: plan.unknown_codes,
      curriculum: matched ? { id: matched.id, code: matched.code, name: matched.name, source_code: matched.source_code } : null };
  }

  /** T28: nội dung file tiến độ đã lưu của chính tài khoản, hoặc `null` nếu chưa tải file. */
  async getProgress(userId: string) {
    const row = await this.progress.findOne({ where: { user_id: userId } });
    const saved = savedCurrentSemester(row?.data);
    // Học kỳ hiện tại: sinh viên khai (nút Hiệu chỉnh) hoặc tính theo ngày.
    const semester = { current_semester: saved ?? currentSemester(), current_semester_source: saved ? 'student' : 'auto' };
    if (!row) return { imported_at: null, data: null, ...semester };
    return { imported_at: row.updated_at, data: row.data, ...semester };
  }

  /**
   * Nút "Hiệu chỉnh" (21/11): ghi trạng thái các môn sinh viên sửa/thêm vào `student_courses` và học kỳ hiện tại vào
   * `student_progress_imports.data.web`, trong một transaction. Chỉ đụng dòng của chính tài khoản; nội dung file giữ nguyên.
   */
  async adjustMybk(userId: string, dto: AdjustMybkDto) {
    const row = await this.progress.findOne({ where: { user_id: userId } });
    if (!row) throw new BadRequestException('Chưa có tiến độ: nhập tiến độ từ myBK trước rồi mới hiệu chỉnh.');
    const ids = [...new Set(dto.items.map((it) => it.course_id))];
    const found = ids.length ? await this.courses.find({ where: { id: In(ids) }, select: { id: true } }) : [];
    if (found.length !== ids.length) throw new BadRequestException('Có môn không tồn tại trong danh mục môn học.');
    const latest = new Map(dto.items.map((it) => [it.course_id, it.status])); // trùng môn: lấy lần cuối
    const remove = [...new Set(dto.remove_course_ids ?? [])].filter((id) => !latest.has(id));
    await this.progress.manager.transaction(async (manager) => {
      if (remove.length) await manager.delete(StudentCourse, { user_id: userId, course_id: In(remove) });
      if (latest.size) {
        await manager.upsert(
          StudentCourse,
          [...latest].map(([course_id, status]) => ({ user_id: userId, course_id, status })),
          { conflictPaths: ['user_id', 'course_id'] },
        );
      }
      if (dto.current_semester) {
        const data = row.data as Record<string, unknown>;
        const web = { ...((data.web as Record<string, unknown> | undefined) ?? {}), current_semester: dto.current_semester };
        await manager.update(StudentProgressImport, { user_id: userId }, { data: { ...data, web } as never });
      }
    });
    return { ...(await this.getProgress(userId)), written_courses: latest.size, removed_courses: remove.length };
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

  /** Interest tags (Clingo tab) that have courses in the student's program; none without a program or tag file. */
  async interestTags(userId: string): Promise<{ tags: InterestTag[] }> {
    const profile = await this.profiles.findOne({ where: { user_id: userId } });
    if (!profile?.curriculum_id) return { tags: [] };
    const items = await this.curriculumCourses.find({ where: { curriculum_id: profile.curriculum_id }, relations: { course: true } });
    let file: unknown = null;
    try {
      file = JSON.parse(readFileSync(join(this.runner.dir, 'planner', 'data', 'course-tags.json'), 'utf8'));
    } catch {
      file = null; // no tag file exported yet
    }
    return { tags: interestTagsFor(file, new Set(items.map((it) => it.course.code))) };
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
