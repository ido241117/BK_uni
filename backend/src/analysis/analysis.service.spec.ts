import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Course } from '../curricula/course.entity';
import { CourseRule } from '../curricula/course-rule.entity';
import { ElectiveGroup } from '../curricula/elective-group.entity';
import { StudentCourseStatus } from '../users/student-course-status.entity';
import { StudentProfile } from '../users/student-profile.entity';
import { AnalysisService } from './analysis.service';

describe('AnalysisService', () => {
	let service: AnalysisService;
	let profileRepository: Record<string, jest.Mock>;
	let analysisRepository: Record<string, jest.Mock>;
	let courseRepository: Record<string, jest.Mock>;
	let courseQuery: Record<string, jest.Mock>;
	let manager: {
		findOne: jest.Mock;
		getRepository: jest.Mock;
	};
	let dataSource: {
		getRepository: jest.Mock;
		transaction: jest.Mock;
	};

	const profile = {
		id: 'profile-a',
		userId: 'student-a',
		displayName: 'Minh',
		curriculumId: 'curriculum-a',
	};
	const curriculum = {
		id: 'curriculum-a',
		name: 'Chương trình A',
		sourceDocumentName: 'Nguồn A',
		sourceReference: 'ref-a',
		sourceVersion: '1',
		sourceVerifiedAt: '2026-10-04',
	};
	const course = {
		id: 'course-a',
		courseCode: 'CS101',
		courseVersion: '1',
		name: 'Nhập môn lập trình',
		nameEn: null,
		credits: '3.00',
		requirementType: 'required' as const,
		electiveGroupId: null,
		electiveGroup: null,
		term: { id: 'term-a', termCode: 'T1', name: 'Học kỳ 1', sortOrder: 1 },
	};

	beforeEach(() => {
		profileRepository = { findOne: jest.fn() };
		analysisRepository = {
			create: jest.fn((value: object) => value),
			save: jest.fn((value: object) =>
				Promise.resolve({ ...value, id: 'analysis-a', createdAt: new Date('2026-10-04T00:00:00Z') }),
			),
			findOne: jest.fn(),
			createQueryBuilder: jest.fn(),
		};
		courseQuery = {
			leftJoinAndSelect: jest.fn().mockReturnThis(),
			where: jest.fn().mockReturnThis(),
			andWhere: jest.fn().mockReturnThis(),
			orderBy: jest.fn().mockReturnThis(),
			addOrderBy: jest.fn().mockReturnThis(),
			getMany: jest.fn().mockResolvedValue([course]),
		};
		courseRepository = { createQueryBuilder: jest.fn(() => courseQuery) };
		const rulesRepository = { find: jest.fn().mockResolvedValue([]) };
		const groupsRepository = { find: jest.fn().mockResolvedValue([]) };
		const statusesRepository = { find: jest.fn().mockResolvedValue([]) };
		manager = {
			findOne: jest
				.fn()
				.mockResolvedValueOnce(profile)
				.mockResolvedValue(curriculum),
			getRepository: jest.fn((entity: object) => {
				if (entity === Course) return courseRepository;
				if (entity === CourseRule) return rulesRepository;
				if (entity === ElectiveGroup) return groupsRepository;
				if (entity === StudentCourseStatus) return statusesRepository;
				return analysisRepository;
			}),
		};
		dataSource = {
			getRepository: jest.fn((entity: object) =>
				entity === StudentProfile ? profileRepository : analysisRepository,
			),
			transaction: jest.fn(
				(
					_isolation: string,
					callback: (value: typeof manager) => unknown,
				) => callback(manager),
			),
		};
		service = new AnalysisService(dataSource as unknown as DataSource);
	});

	it('stores and returns one analysis snapshot in a repeatable-read transaction', async () => {
		const result = await service.analyze('student-a');

		expect(dataSource.transaction).toHaveBeenCalledWith(
			'REPEATABLE READ',
			expect.any(Function),
		);
		expect(analysisRepository.save).toHaveBeenCalledTimes(1);
		expect(result).toMatchObject({
			id: 'analysis-a',
			curriculum: { id: 'curriculum-a', name: 'Chương trình A' },
			summary: { eligibleCourses: 1, ineligibleCourses: 0 },
		});
		const savedCalls = analysisRepository.save.mock.calls as unknown as Array<
			[{
				profileId: string;
				curriculumId: string;
				rulesetVersion: string;
				inputSnapshot: { profile: { id: string; displayName: string } };
			}]
		>;
		const savedRun = savedCalls[0]?.[0];
		expect(savedRun.profileId).toBe('profile-a');
		expect(savedRun.curriculumId).toBe('curriculum-a');
		expect(savedRun.rulesetVersion).toBe('1');
		expect(savedRun.inputSnapshot.profile).toEqual({
			id: 'profile-a',
			displayName: 'Minh',
		});
	});

	it('rejects incomplete profiles without inserting an analysis run', async () => {
		manager.findOne.mockReset().mockResolvedValue({ ...profile, displayName: null });

		await expect(service.analyze('student-a')).rejects.toBeInstanceOf(
			UnprocessableEntityException,
		);
		expect(analysisRepository.save).not.toHaveBeenCalled();
	});

	it('rejects curricula without active courses and leaves history unchanged', async () => {
		courseQuery.getMany.mockResolvedValue([]);

		await expect(service.analyze('student-a')).rejects.toBeInstanceOf(
			UnprocessableEntityException,
		);
		expect(analysisRepository.save).not.toHaveBeenCalled();
	});

	it('rejects snapshots above two MiB before inserting them', async () => {
		courseQuery.getMany.mockResolvedValue([
			{ ...course, name: 'x'.repeat(2 * 1024 * 1024) },
		]);

		await expect(service.analyze('student-a')).rejects.toBeInstanceOf(
			UnprocessableEntityException,
		);
		expect(analysisRepository.save).not.toHaveBeenCalled();
	});

	it('lists history under the authenticated profile, including a soft-deleted profile', async () => {
		profileRepository.findOne.mockResolvedValue({ ...profile, deletedAt: new Date() });
		const queryBuilder = {
			where: jest.fn().mockReturnThis(),
			orderBy: jest.fn().mockReturnThis(),
			addOrderBy: jest.fn().mockReturnThis(),
			skip: jest.fn().mockReturnThis(),
			take: jest.fn().mockReturnThis(),
			getManyAndCount: jest.fn().mockResolvedValue([
				[
					{
						id: 'analysis-a',
						createdAt: new Date('2026-10-04T00:00:00Z'),
						resultSnapshot: {
							curriculum: { id: 'curriculum-a', name: 'Chương trình cũ' },
							summary: { eligibleCourses: 2 },
						},
					},
				],
				1,
			]),
		};
		analysisRepository.createQueryBuilder.mockReturnValue(queryBuilder);

		const result = await service.listHistory('student-a', { limit: 20, offset: 0 });

		expect(profileRepository.findOne).toHaveBeenCalledWith({
			where: { userId: 'student-a' },
			withDeleted: true,
		});
		expect(queryBuilder.where).toHaveBeenCalledWith(
			'analysis.profile_id = :profileId',
			{ profileId: 'profile-a' },
		);
		expect(result.items[0]).toMatchObject({
			id: 'analysis-a',
			curriculum: { name: 'Chương trình cũ' },
			summary: { eligibleCourses: 2 },
		});
	});

	it('returns stored detail only when the snapshot belongs to the profile', async () => {
		profileRepository.findOne.mockResolvedValue(profile);
		analysisRepository.findOne.mockResolvedValue({
			id: 'analysis-a',
			createdAt: new Date('2026-10-04T00:00:00Z'),
			inputSnapshot: { courses: [{ code: 'OLD101' }] },
			resultSnapshot: {
				curriculum: { id: 'curriculum-a', name: 'Old curriculum name' },
				courseResults: [],
			},
		});

		const result = await service.getHistoryDetail('student-a', 'analysis-a');

		expect(analysisRepository.findOne).toHaveBeenCalledWith({
			where: { id: 'analysis-a', profileId: 'profile-a' },
		});
		expect(result).toMatchObject({
			inputSnapshot: { courses: [{ code: 'OLD101' }] },
			curriculum: { name: 'Old curriculum name' },
		});
		expect(courseRepository.createQueryBuilder).not.toHaveBeenCalled();
	});

	it('hides a snapshot owned by another profile', async () => {
		profileRepository.findOne.mockResolvedValue(profile);
		analysisRepository.findOne.mockResolvedValue(null);

		await expect(
			service.getHistoryDetail('student-a', 'foreign-analysis-id'),
		).rejects.toBeInstanceOf(NotFoundException);
		expect(analysisRepository.findOne).toHaveBeenCalledWith({
			where: { id: 'foreign-analysis-id', profileId: 'profile-a' },
		});
	});
});