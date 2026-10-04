import { UnprocessableEntityException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Curriculum } from '../curricula/curriculum.entity';
import { StudentCourseStatus } from './student-course-status.entity';
import { StudentProfile } from './student-profile.entity';
import { StudentProfileService } from './student-profile.service';

describe('StudentProfileService', () => {
  let service: StudentProfileService;
  let profileRepository: Record<string, jest.Mock>;
  let curriculumRepository: Record<string, jest.Mock>;
  let statusRepository: Record<string, jest.Mock>;
  let courseQuery: Record<string, jest.Mock>;
  let manager: {
    findOne: jest.Mock;
    getRepository: jest.Mock;
  };
  let dataSource: {
    getRepository: jest.Mock;
    transaction: jest.Mock;
  };

  beforeEach(() => {
    profileRepository = {
      findOne: jest.fn(),
      create: jest.fn((value: object) => value),
      save: jest.fn((value: object) => Promise.resolve(value)),
      softRemove: jest.fn(),
    };
    curriculumRepository = { findOne: jest.fn() };
    statusRepository = {
      upsert: jest.fn(),
    };
    courseQuery = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawMany: jest.fn(),
    };
    manager = {
      findOne: jest.fn(),
      getRepository: jest.fn((entity: object) => {
        if (entity === StudentCourseStatus) return statusRepository;
        return { createQueryBuilder: () => courseQuery };
      }),
    };
    dataSource = {
      getRepository: jest.fn((entity: object) => {
        if (entity === StudentProfile) return profileRepository;
        if (entity === Curriculum) return curriculumRepository;
        return statusRepository;
      }),
      transaction: jest.fn((callback: (value: typeof manager) => unknown) =>
        callback(manager),
      ),
    };
    service = new StudentProfileService(dataSource as unknown as DataSource);
  });

  it('loads the profile by the authenticated user id', async () => {
    profileRepository.findOne.mockResolvedValue({
      id: 'profile-a',
      userId: 'student-a',
      displayName: 'Minh',
      curriculumId: 'curriculum-a',
    });

    await expect(service.get('student-a')).resolves.toEqual({
      id: 'profile-a',
      displayName: 'Minh',
      curriculumId: 'curriculum-a',
    });
    expect(profileRepository.findOne).toHaveBeenCalledWith({
      where: { userId: 'student-a' },
    });
  });

  it('restores a soft-deleted profile when the student updates it', async () => {
    profileRepository.findOne.mockResolvedValue({
      id: 'profile-a',
      userId: 'student-a',
      displayName: null,
      curriculumId: null,
      deletedAt: new Date(),
    });
    profileRepository.save.mockImplementation((value: object) =>
      Promise.resolve(value),
    );

    await expect(
      service.update('student-a', { displayName: '  Minh  ' }),
    ).resolves.toMatchObject({
      id: 'profile-a',
      displayName: 'Minh',
      curriculumId: null,
    });
    expect(profileRepository.findOne).toHaveBeenCalledWith({
      where: { userId: 'student-a' },
      withDeleted: true,
    });
    expect(profileRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ deletedAt: null }),
    );
  });

  it('soft-deletes only the authenticated student profile', async () => {
    const profile = { id: 'profile-a', userId: 'student-a' };
    profileRepository.findOne.mockResolvedValue(profile);

    await service.remove('student-a');

    expect(profileRepository.findOne).toHaveBeenCalledWith({
      where: { userId: 'student-a' },
    });
    expect(profileRepository.softRemove).toHaveBeenCalledWith(profile);
  });

  it('writes all statuses within one transaction after validating curriculum scope', async () => {
    manager.findOne.mockResolvedValue({
      id: 'profile-a',
      curriculumId: 'curriculum-a',
    });
    courseQuery.getRawMany.mockResolvedValue([
      { id: 'course-a' },
      { id: 'course-b' },
    ]);

    await expect(
      service.updateStatuses('student-a', [
        { courseId: 'course-a', status: 'completed' },
        { courseId: 'course-b', status: 'in_progress' },
      ]),
    ).resolves.toEqual({ updated: 2 });

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(statusRepository.upsert).toHaveBeenCalledWith(
      [
        {
          profileId: 'profile-a',
          curriculumId: 'curriculum-a',
          courseId: 'course-a',
          status: 'completed',
        },
        {
          profileId: 'profile-a',
          curriculumId: 'curriculum-a',
          courseId: 'course-b',
          status: 'in_progress',
        },
      ],
      ['profileId', 'curriculumId', 'courseId'],
    );
  });

  it('rejects a foreign course without writing any item in the batch', async () => {
    manager.findOne.mockResolvedValue({
      id: 'profile-a',
      curriculumId: 'curriculum-a',
    });
    courseQuery.getRawMany.mockResolvedValue([{ id: 'course-a' }]);

    await expect(
      service.updateStatuses('student-a', [
        { courseId: 'course-a', status: 'completed' },
        { courseId: 'foreign-course', status: 'completed' },
      ]),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(statusRepository.upsert).not.toHaveBeenCalled();
  });

  it('rejects a batch above the 500 item limit before opening a transaction', async () => {
    const items = Array.from({ length: 501 }, (_, index) => ({
      courseId: `course-${index}`,
      status: 'completed' as const,
    }));

    await expect(
      service.updateStatuses('student-a', items),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rejects duplicate course ids before writing', async () => {
    await expect(
      service.updateStatuses('student-a', [
        { courseId: 'course-a', status: 'completed' },
        { courseId: 'course-a', status: 'in_progress' },
      ]),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });
});
