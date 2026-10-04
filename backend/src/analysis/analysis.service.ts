import {
	Injectable,
	NotFoundException,
	UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { Course } from '../curricula/course.entity';
import { CourseRule } from '../curricula/course-rule.entity';
import { Curriculum } from '../curricula/curriculum.entity';
import { ElectiveGroup } from '../curricula/elective-group.entity';
import { StudentCourseStatus } from '../users/student-course-status.entity';
import { StudentProfile } from '../users/student-profile.entity';
import { AnalysisHistoryQueryDto } from './analysis.dto';
import { AnalysisRun } from './analysis-run.entity';
import {
	AnalysisCourse,
	analyzeCurriculum,
} from './analysis.engine';

const RULESET_VERSION = '1';
const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;

@Injectable()
export class AnalysisService {
	constructor(private readonly dataSource: DataSource) { }

	private notFound() {
		return new NotFoundException({
			message: 'Không tìm thấy dữ liệu yêu cầu.',
			code: 'NOT_FOUND',
		});
	}

	private requiredProfile() {
		return new UnprocessableEntityException({
			message: 'Hồ sơ cần có tên hiển thị và chương trình đào tạo trước khi phân tích.',
			code: 'PROFILE_REQUIRED_FIELDS',
		});
	}

	async analyze(userId: string) {
		return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
			const profile = await manager.findOne(StudentProfile, {
				where: { userId },
				lock: { mode: 'pessimistic_write' },
			});
			if (!profile) throw this.notFound();
			if (!profile.displayName?.trim() || !profile.curriculumId) {
				throw this.requiredProfile();
			}

			const curriculum = await manager.findOne(Curriculum, {
				where: { id: profile.curriculumId },
			});
			if (!curriculum) throw this.requiredProfile();

			const courses = await manager
				.getRepository(Course)
				.createQueryBuilder('course')
				.leftJoinAndSelect('course.term', 'term')
				.leftJoinAndSelect('course.electiveGroup', 'electiveGroup')
				.where('course.curriculum_id = :curriculumId', {
					curriculumId: curriculum.id,
				})
				.andWhere('course.deleted_at IS NULL')
				.orderBy('term.sort_order', 'ASC')
				.addOrderBy('course.course_code', 'ASC')
				.getMany();
			if (!courses.length) {
				throw new UnprocessableEntityException({
					message: 'Chương trình chưa có học phần đang hoạt động.',
					code: 'CURRICULUM_HAS_NO_COURSES',
				});
			}

			const [rules, groups, statuses] = await Promise.all([
				manager.getRepository(CourseRule).find({
					where: { curriculumId: curriculum.id },
					order: { createdAt: 'ASC', id: 'ASC' },
				}),
				manager.getRepository(ElectiveGroup).find({
					where: { curriculumId: curriculum.id },
					order: { sortOrder: 'ASC', name: 'ASC' },
				}),
				manager.getRepository(StudentCourseStatus).find({
					where: {
						profileId: profile.id,
						curriculumId: curriculum.id,
						courseId: In(courses.map((course) => course.id)),
					},
				}),
			]);
			const statusByCourseId = new Map(
				statuses.map((status) => [status.courseId, status.status]),
			);
			const rulesByTarget = new Map<string, CourseRule[]>();
			for (const rule of rules) {
				const targetRules = rulesByTarget.get(rule.targetCourseId) ?? [];
				targetRules.push(rule);
				rulesByTarget.set(rule.targetCourseId, targetRules);
			}

			const engineCourses: AnalysisCourse[] = courses.map((course) => ({
				id: course.id,
				code: course.courseCode,
				version: course.courseVersion,
				name: course.name,
				credits: Number(course.credits),
				requirementType: course.requirementType,
				electiveGroupId: course.electiveGroupId,
				status: statusByCourseId.get(course.id) ?? 'not_started',
				rules: (rulesByTarget.get(course.id) ?? []).map((rule) => ({
					id: rule.id,
					type: rule.ruleType,
					prerequisiteCourseId: rule.prerequisiteCourseId,
					minimumCredits:
						rule.minimumCredits === null
							? null
							: Number(rule.minimumCredits),
				})),
			}));
			const engineGroups = groups.map((group) => ({
				id: group.id,
				name: group.name,
				requiredCredits:
					group.requiredCredits === null
						? null
						: Number(group.requiredCredits),
				requiredCourses: group.requiredCourses,
			}));
			const inputSnapshot = {
				rulesetVersion: RULESET_VERSION,
				profile: { id: profile.id, displayName: profile.displayName.trim() },
				curriculum: {
					id: curriculum.id,
					name: curriculum.name,
					source: {
						documentName: curriculum.sourceDocumentName,
						reference: curriculum.sourceReference,
						version: curriculum.sourceVersion,
						verifiedAt: curriculum.sourceVerifiedAt,
					},
				},
				courses: courses.map((course) => ({
					id: course.id,
					code: course.courseCode,
					version: course.courseVersion,
					name: course.name,
					nameEn: course.nameEn,
					credits: Number(course.credits),
					term: {
						id: course.term.id,
						code: course.term.termCode,
						name: course.term.name,
						sortOrder: course.term.sortOrder,
					},
					requirementType: course.requirementType,
					electiveGroup: course.electiveGroup
						? {
							id: course.electiveGroup.id,
							name: course.electiveGroup.name,
						}
						: null,
					status: statusByCourseId.get(course.id) ?? 'not_started',
					rules: (rulesByTarget.get(course.id) ?? []).map((rule) => ({
						id: rule.id,
						type: rule.ruleType,
						prerequisiteCourseId: rule.prerequisiteCourseId,
						minimumCredits:
							rule.minimumCredits === null
								? null
								: Number(rule.minimumCredits),
						source: rule.sourceDocumentName
							? {
								documentName: rule.sourceDocumentName,
								reference: rule.sourceReference,
								version: rule.sourceVersion,
								verifiedAt: rule.sourceVerifiedAt,
							}
							: {
								documentName: curriculum.sourceDocumentName,
								reference: curriculum.sourceReference,
								version: curriculum.sourceVersion,
								verifiedAt: curriculum.sourceVerifiedAt,
							},
					})),
				})),
				electiveGroups: groups.map((group) => ({
					id: group.id,
					name: group.name,
					requiredCredits:
						group.requiredCredits === null
							? null
							: Number(group.requiredCredits),
					requiredCourses: group.requiredCourses,
				})),
			};
			const resultSnapshot = analyzeCurriculum({
				curriculum: { id: curriculum.id, name: curriculum.name },
				courses: engineCourses,
				electiveGroups: engineGroups,
			});
			const snapshotSize =
				Buffer.byteLength(JSON.stringify(inputSnapshot), 'utf8') +
				Buffer.byteLength(JSON.stringify(resultSnapshot), 'utf8');
			if (snapshotSize > MAX_SNAPSHOT_BYTES) {
				throw new UnprocessableEntityException({
					message: 'Snapshot phân tích vượt quá giới hạn 2 MiB.',
					code: 'SNAPSHOT_TOO_LARGE',
				});
			}

			const run = await manager.getRepository(AnalysisRun).save(
				manager.getRepository(AnalysisRun).create({
					profileId: profile.id,
					curriculumId: curriculum.id,
					inputSnapshot,
					resultSnapshot,
					rulesetVersion: RULESET_VERSION,
				}),
			);
			return {
				id: run.id,
				createdAt: run.createdAt,
				...resultSnapshot,
			};
		});
	}

	private async profileForHistory(userId: string) {
		const profile = await this.dataSource.getRepository(StudentProfile).findOne({
			where: { userId },
			withDeleted: true,
		});
		if (!profile) throw this.notFound();
		return profile;
	}

	async listHistory(userId: string, query: AnalysisHistoryQueryDto) {
		const profile = await this.profileForHistory(userId);
		const [runs, total] = await this.dataSource
			.getRepository(AnalysisRun)
			.createQueryBuilder('analysis')
			.where('analysis.profile_id = :profileId', { profileId: profile.id })
			.orderBy('analysis.created_at', 'DESC')
			.addOrderBy('analysis.id', 'DESC')
			.skip(query.offset)
			.take(query.limit)
			.getManyAndCount();
		return {
			items: runs.map((run) => ({
				id: run.id,
				createdAt: run.createdAt,
				curriculum: run.resultSnapshot.curriculum,
				summary: run.resultSnapshot.summary,
			})),
			page: { limit: query.limit, offset: query.offset, total },
		};
	}

	async getHistoryDetail(userId: string, analysisId: string) {
		const profile = await this.profileForHistory(userId);
		const run = await this.dataSource.getRepository(AnalysisRun).findOne({
			where: { id: analysisId, profileId: profile.id },
		});
		if (!run) throw this.notFound();
		return {
			id: run.id,
			createdAt: run.createdAt,
			inputSnapshot: run.inputSnapshot,
			...run.resultSnapshot,
		};
	}
}