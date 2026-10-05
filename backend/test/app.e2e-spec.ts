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
			})
			.expect(201);
		const targetId = responseData<{ id: string }>(targetResponse).id;
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
