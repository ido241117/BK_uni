import {
	AnalysisCourse,
	CourseRuleReason,
	evaluateCourseEligibility,
	StudentCourseStatus,
} from './analysis.engine';

export type RecommendationSettings = {
	totalCreditsTarget: number;
	minimumSemesterCredits: number;
	maximumSemesterCredits: number;
};

export type RecommendationTerm = {
	id: string;
	code: string;
	name: string;
	sortOrder: number;
};

export type RecommendationCourse = Omit<AnalysisCourse, 'status'> & {
	status?: StudentCourseStatus;
	recommendationPriority: number;
};

export type RecommendCoursesInput = {
	settings: RecommendationSettings;
	terms: RecommendationTerm[];
	courses: RecommendationCourse[];
};

export type DeferredRequiredReason =
	'RULE_NOT_SATISFIED' | 'MAX_CREDITS_REACHED' | 'TARGET_REACHED';

export class RecommendationInputError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'RecommendationInputError';
	}
}

const MAX_COURSE_CREDITS = 999.99;
const MAX_TOTAL_CREDITS = 99999.99;
const MAX_MINIMUM_CREDITS = 9999.99;
const MAX_PRIORITY = 2147483647;
const STATUSES: StudentCourseStatus[] = [
	'not_started',
	'in_progress',
	'completed',
];

const countsTowardProgress = (status: StudentCourseStatus) =>
	status === 'in_progress' || status === 'completed';

function assertDecimalRange(
	value: number,
	field: string,
	minimum: number,
	maximum: number,
) {
	const cents = Math.round(value * 100);
	if (
		!Number.isFinite(value) ||
		value < minimum ||
		value > maximum ||
		!Number.isSafeInteger(cents) ||
		Math.abs(value * 100 - cents) > 1e-7
	) {
		throw new RecommendationInputError(`${field} is outside its valid range.`);
	}
}

function assertSettings(settings: RecommendationSettings) {
	if (!settings || typeof settings !== 'object') {
		throw new RecommendationInputError('Recommendation settings are required.');
	}
	assertDecimalRange(
		settings.totalCreditsTarget,
		'totalCreditsTarget',
		0.01,
		MAX_TOTAL_CREDITS,
	);
	assertDecimalRange(
		settings.minimumSemesterCredits,
		'minimumSemesterCredits',
		0,
		MAX_COURSE_CREDITS,
	);
	assertDecimalRange(
		settings.maximumSemesterCredits,
		'maximumSemesterCredits',
		0.01,
		MAX_COURSE_CREDITS,
	);
	if (settings.minimumSemesterCredits > settings.maximumSemesterCredits) {
		throw new RecommendationInputError(
			'minimumSemesterCredits cannot exceed maximumSemesterCredits.',
		);
	}
}

function assertTerms(terms: RecommendationTerm[]) {
	if (!Array.isArray(terms) || terms.length === 0) {
		throw new RecommendationInputError('At least one active term is required.');
	}
	const ids = new Set<string>();
	const sortOrders = new Set<number>();
	for (const term of terms) {
		if (
			!term ||
			typeof term.id !== 'string' ||
			typeof term.code !== 'string' ||
			typeof term.name !== 'string' ||
			!term.id.trim() ||
			!term.code.trim() ||
			!term.name.trim()
		) {
			throw new RecommendationInputError(
				'Active terms need an id, code, and name.',
			);
		}
		if (
			!Number.isInteger(term.sortOrder) ||
			term.sortOrder < 0 ||
			term.sortOrder > MAX_PRIORITY
		) {
			throw new RecommendationInputError(
				'Term sortOrder must be a non-negative integer.',
			);
		}
		if (ids.has(term.id) || sortOrders.has(term.sortOrder)) {
			throw new RecommendationInputError(
				'Active term ids and sortOrder values must be unique.',
			);
		}
		ids.add(term.id);
		sortOrders.add(term.sortOrder);
	}
}

type NormalizedRecommendationCourse = RecommendationCourse & {
	status: StudentCourseStatus;
};

function normalizeCourses(
	courses: RecommendationCourse[],
): NormalizedRecommendationCourse[] {
	if (!Array.isArray(courses)) {
		throw new RecommendationInputError('courses must be an array.');
	}
	const ids = new Set<string>();
	const identities = new Set<string>();
	return courses.map((course) => {
		if (
			!course ||
			typeof course.id !== 'string' ||
			typeof course.code !== 'string' ||
			typeof course.version !== 'string' ||
			!course.id.trim() ||
			!course.code.trim() ||
			!course.version.trim()
		) {
			throw new RecommendationInputError(
				'Courses need an id, code, and version.',
			);
		}
		if (ids.has(course.id)) {
			throw new RecommendationInputError('Course ids must be unique.');
		}
		const identity = `${course.code}\u0000${course.version}`;
		if (identities.has(identity)) {
			throw new RecommendationInputError(
				'Course code and version pairs must be unique.',
			);
		}
		ids.add(course.id);
		identities.add(identity);
		assertDecimalRange(course.credits, 'credits', 0, MAX_COURSE_CREDITS);
		if (
			!Number.isInteger(course.recommendationPriority) ||
			course.recommendationPriority < 0 ||
			course.recommendationPriority > MAX_PRIORITY
		) {
			throw new RecommendationInputError(
				'recommendationPriority must be a non-negative integer.',
			);
		}
		if (!['required', 'elective'].includes(course.requirementType)) {
			throw new RecommendationInputError('Course requirementType is invalid.');
		}
		const status = course.status ?? 'not_started';
		if (!STATUSES.includes(status)) {
			throw new RecommendationInputError('Course status is invalid.');
		}
		if (!Array.isArray(course.rules)) {
			throw new RecommendationInputError('Course rules must be an array.');
		}
		for (const rule of course.rules) {
			if (!rule || typeof rule.id !== 'string' || !rule.id.trim()) {
				throw new RecommendationInputError('Course rules need an id.');
			}
			if (rule.type === 'prerequisite') {
				if (
					typeof rule.prerequisiteCourseId !== 'string' ||
					!rule.prerequisiteCourseId.trim() ||
					rule.minimumCredits !== null
				) {
					throw new RecommendationInputError('Prerequisite rule is invalid.');
				}
			} else if (rule.type === 'minimum_credits') {
				if (rule.prerequisiteCourseId !== null) {
					throw new RecommendationInputError('Minimum-credit rule is invalid.');
				}
				assertDecimalRange(
					rule.minimumCredits as number,
					'minimumCredits',
					0.01,
					MAX_MINIMUM_CREDITS,
				);
			} else {
				throw new RecommendationInputError('Course rule type is invalid.');
			}
		}
		return { ...course, status };
	});
}

const compareText = (left: string, right: string) =>
	left < right ? -1 : left > right ? 1 : 0;

export function recommendCourses(input: RecommendCoursesInput) {
	if (!input || typeof input !== 'object') {
		throw new RecommendationInputError('Recommendation input is required.');
	}
	assertSettings(input.settings);
	assertTerms(input.terms);
	const terms = [...input.terms].sort(
		(left, right) => left.sortOrder - right.sortOrder,
	);
	const courses = normalizeCourses(input.courses);
	const earnedCreditCents = courses.reduce(
		(total, course) =>
			total +
			(countsTowardProgress(course.status)
				? Math.round(course.credits * 100)
				: 0),
		0,
	);
	if (!Number.isSafeInteger(earnedCreditCents)) {
		throw new RecommendationInputError(
			'Accumulated credits exceed the supported range.',
		);
	}
	const accumulatedCredits = earnedCreditCents / 100;
	const averageCreditsPerTerm =
		input.settings.totalCreditsTarget / terms.length;
	const effectiveTarget = Math.min(
		input.settings.maximumSemesterCredits,
		Math.max(averageCreditsPerTerm, input.settings.minimumSemesterCredits),
	);
	const baseResult = {
		progress: {
			accumulatedCredits,
			totalCreditsTarget: input.settings.totalCreditsTarget,
			averageCreditsPerTerm,
			minimumSemesterCredits: input.settings.minimumSemesterCredits,
			maximumSemesterCredits: input.settings.maximumSemesterCredits,
			effectiveTarget,
		},
		summary: { recommendedCredits: 0 },
		recommendedCourses: [] as Array<{
			course: Pick<AnalysisCourse, 'id' | 'code' | 'version' | 'name'>;
			credits: number;
			requirementType: AnalysisCourse['requirementType'];
			recommendationPriority: number;
			reasons: CourseRuleReason[];
		}>,
		deferredRequiredCourses: [] as Array<{
			course: Pick<AnalysisCourse, 'id' | 'code' | 'version' | 'name'>;
			credits: number;
			reason: DeferredRequiredReason;
			reasons: CourseRuleReason[];
		}>,
		warnings: {
			minimumSemesterCreditsNotMet: false,
			effectiveTargetNotReached: false,
			noEligibleCandidates: false,
			noCoursesRecommended: false,
		},
	};

	if (accumulatedCredits >= input.settings.totalCreditsTarget) {
		return {
			status: 'program_completed' as const,
			...baseResult,
			estimatedTerm: null,
		};
	}

	const estimatedTermIndex = Math.min(
		terms.length - 1,
		Math.floor(accumulatedCredits / averageCreditsPerTerm),
	);
	const estimatedTerm = terms[estimatedTermIndex];
	const eligibilityByCourseId = new Map(
		evaluateCourseEligibility(courses).map((result) => [
			result.courseId,
			result,
		]),
	);
	const candidates = courses
		.filter((course) => !countsTowardProgress(course.status))
		.sort((left, right) => {
			const requirementOrder =
				(left.requirementType === 'required' ? 0 : 1) -
				(right.requirementType === 'required' ? 0 : 1);
			return (
				requirementOrder ||
				left.recommendationPriority - right.recommendationPriority ||
				compareText(left.code, right.code) ||
				compareText(left.version, right.version) ||
				compareText(left.id, right.id)
			);
		});
	const maximumCreditCents = Math.round(
		input.settings.maximumSemesterCredits * 100,
	);
	let recommendedCreditCents = 0;
	let eligibleCandidateCount = 0;

	for (const course of candidates) {
		const eligibility = eligibilityByCourseId.get(course.id)!;
		if (eligibility.eligible) eligibleCandidateCount += 1;
		if (!eligibility.eligible) {
			if (course.requirementType === 'required') {
				baseResult.deferredRequiredCourses.push({
					course: {
						id: course.id,
						code: course.code,
						version: course.version,
						name: course.name,
					},
					credits: course.credits,
					reason: 'RULE_NOT_SATISFIED',
					reasons: eligibility.reasons,
				});
			}
			continue;
		}

		const recommendedCredits = recommendedCreditCents / 100;
		if (recommendedCredits + 1e-9 >= effectiveTarget) {
			if (course.requirementType === 'required') {
				baseResult.deferredRequiredCourses.push({
					course: {
						id: course.id,
						code: course.code,
						version: course.version,
						name: course.name,
					},
					credits: course.credits,
					reason: 'TARGET_REACHED',
					reasons: eligibility.reasons,
				});
			}
			continue;
		}

		const courseCreditCents = Math.round(course.credits * 100);
		if (recommendedCreditCents + courseCreditCents > maximumCreditCents) {
			if (course.requirementType === 'required') {
				baseResult.deferredRequiredCourses.push({
					course: {
						id: course.id,
						code: course.code,
						version: course.version,
						name: course.name,
					},
					credits: course.credits,
					reason: 'MAX_CREDITS_REACHED',
					reasons: eligibility.reasons,
				});
			}
			continue;
		}

		recommendedCreditCents += courseCreditCents;
		baseResult.recommendedCourses.push({
			course: {
				id: course.id,
				code: course.code,
				version: course.version,
				name: course.name,
			},
			credits: course.credits,
			requirementType: course.requirementType,
			recommendationPriority: course.recommendationPriority,
			reasons: eligibility.reasons,
		});
	}

	const recommendedCredits = recommendedCreditCents / 100;
	return {
		status: 'ready' as const,
		...baseResult,
		estimatedTerm,
		summary: { recommendedCredits },
		warnings: {
			minimumSemesterCreditsNotMet:
				recommendedCredits + 1e-9 < input.settings.minimumSemesterCredits,
			effectiveTargetNotReached: recommendedCredits + 1e-9 < effectiveTarget,
			noEligibleCandidates: eligibleCandidateCount === 0,
			noCoursesRecommended: baseResult.recommendedCourses.length === 0,
		},
	};
}
