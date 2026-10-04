import {
	Injectable,
	NotFoundException,
	UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Course } from '../curricula/course.entity';
import { Curriculum } from '../curricula/curriculum.entity';
import { StudentCourseStatus } from './student-course-status.entity';
import { StudentProfile } from './student-profile.entity';
import {
	CourseStatusItemDto,
	UpdateStudentProfileDto,
} from './student-profile.dto';

const statuses = new Set(['not_started', 'in_progress', 'completed']);

@Injectable()
export class StudentProfileService {
	constructor(private readonly dataSource: DataSource) { }

	private notFound() {
		return new NotFoundException({
			message: 'Không tìm thấy hồ sơ học tập.',
			code: 'NOT_FOUND',
		});
	}

	private async activeProfile(userId: string) {
		const profile = await this.dataSource
			.getRepository(StudentProfile)
			.findOne({
				where: { userId },
			});
		if (!profile) throw this.notFound();
		return profile;
	}

	private representation(profile: StudentProfile) {
		return {
			id: profile.id,
			displayName: profile.displayName,
			curriculumId: profile.curriculumId,
		};
	}

	async get(userId: string) {
		return this.representation(await this.activeProfile(userId));
	}

	async update(userId: string, input: UpdateStudentProfileDto) {
		const repository = this.dataSource.getRepository(StudentProfile);
		const profile = await repository.findOne({
			where: { userId },
			withDeleted: true,
		});
		const restored = profile ?? repository.create({ userId });

		if (input.displayName !== undefined) {
			restored.displayName = input.displayName?.trim() || null;
		}
		if (input.curriculumId !== undefined && input.curriculumId !== null) {
			const curriculum = await this.dataSource
				.getRepository(Curriculum)
				.findOne({ where: { id: input.curriculumId } });
			if (!curriculum) throw this.notFound();
			restored.curriculumId = curriculum.id;
		} else if (input.curriculumId === null) {
			restored.curriculumId = null;
		}
		restored.deletedAt = null;
		return this.representation(await repository.save(restored));
	}

	async remove(userId: string) {
		const profile = await this.activeProfile(userId);
		await this.dataSource.getRepository(StudentProfile).softRemove(profile);
	}

	async updateStatuses(userId: string, items: CourseStatusItemDto[]) {
		if (!Array.isArray(items) || items.length > 500) {
			throw new UnprocessableEntityException({
				message: 'Batch trạng thái phải có tối đa 500 môn.',
				code: 'BATCH_LIMIT_EXCEEDED',
			});
		}
		const courseIds = items.map((item) => item.courseId);
		if (new Set(courseIds).size !== courseIds.length) {
			throw new UnprocessableEntityException({
				message: 'Mỗi môn chỉ được xuất hiện một lần trong batch.',
				code: 'DUPLICATE_BATCH_ITEM',
			});
		}
		if (items.some((item) => !statuses.has(item.status))) {
			throw new UnprocessableEntityException({
				message: 'Trạng thái môn học không hợp lệ.',
				code: 'INVALID_COURSE_STATUS',
			});
		}

		return this.dataSource.transaction(async (manager) => {
			const profile = await manager.findOne(StudentProfile, {
				where: { userId },
				lock: { mode: 'pessimistic_write' },
			});
			if (!profile) throw this.notFound();
			if (!profile.curriculumId) {
				throw new UnprocessableEntityException({
					message: 'Hồ sơ cần chọn chương trình trước khi cập nhật trạng thái.',
					code: 'PROFILE_REQUIRED_FIELDS',
				});
			}
			const curriculumId = profile.curriculumId;

			const matchingCourses = items.length
				? await manager
					.getRepository(Course)
					.createQueryBuilder('course')
					.select('course.id', 'id')
					.where('course.curriculum_id = :curriculumId', {
						curriculumId,
					})
					.andWhere('course.deleted_at IS NULL')
					.andWhere('course.id IN (:...courseIds)', { courseIds })
					.getRawMany<{ id: string }>()
				: [];
			if (matchingCourses.length !== items.length) {
				throw new UnprocessableEntityException({
					message:
						'Có môn không thuộc chương trình đang chọn hoặc đã ngừng hoạt động.',
					code: 'COURSE_SCOPE_MISMATCH',
				});
			}

			const repository = manager.getRepository(StudentCourseStatus);
			if (items.length) {
				await repository.upsert(
					items.map((item) => ({
						profileId: profile.id,
						curriculumId,
						courseId: item.courseId,
						status: item.status,
					})),
					['profileId', 'curriculumId', 'courseId'],
				);
			}
			return { updated: items.length };
		});
	}
}
