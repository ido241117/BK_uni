import {
	ConflictException,
	Injectable,
	NotFoundException,
	UnprocessableEntityException,
} from '@nestjs/common';
import { In, Repository } from 'typeorm';
import { DataSource } from 'typeorm';
import { Course } from './course.entity';
import { CourseRule } from './course-rule.entity';
import { Curriculum } from './curriculum.entity';
import { CurriculumTerm } from './curriculum-term.entity';
import { ElectiveGroup } from './elective-group.entity';
import { StudentCourseStatus } from '../users/student-course-status.entity';
import { StudentProfile } from '../users/student-profile.entity';
import { User } from '../users/user.entity';
import {
	CreateCourseDto,
	CreateCourseRuleDto,
	CourseListQueryDto,
	CreateCurriculumDto,
	CreateElectiveGroupDto,
	CreateTermDto,
	ListCurriculaQueryDto,
	UpdateCourseDto,
	UpdateCourseRuleDto,
	UpdateCurriculumDto,
	UpdateElectiveGroupDto,
	UpdateTermDto,
} from './curriculum.dto';

type SourceInput = {
	documentName: string;
	reference: string;
	version: string;
	verifiedAt: string;
};

type RecommendationSettingsInput = {
	totalCreditsTarget?: number;
	minimumSemesterCredits?: number;
	maximumSemesterCredits?: number;
} | null;

type RecommendationSettingsValues = {
	totalCreditsTarget: number;
	minimumSemesterCredits: number;
	maximumSemesterCredits: number;
};

@Injectable()
export class CurriculumService {
	constructor(private readonly dataSource: DataSource) { }

	private repo<T extends object>(entity: new () => T): Repository<T> {
		return this.dataSource.getRepository(entity);
	}

	private notFound() {
		return new NotFoundException({
			message: 'Không tìm thấy dữ liệu yêu cầu.',
			code: 'NOT_FOUND',
		});
	}

	private conflict(message: string, code = 'CONFLICT') {
		return new ConflictException({ message, code });
	}

	private async ensureCurriculum(curriculumId: string) {
		const curriculum = await this.repo(Curriculum).findOne({
			where: { id: curriculumId },
		});
		if (!curriculum) throw this.notFound();
		return curriculum;
	}

	private normalizeSource(source: SourceInput) {
		return {
			sourceDocumentName: this.requiredText(
				source.documentName,
				'Tên tài liệu nguồn',
			),
			sourceReference: this.requiredText(source.reference, 'Nguồn tham chiếu'),
			sourceVersion: this.requiredText(source.version, 'Phiên bản nguồn'),
			sourceVerifiedAt: source.verifiedAt,
		};
	}

	private requiredText(value: string, label: string) {
		const trimmed = value.trim();
		if (!trimmed) {
			throw new UnprocessableEntityException({
				message: `${label} không được để trống.`,
				code: 'BUSINESS_RULE_VIOLATION',
			});
		}
		return trimmed;
	}

	private curriculumRepresentation(curriculum: Curriculum, courseCount = 0) {
		return {
			id: curriculum.id,
			name: curriculum.name,
			description: curriculum.description,
			recommendationSettings:
				curriculum.totalCreditsTarget == null ||
					curriculum.minimumSemesterCredits == null ||
					curriculum.maximumSemesterCredits == null
					? null
					: {
						totalCreditsTarget: Number(curriculum.totalCreditsTarget),
						minimumSemesterCredits: Number(
							curriculum.minimumSemesterCredits,
						),
						maximumSemesterCredits: Number(
							curriculum.maximumSemesterCredits,
						),
					},
			source: {
				documentName: curriculum.sourceDocumentName,
				reference: curriculum.sourceReference,
				version: curriculum.sourceVersion,
				verifiedAt: curriculum.sourceVerifiedAt,
			},
			courseCount,
		};
	}

	private resolveRecommendationSettings(
		settings: RecommendationSettingsInput | undefined,
		current?: Curriculum,
	): RecommendationSettingsValues | null | undefined {
		if (settings === undefined) return undefined;
		if (settings === null) return null;

		const resolve = (
			value: number | undefined,
			previous: string | null | undefined,
		) => (value === undefined && previous != null ? Number(previous) : value);
		const totalCreditsTarget = resolve(
			settings.totalCreditsTarget,
			current?.totalCreditsTarget,
		);
		const minimumSemesterCredits = resolve(
			settings.minimumSemesterCredits,
			current?.minimumSemesterCredits,
		);
		const maximumSemesterCredits = resolve(
			settings.maximumSemesterCredits,
			current?.maximumSemesterCredits,
		);

		if (
			typeof totalCreditsTarget !== 'number' ||
			typeof minimumSemesterCredits !== 'number' ||
			typeof maximumSemesterCredits !== 'number' ||
			!Number.isFinite(totalCreditsTarget) ||
			!Number.isFinite(minimumSemesterCredits) ||
			!Number.isFinite(maximumSemesterCredits) ||
			totalCreditsTarget <= 0 ||
			totalCreditsTarget > 99999.99 ||
			minimumSemesterCredits < 0 ||
			minimumSemesterCredits > 999.99 ||
			maximumSemesterCredits <= 0 ||
			maximumSemesterCredits > 999.99 ||
			minimumSemesterCredits > maximumSemesterCredits
		) {
			throw new UnprocessableEntityException({
				message: 'Cấu hình tín chỉ gợi ý không hợp lệ.',
				code: 'BUSINESS_RULE_VIOLATION',
			});
		}

		return {
			totalCreditsTarget,
			minimumSemesterCredits,
			maximumSemesterCredits,
		};
	}

	private termRepresentation(term: CurriculumTerm) {
		return {
			id: term.id,
			code: term.termCode,
			name: term.name,
			sortOrder: term.sortOrder,
		};
	}

	private groupRepresentation(group: ElectiveGroup) {
		return {
			id: group.id,
			name: group.name,
			requiredCredits:
				group.requiredCredits === null ? null : Number(group.requiredCredits),
			requiredCourses: group.requiredCourses,
			sortOrder: group.sortOrder,
		};
	}

	private async saveOrConflict<T extends object>(
		repository: Repository<T>,
		entity: T,
		constraintCode?: string,
	): Promise<T> {
		try {
			return await repository.save(entity);
		} catch (error) {
			const driverError =
				typeof error === 'object' && error !== null && 'driverError' in error
					? (error as { driverError?: { code?: string } }).driverError
					: undefined;
			if (driverError?.code === '23505') {
				throw this.conflict(
					'Giá trị đã tồn tại trong chương trình.',
					constraintCode,
				);
			}
			throw error;
		}
	}

	async listAdmin(query: ListCurriculaQueryDto) {
		const qb = this.repo(Curriculum)
			.createQueryBuilder('curriculum')
			.loadRelationCountAndMap('curriculum.courseCount', 'curriculum.courses')
			.orderBy('curriculum.name', 'ASC')
			.skip(query.offset)
			.take(query.limit);
		if (query.q?.trim()) {
			qb.andWhere('lower(curriculum.name) LIKE lower(:q)', {
				q: `%${query.q.trim()}%`,
			});
		}
		const [items, total] = await qb.getManyAndCount();
		return {
			items: items.map((item) =>
				this.curriculumRepresentation(
					item,
					Number(
						(item as Curriculum & { courseCount?: number }).courseCount ?? 0,
					),
				),
			),
			page: { limit: query.limit, offset: query.offset, total },
		};
	}

	async getCurriculum(curriculumId: string) {
		const item = await this.ensureCurriculum(curriculumId);
		return this.curriculumRepresentation(item);
	}

	async getStructure(curriculumId: string, user: User) {
		const curriculum = await this.getCurriculum(curriculumId);
		if (user.role === 'student') {
			const profile = await this.repo(StudentProfile).findOne({
				where: { userId: user.id },
			});
			if (!profile || profile.curriculumId !== curriculumId) {
				throw new UnprocessableEntityException({
					message: 'Chỉ có thể xem cấu trúc chương trình đã chọn trong hồ sơ.',
					code: 'CURRICULUM_NOT_SELECTED',
				});
			}
		}
		const [terms, groups, courses] = await Promise.all([
			this.repo(CurriculumTerm).find({
				where: { curriculumId },
				order: { sortOrder: 'ASC', termCode: 'ASC' },
			}),
			this.repo(ElectiveGroup).find({
				where: { curriculumId },
				order: { sortOrder: 'ASC', name: 'ASC' },
			}),
			this.repo(Course).find({
				where: { curriculumId },
				relations: { term: true, electiveGroup: true },
				order: { courseCode: 'ASC' },
			}),
		]);
		return {
			curriculum,
			terms: terms.map((term) => ({
				id: term.id,
				code: term.termCode,
				name: term.name,
				sortOrder: term.sortOrder,
			})),
			electiveGroups: groups.map((group) => ({
				id: group.id,
				name: group.name,
				requiredCredits:
					group.requiredCredits === null ? null : Number(group.requiredCredits),
				requiredCourses: group.requiredCourses,
				sortOrder: group.sortOrder,
			})),
			courses: courses.map((course) => ({
				id: course.id,
				code: course.courseCode,
				version: course.courseVersion,
				name: course.name,
				nameEn: course.nameEn,
				credits: Number(course.credits),
				recommendationPriority: course.recommendationPriority,
				term: {
					id: course.term.id,
					code: course.term.termCode,
					name: course.term.name,
					sortOrder: course.term.sortOrder,
				},
				requirementType: course.requirementType,
				electiveGroup: course.electiveGroup
					? { id: course.electiveGroup.id, name: course.electiveGroup.name }
					: null,
			})),
		};
	}

	async listCourses(
		curriculumId: string,
		query: CourseListQueryDto,
		user: User,
	) {
		await this.ensureCurriculum(curriculumId);
		let profile: StudentProfile | null = null;
		if (user.role === 'student') {
			profile = await this.repo(StudentProfile).findOne({
				where: { userId: user.id },
			});
			if (!profile || profile.curriculumId !== curriculumId) {
				throw new UnprocessableEntityException({
					message: 'Chỉ có thể xem môn thuộc chương trình đã chọn trong hồ sơ.',
					code: 'CURRICULUM_NOT_SELECTED',
				});
			}
		}
		const qb = this.repo(Course)
			.createQueryBuilder('course')
			.leftJoinAndSelect('course.term', 'term')
			.leftJoinAndSelect('course.electiveGroup', 'electiveGroup')
			.where('course.curriculum_id = :curriculumId', { curriculumId })
			.orderBy('term.sort_order', 'ASC')
			.addOrderBy('course.course_code', 'ASC')
			.skip(query.offset)
			.take(query.limit);
		if (query.q?.trim()) {
			qb.andWhere(
				'(lower(course.course_code) LIKE lower(:q) OR lower(course.name) LIKE lower(:q))',
				{
					q: `%${query.q.trim()}%`,
				},
			);
		}
		if (query.termId)
			qb.andWhere('course.term_id = :termId', { termId: query.termId });
		if (query.requirementType)
			qb.andWhere('course.requirement_type = :requirementType', {
				requirementType: query.requirementType,
			});
		const [rows, total] = await qb.getManyAndCount();
		const statuses =
			profile && rows.length
				? await this.repo(StudentCourseStatus).find({
					where: {
						profileId: profile.id,
						curriculumId,
						courseId: In(rows.map((course) => course.id)),
					},
				})
				: [];
		const statusByCourseId = new Map(
			statuses.map((item) => [item.courseId, item.status]),
		);
		return {
			items: rows.map((course) => ({
				id: course.id,
				code: course.courseCode,
				version: course.courseVersion,
				name: course.name,
				nameEn: course.nameEn,
				credits: Number(course.credits),
				recommendationPriority: course.recommendationPriority,
				term: {
					id: course.term.id,
					code: course.term.termCode,
					name: course.term.name,
				},
				requirementType: course.requirementType,
				electiveGroup: course.electiveGroup
					? { id: course.electiveGroup.id, name: course.electiveGroup.name }
					: null,
				status: statusByCourseId.get(course.id) ?? 'not_started',
			})),
			page: { limit: query.limit, offset: query.offset, total },
		};
	}

	async createCurriculum(adminId: string, input: CreateCurriculumDto) {
		const recommendationSettings = this.resolveRecommendationSettings(
			input.recommendationSettings,
		);
		const curriculum = this.repo(Curriculum).create({
			name: this.requiredText(input.name, 'Tên chương trình'),
			description: input.description?.trim() || null,
			totalCreditsTarget: recommendationSettings
				? String(recommendationSettings.totalCreditsTarget)
				: null,
			minimumSemesterCredits: recommendationSettings
				? String(recommendationSettings.minimumSemesterCredits)
				: null,
			maximumSemesterCredits: recommendationSettings
				? String(recommendationSettings.maximumSemesterCredits)
				: null,
			createdBy: adminId,
			...this.normalizeSource(input.source),
		});
		const saved = await this.saveOrConflict(
			this.repo(Curriculum),
			curriculum,
			'DUPLICATE_CURRICULUM_NAME',
		);
		return this.curriculumRepresentation(saved);
	}

	async updateCurriculum(curriculumId: string, input: UpdateCurriculumDto) {
		const curriculum = await this.ensureCurriculum(curriculumId);
		if (input.name !== undefined)
			curriculum.name = this.requiredText(input.name, 'Tên chương trình');
		if (input.description !== undefined)
			curriculum.description = input.description?.trim() || null;
		if (input.source)
			Object.assign(curriculum, this.normalizeSource(input.source));
		const recommendationSettings = this.resolveRecommendationSettings(
			input.recommendationSettings,
			curriculum,
		);
		if (recommendationSettings === null) {
			curriculum.totalCreditsTarget = null;
			curriculum.minimumSemesterCredits = null;
			curriculum.maximumSemesterCredits = null;
		} else if (recommendationSettings !== undefined) {
			curriculum.totalCreditsTarget = String(
				recommendationSettings.totalCreditsTarget,
			);
			curriculum.minimumSemesterCredits = String(
				recommendationSettings.minimumSemesterCredits,
			);
			curriculum.maximumSemesterCredits = String(
				recommendationSettings.maximumSemesterCredits,
			);
		}
		const saved = await this.saveOrConflict(
			this.repo(Curriculum),
			curriculum,
			'DUPLICATE_CURRICULUM_NAME',
		);
		return this.curriculumRepresentation(saved);
	}

	async createTerm(curriculumId: string, input: CreateTermDto) {
		await this.ensureCurriculum(curriculumId);
		const term = this.repo(CurriculumTerm).create({
			curriculumId,
			termCode: this.requiredText(input.code, 'Mã học kỳ'),
			name: this.requiredText(input.name, 'Tên học kỳ'),
			sortOrder: input.sortOrder,
		});
		return this.termRepresentation(
			await this.saveOrConflict(this.repo(CurriculumTerm), term),
		);
	}

	async updateTerm(curriculumId: string, termId: string, input: UpdateTermDto) {
		const repository = this.repo(CurriculumTerm);
		const term = await repository.findOne({
			where: { id: termId, curriculumId },
		});
		if (!term) throw this.notFound();
		if (input.code !== undefined)
			term.termCode = this.requiredText(input.code, 'Mã học kỳ');
		if (input.name !== undefined)
			term.name = this.requiredText(input.name, 'Tên học kỳ');
		if (input.sortOrder !== undefined) term.sortOrder = input.sortOrder;
		return this.termRepresentation(await this.saveOrConflict(repository, term));
	}

	async deleteTerm(curriculumId: string, termId: string) {
		const term = await this.repo(CurriculumTerm).findOne({
			where: { id: termId, curriculumId },
		});
		if (!term) throw this.notFound();
		const references = await this.repo(Course).count({
			where: { curriculumId, termId },
		});
		if (references)
			throw this.conflict(
				'Không thể gỡ học kỳ đang có môn hoạt động tham chiếu.',
			);
		await this.repo(CurriculumTerm).softDelete({ id: termId, curriculumId });
	}

	private assertGroupThresholds(
		credits: number | null | undefined,
		courses: number | null | undefined,
	) {
		if (credits == null && courses == null) {
			throw new UnprocessableEntityException({
				message: 'Nhóm tự chọn cần ít nhất một ngưỡng tín chỉ hoặc số môn.',
				code: 'BUSINESS_RULE_VIOLATION',
			});
		}
	}

	async createElectiveGroup(
		curriculumId: string,
		input: CreateElectiveGroupDto,
	) {
		await this.ensureCurriculum(curriculumId);
		this.assertGroupThresholds(input.requiredCredits, input.requiredCourses);
		const group = this.repo(ElectiveGroup).create({
			curriculumId,
			name: this.requiredText(input.name, 'Tên nhóm tự chọn'),
			sortOrder: input.sortOrder,
			requiredCredits:
				input.requiredCredits == null ? null : String(input.requiredCredits),
			requiredCourses: input.requiredCourses ?? null,
		});
		return this.groupRepresentation(
			await this.saveOrConflict(this.repo(ElectiveGroup), group),
		);
	}

	async updateElectiveGroup(
		curriculumId: string,
		groupId: string,
		input: UpdateElectiveGroupDto,
	) {
		const repository = this.repo(ElectiveGroup);
		const group = await repository.findOne({
			where: { id: groupId, curriculumId },
		});
		if (!group) throw this.notFound();
		const credits =
			input.requiredCredits === undefined
				? group.requiredCredits == null
					? null
					: Number(group.requiredCredits)
				: input.requiredCredits;
		const courses =
			input.requiredCourses === undefined
				? group.requiredCourses
				: input.requiredCourses;
		this.assertGroupThresholds(credits, courses);
		if (input.name !== undefined)
			group.name = this.requiredText(input.name, 'Tên nhóm tự chọn');
		if (input.sortOrder !== undefined) group.sortOrder = input.sortOrder;
		group.requiredCredits = credits == null ? null : String(credits);
		group.requiredCourses = courses ?? null;
		return this.groupRepresentation(
			await this.saveOrConflict(repository, group),
		);
	}

	async deleteElectiveGroup(curriculumId: string, groupId: string) {
		const group = await this.repo(ElectiveGroup).findOne({
			where: { id: groupId, curriculumId },
		});
		if (!group) throw this.notFound();
		const references = await this.repo(Course).count({
			where: { curriculumId, electiveGroupId: groupId },
		});
		if (references)
			throw this.conflict(
				'Không thể gỡ nhóm đang có môn hoạt động tham chiếu.',
			);
		await this.repo(ElectiveGroup).softDelete({ id: groupId, curriculumId });
	}

	private async assertCourseReferences(
		curriculumId: string,
		input: {
			termId: string;
			requirementType: 'required' | 'elective';
			electiveGroupId?: string | null;
		},
	) {
		const term = await this.repo(CurriculumTerm).findOne({
			where: { id: input.termId, curriculumId },
		});
		if (!term)
			throw new UnprocessableEntityException({
				message: 'Học kỳ không thuộc chương trình hoặc đã bị gỡ.',
				code: 'BUSINESS_RULE_VIOLATION',
			});
		if (input.requirementType === 'required' && input.electiveGroupId) {
			throw new UnprocessableEntityException({
				message: 'Môn bắt buộc không được thuộc nhóm tự chọn.',
				code: 'BUSINESS_RULE_VIOLATION',
			});
		}
		if (input.requirementType === 'elective') {
			if (!input.electiveGroupId)
				throw new UnprocessableEntityException({
					message: 'Môn tự chọn phải thuộc một nhóm tự chọn.',
					code: 'BUSINESS_RULE_VIOLATION',
				});
			const group = await this.repo(ElectiveGroup).findOne({
				where: { id: input.electiveGroupId, curriculumId },
			});
			if (!group)
				throw new UnprocessableEntityException({
					message: 'Nhóm tự chọn không thuộc chương trình hoặc đã bị gỡ.',
					code: 'BUSINESS_RULE_VIOLATION',
				});
		}
	}

	async createCourse(curriculumId: string, input: CreateCourseDto) {
		await this.ensureCurriculum(curriculumId);
		await this.assertCourseReferences(curriculumId, input);
		const course = this.repo(Course).create({
			curriculumId,
			courseCode: this.requiredText(input.code, 'Mã môn'),
			courseVersion: input.version
				? this.requiredText(input.version, 'Phiên bản môn')
				: '1',
			name: this.requiredText(input.name, 'Tên học phần'),
			nameEn: input.nameEn?.trim() || null,
			credits: String(input.credits),
			termId: input.termId,
			requirementType: input.requirementType,
			electiveGroupId:
				input.requirementType === 'elective'
					? (input.electiveGroupId ?? null)
					: null,
			recommendationPriority: input.recommendationPriority,
		});
		const saved = await this.saveOrConflict(
			this.repo(Course),
			course,
			'DUPLICATE_COURSE_IDENTITY',
		);
		return this.loadCourseRepresentation(saved);
	}

	async updateCourse(
		curriculumId: string,
		courseId: string,
		input: UpdateCourseDto,
	) {
		const repository = this.repo(Course);
		const course = await repository.findOne({
			where: { id: courseId, curriculumId },
		});
		if (!course) throw this.notFound();
		const code =
			input.code === undefined
				? course.courseCode
				: this.requiredText(input.code, 'Mã môn');
		const version =
			input.version === undefined
				? course.courseVersion
				: this.requiredText(input.version, 'Phiên bản môn');
		if (code !== course.courseCode || version !== course.courseVersion) {
			const referenced = await this.repo(CourseRule).count({
				where: [
					{ curriculumId, targetCourseId: courseId },
					{ curriculumId, prerequisiteCourseId: courseId },
				],
			});
			if (referenced)
				throw this.conflict(
					'Mã/version đã được rule tham chiếu; hãy tạo version mới.',
					'COURSE_IN_USE',
				);
		}
		const requirementType = input.requirementType ?? course.requirementType;
		const electiveGroupId =
			input.electiveGroupId === undefined
				? course.electiveGroupId
				: input.electiveGroupId;
		await this.assertCourseReferences(curriculumId, {
			termId: input.termId ?? course.termId,
			requirementType,
			electiveGroupId,
		});
		course.courseCode = code;
		course.courseVersion = version;
		if (input.name !== undefined)
			course.name = this.requiredText(input.name, 'Tên học phần');
		if (input.nameEn !== undefined)
			course.nameEn = input.nameEn?.trim() || null;
		if (input.credits !== undefined) course.credits = String(input.credits);
		course.termId = input.termId ?? course.termId;
		course.requirementType = requirementType;
		course.electiveGroupId =
			requirementType === 'elective' ? (electiveGroupId ?? null) : null;
		if (input.recommendationPriority !== undefined)
			course.recommendationPriority = input.recommendationPriority;
		const saved = await this.saveOrConflict(
			repository,
			course,
			'DUPLICATE_COURSE_IDENTITY',
		);
		return this.loadCourseRepresentation(saved);
	}

	private async loadCourseRepresentation(course: Course) {
		const [term, group] = await Promise.all([
			this.repo(CurriculumTerm).findOne({
				where: { id: course.termId, curriculumId: course.curriculumId },
			}),
			course.electiveGroupId
				? this.repo(ElectiveGroup).findOne({
					where: {
						id: course.electiveGroupId,
						curriculumId: course.curriculumId,
					},
				})
				: Promise.resolve(null),
		]);
		if (!term) throw this.notFound();
		return {
			id: course.id,
			code: course.courseCode,
			version: course.courseVersion,
			name: course.name,
			nameEn: course.nameEn,
			credits: Number(course.credits),
			recommendationPriority: course.recommendationPriority,
			termId: course.termId,
			requirementType: course.requirementType,
			electiveGroupId: course.electiveGroupId,
			term: this.termRepresentation(term),
			electiveGroup: group ? { id: group.id, name: group.name } : null,
		};
	}

	async deleteCourse(curriculumId: string, courseId: string) {
		const course = await this.repo(Course).findOne({
			where: { id: courseId, curriculumId },
		});
		if (!course) throw this.notFound();
		const references = await this.repo(CourseRule).count({
			where: [
				{ curriculumId, targetCourseId: courseId },
				{ curriculumId, prerequisiteCourseId: courseId },
			],
		});
		if (references)
			throw this.conflict(
				'Hãy gỡ các ràng buộc đang tham chiếu môn trước.',
				'COURSE_IN_USE',
			);
		await this.repo(Course).softDelete({ id: courseId, curriculumId });
	}

	async listCourseRules(curriculumId: string, courseId: string) {
		await this.ensureCourse(curriculumId, courseId);
		const rules = await this.repo(CourseRule).find({
			where: { curriculumId, targetCourseId: courseId },
			order: { createdAt: 'ASC' },
		});
		return rules.map((rule) => this.ruleRepresentation(rule));
	}

	private ruleRepresentation(rule: CourseRule) {
		const hasSource = rule.sourceDocumentName !== null;
		return {
			id: rule.id,
			type: rule.ruleType,
			prerequisiteCourseId: rule.prerequisiteCourseId,
			minimumCredits:
				rule.minimumCredits === null ? null : Number(rule.minimumCredits),
			source: hasSource
				? {
					documentName: rule.sourceDocumentName,
					reference: rule.sourceReference,
					version: rule.sourceVersion,
					verifiedAt: rule.sourceVerifiedAt,
				}
				: null,
		};
	}

	private async ensureCourse(curriculumId: string, courseId: string) {
		const course = await this.repo(Course).findOne({
			where: { curriculumId, id: courseId },
		});
		if (!course) throw this.notFound();
		return course;
	}

	private assertRuleShape(input: CreateCourseRuleDto | UpdateCourseRuleDto) {
		const hasPrerequisite = Boolean(input.prerequisiteCourseId);
		const hasMinimumCredits = input.minimumCredits !== undefined;
		if (
			(input.type === 'prerequisite' &&
				(!hasPrerequisite || hasMinimumCredits)) ||
			(input.type === 'minimum_credits' &&
				(hasPrerequisite || !hasMinimumCredits)) ||
			!input.type ||
			!['prerequisite', 'minimum_credits'].includes(input.type)
		) {
			throw new UnprocessableEntityException({
				message: 'Các trường của ràng buộc không khớp loại rule.',
				code: 'BUSINESS_RULE_VIOLATION',
			});
		}
	}

	async createCourseRule(
		curriculumId: string,
		courseId: string,
		input: CreateCourseRuleDto,
	) {
		await this.ensureCourse(curriculumId, courseId);
		this.assertRuleShape(input);
		if (input.prerequisiteCourseId) {
			if (input.prerequisiteCourseId === courseId)
				throw new UnprocessableEntityException({
					message: 'Môn không thể là tiên quyết của chính nó.',
					code: 'BUSINESS_RULE_VIOLATION',
				});
			await this.ensureCourse(curriculumId, input.prerequisiteCourseId);
		}
		const source = input.source ? this.normalizeSource(input.source) : null;
		const rule = await this.repo(CourseRule).save(
			this.repo(CourseRule).create({
				curriculumId,
				targetCourseId: courseId,
				ruleType: input.type,
				prerequisiteCourseId: input.prerequisiteCourseId ?? null,
				minimumCredits:
					input.minimumCredits === undefined
						? null
						: String(input.minimumCredits),
				sourceDocumentName: source?.sourceDocumentName ?? null,
				sourceReference: source?.sourceReference ?? null,
				sourceVersion: source?.sourceVersion ?? null,
				sourceVerifiedAt: source?.sourceVerifiedAt ?? null,
			}),
		);
		return this.ruleRepresentation(rule);
	}

	async updateCourseRule(
		curriculumId: string,
		courseId: string,
		ruleId: string,
		input: UpdateCourseRuleDto,
	) {
		const repository = this.repo(CourseRule);
		const rule = await repository.findOne({
			where: { id: ruleId, curriculumId, targetCourseId: courseId },
		});
		if (!rule) throw this.notFound();
		const next = {
			type: input.type ?? rule.ruleType,
			prerequisiteCourseId:
				input.prerequisiteCourseId ??
				(input.type ? null : (rule.prerequisiteCourseId ?? undefined)),
			minimumCredits:
				input.minimumCredits ??
				(input.type ? undefined : Number(rule.minimumCredits) || undefined),
		};
		this.assertRuleShape(next as CreateCourseRuleDto);
		if (next.prerequisiteCourseId) {
			if (next.prerequisiteCourseId === courseId)
				throw new UnprocessableEntityException({
					message: 'Môn không thể là tiên quyết của chính nó.',
					code: 'BUSINESS_RULE_VIOLATION',
				});
			await this.ensureCourse(curriculumId, next.prerequisiteCourseId);
		}
		rule.ruleType = next.type;
		rule.prerequisiteCourseId = next.prerequisiteCourseId ?? null;
		rule.minimumCredits =
			next.minimumCredits === undefined ? null : String(next.minimumCredits);
		if (input.source) Object.assign(rule, this.normalizeSource(input.source));
		if (input.source === null) {
			rule.sourceDocumentName = null;
			rule.sourceReference = null;
			rule.sourceVersion = null;
			rule.sourceVerifiedAt = null;
		}
		return this.ruleRepresentation(await repository.save(rule));
	}

	async deleteCourseRule(
		curriculumId: string,
		courseId: string,
		ruleId: string,
	) {
		const rule = await this.repo(CourseRule).findOne({
			where: { id: ruleId, curriculumId, targetCourseId: courseId },
		});
		if (!rule) throw this.notFound();
		await this.repo(CourseRule).softDelete({
			id: ruleId,
			curriculumId,
			targetCourseId: courseId,
		});
	}
}
