import 'dotenv/config';
import { randomUUID } from 'crypto';
import type { Server } from 'http';
import { join } from 'path';
import * as bcrypt from 'bcryptjs';
import { Client } from 'pg';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
	BadRequestException,
	ValidationError,
	ValidationPipe,
} from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { TransformResponseInterceptor } from '../src/common/interceptors/transform-response.interceptor';
import { AnalysisRun } from '../src/analysis/analysis-run.entity';
import { StudentCourseStatus } from '../src/users/student-course-status.entity';
import { User } from '../src/users/user.entity';

const api = '/api/v1';
const origin = 'http://localhost:5174';
const testDatabase = process.env.DB_TEST_NAME;
const localDatabase = process.env.DB_NAME;
const schema = `e2e_${randomUUID().replaceAll('-', '')}`;
const connection = {
	host: process.env.DB_HOST || 'localhost',
	port: Number(process.env.DB_PORT || 5432),
	user: process.env.DB_USERNAME,
	password: process.env.DB_PASSWORD,
	database: testDatabase,
};

const responseData = <T>(response: { body: unknown }): T =>
	(response.body as { data: T }).data;

type AnalysisCourseResult = {
	course: { code: string };
	eligible: boolean;
	reasons: { passed: boolean }[];
};

let adminClient: Client | undefined;
let migrationDataSource: DataSource | undefined;
let app: INestApplication | undefined;

const validationMessages = (errors: ValidationError[], parentPath = '') => {
	const messages: string[] = [];
	for (const error of errors) {
		const currentPath = parentPath
			? `${parentPath}.${error.property}`
			: error.property;
		if (error.constraints) {
			messages.push(
				...Object.values(error.constraints).map(
					(constraint) => `${currentPath}: ${constraint}`,
				),
			);
		}
		if (error.children?.length) {
			messages.push(...validationMessages(error.children, currentPath));
		}
	}
	return messages;
};

const getCsrfToken = async (agent: ReturnType<typeof request.agent>) => {
	const response = await agent.get(`${api}/auth/csrf`).expect(200);
	return responseData<{ token: string }>(response).token;
};

const mutation = (agent: ReturnType<typeof request.agent>, token: string) => ({
	post: (path: string) =>
		agent.post(path).set('Origin', origin).set('X-CSRF-Token', token),
	put: (path: string) =>
		agent.put(path).set('Origin', origin).set('X-CSRF-Token', token),
	patch: (path: string) =>
		agent.patch(path).set('Origin', origin).set('X-CSRF-Token', token),
	delete: (path: string) =>
		agent.delete(path).set('Origin', origin).set('X-CSRF-Token', token),
});

describe('BK Uni API (PostgreSQL e2e)', () => {
	beforeAll(async () => {
		if (
			!testDatabase ||
			testDatabase === localDatabase ||
			!/(^|[_-])test([_-]|$)/i.test(testDatabase)
		) {
			throw new Error(
				'DB_TEST_NAME must name a dedicated test database, differ from DB_NAME, and contain "test".',
			);
		}

		process.env.NODE_ENV = 'test';
		process.env.DB_NAME = testDatabase;
		process.env.DB_SCHEMA = schema;
		process.env.CSRF_SECRET = 'bk-uni-e2e-csrf-secret';

		adminClient = new Client(connection);
		await adminClient.connect();
		await adminClient.query(`CREATE SCHEMA "${schema}"`);

		migrationDataSource = new DataSource({
			type: 'postgres',
			host: connection.host,
			port: connection.port,
			username: connection.user,
			password: connection.password,
			database: testDatabase,
			schema,
			entities: [join(__dirname, '../src/**/*.entity{.ts,.js}')],
			migrations: [join(__dirname, '../src/db/migrations/*{.ts,.js}')],
			migrationsTableName: 'typeorm_migrations',
			synchronize: false,
			logging: false,
		});
		await migrationDataSource.initialize();
		await migrationDataSource.runMigrations();

		const { AppModule } = await import('../src/app.module');
		app = await NestFactory.create(AppModule, { logger: false });
		app.setGlobalPrefix('api/v1');
		app.useGlobalPipes(
			new ValidationPipe({
				transform: true,
				whitelist: true,
				exceptionFactory: (errors: ValidationError[] = []) =>
					new BadRequestException({
						message:
							validationMessages(errors).length > 0
								? validationMessages(errors)
								: ['Dữ liệu gửi lên không hợp lệ.'],
						error: 'Yêu cầu không hợp lệ',
					}),
			}),
		);
		app.useGlobalInterceptors(new TransformResponseInterceptor());
		app.useGlobalFilters(new AllExceptionsFilter());
		await app.init();
	}, 60000);

	afterAll(async () => {
		await app?.close();
		if (migrationDataSource?.isInitialized) {
			await migrationDataSource.destroy();
		}
		if (adminClient) {
			await adminClient.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
			await adminClient.end();
		}
	});

	it('manages curriculum recommendation settings through the admin API', async () => {
		const dataSource = app!.get(DataSource);
		const server = app!.getHttpServer() as Server;
		const adminEmail = `settings-admin-${randomUUID()}@example.test`;
		const adminRepository = dataSource.getRepository(User);
		await adminRepository.save(
			adminRepository.create({
				email: adminEmail,
				passwordHash: await bcrypt.hash('admin-pass-123', 4),
				role: 'admin',
			}),
		);
		const adminAgent = request.agent(server);
		const adminCsrf = await getCsrfToken(adminAgent);
		await mutation(adminAgent, adminCsrf)
			.post(`${api}/auth/login`)
			.send({ email: adminEmail, password: 'admin-pass-123' })
			.expect(200);

		const curriculumResponse = await mutation(adminAgent, adminCsrf)
			.post(`${api}/admin/curricula`)
			.send({
				name: `Settings curriculum ${randomUUID().slice(0, 8)}`,
				source: {
					documentName: 'E2E source',
					reference: 'https://example.test/e2e',
					version: '1',
					verifiedAt: '2026-10-04',
				},
				recommendationSettings: {
					totalCreditsTarget: 140,
					minimumSemesterCredits: 11,
					maximumSemesterCredits: 24,
				},
			})
			.expect(201);
		const created = responseData<{
			id: string;
			recommendationSettings: object;
		}>(curriculumResponse);
		const curriculumId = created.id;
		expect(created.recommendationSettings).toEqual({
			totalCreditsTarget: 140,
			minimumSemesterCredits: 11,
			maximumSemesterCredits: 24,
		});

		await mutation(adminAgent, adminCsrf)
			.patch(`${api}/admin/curricula/${curriculumId}`)
			.send({ recommendationSettings: { minimumSemesterCredits: 12 } })
			.expect(200);
		await adminAgent
			.get(`${api}/curricula/${curriculumId}`)
			.expect(200)
			.expect((response) =>
				expect(
					responseData<{
						recommendationSettings: {
							totalCreditsTarget: number;
							minimumSemesterCredits: number;
							maximumSemesterCredits: number;
						};
					}>(response).recommendationSettings,
				).toEqual({
					totalCreditsTarget: 140,
					minimumSemesterCredits: 12,
					maximumSemesterCredits: 24,
				}),
			);
		for (const recommendationSettings of [
			{ totalCreditsTarget: 0 },
			{ minimumSemesterCredits: -1 },
			{ maximumSemesterCredits: 0 },
		]) {
			await mutation(adminAgent, adminCsrf)
				.patch(`${api}/admin/curricula/${curriculumId}`)
				.send({ recommendationSettings })
				.expect(400);
		}
		await mutation(adminAgent, adminCsrf)
			.patch(`${api}/admin/curricula/${curriculumId}`)
			.send({ recommendationSettings: { minimumSemesterCredits: 25 } })
			.expect(422);
		await mutation(adminAgent, adminCsrf)
			.patch(`${api}/admin/curricula/${curriculumId}`)
			.send({ recommendationSettings: null })
			.expect(200)
			.expect((response) =>
				expect(
					responseData<{ recommendationSettings: unknown }>(response)
						.recommendationSettings,
				).toBeNull(),
			);
		await mutation(adminAgent, adminCsrf)
			.post(`${api}/admin/curricula`)
			.send({
				name: `Invalid settings ${randomUUID().slice(0, 8)}`,
				source: {
					documentName: 'E2E source',
					reference: 'https://example.test/e2e',
					version: '1',
					verifiedAt: '2026-10-04',
				},
				recommendationSettings: { totalCreditsTarget: 140 },
			})
			.expect(400);
	});

	it('returns student-only recommendations without persisting history or status', async () => {
		const dataSource = app!.get(DataSource);
		const server = app!.getHttpServer() as Server;
		const adminEmail = `recommendation-admin-${randomUUID()}@example.test`;
		const adminRepository = dataSource.getRepository(User);
		await adminRepository.save(
			adminRepository.create({
				email: adminEmail,
				passwordHash: await bcrypt.hash('admin-pass-123', 4),
				role: 'admin',
			}),
		);
		const adminAgent = request.agent(server);
		const adminCsrf = await getCsrfToken(adminAgent);
		await mutation(adminAgent, adminCsrf)
			.post(`${api}/auth/login`)
			.send({ email: adminEmail, password: 'admin-pass-123' })
			.expect(200);

		const studentAgent = request.agent(server);
		const studentCsrf = await getCsrfToken(studentAgent);
		await mutation(studentAgent, studentCsrf)
			.post(`${api}/auth/register`)
			.send({
				email: `recommendation-student-${randomUUID()}@example.test`,
				password: 'student-pass-123',
			})
			.expect(201);
		const recommendationPath = `${api}/me/profile/course-recommendations`;
		await mutation(studentAgent, studentCsrf)
			.post(recommendationPath)
			.send({})
			.expect(422)
			.expect((response) =>
				expect(response.body).toMatchObject({ code: 'CURRICULUM_NOT_SELECTED' }),
			);

		const curriculumResponse = await mutation(adminAgent, adminCsrf)
			.post(`${api}/admin/curricula`)
			.send({
				name: `Recommendation curriculum ${randomUUID().slice(0, 8)}`,
				source: {
					documentName: 'E2E source',
					reference: 'https://example.test/e2e',
					version: '1',
					verifiedAt: '2026-10-05',
				},
				recommendationSettings: {
					totalCreditsTarget: 6,
					minimumSemesterCredits: 3,
					maximumSemesterCredits: 6,
				},
			})
			.expect(201);
		const curriculumId = responseData<{ id: string }>(curriculumResponse).id;
		const profileResponse = await mutation(studentAgent, studentCsrf)
			.put(`${api}/me/profile`)
			.send({ curriculumId })
			.expect(200);
		const profileId = responseData<{ id: string; displayName: string | null }>(
			profileResponse,
		).id;
		expect(
			responseData<{ displayName: string | null }>(profileResponse).displayName,
		).toBeNull();
		await adminAgent
			.post(recommendationPath)
			.set('Origin', origin)
			.set('X-CSRF-Token', adminCsrf)
			.send({})
			.expect(403);
		await studentAgent
			.post(recommendationPath)
			.set('Origin', origin)
			.send({})
			.expect(403);

		await mutation(studentAgent, studentCsrf)
			.post(recommendationPath)
			.send({})
			.expect(422)
			.expect((response) =>
				expect(response.body).toMatchObject({
					code: 'CURRICULUM_HAS_NO_TERMS',
				}),
			);
		const termResponse = await mutation(adminAgent, adminCsrf)
			.post(`${api}/admin/curricula/${curriculumId}/terms`)
			.send({ code: 'T1', name: 'Term 1', sortOrder: 0 })
			.expect(201);
		const termId = responseData<{ id: string }>(termResponse).id;
		await mutation(studentAgent, studentCsrf)
			.post(recommendationPath)
			.send({})
			.expect(422)
			.expect((response) =>
				expect(response.body).toMatchObject({
					code: 'CURRICULUM_HAS_NO_COURSES',
				}),
			);

		const firstCourseResponse = await mutation(adminAgent, adminCsrf)
			.post(`${api}/admin/curricula/${curriculumId}/courses`)
			.send({
				code: 'REC101',
				name: 'Recommendation prerequisite',
				credits: 3,
				termId,
				requirementType: 'required',
				recommendationPriority: 0,
			})
			.expect(201);
		const firstCourseId = responseData<{ id: string }>(firstCourseResponse).id;
		const secondCourseResponse = await mutation(adminAgent, adminCsrf)
			.post(`${api}/admin/curricula/${curriculumId}/courses`)
			.send({
				code: 'REC102',
				name: 'Recommendation target',
				credits: 3,
				termId,
				requirementType: 'required',
				recommendationPriority: 1,
			})
			.expect(201);
		const secondCourseId = responseData<{ id: string }>(secondCourseResponse).id;
		await mutation(adminAgent, adminCsrf)
			.post(`${api}/admin/curricula/${curriculumId}/courses/${secondCourseId}/rules`)
			.send({
				type: 'prerequisite',
				prerequisiteCourseId: firstCourseId,
			})
			.expect(201);

		const analysisRuns = dataSource.getRepository(AnalysisRun);
		const courseStatuses = dataSource.getRepository(StudentCourseStatus);
		const runsBefore = await analysisRuns.count({ where: { profileId } });
		const statusesBefore = await courseStatuses.find({ where: { profileId } });
		const recommendation = await mutation(studentAgent, studentCsrf)
			.post(recommendationPath)
			.send({})
			.expect(200);
		const recommendationData = responseData<{
			status: string;
			progress: {
				accumulatedCredits: number;
				totalCreditsTarget: number;
				averageCreditsPerTerm: number;
				minimumSemesterCredits: number;
				maximumSemesterCredits: number;
				effectiveTarget: number;
			};
			recommendedCourses: Array<{ course: { code: string }; eligible: boolean }>;
			deferredRequiredCourses: Array<{
				course: { code: string };
				reason: string;
				eligible: boolean;
			}>;
			summary: { recommendedCredits: number };
			warnings: { effectiveTargetNotReached: boolean };
		}>(recommendation);
		expect(recommendationData.status).toBe('ready');
		expect(recommendationData.recommendedCourses).toMatchObject([
			{ course: { code: 'REC101' }, eligible: true },
		]);
		expect(recommendationData.deferredRequiredCourses).toMatchObject([
			{
				course: { code: 'REC102' },
				reason: 'RULE_NOT_SATISFIED',
				eligible: false,
			},
		]);
		expect(recommendationData.summary.recommendedCredits).toBe(3);
		expect(recommendationData.warnings.effectiveTargetNotReached).toBe(true);
		await mutation(studentAgent, studentCsrf)
			.post(recommendationPath)
			.send({})
			.expect(200)
			.expect((response) =>
				expect(responseData(response)).toEqual(recommendationData),
			);
		expect(await analysisRuns.count({ where: { profileId } })).toBe(runsBefore);
		expect(await courseStatuses.find({ where: { profileId } })).toEqual(
			statusesBefore,
		);

		const otherCurriculumResponse = await mutation(adminAgent, adminCsrf)
			.post(`${api}/admin/curricula`)
			.send({
				name: `Other recommendation curriculum ${randomUUID().slice(0, 8)}`,
				source: {
					documentName: 'Other E2E source',
					reference: 'https://example.test/other-e2e',
					version: '1',
					verifiedAt: '2026-10-05',
				},
				recommendationSettings: {
					totalCreditsTarget: 40,
					minimumSemesterCredits: 8,
					maximumSemesterCredits: 12,
				},
			})
			.expect(201);
		const otherCurriculumId = responseData<{ id: string }>(
			otherCurriculumResponse,
		).id;
		const otherFirstTermResponse = await mutation(adminAgent, adminCsrf)
			.post(`${api}/admin/curricula/${otherCurriculumId}/terms`)
			.send({ code: 'T1', name: 'Other term 1', sortOrder: 0 })
			.expect(201);
		await mutation(adminAgent, adminCsrf)
			.post(`${api}/admin/curricula/${otherCurriculumId}/terms`)
			.send({ code: 'T2', name: 'Other term 2', sortOrder: 1 })
			.expect(201);
		await mutation(adminAgent, adminCsrf)
			.post(`${api}/admin/curricula/${otherCurriculumId}/courses`)
			.send({
				code: 'OTHER101',
				name: 'Other curriculum course',
				credits: 4,
				termId: responseData<{ id: string }>(otherFirstTermResponse).id,
				requirementType: 'required',
				recommendationPriority: 0,
			})
			.expect(201);

		await mutation(studentAgent, studentCsrf)
			.put(`${api}/me/profile`)
			.send({ curriculumId: otherCurriculumId })
			.expect(200);
		const otherRecommendation = await mutation(studentAgent, studentCsrf)
			.post(recommendationPath)
			.send({})
			.expect(200);
		const otherRecommendationData = responseData<{
			progress: typeof recommendationData.progress;
			recommendedCourses: Array<{ course: { code: string } }>;
			summary: { recommendedCredits: number };
		}>(otherRecommendation);
		expect(otherRecommendationData.progress).toEqual({
			accumulatedCredits: 0,
			totalCreditsTarget: 40,
			averageCreditsPerTerm: 20,
			minimumSemesterCredits: 8,
			maximumSemesterCredits: 12,
			effectiveTarget: 12,
		});
		expect(otherRecommendationData.recommendedCourses.map(({ course }) => course.code))
			.toEqual(['OTHER101']);
		expect(otherRecommendationData.summary.recommendedCredits).toBe(4);

		await mutation(studentAgent, studentCsrf)
			.put(`${api}/me/profile`)
			.send({ curriculumId })
			.expect(200);
		const restoredRecommendation = await mutation(studentAgent, studentCsrf)
			.post(recommendationPath)
			.send({})
			.expect(200);
		expect(responseData(restoredRecommendation)).toEqual(recommendationData);
		expect(await analysisRuns.count({ where: { profileId } })).toBe(runsBefore);
		expect(await courseStatuses.find({ where: { profileId } })).toEqual(
			statusesBefore,
		);

		await mutation(studentAgent, studentCsrf)
			.patch(`${api}/me/profile/course-statuses`)
			.send({
				items: [
					{ courseId: firstCourseId, status: 'completed' },
					{ courseId: secondCourseId, status: 'completed' },
				],
			})
			.expect(200);
		const completedRunsBefore = await analysisRuns.count({ where: { profileId } });
		const completedStatusesBefore = await courseStatuses.find({ where: { profileId } });
		const completed = await mutation(studentAgent, studentCsrf)
			.post(recommendationPath)
			.send({})
			.expect(200);
		expect(responseData<{ status: string; estimatedTerm: unknown; recommendedCourses: unknown[] }>(completed))
			.toMatchObject({
				status: 'program_completed',
				estimatedTerm: null,
				recommendedCourses: [],
			});
		expect(await analysisRuns.count({ where: { profileId } })).toBe(completedRunsBefore);
		expect(await courseStatuses.find({ where: { profileId } })).toEqual(
			completedStatusesBefore,
		);
	});

	it('enforces roles and CSRF across admin, profile, status, analysis, and history APIs', async () => {
		const dataSource = app!.get(DataSource);
		const server = app!.getHttpServer() as Server;
		const studentAgent = request.agent(server);
		const studentCsrf = await getCsrfToken(studentAgent);
		const studentRegistration = await mutation(studentAgent, studentCsrf)
			.post(`${api}/auth/register`)
			.send({ email: 'student-e2e@example.test', password: 'student-pass-123' })
			.expect(201);
		expect(
			responseData<{ profile: object }>(studentRegistration).profile,
		).toMatchObject({
			displayName: null,
			curriculumId: null,
		});
		await studentAgent
			.get(`${api}/me`)
			.expect(200)
			.expect((response) =>
				expect(responseData<{ role: string }>(response).role).toBe('student'),
			);
		await studentAgent.get(`${api}/admin/curricula`).expect(403);
		await studentAgent
			.patch(`${api}/me/profile/course-statuses`)
			.set('Origin', origin)
			.send({ items: [] })
			.expect(403);

		const curriculumName = `E2E curriculum ${randomUUID().slice(0, 8)}`;
		const adminEmail = `admin-${randomUUID()}@example.test`;
		const adminRepository = dataSource.getRepository(User);
		await adminRepository.save(
			adminRepository.create({
				email: adminEmail,
				passwordHash: await bcrypt.hash('admin-pass-123', 4),
				role: 'admin',
			}),
		);
		const adminAgent = request.agent(server);
		const adminCsrf = await getCsrfToken(adminAgent);
		await mutation(adminAgent, adminCsrf)
			.post(`${api}/auth/login`)
			.send({ email: adminEmail, password: 'admin-pass-123' })
			.expect(200);

		const curriculumResponse = await mutation(adminAgent, adminCsrf)
			.post(`${api}/admin/curricula`)
			.send({
				name: curriculumName,
				source: {
					documentName: 'E2E source',
					reference: 'https://example.test/e2e',
					version: '1',
					verifiedAt: '2026-10-04',
				},
			})
			.expect(201);
		const curriculumId = responseData<{ id: string }>(curriculumResponse).id;
		await mutation(adminAgent, adminCsrf)
			.patch(`${api}/admin/curricula/${curriculumId}`)
			.send({ name: `${curriculumName} updated` })
			.expect(200);

		const termResponse = await mutation(adminAgent, adminCsrf)
			.post(`${api}/admin/curricula/${curriculumId}/terms`)
			.send({ code: 'T1', name: 'Term 1', sortOrder: 0 })
			.expect(201);
		const termId = responseData<{ id: string }>(termResponse).id;
		const prerequisiteResponse = await mutation(adminAgent, adminCsrf)
			.post(`${api}/admin/curricula/${curriculumId}/courses`)
			.send({
				code: 'E2E101',
				name: 'Prerequisite course',
				credits: 3,
				termId,
				requirementType: 'required',
				recommendationPriority: 0,
			})
			.expect(201);
		const prerequisiteId = responseData<{ id: string }>(
			prerequisiteResponse,
		).id;
		const targetResponse = await mutation(adminAgent, adminCsrf)
			.post(`${api}/admin/curricula/${curriculumId}/courses`)
			.send({
				code: 'E2E102',
				name: 'Target course',
				credits: 3,
				termId,
				requirementType: 'required',
				recommendationPriority: 0,
			})
			.expect(201);
		const targetId = responseData<{ id: string }>(targetResponse).id;
		expect(responseData<{ recommendationPriority: number }>(targetResponse))
			.toHaveProperty('recommendationPriority', 0);
		const updatedTarget = await mutation(adminAgent, adminCsrf)
			.patch(`${api}/admin/curricula/${curriculumId}/courses/${targetId}`)
			.send({ recommendationPriority: 2 })
			.expect(200);
		expect(responseData<{ recommendationPriority: number }>(updatedTarget))
			.toHaveProperty('recommendationPriority', 2);
		const structureResponse = await adminAgent
			.get(`${api}/curricula/${curriculumId}/structure`)
			.expect(200);
		expect(
			responseData<{ courses: Array<{ code: string; recommendationPriority: number }> }>(
				structureResponse,
			).courses.find((course) => course.code === 'E2E102'),
		).toMatchObject({ recommendationPriority: 2 });
		await mutation(adminAgent, adminCsrf)
			.post(`${api}/admin/curricula/${curriculumId}/courses`)
			.send({
				code: 'E2E103',
				name: 'Missing priority',
				credits: 3,
				termId,
				requirementType: 'required',
			})
			.expect(400);
		await mutation(adminAgent, adminCsrf)
			.patch(`${api}/admin/curricula/${curriculumId}/courses/${targetId}`)
			.send({ recommendationPriority: 2147483648 })
			.expect(400);
		await mutation(adminAgent, adminCsrf)
			.post(`${api}/admin/curricula/${curriculumId}/courses`)
			.send({
				code: 'E2E104',
				name: 'Negative priority',
				credits: 3,
				termId,
				requirementType: 'required',
				recommendationPriority: -1,
			})
			.expect(400);
		await mutation(adminAgent, adminCsrf)
			.post(`${api}/admin/curricula/${curriculumId}/courses/${targetId}/rules`)
			.send({ type: 'prerequisite', prerequisiteCourseId: prerequisiteId })
			.expect(201);

		await mutation(studentAgent, studentCsrf)
			.put(`${api}/me/profile`)
			.send({ displayName: 'E2E Student', curriculumId })
			.expect(200);
		const invalidBatch = await mutation(studentAgent, studentCsrf)
			.patch(`${api}/me/profile/course-statuses`)
			.send({
				items: [
					{ courseId: prerequisiteId, status: 'completed' },
					{ courseId: randomUUID(), status: 'completed' },
				],
			})
			.expect(422);
		expect((invalidBatch.body as { error: boolean }).error).toBe(true);

		const firstAnalysis = await mutation(studentAgent, studentCsrf)
			.post(`${api}/me/profile/analyses`)
			.send({})
			.expect(201);
		const firstAnalysisData = responseData<{
			id: string;
			courseResults: AnalysisCourseResult[];
		}>(firstAnalysis);
		const firstAnalysisId = firstAnalysisData.id;
		const blockedCourse = firstAnalysisData.courseResults.find(
			(result) => result.course.code === 'E2E102',
		);
		expect(blockedCourse?.eligible).toBe(false);
		expect(blockedCourse?.reasons[0]?.passed).toBe(false);

		await mutation(studentAgent, studentCsrf)
			.patch(`${api}/me/profile/course-statuses`)
			.send({
				items: [{ courseId: prerequisiteId, status: 'completed' }],
			})
			.expect(200);
		const secondAnalysis = await mutation(studentAgent, studentCsrf)
			.post(`${api}/me/profile/analyses`)
			.send({})
			.expect(201);
		const secondAnalysisData = responseData<{
			courseResults: AnalysisCourseResult[];
		}>(secondAnalysis);
		const eligibleCourse = secondAnalysisData.courseResults.find(
			(result) => result.course.code === 'E2E102',
		);
		expect(eligibleCourse?.eligible).toBe(true);

		const oldSnapshot = await studentAgent
			.get(`${api}/me/profile/analyses/${firstAnalysisId}`)
			.expect(200);
		expect(
			responseData<{ courseResults: AnalysisCourseResult[] }>(oldSnapshot)
				.courseResults,
		).toEqual(firstAnalysisData.courseResults);
		await studentAgent
			.get(`${api}/me/profile/analyses`)
			.expect(200)
			.expect((response) =>
				expect(responseData<{ items: unknown[] }>(response).items).toHaveLength(
					2,
				),
			);

		const otherAgent = request.agent(server);
		const otherCsrf = await getCsrfToken(otherAgent);
		await mutation(otherAgent, otherCsrf)
			.post(`${api}/auth/register`)
			.send({ email: 'other-e2e@example.test', password: 'other-pass-123' })
			.expect(201);
		await otherAgent.get(`${api}/me`).expect(200);
		await otherAgent
			.get(`${api}/me/profile/analyses/${firstAnalysisId}`)
			.expect(404);
	});
});
