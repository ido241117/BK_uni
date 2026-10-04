import {
	ConflictException,
	UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Course } from './course.entity';
import { CourseRule } from './course-rule.entity';
import { Curriculum } from './curriculum.entity';
import { CurriculumTerm } from './curriculum-term.entity';
import { ElectiveGroup } from './elective-group.entity';
import { CurriculumService } from './curriculum.service';
import { StudentProfile } from '../users/student-profile.entity';
import { User } from '../users/user.entity';

describe('CurriculumService', () => {
	const repositories = new Map<object, Record<string, jest.Mock>>();
	let service: CurriculumService;

	const repository = (entity: object) => repositories.get(entity)!;

	beforeEach(() => {
		repositories.clear();
		for (const entity of [
			Curriculum,
			CurriculumTerm,
			ElectiveGroup,
			Course,
			CourseRule,
			StudentProfile,
		]) {
			repositories.set(entity, {
				create: jest.fn((value: object) => value),
				save: jest.fn((value: object) => Promise.resolve(value)),
				findOne: jest.fn(),
				find: jest.fn(),
				count: jest.fn(() => Promise.resolve(0)),
				softDelete: jest.fn(),
				createQueryBuilder: jest.fn(),
			});
		}
		const dataSource = {
			getRepository: jest.fn((entity: object) => repository(entity)),
		} as unknown as DataSource;
		service = new CurriculumService(dataSource);
	});

	it('trims curriculum name and stores its source with the creating admin', async () => {
		const created = await service.createCurriculum('admin-id', {
			name: '  Chương trình A  ',
			description: '  Mô tả  ',
			source: {
				documentName: '  Tài liệu  ',
				reference: '  https://example.test/source  ',
				version: '  2026  ',
				verifiedAt: '2026-10-04',
			},
		});

		expect(created).toMatchObject({
			id: undefined,
			name: 'Chương trình A',
			description: 'Mô tả',
			source: {
				documentName: 'Tài liệu',
				reference: 'https://example.test/source',
				version: '2026',
				verifiedAt: '2026-10-04',
			},
			courseCount: 0,
		});
		expect(repository(Curriculum).create).toHaveBeenCalledWith(
			expect.objectContaining({ createdBy: 'admin-id' }),
		);
	});

	it('maps a successful course create to the documented code/version fields', async () => {
		repository(Curriculum).findOne.mockResolvedValue({ id: 'curriculum-id' });
		repository(CurriculumTerm).findOne.mockResolvedValue({
			id: 'term-id',
			curriculumId: 'curriculum-id',
			termCode: 'T1',
			name: 'Học kỳ 1',
			sortOrder: 0,
		});

		const created = await service.createCourse('curriculum-id', {
			code: 'CS101',
			name: 'Lập trình',
			credits: 3,
			termId: 'term-id',
			requirementType: 'required',
		});

		expect(created).toMatchObject({
			code: 'CS101',
			version: '1',
			termId: 'term-id',
			term: { code: 'T1', name: 'Học kỳ 1' },
			electiveGroup: null,
		});
	});

	it('maps duplicate course identities to a conflict response', async () => {
		repository(Curriculum).findOne.mockResolvedValue({ id: 'curriculum-id' });
		repository(CurriculumTerm).findOne.mockResolvedValue({ id: 'term-id' });
		repository(Course).save.mockRejectedValue({
			driverError: { code: '23505' },
		});

		const result = await service
			.createCourse('curriculum-id', {
				code: 'CS101',
				name: 'Lập trình',
				credits: 3,
				termId: 'term-id',
				requirementType: 'required',
			})
			.catch((error: unknown) => error);

		expect(result).toBeInstanceOf(ConflictException);
		if (result instanceof ConflictException) {
			expect(result.getResponse()).toMatchObject({
				code: 'DUPLICATE_COURSE_IDENTITY',
			});
		}
	});

	it('updates curriculum details and returns the API source shape', async () => {
		repository(Curriculum).findOne.mockResolvedValue({
			id: 'curriculum-id',
			name: 'Old name',
			description: null,
			sourceDocumentName: 'Old source',
			sourceReference: 'https://example.test/old',
			sourceVersion: '2025',
			sourceVerifiedAt: '2025-10-01',
		});

		const updated = await service.updateCurriculum('curriculum-id', {
			name: '  New name  ',
			source: {
				documentName: '  New source  ',
				reference: '  https://example.test/new  ',
				version: '  2026  ',
				verifiedAt: '2026-10-04',
			},
		});

		expect(updated).toMatchObject({
			id: 'curriculum-id',
			name: 'New name',
			source: {
				documentName: 'New source',
				reference: 'https://example.test/new',
				version: '2026',
			},
		});
	});

	it('prevents a student from reading a structure outside their selected curriculum', async () => {
		repository(Curriculum).findOne.mockResolvedValue({
			id: 'curriculum-a',
			name: 'Chương trình A',
		});
		repository(StudentProfile).findOne.mockResolvedValue({
			userId: 'student-a',
			curriculumId: 'curriculum-b',
		});

		await expect(
			service.getStructure('curriculum-a', {
				id: 'student-a',
				role: 'student',
			} as unknown as User),
		).rejects.toBeInstanceOf(UnprocessableEntityException);
		expect(repository(CurriculumTerm).find).not.toHaveBeenCalled();
	});

	it('rejects elective groups without either threshold', async () => {
		repository(Curriculum).findOne.mockResolvedValue({ id: 'curriculum-id' });
		await expect(
			service.createElectiveGroup('curriculum-id', {
				name: 'Nhóm A',
				sortOrder: 0,
			}),
		).rejects.toBeInstanceOf(UnprocessableEntityException);
		expect(repository(ElectiveGroup).save).not.toHaveBeenCalled();
	});

	it('rejects courses whose term is not active in the selected curriculum', async () => {
		repository(Curriculum).findOne.mockResolvedValue({ id: 'curriculum-id' });
		repository(CurriculumTerm).findOne.mockResolvedValue(null);

		await expect(
			service.createCourse('curriculum-id', {
				code: 'CS101',
				name: 'Lập trình',
				credits: 3,
				termId: 'foreign-term-id',
				requirementType: 'required',
			}),
		).rejects.toBeInstanceOf(UnprocessableEntityException);
		expect(repository(Course).save).not.toHaveBeenCalled();
	});

	it('rejects a course as its own prerequisite', async () => {
		repository(Course).findOne.mockResolvedValue({ id: 'course-id' });

		await expect(
			service.createCourseRule('curriculum-id', 'course-id', {
				type: 'prerequisite',
				prerequisiteCourseId: 'course-id',
			}),
		).rejects.toBeInstanceOf(UnprocessableEntityException);
		expect(repository(CourseRule).save).not.toHaveBeenCalled();
	});

	it('rejects prerequisites from another curriculum', async () => {
		repository(Course)
			.findOne.mockResolvedValueOnce({
				id: 'target-id',
				curriculumId: 'curriculum-a',
			})
			.mockResolvedValueOnce(null);

		await expect(
			service.createCourseRule('curriculum-a', 'target-id', {
				type: 'prerequisite',
				prerequisiteCourseId: 'course-from-b',
			}),
		).rejects.toThrow('Không tìm thấy dữ liệu yêu cầu.');
		expect(repository(CourseRule).save).not.toHaveBeenCalled();
	});

	it('prevents soft-deleting a course referenced by an active rule', async () => {
		repository(Course).findOne.mockResolvedValue({
			id: 'course-id',
			curriculumId: 'curriculum-id',
		});
		repository(CourseRule).count.mockResolvedValue(1);

		await expect(
			service.deleteCourse('curriculum-id', 'course-id'),
		).rejects.toBeInstanceOf(ConflictException);
		expect(repository(Course).softDelete).not.toHaveBeenCalled();
	});

	it('prevents soft-deleting a term with active courses', async () => {
		repository(CurriculumTerm).findOne.mockResolvedValue({ id: 'term-id' });
		repository(Course).count.mockResolvedValue(1);

		await expect(
			service.deleteTerm('curriculum-id', 'term-id'),
		).rejects.toBeInstanceOf(ConflictException);
		expect(repository(CurriculumTerm).softDelete).not.toHaveBeenCalled();
	});

	it('soft-deletes a term with no active courses', async () => {
		repository(CurriculumTerm).findOne.mockResolvedValue({ id: 'term-id' });

		await service.deleteTerm('curriculum-id', 'term-id');

		expect(repository(CurriculumTerm).softDelete).toHaveBeenCalledWith({
			id: 'term-id',
			curriculumId: 'curriculum-id',
		});
	});

	it('prevents soft-deleting an elective group with active courses', async () => {
		repository(ElectiveGroup).findOne.mockResolvedValue({ id: 'group-id' });
		repository(Course).count.mockResolvedValue(1);

		await expect(
			service.deleteElectiveGroup('curriculum-id', 'group-id'),
		).rejects.toBeInstanceOf(ConflictException);
		expect(repository(ElectiveGroup).softDelete).not.toHaveBeenCalled();
	});

	it('soft-deletes a course with no active rule references', async () => {
		repository(Course).findOne.mockResolvedValue({ id: 'course-id' });

		await service.deleteCourse('curriculum-id', 'course-id');

		expect(repository(Course).softDelete).toHaveBeenCalledWith({
			id: 'course-id',
			curriculumId: 'curriculum-id',
		});
	});

	it('updates a minimum-credit rule using its API representation', async () => {
		repository(CourseRule).findOne.mockResolvedValue({
			id: 'rule-id',
			curriculumId: 'curriculum-id',
			targetCourseId: 'target-id',
			ruleType: 'minimum_credits',
			prerequisiteCourseId: null,
			minimumCredits: '30',
			sourceDocumentName: null,
			sourceReference: null,
			sourceVersion: null,
			sourceVerifiedAt: null,
		});

		const updated = await service.updateCourseRule(
			'curriculum-id',
			'target-id',
			'rule-id',
			{ minimumCredits: 45 },
		);

		expect(updated).toMatchObject({
			id: 'rule-id',
			type: 'minimum_credits',
			minimumCredits: 45,
			source: null,
		});
	});

	it('soft-deletes a scoped course rule', async () => {
		repository(CourseRule).findOne.mockResolvedValue({ id: 'rule-id' });

		await service.deleteCourseRule('curriculum-id', 'target-id', 'rule-id');

		expect(repository(CourseRule).softDelete).toHaveBeenCalledWith({
			id: 'rule-id',
			curriculumId: 'curriculum-id',
			targetCourseId: 'target-id',
		});
	});

	it('scopes term updates to the requested curriculum', async () => {
		repository(CurriculumTerm).findOne.mockResolvedValue(null);

		await expect(
			service.updateTerm('curriculum-a', 'term-from-b', { name: 'Renamed' }),
		).rejects.toThrow('Không tìm thấy dữ liệu yêu cầu.');
		expect(repository(CurriculumTerm).findOne).toHaveBeenCalledWith({
			where: { id: 'term-from-b', curriculumId: 'curriculum-a' },
		});
	});
});
