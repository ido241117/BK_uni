import {
	NotFoundException,
	UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Course } from '../curricula/course.entity';
import { CourseRule } from '../curricula/course-rule.entity';
import { CurriculumTerm } from '../curricula/curriculum-term.entity';
import { StudentCourseStatus } from '../users/student-course-status.entity';
import { RecommendationService } from './recommendation.service';

describe('RecommendationService', () => {
	let service: RecommendationService;
	let manager: {
		findOne: jest.Mock;
		getRepository: jest.Mock;
	};
	let queryRunner: {
		manager: typeof manager;
		connect: jest.Mock;
		startTransaction: jest.Mock;
		query: jest.Mock;
		commitTransaction: jest.Mock;
		rollbackTransaction: jest.Mock;
		release: jest.Mock;
		isTransactionActive: boolean;
	};
	let termsRepository: { find: jest.Mock };
	let courseQuery: Record<string, jest.Mock>;
	let courses: object[];
	const profile = {
		id: 'profile-a',
		userId: 'student-a',
		curriculumId: 'curriculum-a',
	};
	const curriculum = {
		id: 'curriculum-a',
		totalCreditsTarget: '6.00',
		minimumSemesterCredits: '3.00',
		maximumSemesterCredits: '6.00',
	};
	const term = {
		id: 'term-a',
		termCode: 'T1',
		name: 'Học kỳ 1',
		sortOrder: 0,
	};

	beforeEach(() => {
		courses = [
			{
				id: 'course-a',
				courseCode: 'CS101',
				courseVersion: '1',
				name: 'Nhập môn lập trình',
				credits: '3.00',
				requirementType: 'required',
				electiveGroupId: null,
				recommendationPriority: 0,
				term,
			},
		];
		termsRepository = { find: jest.fn().mockResolvedValue([term]) };
		courseQuery = {
			leftJoinAndSelect: jest.fn().mockReturnThis(),
			where: jest.fn().mockReturnThis(),
			andWhere: jest.fn().mockReturnThis(),
			getMany: jest.fn(() => Promise.resolve(courses)),
		};
		const courseRepository = {
			createQueryBuilder: jest.fn(() => courseQuery),
		};
		const rulesRepository = { find: jest.fn().mockResolvedValue([]) };
		const statusesRepository = { find: jest.fn().mockResolvedValue([]) };
		manager = {
			findOne: jest
				.fn()
				.mockResolvedValueOnce(profile)
				.mockResolvedValue(curriculum),
			getRepository: jest.fn((entity: object) => {
				if (entity === CurriculumTerm) return termsRepository;
				if (entity === Course) return courseRepository;
				if (entity === CourseRule) return rulesRepository;
				if (entity === StudentCourseStatus) return statusesRepository;
				throw new Error('Unexpected repository');
			}),
		};
		queryRunner = {
			manager,
			connect: jest.fn(),
			startTransaction: jest.fn(),
			query: jest.fn(),
			commitTransaction: jest.fn(),
			rollbackTransaction: jest.fn(),
			release: jest.fn(),
			isTransactionActive: true,
		};
		const dataSource = {
			createQueryRunner: jest.fn(() => queryRunner),
		} as unknown as DataSource;
		service = new RecommendationService(dataSource);
	});

	it('reads a recommendation in a repeatable-read read-only transaction', async () => {
		const result = await service.recommend('student-a');

		expect(queryRunner.startTransaction).toHaveBeenCalledWith(
			'REPEATABLE READ',
		);
		expect(queryRunner.query).toHaveBeenCalledWith('SET TRANSACTION READ ONLY');
		expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
		expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
		expect(queryRunner.release).toHaveBeenCalledTimes(1);
		expect(result).toMatchObject({
			status: 'ready',
			summary: { recommendedCredits: 3 },
			recommendedCourses: [
				{
					course: { id: 'course-a', code: 'CS101' },
					eligible: true,
					recommendationPriority: 0,
				},
			],
		});
	});

	it('returns NOT_FOUND when the session has no profile', async () => {
		manager.findOne.mockReset().mockResolvedValue(null);

		await expect(service.recommend('student-a')).rejects.toBeInstanceOf(
			NotFoundException,
		);
		expect(termsRepository.find).not.toHaveBeenCalled();
		expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
	});

	it('rejects a profile without a selected curriculum', async () => {
		manager.findOne.mockReset().mockResolvedValue({
			...profile,
			curriculumId: null,
		});

		const error = await service
			.recommend('student-a')
			.catch((value: unknown) => value);
		expect(error).toBeInstanceOf(UnprocessableEntityException);
		if (error instanceof UnprocessableEntityException) {
			expect(error.getResponse()).toMatchObject({
				code: 'CURRICULUM_NOT_SELECTED',
			});
		}
	});

	it('rejects missing recommendation settings', async () => {
		manager.findOne
			.mockReset()
			.mockResolvedValueOnce(profile)
			.mockResolvedValue({
				...curriculum,
				totalCreditsTarget: null,
				minimumSemesterCredits: null,
				maximumSemesterCredits: null,
			});

		const error = await service
			.recommend('student-a')
			.catch((value: unknown) => value);
		expect(error).toBeInstanceOf(UnprocessableEntityException);
		if (error instanceof UnprocessableEntityException) {
			expect(error.getResponse()).toMatchObject({
				code: 'CURRICULUM_RECOMMENDATION_NOT_CONFIGURED',
			});
		}
		expect(termsRepository.find).not.toHaveBeenCalled();
	});

	it('rejects inconsistent stored recommendation settings', async () => {
		manager.findOne
			.mockReset()
			.mockResolvedValueOnce(profile)
			.mockResolvedValue({
				...curriculum,
				minimumSemesterCredits: '7.00',
			});

		const error = await service
			.recommend('student-a')
			.catch((value: unknown) => value);
		expect(error).toBeInstanceOf(UnprocessableEntityException);
		if (error instanceof UnprocessableEntityException) {
			expect(error.getResponse()).toMatchObject({
				code: 'CURRICULUM_RECOMMENDATION_SETTINGS_INVALID',
			});
		}
		expect(termsRepository.find).not.toHaveBeenCalled();
	});

	it('rejects missing active terms and courses with stable error codes', async () => {
		termsRepository.find.mockResolvedValueOnce([]);
		const noTerms = await service
			.recommend('student-a')
			.catch((value: unknown) => value);
		expect(noTerms).toBeInstanceOf(UnprocessableEntityException);
		if (noTerms instanceof UnprocessableEntityException) {
			expect(noTerms.getResponse()).toMatchObject({
				code: 'CURRICULUM_HAS_NO_TERMS',
			});
		}

		manager.findOne
			.mockReset()
			.mockResolvedValueOnce(profile)
			.mockResolvedValue(curriculum);
		courses = [];
		const noCourses = await service
			.recommend('student-a')
			.catch((value: unknown) => value);
		expect(noCourses).toBeInstanceOf(UnprocessableEntityException);
		if (noCourses instanceof UnprocessableEntityException) {
			expect(noCourses.getResponse()).toMatchObject({
				code: 'CURRICULUM_HAS_NO_COURSES',
			});
		}
	});

	it('rejects missing course priority rather than assigning a default', async () => {
		courses = [{ ...courses[0], recommendationPriority: null }];

		const error = await service
			.recommend('student-a')
			.catch((value: unknown) => value);
		expect(error).toBeInstanceOf(UnprocessableEntityException);
		if (error instanceof UnprocessableEntityException) {
			expect(error.getResponse()).toMatchObject({
				code: 'COURSE_RECOMMENDATION_PRIORITY_INVALID',
			});
		}
	});
});
