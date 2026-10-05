import {
	Injectable,
	NotFoundException,
	UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource, In, QueryRunner } from 'typeorm';
import { Course } from '../curricula/course.entity';
import { CourseRule } from '../curricula/course-rule.entity';
import { Curriculum } from '../curricula/curriculum.entity';
import { CurriculumTerm } from '../curricula/curriculum-term.entity';
import { StudentCourseStatus } from '../users/student-course-status.entity';
import { StudentProfile } from '../users/student-profile.entity';
import {
	RecommendationCourse,
	RecommendationInputError,
	recommendCourses,
} from './recommendation.engine';
import { RecommendationResponseDto } from './recommendation.dto';

const MAX_PRIORITY = 2147483647;

@Injectable()
export class RecommendationService {
	constructor(private readonly dataSource: DataSource) { }

	private notFound() {
		return new NotFoundException({
			message: 'Không tìm thấy hồ sơ học tập.',
			code: 'NOT_FOUND',
		});
	}

	private unprocessable(message: string, code: string) {
		return new UnprocessableEntityException({ message, code });
	}

	private async readInTransaction(
		queryRunner: QueryRunner,
		userId: string,
	): Promise<RecommendationResponseDto> {
		const { manager } = queryRunner;
		const profile = await manager.findOne(StudentProfile, {
			where: { userId },
		});
		if (!profile) throw this.notFound();
		if (!profile.curriculumId) {
			throw this.unprocessable(
				'Hồ sơ chưa chọn chương trình đào tạo.',
				'CURRICULUM_NOT_SELECTED',
			);
		}

		const curriculum = await manager.findOne(Curriculum, {
			where: { id: profile.curriculumId },
		});
		if (!curriculum) {
			throw this.unprocessable(
				'Chương trình đào tạo trong hồ sơ không còn hoạt động.',
				'CURRICULUM_NOT_SELECTED',
			);
		}

		const configuredValues = [
			curriculum.totalCreditsTarget,
			curriculum.minimumSemesterCredits,
			curriculum.maximumSemesterCredits,
		];
		if (configuredValues.every((value) => value === null)) {
			throw this.unprocessable(
				'Chương trình chưa cấu hình tải gợi ý học kỳ.',
				'CURRICULUM_RECOMMENDATION_NOT_CONFIGURED',
			);
		}
		if (configuredValues.some((value) => value === null)) {
			throw this.unprocessable(
				'Cấu hình tải gợi ý của chương trình không hợp lệ.',
				'CURRICULUM_RECOMMENDATION_SETTINGS_INVALID',
			);
		}
		const settings = {
			totalCreditsTarget: Number(curriculum.totalCreditsTarget),
			minimumSemesterCredits: Number(curriculum.minimumSemesterCredits),
			maximumSemesterCredits: Number(curriculum.maximumSemesterCredits),
		};
		if (
			!Number.isFinite(settings.totalCreditsTarget) ||
			settings.totalCreditsTarget <= 0 ||
			!Number.isFinite(settings.minimumSemesterCredits) ||
			settings.minimumSemesterCredits < 0 ||
			!Number.isFinite(settings.maximumSemesterCredits) ||
			settings.maximumSemesterCredits <= 0 ||
			settings.minimumSemesterCredits > settings.maximumSemesterCredits
		) {
			throw this.unprocessable(
				'Cấu hình tải gợi ý của chương trình không hợp lệ.',
				'CURRICULUM_RECOMMENDATION_SETTINGS_INVALID',
			);
		}

		const terms = await manager.getRepository(CurriculumTerm).find({
			where: { curriculumId: curriculum.id },
			order: { sortOrder: 'ASC' },
		});
		if (!terms.length) {
			throw this.unprocessable(
				'Chương trình chưa có học kỳ hoạt động.',
				'CURRICULUM_HAS_NO_TERMS',
			);
		}

		const courses = await manager
			.getRepository(Course)
			.createQueryBuilder('course')
			.leftJoinAndSelect('course.term', 'term')
			.where('course.curriculum_id = :curriculumId', {
				curriculumId: curriculum.id,
			})
			.andWhere('course.deleted_at IS NULL')
			.andWhere('term.deleted_at IS NULL')
			.getMany();
		if (!courses.length) {
			throw this.unprocessable(
				'Chương trình chưa có học phần đang hoạt động.',
				'CURRICULUM_HAS_NO_COURSES',
			);
		}
		if (
			courses.some(
				(course) =>
					!Number.isInteger(course.recommendationPriority) ||
					course.recommendationPriority < 0 ||
					course.recommendationPriority > MAX_PRIORITY,
			)
		) {
			throw this.unprocessable(
				'Một học phần đang hoạt động thiếu độ ưu tiên gợi ý hợp lệ.',
				'COURSE_RECOMMENDATION_PRIORITY_INVALID',
			);
		}

		const courseIds = courses.map((course) => course.id);
		const [rules, statuses] = await Promise.all([
			manager.getRepository(CourseRule).find({
				where: {
					curriculumId: curriculum.id,
					targetCourseId: In(courseIds),
				},
				order: { createdAt: 'ASC', id: 'ASC' },
			}),
			manager.getRepository(StudentCourseStatus).find({
				where: {
					profileId: profile.id,
					curriculumId: curriculum.id,
					courseId: In(courseIds),
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

		const engineCourses: RecommendationCourse[] = courses.map((course) => ({
			id: course.id,
			code: course.courseCode,
			version: course.courseVersion,
			name: course.name,
			credits: Number(course.credits),
			requirementType: course.requirementType,
			electiveGroupId: course.electiveGroupId,
			status: statusByCourseId.get(course.id),
			recommendationPriority: course.recommendationPriority,
			rules: (rulesByTarget.get(course.id) ?? []).map((rule) => ({
				id: rule.id,
				type: rule.ruleType,
				prerequisiteCourseId: rule.prerequisiteCourseId,
				minimumCredits:
					rule.minimumCredits === null ? null : Number(rule.minimumCredits),
			})),
		}));
		const engineTerms = terms.map((term) => ({
			id: term.id,
			code: term.termCode,
			name: term.name,
			sortOrder: term.sortOrder,
		}));

		try {
			const result = recommendCourses({
				settings,
				terms: engineTerms,
				courses: engineCourses,
			});
			return {
				status: result.status,
				progress: result.progress,
				estimatedTerm: result.estimatedTerm,
				summary: result.summary,
				recommendedCourses: result.recommendedCourses.map((item) => ({
					course: item.course,
					credits: item.credits,
					requirementType: item.requirementType,
					recommendationPriority: item.recommendationPriority,
					eligible: true,
					reasons: item.reasons,
				})),
				deferredRequiredCourses: result.deferredRequiredCourses.map((item) => ({
					course: item.course,
					credits: item.credits,
					reason: item.reason,
					eligible: item.reason !== 'RULE_NOT_SATISFIED',
					reasons: item.reasons,
				})),
				warnings: result.warnings,
			};
		} catch (error) {
			if (error instanceof RecommendationInputError) {
				throw this.unprocessable(
					'Dữ liệu chương trình không hợp lệ để tạo gợi ý.',
					'CURRICULUM_RECOMMENDATION_DATA_INVALID',
				);
			}
			throw error;
		}
	}

	async recommend(userId: string) {
		const queryRunner = this.dataSource.createQueryRunner();
		await queryRunner.connect();
		try {
			await queryRunner.startTransaction('REPEATABLE READ');
			await queryRunner.query('SET TRANSACTION READ ONLY');
			const result = await this.readInTransaction(queryRunner, userId);
			await queryRunner.commitTransaction();
			return result;
		} catch (error) {
			if (queryRunner.isTransactionActive) {
				await queryRunner.rollbackTransaction();
			}
			throw error;
		} finally {
			await queryRunner.release();
		}
	}
}
