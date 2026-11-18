import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CourseOpenedSemester } from '../course/entities/course-opened-semester.entity';
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
import { SolvePlanDto } from './dto/solve-plan.dto';
import { buildPlannerInput, PlannerSource } from './planner-input';
import { PlannerRunner } from './planner.runner';

/** Đọc dữ liệu (chỉ đọc), ghép đầu vào, gọi bộ giải. Không ghi gì vào database. */
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

  async solve(userId: string, dto: SolvePlanDto): Promise<Record<string, unknown>> {
    const input = buildPlannerInput(await this.loadSource(userId), dto);
    try {
      return await this.runner.run(input, dto.solver ?? 'cpsat');
    } catch (error) {
      throw new BadGatewayException((error as Error).message);
    }
  }
}
