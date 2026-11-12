import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Course } from '../course/entities/course.entity';
import { CourseOpenedSemester } from '../course/entities/course-opened-semester.entity';
import { CourseGroup } from '../curriculum/entities/course-group.entity';
import { CourseGroupMember } from '../curriculum/entities/course-group-member.entity';
import { CourseRelation } from '../curriculum/entities/course-relation.entity';
import { CurriculumCourse } from '../curriculum/entities/curriculum-course.entity';
import { CurriculumSpecialization } from '../curriculum/entities/curriculum-specialization.entity';
import { CourseGroupScope } from '../curriculum/enum/course-group-scope';
import { CourseRelationType } from '../curriculum/enum/course-relation-type';
import { StudentCourse } from '../student/entities/student-course.entity';
import { StudentPlanCourse } from '../student/entities/student-plan-course.entity';
import { OutlineService } from '../outline/outline.service';
import { StudentCourseStatus } from '../student/enum/student-course-status';
import { isPhysicalEducationCourse, PE_GENERIC_CODES } from '../student/physical-education';
import {
  ANSWER_SCHEMA,
  type AdvisorRecommendation,
  type OfferingInfo,
  type RawAnswer,
} from './advisor.answer';
import type { ChatToolDefinition } from './deepseek.client';
import { SEMESTER_CODE, termOf } from './semester';

/** Các phần của ảnh chụp "Phân tích học tập" mà tool `get_analysis_section` trả được. */
export const ANALYSIS_SECTIONS = [
  'overview', 'warnings', 'overdue', 'required_left', 'failed', 'electives', 'specializations',
  'eligible_next', 'blocked_next', 'bottlenecks', 'roadmap', 'regulations',
] as const;

export const SUBMIT_ANSWER_TOOL = 'submit_answer';

const RELATION_LABEL: Record<CourseRelationType, string> = {
  [CourseRelationType.PREREQUISITE]: 'tiên quyết (phải đạt)',
  [CourseRelationType.PRIOR]: 'học trước (đã học, rớt vẫn được)',
  [CourseRelationType.COREQUISITE]: 'song hành (học trước hoặc cùng kỳ)',
  [CourseRelationType.RECOMMENDED]: 'khuyến nghị (không chặn đăng ký)',
};

const STATUS_LABEL: Record<StudentCourseStatus, string> = {
  [StudentCourseStatus.NOT_STARTED]: 'chưa học',
  [StudentCourseStatus.IN_PROGRESS]: 'đang học',
  [StudentCourseStatus.COMPLETED]: 'đã hoàn thành',
  [StudentCourseStatus.FAILED]: 'chưa đạt',
};

export const TOOL_DEFINITIONS: ChatToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_analysis_section',
      description:
        'Lấy chi tiết một phần kết quả của trang "Phân tích học tập" (đã tính bằng code theo đúng quy tắc tiên quyết, ' +
        'khối tự chọn, chuyên ngành). Dùng làm nguồn chính cho điều kiện đăng ký và tiến độ.',
      parameters: {
        type: 'object',
        properties: {
          section: {
            type: 'string',
            enum: ANALYSIS_SECTIONS,
            description:
              'overview: tổng quan tín chỉ; warnings: cảnh báo; overdue: môn bắt buộc quá kỳ khuyến nghị; ' +
              'required_left: môn bắt buộc còn lại; failed: môn chưa đạt; electives: các khối tự chọn còn thiếu và môn ứng viên; ' +
              'specializations: tiến độ từng chuyên ngành; eligible_next: môn đủ điều kiện đăng ký kỳ tới; ' +
              'blocked_next: môn chưa đủ điều kiện kèm môn còn thiếu; bottlenecks: môn mở khóa nhiều môn nhất; ' +
              'roadmap: lộ trình tự xếp đến tốt nghiệp; regulations: điều kiện tốt nghiệp chưa đạt.',
          },
        },
        required: ['section'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_course_detail',
      description:
        'Tra cứu một môn trong cơ sở dữ liệu: thông tin môn, kỳ khuyến nghị, quan hệ tiên quyết/học trước/song hành ' +
        '(kèm trạng thái của sinh viên với từng môn liên quan), các môn nó mở khóa, khối tự chọn và chuyên ngành chứa môn, ' +
        'lịch sử mở lớp và dự đoán mở lớp kỳ tới.',
      parameters: {
        type: 'object',
        properties: { code: { type: 'string', description: 'Mã môn, ví dụ CO3001' } },
        required: ['code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_offering',
      description:
        'Kiểm tra các môn có mở lớp ở một học kỳ không, dựa trên dữ liệu mở lớp của myBK. Nếu chưa có dữ liệu của kỳ đó ' +
        'thì dự đoán từ các kỳ cùng loại (kỳ 1/kỳ 2/kỳ hè) những năm trước.',
      parameters: {
        type: 'object',
        properties: {
          codes: { type: 'array', items: { type: 'string' }, description: 'Tối đa 30 mã môn' },
          semester: { type: 'string', description: 'Mã học kỳ 3 số, ví dụ 262. Bỏ trống để dùng học kỳ tới.' },
        },
        required: ['codes'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_course_outline',
      description:
        'Đọc đề cương môn học (nguồn myBK, bản áp dụng cho học kỳ tới) đã rút gọn: mục tiêu, nội dung tóm tắt, nội dung ' +
        'từng buổi, chuẩn đầu ra, cách tính điểm, hình thức thi, khối lượng giờ học, tài liệu, và điều kiện môn theo đề cương ' +
        'đặt cạnh điều kiện theo chương trình. Dùng khi sinh viên hỏi môn học gì, thi thế nào, nặng không, hoặc để so sánh môn.',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Mã môn, ví dụ CO2003' },
          semester: { type: 'string', description: 'Mã học kỳ 3 số; bỏ trống để dùng học kỳ tới' },
        },
        required: ['code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_curriculum_courses',
      description:
        'Tìm môn trong chương trình đào tạo của sinh viên theo mã, từ khóa trong tên, hoặc chủ đề trong nội dung đề cương ' +
        '(mục tiêu, tóm tắt; không phân biệt dấu), kèm trạng thái của sinh viên, khối tự chọn và chuyên ngành chứa môn.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Mã môn hoặc từ khóa, ví dụ "trí tuệ nhân tạo", "CO30"' },
          limit: { type: 'integer', description: 'Số kết quả tối đa (mặc định 15, tối đa 30)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_specialization_detail',
      description:
        'Danh sách môn của một chuyên ngành theo từng khối (số môn/tín chỉ phải chọn, khối gốc mà nó thu hẹp) kèm trạng thái ' +
        'của sinh viên với từng môn. Dùng khi tư vấn chọn chuyên ngành.',
      parameters: {
        type: 'object',
        properties: { code: { type: 'string', description: 'Mã chuyên ngành, ví dụ CNPM' } },
        required: ['code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: SUBMIT_ANSWER_TOOL,
      description:
        'Gửi câu trả lời cuối cho sinh viên dưới dạng JSON có cấu trúc. Bắt buộc gọi đúng một lần để kết thúc lượt trả lời.',
      parameters: ANSWER_SCHEMA as unknown as Record<string, unknown>,
    },
  },
];

/** Dữ liệu của một lượt hỏi; chỉ mục chương trình được nạp lười một lần cho cả lượt. */
export interface TurnContext {
  userId: string;
  curriculumId: string;
  snapshot: Record<string, unknown>;
  /** Học kỳ chính kế tiếp, mặc định cho `check_offering`. */
  nextSemester: string;
  index?: Promise<CurriculumIndex>;
  outlineSummaries?: Promise<Map<string, OutlineSummaryItem>>;
  outlineTexts?: Promise<Map<string, string>>;
}

type OutlineSummaryItem = Awaited<ReturnType<OutlineService['summaries']>>['items'][number];

const truncate = (text: string | null | undefined, max: number): string | null => {
  if (!text) return null;
  const clean = text.trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
};

/** Thông tin đề cương gọn để đặt cạnh kết quả khác (môn đề xuất, chi tiết môn). */
const outlineBrief = (summary: OutlineSummaryItem | undefined) => (summary
  ? {
    version: summary.version,
    applies_from: summary.applies_from,
    study_hours: summary.total_study_hours,
    has_lab: summary.has_lab,
    has_project: summary.has_project,
    final_exam: summary.final_exam,
    midterm: summary.midterm,
    weights: summary.weights,
  }
  : null);

interface IndexedCourse {
  id: string;
  code: string;
  name: string;
  credits: number;
  description: string | null;
  recommended: string | null;
  status: StudentCourseStatus | null;
  planned: string | null;
  groups: string[];
  specializations: string[];
}

interface CurriculumIndex {
  byCode: Map<string, IndexedCourse>;
  byId: Map<string, IndexedCourse>;
  statusById: Map<string, StudentCourseStatus>;
}

const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

/** Các nhánh nội dung đề cương mà tool `get_course_outline` đọc. */
interface OutlineContentView {
  name?: { vi?: string | null } | null;
  course_type?: { name?: { vi?: string | null } | null } | null;
  faculty?: { name?: { vi?: string | null } | null } | null;
  objectives?: { vi?: string | null } | null;
  summary?: { vi?: string | null } | null;
  study_guide?: { vi?: string | null } | null;
  references?: { vi?: string | null } | null;
  hours?: unknown;
  credit_breakdown?: unknown;
  assessment?: { weights?: unknown; midterm?: unknown; final_exam?: unknown; other?: unknown } | null;
  learning_outcomes?: { framework: string; level: number; code: string; name?: { vi?: string | null } | null }[];
  sessions?: { label?: string | null; content?: { vi?: string | null } | null }[];
}

const COVERAGE_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class AdvisorTools {
  private coverage: { codes: string[]; at: number } | null = null;

  constructor(
    @InjectRepository(Course) private readonly courses: Repository<Course>,
    @InjectRepository(CourseOpenedSemester) private readonly opened: Repository<CourseOpenedSemester>,
    @InjectRepository(CurriculumCourse) private readonly curriculumCourses: Repository<CurriculumCourse>,
    @InjectRepository(CourseRelation) private readonly relations: Repository<CourseRelation>,
    @InjectRepository(CourseGroup) private readonly groups: Repository<CourseGroup>,
    @InjectRepository(CourseGroupMember) private readonly groupMembers: Repository<CourseGroupMember>,
    @InjectRepository(CurriculumSpecialization) private readonly specializations: Repository<CurriculumSpecialization>,
    @InjectRepository(StudentCourse) private readonly studentCourses: Repository<StudentCourse>,
    @InjectRepository(StudentPlanCourse) private readonly planCourses: Repository<StudentPlanCourse>,
    private readonly outlineService: OutlineService,
  ) {}

  /** Chạy một tool; lỗi nghiệp vụ trả về `{ error }` để model tự xử lý thay vì làm hỏng cả lượt. */
  async execute(name: string, args: Record<string, unknown>, ctx: TurnContext): Promise<unknown> {
    switch (name) {
      case 'get_analysis_section': return this.analysisSection(args, ctx);
      case 'get_course_detail': return this.courseDetail(args, ctx);
      case 'check_offering': return this.checkOffering(args, ctx);
      case 'search_curriculum_courses': return this.searchCourses(args, ctx);
      case 'get_specialization_detail': return this.specializationDetail(args, ctx);
      case 'get_course_outline': return this.courseOutline(args, ctx);
      default: return { error: `Không có tool "${name}"` };
    }
  }

  /* ------------------------------- Từng tool ------------------------------- */

  private analysisSection(args: Record<string, unknown>, ctx: TurnContext) {
    const section = String(args.section ?? '');
    if (!(ANALYSIS_SECTIONS as readonly string[]).includes(section)) {
      return { error: `section phải là một trong: ${ANALYSIS_SECTIONS.join(', ')}` };
    }
    return { section, data: ctx.snapshot[section] ?? null };
  }

  private async courseDetail(args: Record<string, unknown>, ctx: TurnContext) {
    const code = String(args.code ?? '').trim();
    if (!code) return { error: 'Thiếu code' };
    const index = await this.index(ctx);
    const course = index.byCode.get(code.toUpperCase());
    if (!course) {
      const catalog = await this.courses.createQueryBuilder('c').where('LOWER(c.code) = LOWER(:code)', { code }).getOne();
      if (!catalog) return { error: `Không tìm thấy môn ${code}` };
      const offering = (await this.offering([catalog.id], ctx.nextSemester)).get(catalog.id)!;
      return {
        code: catalog.code, name: catalog.name, credits: catalog.credits, description: catalog.description,
        in_curriculum: false,
        note: isPhysicalEducationCourse(catalog.code)
          ? 'Học phần thể chất: tính vào GDTC của chương trình (1 học phần = xong PE1003, 2 học phần = xong PE1005).'
          : 'Môn không thuộc chương trình đào tạo của sinh viên; chỉ có thể tính vào khối tự chọn tự do (nếu có).',
        offering_next: offering,
      };
    }

    const [requires, unlocks, openedRows] = await Promise.all([
      this.relations.find({ where: { curriculum_id: ctx.curriculumId, course_id: course.id } }),
      this.relations.find({ where: { curriculum_id: ctx.curriculumId, related_course_id: course.id } }),
      this.opened.find({ where: { course_id: course.id }, order: { semester_code: 'ASC' } }),
    ]);
    const describe = (id: string) => index.byId.get(id);
    const offering = (await this.offering([course.id], ctx.nextSemester)).get(course.id)!;
    const snapshotCheck = this.snapshotCheck(ctx, course.code);
    const summary = (await this.outlineSummaries(ctx)).get(course.code.toUpperCase());

    return {
      code: course.code,
      name: course.name,
      credits: course.credits,
      description: course.description,
      in_curriculum: true,
      recommended: course.recommended,
      student_status: course.status ? STATUS_LABEL[course.status] : 'chưa khai',
      planned_semester: course.planned,
      elective_groups: course.groups,
      specializations: course.specializations,
      requires: requires.map(relation => {
        const related = describe(relation.related_course_id);
        return {
          code: related?.code ?? '?',
          name: related?.name ?? null,
          type: RELATION_LABEL[relation.type],
          student_status: related?.status ? STATUS_LABEL[related.status] : 'chưa khai',
        };
      }),
      unlocks: unlocks
        .filter(relation => relation.type !== CourseRelationType.RECOMMENDED)
        .map(relation => ({ code: describe(relation.course_id)?.code ?? '?', type: RELATION_LABEL[relation.type] })),
      eligibility_next: snapshotCheck,
      opened_semesters: openedRows.map(row => row.semester_code),
      offering_next: offering,
      outline: outlineBrief(summary),
      outline_prerequisites: (summary?.prerequisites ?? [])
        .map(item => ({ code: item.related_course_code, type: item.type ? RELATION_LABEL[item.type as CourseRelationType] : null })),
      ...((PE_GENERIC_CODES as readonly string[]).includes(course.code.toUpperCase())
        ? { physical_education_options: await this.physicalEducationOptions(ctx) }
        : {}),
    };
  }

  /** Các học phần thể chất trong danh mục (thay cho mã chung PE1003/PE1005), kèm trạng thái và dự đoán mở lớp kỳ tới. */
  private async physicalEducationOptions(ctx: TurnContext) {
    const catalog = (await this.courses.createQueryBuilder('c').where('UPPER(c.code) LIKE :prefix', { prefix: 'PE%' }).getMany())
      .filter(course => isPhysicalEducationCourse(course.code))
      .sort((a, b) => a.code.localeCompare(b.code));
    if (!catalog.length) return [];
    const ids = catalog.map(course => course.id);
    const [statuses, offerings] = await Promise.all([
      this.studentCourses.find({ where: { user_id: ctx.userId, course_id: In(ids) } }),
      this.offering(ids, ctx.nextSemester),
    ]);
    const statusById = new Map(statuses.map(row => [row.course_id, row.status]));
    return catalog.map(course => {
      const status = statusById.get(course.id);
      return {
        code: course.code,
        name: course.name,
        student_status: status ? STATUS_LABEL[status] : 'chưa khai',
        offering_next: offerings.get(course.id)?.verdict ?? 'no_data',
      };
    });
  }

  private async checkOffering(args: Record<string, unknown>, ctx: TurnContext) {
    const codes = (Array.isArray(args.codes) ? args.codes : [])
      .map(code => String(code).trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 30);
    if (!codes.length) return { error: 'codes rỗng' };
    const semester = typeof args.semester === 'string' && SEMESTER_CODE.test(args.semester.trim())
      ? args.semester.trim()
      : ctx.nextSemester;

    const resolved = await this.resolveCodes(codes, ctx);
    const offerings = await this.offering([...resolved.values()].map(course => course.id), semester);
    const coverage = await this.coverageCodes();
    return {
      semester,
      latest_semester_with_data: coverage.at(-1) ?? null,
      has_data_for_semester: coverage.includes(semester),
      results: codes.map(code => {
        const course = resolved.get(code);
        if (!course) return { code, error: 'Không tìm thấy môn' };
        return { code: course.code, name: course.name, ...offerings.get(course.id)! };
      }),
    };
  }

  private async searchCourses(args: Record<string, unknown>, ctx: TurnContext) {
    const query = fold(String(args.query ?? '').trim());
    if (!query) return { error: 'Thiếu query' };
    const limit = Math.min(30, Math.max(1, Number(args.limit) || 15));
    const index = await this.index(ctx);
    const terms = query.split(/\s+/);
    const texts = await this.outlineTexts(ctx);
    const byName = (course: IndexedCourse) => terms.every(term => fold(`${course.code} ${course.name}`).includes(term));
    const byOutline = (course: IndexedCourse) => {
      const text = texts.get(course.code.toUpperCase());
      return Boolean(text) && terms.every(term => text!.includes(term));
    };
    const matches = [...index.byId.values()]
      .map(course => ({ course, name: byName(course), outline: byOutline(course) }))
      .filter(match => match.name || match.outline)
      // Khớp tên trước, rồi khớp nội dung đề cương.
      .sort((a, b) => Number(b.name) - Number(a.name) || a.course.code.localeCompare(b.course.code));
    return {
      total: matches.length,
      results: matches.slice(0, limit).map(({ course, name }) => ({
        code: course.code,
        name: course.name,
        credits: course.credits,
        matched_in: name ? 'tên môn' : 'nội dung đề cương',
        recommended: course.recommended,
        student_status: course.status ? STATUS_LABEL[course.status] : 'chưa khai',
        elective_groups: course.groups,
        specializations: course.specializations,
      })),
    };
  }

  /** Đề cương rút gọn (vài KB) cho model; không gửi nguyên nội dung ~26 KB. */
  private async courseOutline(args: Record<string, unknown>, ctx: TurnContext) {
    const code = String(args.code ?? '').trim().toUpperCase();
    if (!code) return { error: 'Thiếu code' };
    const semester = typeof args.semester === 'string' && SEMESTER_CODE.test(args.semester.trim()) ? args.semester.trim() : ctx.nextSemester;
    let found: Awaited<ReturnType<OutlineService['findByCode']>>;
    try {
      found = await this.outlineService.findByCode(code, semester);
    } catch {
      return { error: `Môn ${code} chưa có đề cương trong hệ thống` };
    }
    const outline = found.selected ?? await this.outlineService.findById(found.versions.at(-1)!.id);
    const content = outline.content as OutlineContentView;
    const outcomes = content.learning_outcomes ?? [];
    const framework = outcomes.some(item => item.framework === 'LO') ? 'LO' : outcomes[0]?.framework;

    const index = await this.index(ctx);
    const course = index.byCode.get(code);
    const curriculumRelations = course
      ? (await this.relations.find({ where: { curriculum_id: ctx.curriculumId, course_id: course.id } }))
        .map(relation => ({ code: index.byId.get(relation.related_course_id)?.code ?? '?', type: RELATION_LABEL[relation.type] }))
      : [];

    return {
      code,
      version: outline.version,
      applies_from: outline.applies_from,
      note: found.selected ? `Bản áp dụng cho HK ${semester}` : `Chưa có bản áp dụng cho HK ${semester}; đây là bản mới nhất`,
      name: content.name?.vi ?? null,
      credits: outline.credits,
      course_type: content.course_type?.name?.vi ?? null,
      faculty: content.faculty?.name?.vi ?? null,
      objectives: truncate(content.objectives?.vi, 1200),
      summary: truncate(content.summary?.vi, 1500),
      study_guide: truncate(content.study_guide?.vi, 500),
      references: truncate(content.references?.vi, 600),
      hours: content.hours ?? null,
      credit_breakdown: content.credit_breakdown ?? null,
      assessment: content.assessment
        ? { weights: content.assessment.weights, midterm: content.assessment.midterm, final_exam: content.assessment.final_exam, other: content.assessment.other }
        : null,
      prerequisites_in_outline: outline.prerequisites.map(item => ({
        code: item.related_course_code, type: item.type ? RELATION_LABEL[item.type as CourseRelationType] : item.type_raw,
      })),
      prerequisites_in_curriculum: curriculumRelations,
      prerequisites_note: 'Hệ thống xét đủ điều kiện theo chương trình đào tạo; điều kiện chỉ có trong đề cương là để lưu ý.',
      learning_outcomes: outcomes
        .filter(item => item.framework === framework && item.level <= 1)
        .slice(0, 12)
        .map(item => ({ code: item.code, name: truncate(item.name?.vi, 220) })),
      sessions: (content.sessions ?? []).slice(0, 24).map(item => ({ label: item.label ?? null, content: truncate(item.content?.vi, 220) })),
    };
  }

  private async specializationDetail(args: Record<string, unknown>, ctx: TurnContext) {
    const code = String(args.code ?? '').trim();
    if (!code) return { error: 'Thiếu code' };
    const specs = await this.specializations.find({ where: { curriculum_id: ctx.curriculumId } });
    const spec = specs.find(item => item.code.toLowerCase() === code.toLowerCase());
    if (!spec) return { error: `Không có chuyên ngành ${code}. Các mã hợp lệ: ${specs.map(item => item.code).join(', ')}` };

    const index = await this.index(ctx);
    const groups = await this.groups.find({ where: { curriculum_id: ctx.curriculumId } });
    const children = groups.filter(group => group.specialization_id === spec.id);
    const members = children.length
      ? await this.groupMembers.find({ where: { curriculum_id: ctx.curriculumId, group_id: In(children.map(group => group.id)) } })
      : [];
    const groupById = new Map(groups.map(group => [group.id, group]));
    return {
      code: spec.code,
      name: spec.name,
      description: spec.description,
      rule: 'Đạt chuyên ngành khi các môn tự chọn của khối gốc đều thuộc danh sách chuyên ngành và đủ số môn/tín chỉ của từng khối con.',
      groups: children.map(group => {
        const parent = group.parent_group_id ? groupById.get(group.parent_group_id) : undefined;
        return {
          name: group.name,
          parent_group: parent?.name ?? null,
          required_count: group.required_count ?? parent?.required_count ?? null,
          required_credits: group.required_credits ?? parent?.required_credits ?? null,
          courses: members
            .filter(member => member.group_id === group.id)
            .map(member => index.byId.get(member.course_id))
            .filter((course): course is IndexedCourse => Boolean(course))
            .map(course => ({
              code: course.code,
              name: course.name,
              credits: course.credits,
              student_status: course.status ? STATUS_LABEL[course.status] : 'chưa khai',
            })),
        };
      }),
    };
  }

  /* --------------------------- Bổ sung câu trả lời --------------------------- */

  /**
   * Gắn thông tin kiểm chứng bằng code vào từng môn đề xuất: tên/tín chỉ từ DB, điều kiện đăng ký từ
   * trang phân tích, mở lớp kỳ tới từ dữ liệu myBK. Trả về mã môn không tồn tại để model sửa.
   */
  async enrichAnswer(answer: RawAnswer, ctx: TurnContext): Promise<{ recommendations: AdvisorRecommendation[]; unknown: string[] }> {
    const resolved = await this.resolveCodes(answer.recommendations.map(item => item.code), ctx);
    const index = await this.index(ctx);
    const ids = [...resolved.values()].map(course => course.id);
    const offerings = await this.offering(ids, ctx.nextSemester);
    const summaries = await this.outlineSummaries(ctx);
    const unknown: string[] = [];
    const recommendations: AdvisorRecommendation[] = [];
    answer.recommendations.forEach(item => {
      const course = resolved.get(item.code);
      if (!course) {
        unknown.push(item.code);
        return;
      }
      const check = this.snapshotCheck(ctx, course.code);
      recommendations.push({
        ...item,
        code: course.code,
        name: course.name,
        credits: course.credits,
        in_curriculum: index.byId.has(course.id),
        eligible: check.eligible,
        missing: check.missing,
        offering: offerings.get(course.id) ?? null,
        outline: outlineBrief(summaries.get(course.code.toUpperCase())),
      });
    });
    return { recommendations, unknown };
  }

  /* --------------------------------- Nội bộ --------------------------------- */

  private index(ctx: TurnContext): Promise<CurriculumIndex> {
    ctx.index ??= this.loadIndex(ctx);
    return ctx.index;
  }

  /** Tóm tắt đề cương (bản áp dụng cho học kỳ tới) theo mã môn; lỗi thì coi như chưa có đề cương. */
  private outlineSummaries(ctx: TurnContext): Promise<Map<string, OutlineSummaryItem>> {
    ctx.outlineSummaries ??= this.outlineService.summaries(ctx.curriculumId, ctx.nextSemester)
      .then(result => new Map(result.items.map(item => [item.course_code.toUpperCase(), item])))
      .catch(() => new Map<string, OutlineSummaryItem>());
    return ctx.outlineSummaries;
  }

  /** Văn bản đề cương đã bỏ dấu (tên, mục tiêu, tóm tắt) theo mã môn, để tìm theo chủ đề. */
  private outlineTexts(ctx: TurnContext): Promise<Map<string, string>> {
    ctx.outlineTexts ??= this.outlineService.searchTexts(ctx.curriculumId, ctx.nextSemester)
      .then(rows => new Map(rows.map(row => [
        row.course_code.toUpperCase(),
        fold([row.name_vi, row.name_en, row.objectives?.vi, row.objectives?.en, row.summary?.vi, row.summary?.en].filter(Boolean).join(' ')),
      ])))
      .catch(() => new Map<string, string>());
    return ctx.outlineTexts;
  }

  private async loadIndex(ctx: TurnContext): Promise<CurriculumIndex> {
    const [courses, members, groups, specs, statuses, plans] = await Promise.all([
      this.curriculumCourses.find({ where: { curriculum_id: ctx.curriculumId }, relations: { course: true } }),
      this.groupMembers.find({ where: { curriculum_id: ctx.curriculumId } }),
      this.groups.find({ where: { curriculum_id: ctx.curriculumId } }),
      this.specializations.find({ where: { curriculum_id: ctx.curriculumId } }),
      this.studentCourses.find({ where: { user_id: ctx.userId } }),
      this.planCourses.find({ where: { user_id: ctx.userId, curriculum_id: ctx.curriculumId } }),
    ]);
    const statusById = new Map(statuses.map(item => [item.course_id, item.status]));
    const planById = new Map(plans.map(item => [item.course_id, item.semester_code]));
    const groupById = new Map(groups.map(group => [group.id, group]));
    const specById = new Map(specs.map(spec => [spec.id, spec]));

    const byId = new Map<string, IndexedCourse>();
    courses.forEach(item => byId.set(item.course_id, {
      id: item.course_id,
      code: item.course.code,
      name: item.course.name,
      credits: item.course.credits,
      description: item.course.description,
      recommended: item.recommended_year !== null && item.recommended_term !== null
        ? `Năm ${item.recommended_year} · Kỳ ${item.recommended_term}`
        : null,
      status: statusById.get(item.course_id) ?? null,
      planned: planById.get(item.course_id) ?? null,
      groups: [],
      specializations: [],
    }));
    members.forEach(member => {
      const course = byId.get(member.course_id);
      const group = groupById.get(member.group_id);
      if (!course || !group) return;
      if (group.specialization_id) {
        const spec = specById.get(group.specialization_id);
        if (spec && !course.specializations.includes(spec.code)) course.specializations.push(spec.code);
      } else if (group.pool_scope === CourseGroupScope.LISTED && !course.groups.includes(group.name)) {
        course.groups.push(group.name);
      }
    });
    return {
      byId,
      byCode: new Map([...byId.values()].map(course => [course.code.toUpperCase(), course])),
      statusById,
    };
  }

  /** Mã môn -> môn (ưu tiên môn trong chương trình, sau đó tra danh mục chung). */
  private async resolveCodes(codes: string[], ctx: TurnContext): Promise<Map<string, { id: string; code: string; name: string; credits: number }>> {
    const index = await this.index(ctx);
    const result = new Map<string, { id: string; code: string; name: string; credits: number }>();
    const missing: string[] = [];
    codes.forEach(code => {
      const course = index.byCode.get(code.toUpperCase());
      if (course) result.set(code, course);
      else missing.push(code);
    });
    if (missing.length) {
      const rows = await this.courses.createQueryBuilder('c')
        .where('UPPER(c.code) IN (:...codes)', { codes: missing.map(code => code.toUpperCase()) })
        .getMany();
      missing.forEach(code => {
        const row = rows.find(item => item.code.toUpperCase() === code.toUpperCase());
        if (row) result.set(code, row);
      });
    }
    return result;
  }

  /** Điều kiện đăng ký kỳ tới theo trang phân tích (đã tính bằng code ở frontend). */
  private snapshotCheck(ctx: TurnContext, code: string): { eligible: boolean | null; missing: string[]; note: string } {
    const find = (key: string) => (Array.isArray(ctx.snapshot[key]) ? ctx.snapshot[key] as Record<string, unknown>[] : [])
      .find(item => String(item.code).toUpperCase() === code.toUpperCase());
    if (find('eligible_next')) return { eligible: true, missing: [], note: 'Đủ điều kiện đăng ký kỳ tới' };
    const blocked = find('blocked_next');
    if (blocked) {
      const missing = Array.isArray(blocked.missing) ? blocked.missing.map(String) : [];
      return { eligible: false, missing, note: `Chưa đủ điều kiện, còn thiếu: ${missing.join(', ')}` };
    }
    return { eligible: null, missing: [], note: 'Không nằm trong danh sách môn cần học kỳ tới (đã học, đang học, hoặc ngoài chương trình)' };
  }

  /** Các học kỳ đang có dữ liệu mở lớp trong DB (để biết kỳ nào là "đã có dữ liệu thật"). */
  private async coverageCodes(): Promise<string[]> {
    if (this.coverage && Date.now() - this.coverage.at < COVERAGE_TTL_MS) return this.coverage.codes;
    const rows = await this.opened.createQueryBuilder('o')
      .select('DISTINCT o.semester_code', 'code')
      .getRawMany<{ code: string }>();
    const codes = rows.map(row => row.code).filter(code => SEMESTER_CODE.test(code)).sort();
    this.coverage = { codes, at: Date.now() };
    return codes;
  }

  /**
   * Mở lớp ở học kỳ `semester`:
   * - Đã có dữ liệu của kỳ đó: `confirmed` / `not_offered`.
   * - Chưa có: dự đoán theo 4 kỳ cùng loại gần nhất có dữ liệu (>= 3 lần: likely, 1-2: uncertain,
   *   0 lần nhưng từng mở kỳ cùng loại trước đó: unlikely, chưa từng mở kỳ cùng loại: never).
   */
  async offering(courseIds: string[], semester: string): Promise<Map<string, OfferingInfo>> {
    const result = new Map<string, OfferingInfo>();
    if (!courseIds.length) return result;
    const coverage = await this.coverageCodes();
    const rows = await this.opened.find({ where: { course_id: In(courseIds) }, select: { course_id: true, semester_code: true } });
    const term = termOf(semester);
    const recent = coverage.filter(code => termOf(code) === term && code < semester).slice(-4).reverse();
    const termLabel = term === 3 ? 'kỳ hè' : `kỳ ${term}`;

    courseIds.forEach(id => {
      const opened = new Set(rows.filter(row => row.course_id === id).map(row => row.semester_code));
      const sorted = [...opened].sort();
      const lastOpened = sorted.at(-1) ?? null;
      const hits = recent.filter(code => opened.has(code));
      const base = { semester, recent_same_term: recent, opened_same_term_recent: hits, last_opened: lastOpened };

      if (coverage.includes(semester)) {
        result.set(id, opened.has(semester)
          ? { ...base, verdict: 'confirmed', note: `Có trong danh sách mở lớp HK ${semester}` }
          : { ...base, verdict: 'not_offered', note: `Không có trong danh sách mở lớp HK ${semester}` });
        return;
      }
      if (!opened.size) {
        result.set(id, { ...base, verdict: 'no_data', note: 'Chưa có dữ liệu mở lớp của môn này' });
        return;
      }
      const ratio = `${hits.length}/${recent.length} ${termLabel} gần nhất${hits.length ? ` (${hits.join(', ')})` : ''}`;
      if (hits.length >= 3) {
        result.set(id, { ...base, verdict: 'likely', note: `Dự đoán: nhiều khả năng mở, đã mở ${ratio}` });
      } else if (hits.length > 0) {
        result.set(id, { ...base, verdict: 'uncertain', note: `Dự đoán: chưa chắc, mở ${ratio}` });
      } else if (sorted.some(code => termOf(code) === term)) {
        result.set(id, { ...base, verdict: 'unlikely', note: `Dự đoán: khó mở, không mở ${recent.length} ${termLabel} gần nhất; lần gần nhất HK ${lastOpened}` });
      } else {
        result.set(id, { ...base, verdict: 'never', note: `Chưa từng mở ở ${termLabel}; các kỳ đã mở: ${sorted.slice(-6).join(', ')}` });
      }
    });
    return result;
  }
}
