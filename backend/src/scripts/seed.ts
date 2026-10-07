import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import dataSource from '../data-source';
import { Course } from '../curricula/course.entity';
import { CourseRule } from '../curricula/course-rule.entity';
import { Curriculum } from '../curricula/curriculum.entity';
import { CurriculumTerm } from '../curricula/curriculum-term.entity';
import { ElectiveGroup } from '../curricula/elective-group.entity';
import { ruleTestCurricula, ruleTestProfiles } from '../fixtures/rule-test-data';
import { StudentCourseStatus } from '../users/student-course-status.entity';
import { StudentProfile } from '../users/student-profile.entity';
import { User } from '../users/user.entity';

const SEED_SOURCE = {
	documentName: 'Synthetic rule test data',
	reference: 'Local development testcase fixture; not a verified curriculum',
	version: '1',
	verifiedAt: '2026-10-07',
};

async function saveById<EntityType extends { id: string }>(
	manager: typeof dataSource.manager,
	entity: new () => EntityType,
	id: string,
	values: Partial<EntityType>,
) {
	const repository = manager.getRepository(entity);
	const existing = await repository.findOne({
		where: { id } as never,
		withDeleted: true,
	});
	return repository.save(
		repository.create({ ...existing, ...values, id } as EntityType),
	);
}

async function seedRuleTestData(
	manager: typeof dataSource.manager,
	adminId: string,
	passwordHash: string,
) {
	const coursesByCurriculum = new Map<string, Map<string, Course>>();
	let ruleId = 1;

	for (const fixture of ruleTestCurricula) {
		const curriculum = await saveById(manager, Curriculum, fixture.id, {
			name: fixture.name,
			description: fixture.description,
			totalCreditsTarget: '15',
			minimumSemesterCredits: '3',
			maximumSemesterCredits: '6',
			createdBy: adminId,
			sourceDocumentName: SEED_SOURCE.documentName,
			sourceReference: SEED_SOURCE.reference,
			sourceVersion: SEED_SOURCE.version,
			sourceVerifiedAt: SEED_SOURCE.verifiedAt,
			deletedAt: null,
		});
		const termsByCode = new Map<string, CurriculumTerm>();
		for (const term of fixture.terms) {
			termsByCode.set(
				term.code,
				await saveById(manager, CurriculumTerm, term.id, {
					curriculumId: curriculum.id,
					termCode: term.code,
					name: term.name,
					sortOrder: term.sortOrder,
					deletedAt: null,
				}),
			);
		}

		const groupsByName = new Map<string, ElectiveGroup>();
		if (fixture.electiveGroup) {
			const group = await saveById(manager, ElectiveGroup, fixture.electiveGroup.id, {
				curriculumId: curriculum.id,
				name: fixture.electiveGroup.name,
				requiredCredits: String(fixture.electiveGroup.requiredCredits),
				requiredCourses: fixture.electiveGroup.requiredCourses,
				sortOrder: 1,
				deletedAt: null,
			});
			groupsByName.set(group.name, group);
		}

		const coursesByCode = new Map<string, Course>();
		for (const course of fixture.courses) {
			coursesByCode.set(
				course.code,
				await saveById(manager, Course, course.id, {
					curriculumId: curriculum.id,
					courseCode: course.code,
					courseVersion: '1',
					name: course.name,
					nameEn: null,
					credits: String(course.credits),
					termId: termsByCode.get(course.termCode)!.id,
					requirementType: course.requirementType,
					electiveGroupId: course.electiveGroup
						? groupsByName.get(course.electiveGroup)!.id
						: null,
					recommendationPriority: course.recommendationPriority,
					deletedAt: null,
				}),
			);
		}
		coursesByCurriculum.set(curriculum.id, coursesByCode);

		for (const course of fixture.courses) {
			const targetCourse = coursesByCode.get(course.code)!;
			for (const rule of course.rules) {
				const id = `14000000-0000-4000-8000-${ruleId.toString().padStart(12, '0')}`;
				ruleId += 1;
				await saveById(manager, CourseRule, id, {
					curriculumId: curriculum.id,
					targetCourseId: targetCourse.id,
					ruleType: rule.type,
					prerequisiteCourseId:
						rule.type === 'prerequisite'
							? coursesByCode.get(rule.courseCode)!.id
							: null,
					minimumCredits:
						rule.type === 'minimum_credits'
							? String(rule.minimumCredits)
							: null,
					sourceDocumentName: null,
					sourceReference: null,
					sourceVersion: null,
					sourceVerifiedAt: null,
					deletedAt: null,
				});
			}
		}
	}

	for (const [index, fixture] of ruleTestProfiles.entries()) {
		const users = manager.getRepository(User);
		const existingUser = await users
			.createQueryBuilder('user')
			.where('lower(user.email) = :email', { email: fixture.email })
			.getOne();
		const user = await users.save(
			users.create({
				...existingUser,
				id: existingUser?.id ?? `15000000-0000-4000-8000-${(index + 1).toString().padStart(12, '0')}`,
				email: fixture.email,
				passwordHash,
				role: 'student',
			}),
		);
		const profileId = `16000000-0000-4000-8000-${(index + 1).toString().padStart(12, '0')}`;
		await saveById(manager, StudentProfile, profileId, {
			userId: user.id,
			displayName: fixture.displayName,
			curriculumId: fixture.curriculumId,
			deletedAt: null,
		});

		for (const [courseCode, course] of coursesByCurriculum.get(fixture.curriculumId)!) {
			await manager.getRepository(StudentCourseStatus).save({
				profileId,
				curriculumId: fixture.curriculumId,
				courseId: course.id,
				status: fixture.statuses[courseCode] ?? 'not_started',
			});
		}
	}
}

async function seed() {
	const environment = process.env.NODE_ENV || 'development';
	if (!['development', 'test'].includes(environment)) {
		throw new Error(
			'Seed is allowed only in development or test environments.',
		);
	}

	const email = process.env.ADMIN_SEED_EMAIL?.trim().toLowerCase();
	const password = process.env.ADMIN_SEED_PASSWORD;
	if (!email || !password || password.length < 8) {
		throw new Error(
			'Set ADMIN_SEED_EMAIL and an ADMIN_SEED_PASSWORD of at least 8 characters.',
		);
	}

	const passwordHash = await bcrypt.hash(password, 12);
	const demoPassword = process.env.DEMO_SEED_PASSWORD || password;
	if (demoPassword.length < 8) {
		throw new Error('DEMO_SEED_PASSWORD must be at least 8 characters.');
	}
	const demoPasswordHash = await bcrypt.hash(demoPassword, 12);
	await dataSource.initialize();
	try {
		await dataSource.transaction(async (manager) => {
			const users = manager.getRepository(User);
			const admin = await users
				.createQueryBuilder('user')
				.where('lower(user.email) = :email', { email })
				.getOne();

			if (admin) {
				admin.email = email;
				admin.passwordHash = passwordHash;
				admin.role = 'admin';
				await users.save(admin);
			} else {
				const createdAdmin = await users.save(
					users.create({ email, passwordHash, role: 'admin' }),
				);
				await seedRuleTestData(manager, createdAdmin.id, demoPasswordHash);
				return;
			}
			await seedRuleTestData(manager, admin.id, demoPasswordHash);
		});
		console.log(
			`Admin seed is ready for ${email}; 3 rule-test curricula and 6 student profiles are ready.`,
		);
	} finally {
		await dataSource.destroy();
	}
}

seed().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : 'Seed failed.');
	process.exitCode = 1;
});
