import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { currentSemester } from '../advisor/semester';
import { CourseRelation } from '../curriculum/entities/course-relation.entity';
import { CurriculumCourse } from '../curriculum/entities/curriculum-course.entity';
import { Curriculum } from '../curriculum/entities/curriculum.entity';
import { CourseOutlineImport } from './entities/course-outline-import.entity';
import { CourseOutlinePrerequisite } from './entities/course-outline-prerequisite.entity';
import { CourseOutline } from './entities/course-outline.entity';
import { pickOutlineForSemester } from './outline-format';

/** Thông tin một phiên bản (không kèm nội dung đầy đủ). */
const VERSION_COLUMNS = {
  id: true, course_code: true, version: true, applies_from: true, source_id: true, source_code: true,
  source_updated_at: true, name_vi: true, name_en: true, credits: true, level_code: true, course_type_code: true,
  faculty_code: true, import_id: true, created_at: true, updated_at: true,
} as const;

type Exam = { format?: { name?: { vi?: string | null } | null; code?: string | null } | null; duration_minutes?: number | null } | null;

export interface RelationDiff {
  related_course_code: string;
  outline_type: string | null;
  curriculum_type: string | null;
}

@Injectable()
export class OutlineService {
  constructor(
    @InjectRepository(CourseOutline) private readonly outlines: Repository<CourseOutline>,
    @InjectRepository(CourseOutlinePrerequisite) private readonly prerequisites: Repository<CourseOutlinePrerequisite>,
    @InjectRepository(CourseOutlineImport) private readonly imports: Repository<CourseOutlineImport>,
    @InjectRepository(Curriculum) private readonly curricula: Repository<Curriculum>,
    @InjectRepository(CurriculumCourse) private readonly curriculumCourses: Repository<CurriculumCourse>,
    @InjectRepository(CourseRelation) private readonly relations: Repository<CourseRelation>,
  ) {}

  /**
   * Đề cương của một môn: danh sách mọi phiên bản + bản áp dụng cho `semester` (mặc định học kỳ hiện tại)
   * kèm nội dung đầy đủ và điều kiện môn theo đề cương.
   */
  async findByCode(code: string, semester?: string) {
    const courseCode = code.trim().toUpperCase();
    const target = semester ?? currentSemester();
    const versions = await this.outlines.find({
      where: { course_code: courseCode },
      select: VERSION_COLUMNS,
      order: { applies_from: 'ASC', version: 'ASC' },
    });
    if (!versions.length) throw new NotFoundException(`Chưa có đề cương của môn ${courseCode}`);

    const picked = pickOutlineForSemester(versions, target);
    let selected: (CourseOutline & { prerequisites: CourseOutlinePrerequisite[] }) | null = null;
    if (picked) {
      const full = await this.outlines.createQueryBuilder('o').addSelect('o.content').where('o.id = :id', { id: picked.id }).getOneOrFail();
      const prerequisites = await this.prerequisites.find({ where: { outline_id: picked.id }, order: { related_course_code: 'ASC' } });
      selected = { ...full, prerequisites };
    }
    return { course_code: courseCode, semester: target, selected, versions };
  }

  /** Một phiên bản cụ thể (kèm nội dung và điều kiện môn), để xem lại bản cũ. */
  async findById(id: string) {
    const outline = await this.outlines.createQueryBuilder('o').addSelect('o.content').where('o.id = :id', { id }).getOne();
    if (!outline) throw new NotFoundException('Không tìm thấy đề cương');
    const prerequisites = await this.prerequisites.find({ where: { outline_id: id }, order: { related_course_code: 'ASC' } });
    return { ...outline, prerequisites };
  }

  /**
   * Tóm tắt đề cương áp dụng cho `semester` của mọi môn trong một chương trình: giờ học, đánh giá, hình thức thi,
   * điều kiện môn theo đề cương. Dùng cho trang Phân tích học tập (không trả nội dung đầy đủ).
   */
  /** Đề cương áp dụng cho `semester` của mọi môn trong chương trình (chỉ id + mã + phiên bản). */
  private async pickedForCurriculum(curriculumId: string, semester: string): Promise<CourseOutline[]> {
    const curriculum = await this.curricula.findOne({ where: { id: curriculumId } });
    if (!curriculum) throw new NotFoundException('Không tìm thấy chương trình đào tạo');
    const courses = await this.curriculumCourses.find({ where: { curriculum_id: curriculumId }, relations: { course: true } });
    const codes = [...new Set(courses.map(item => item.course.code.trim().toUpperCase()))];
    if (!codes.length) return [];
    const versions = await this.outlines.find({
      where: { course_code: In(codes) },
      select: { id: true, course_code: true, version: true, applies_from: true },
    });
    return codes
      .map(code => pickOutlineForSemester(versions.filter(item => item.course_code === code), semester))
      .filter((item): item is CourseOutline => Boolean(item));
  }

  /**
   * Văn bản để tìm theo chủ đề (tên, mục tiêu, tóm tắt, tên các buổi) của đề cương áp dụng cho `semester`
   * của mọi môn trong chương trình. Chỉ lấy các nhánh JSON cần thiết.
   */
  async searchTexts(curriculumId: string, semester?: string) {
    const picked = await this.pickedForCurriculum(curriculumId, semester ?? currentSemester());
    if (!picked.length) return [];
    return this.outlines.createQueryBuilder('o')
      .select('o.course_code', 'course_code')
      .addSelect('o.name_vi', 'name_vi')
      .addSelect('o.name_en', 'name_en')
      .addSelect(`o.content -> 'objectives'`, 'objectives')
      .addSelect(`o.content -> 'summary'`, 'summary')
      .where('o.id IN (:...ids)', { ids: picked.map(item => item.id) })
      .getRawMany<{
        course_code: string; name_vi: string | null; name_en: string | null;
        objectives: { vi?: string | null; en?: string | null } | null; summary: { vi?: string | null; en?: string | null } | null;
      }>();
  }

  async summaries(curriculumId: string, semester?: string) {
    const target = semester ?? currentSemester();
    const picked = await this.pickedForCurriculum(curriculumId, target);
    if (!picked.length) return { semester: target, items: [] };

    const ids = picked.map(item => item.id);
    // Chỉ lấy các nhánh JSON cần thiết thay vì cả `content` (~26 KB mỗi đề cương).
    const [full, prerequisites] = await Promise.all([
      this.outlines.createQueryBuilder('o')
        .select('o.id', 'id')
        .addSelect('o.course_code', 'course_code')
        .addSelect('o.version', 'version')
        .addSelect('o.applies_from', 'applies_from')
        .addSelect('o.credits', 'credits')
        .addSelect(`o.content -> 'hours'`, 'hours')
        .addSelect(`o.content -> 'credit_breakdown'`, 'credit_breakdown')
        .addSelect(`o.content -> 'assessment'`, 'assessment')
        .where('o.id IN (:...ids)', { ids })
        .getRawMany<{
          id: string; course_code: string; version: string; applies_from: string | null; credits: number | null;
          hours: { total_periods?: number | null; total_study_hours?: number | null; breakdown?: Record<string, number> } | null;
          credit_breakdown: Record<string, number> | null;
          assessment: { weights?: Record<string, number>; midterm?: Exam; final_exam?: Exam } | null;
        }>(),
      this.prerequisites.find({ where: { outline_id: In(ids) } }),
    ]);

    const exam = (value: Exam | undefined) => (value && (value.format || value.duration_minutes)
      ? { format: value.format?.name?.vi ?? value.format?.code ?? null, duration_minutes: value.duration_minutes ?? null }
      : null);

    const items = full.map(outline => {
      const breakdown = { ...(outline.credit_breakdown ?? {}), ...(outline.hours?.breakdown ?? {}) };
      return {
        course_code: outline.course_code,
        outline_id: outline.id,
        version: outline.version,
        applies_from: outline.applies_from,
        credits: outline.credits,
        total_periods: outline.hours?.total_periods ?? null,
        total_study_hours: outline.hours?.total_study_hours ?? null,
        has_lab: (breakdown.lab ?? 0) > 0,
        has_project: ['project', 'thesis', 'internship'].some(key => (breakdown[key] ?? 0) > 0),
        has_assignment: (breakdown.assignment ?? 0) > 0,
        weights: outline.assessment?.weights ?? {},
        midterm: exam(outline.assessment?.midterm),
        final_exam: exam(outline.assessment?.final_exam),
        prerequisites: prerequisites
          .filter(item => item.outline_id === outline.id)
          .map(item => ({ type: item.type, related_course_code: item.related_course_code })),
      };
    });
    return { semester: target, items };
  }

  listImports() {
    return this.imports.find({ order: { created_at: 'DESC' }, take: 50 });
  }

  /**
   * Đối chiếu điều kiện môn của chương trình (`course_relations`) với điều kiện trong đề cương áp dụng cho
   * `semester`. Chỉ đọc: không sửa bên nào. Trả về các môn có khác biệt và các môn chưa có đề cương.
   */
  async discrepancies(curriculumId: string, semester?: string) {
    const curriculum = await this.curricula.findOne({ where: { id: curriculumId } });
    if (!curriculum) throw new NotFoundException('Không tìm thấy chương trình đào tạo');
    const target = semester ?? currentSemester();

    const courses = await this.curriculumCourses.find({ where: { curriculum_id: curriculumId }, relations: { course: true } });
    const codeById = new Map(courses.map(item => [item.course_id, item.course.code.trim().toUpperCase()]));
    const codes = [...new Set(codeById.values())];

    const relations = await this.relations.find({ where: { curriculum_id: curriculumId } });
    const curriculumMap = new Map<string, Map<string, string>>();
    relations.forEach(relation => {
      const course = codeById.get(relation.course_id);
      const related = codeById.get(relation.related_course_id);
      if (!course || !related) return;
      const map = curriculumMap.get(course) ?? new Map<string, string>();
      map.set(related, relation.type);
      curriculumMap.set(course, map);
    });

    const versions = codes.length
      ? await this.outlines.find({ where: { course_code: In(codes) }, select: { id: true, course_code: true, version: true, applies_from: true } })
      : [];
    const pickedByCode = new Map<string, CourseOutline>();
    codes.forEach(code => {
      const picked = pickOutlineForSemester(versions.filter(item => item.course_code === code), target);
      if (picked) pickedByCode.set(code, picked);
    });
    const pickedIds = [...pickedByCode.values()].map(item => item.id);
    const outlinePrerequisites = pickedIds.length
      ? await this.prerequisites.find({ where: { outline_id: In(pickedIds) } })
      : [];

    const items: {
      course_code: string;
      outline: { id: string; version: string; applies_from: string | null };
      only_in_outline: RelationDiff[];
      only_in_curriculum: RelationDiff[];
      type_mismatch: RelationDiff[];
    }[] = [];
    let matching = 0;
    for (const code of codes.sort()) {
      const outline = pickedByCode.get(code);
      if (!outline) continue;
      const fromOutline = new Map<string, string | null>();
      outlinePrerequisites
        .filter(item => item.outline_id === outline.id)
        .forEach(item => { if (!fromOutline.has(item.related_course_code)) fromOutline.set(item.related_course_code, item.type); });
      const fromCurriculum = curriculumMap.get(code) ?? new Map<string, string>();

      const onlyInOutline: RelationDiff[] = [];
      const typeMismatch: RelationDiff[] = [];
      fromOutline.forEach((type, related) => {
        if (!fromCurriculum.has(related)) onlyInOutline.push({ related_course_code: related, outline_type: type, curriculum_type: null });
        else if (fromCurriculum.get(related) !== type) {
          typeMismatch.push({ related_course_code: related, outline_type: type, curriculum_type: fromCurriculum.get(related)! });
        }
      });
      const onlyInCurriculum: RelationDiff[] = [...fromCurriculum.entries()]
        .filter(([related]) => !fromOutline.has(related))
        .map(([related, type]) => ({ related_course_code: related, outline_type: null, curriculum_type: type }));

      if (onlyInOutline.length || onlyInCurriculum.length || typeMismatch.length) {
        items.push({
          course_code: code,
          outline: { id: outline.id, version: outline.version, applies_from: outline.applies_from },
          only_in_outline: onlyInOutline,
          only_in_curriculum: onlyInCurriculum,
          type_mismatch: typeMismatch,
        });
      } else {
        matching += 1;
      }
    }

    return {
      curriculum: { id: curriculum.id, code: curriculum.code },
      semester: target,
      summary: {
        courses: codes.length,
        with_outline: pickedByCode.size,
        matching,
        different: items.length,
      },
      courses_without_outline: codes.filter(code => !pickedByCode.has(code)).sort(),
      items,
    };
  }
}
