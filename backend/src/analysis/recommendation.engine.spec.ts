import {
	RecommendationCourse,
	RecommendationInputError,
	RecommendCoursesInput,
	recommendCourses,
} from './recommendation.engine';

const settings = {
	totalCreditsTarget: 90,
	minimumSemesterCredits: 10,
	maximumSemesterCredits: 30,
};

const terms = [
	{ id: 'term-1', code: 'T1', name: 'Term 1', sortOrder: 1 },
	{ id: 'term-2', code: 'T2', name: 'Term 2', sortOrder: 2 },
	{ id: 'term-3', code: 'T3', name: 'Term 3', sortOrder: 3 },
];

function course(
	code: string,
	overrides: Partial<RecommendationCourse> = {},
): RecommendationCourse {
	return {
		id: code,
		code,
		version: '1',
		name: code,
		credits: 3,
		requirementType: 'required',
		electiveGroupId: null,
		recommendationPriority: 0,
		rules: [],
		...overrides,
	};
}

function input(
	overrides: Partial<RecommendCoursesInput> = {},
): RecommendCoursesInput {
	return {
		settings,
		terms,
		courses: [course('CS101')],
		...overrides,
	};
}

describe('recommendCourses', () => {
	it('calculates average load and estimates the first, middle, and last term', () => {
		const base = input({ courses: [course('DONE', { status: 'completed' })] });
		expect(recommendCourses(base).estimatedTerm?.id).toBe('term-1');
		expect(
			recommendCourses({
				...base,
				courses: [course('DONE', { status: 'completed', credits: 30 })],
			}).estimatedTerm?.id,
		).toBe('term-2');
		const lastTerm = recommendCourses({
			...base,
			courses: [course('DONE', { status: 'completed', credits: 60 })],
		});
		expect(lastTerm.progress.averageCreditsPerTerm).toBe(30);
		expect(lastTerm.estimatedTerm?.id).toBe('term-3');
	});

	it('returns program completed at or above the total-credit target without recommendations', () => {
		for (const credits of [90, 96]) {
			const result = recommendCourses(
				input({
					courses: [course('DONE', { status: 'completed', credits })],
				}),
			);
			expect(result.status).toBe('program_completed');
			expect(result.estimatedTerm).toBeNull();
			expect(result.recommendedCourses).toEqual([]);
		}
	});

	it('counts in-progress and completed credits but treats missing status as not started', () => {
		const result = recommendCourses(
			input({
				courses: [
					course('DONE', { status: 'completed', credits: 3 }),
					course('CURRENT', { status: 'in_progress', credits: 4 }),
					course('NEW', { credits: 5 }),
				],
			}),
		);
		expect(result.progress.accumulatedCredits).toBe(7);
		expect(result.recommendedCourses.map((item) => item.course.code)).toEqual([
			'NEW',
		]);
	});

	it('orders required first, then by priority, code, and version deterministically', () => {
		const courses = [
			course('ELECTIVE', {
				requirementType: 'elective',
				recommendationPriority: 0,
			}),
			course('CS102', { recommendationPriority: 1 }),
			course('CS101', { recommendationPriority: 1 }),
			course('CS101', {
				id: 'CS101-v2',
				version: '2',
				recommendationPriority: 1,
			}),
		];
		const result = recommendCourses(input({ courses }));
		expect(result.recommendedCourses.map((item) => item.course.id)).toEqual([
			'CS101',
			'CS101-v2',
			'CS102',
			'ELECTIVE',
		]);
	});

	it('uses the existing rule evaluator and excludes ineligible courses from recommendations', () => {
		const result = recommendCourses(
			input({
				courses: [
					course('PREREQ', { status: 'in_progress' }),
					course('ELIGIBLE', {
						recommendationPriority: 1,
						rules: [
							{
								id: 'rule-pass',
								type: 'prerequisite',
								prerequisiteCourseId: 'PREREQ',
								minimumCredits: null,
							},
						],
					}),
					course('BLOCKED', {
						recommendationPriority: 2,
						rules: [
							{
								id: 'rule-fail',
								type: 'prerequisite',
								prerequisiteCourseId: 'NOT-TAKEN',
								minimumCredits: null,
							},
						],
					}),
				],
			}),
		);
		expect(result.recommendedCourses.map((item) => item.course.code)).toEqual([
			'ELIGIBLE',
		]);
		expect(result.deferredRequiredCourses).toMatchObject([
			{ course: { code: 'BLOCKED' }, reason: 'RULE_NOT_SATISFIED' },
		]);
	});

	it('evaluates minimum-credit rules against current accumulated credits', () => {
		const result = recommendCourses(
			input({
				courses: [
					course('EARNED', { status: 'completed', credits: 6 }),
					course('PASSING', {
						rules: [
							{
								id: 'minimum-pass',
								type: 'minimum_credits',
								prerequisiteCourseId: null,
								minimumCredits: 6,
							},
						],
					}),
					course('FAILING', {
						recommendationPriority: 1,
						rules: [
							{
								id: 'minimum-fail',
								type: 'minimum_credits',
								prerequisiteCourseId: null,
								minimumCredits: 7,
							},
						],
					}),
				],
			}),
		);
		expect(result.recommendedCourses.map((item) => item.course.code)).toEqual([
			'PASSING',
		]);
		expect(result.deferredRequiredCourses).toMatchObject([
			{ course: { code: 'FAILING' }, reason: 'RULE_NOT_SATISFIED' },
		]);
	});

	it('skips a course that exceeds max and continues until effective target is reached', () => {
		const result = recommendCourses(
			input({
				settings: {
					totalCreditsTarget: 30,
					minimumSemesterCredits: 12,
					maximumSemesterCredits: 12,
				},
				courses: [
					course('TOO-LARGE', { credits: 13, recommendationPriority: 0 }),
					course('FITS-FIRST', { credits: 4, recommendationPriority: 1 }),
					course('FITS-SECOND', { credits: 8, recommendationPriority: 2 }),
					course('AFTER-TARGET', { credits: 1, recommendationPriority: 3 }),
				],
			}),
		);
		expect(result.progress.effectiveTarget).toBe(12);
		expect(result.summary.recommendedCredits).toBe(12);
		expect(result.recommendedCourses.map((item) => item.course.code)).toEqual([
			'FITS-FIRST',
			'FITS-SECOND',
		]);
		expect(result.deferredRequiredCourses).toMatchObject([
			{ course: { code: 'TOO-LARGE' }, reason: 'MAX_CREDITS_REACHED' },
			{ course: { code: 'AFTER-TARGET' }, reason: 'TARGET_REACHED' },
		]);
	});

	it('allows electives to fill the load and warns when available courses do not reach min or target', () => {
		const enough = recommendCourses(
			input({
				settings: {
					totalCreditsTarget: 30,
					minimumSemesterCredits: 10,
					maximumSemesterCredits: 15,
				},
				courses: [
					course('REQUIRED', { credits: 6 }),
					course('ELECTIVE', {
						credits: 9,
						requirementType: 'elective',
						recommendationPriority: 0,
					}),
				],
			}),
		);
		expect(enough.recommendedCourses.map((item) => item.course.code)).toEqual([
			'REQUIRED',
			'ELECTIVE',
		]);
		expect(enough.warnings.minimumSemesterCreditsNotMet).toBe(false);
		expect(enough.warnings.effectiveTargetNotReached).toBe(false);

		const short = recommendCourses(
			input({
				settings: {
					totalCreditsTarget: 90,
					minimumSemesterCredits: 25,
					maximumSemesterCredits: 30,
				},
				courses: [course('ONLY-COURSE', { credits: 10 })],
			}),
		);
		expect(short.summary.recommendedCredits).toBe(10);
		expect(short.warnings).toMatchObject({
			minimumSemesterCreditsNotMet: true,
			effectiveTargetNotReached: true,
		});
	});

	it('returns empty recommendations and warnings when there are no candidates', () => {
		const result = recommendCourses(
			input({ courses: [course('DONE', { status: 'completed', credits: 3 })] }),
		);
		expect(result.status).toBe('ready');
		expect(result.recommendedCourses).toEqual([]);
		expect(result.warnings.noCoursesRecommended).toBe(true);
		expect(result.warnings.noEligibleCandidates).toBe(true);
		expect(result.warnings.effectiveTargetNotReached).toBe(true);
	});

	it('uses integer hundredths so decimal credits do not falsely exceed max', () => {
		const result = recommendCourses(
			input({
				settings: {
					totalCreditsTarget: 0.6,
					minimumSemesterCredits: 0,
					maximumSemesterCredits: 0.3,
				},
				terms: [terms[0], terms[1]],
				courses: [
					course('DECIMAL-A', { credits: 0.1 }),
					course('DECIMAL-B', { credits: 0.2, recommendationPriority: 1 }),
				],
			}),
		);
		expect(result.summary.recommendedCredits).toBe(0.3);
	});

	it.each([
		[
			'invalid settings',
			() => input({ settings: { ...settings, maximumSemesterCredits: 0 } }),
		],
		[
			'min above max',
			() => input({ settings: { ...settings, minimumSemesterCredits: 31 } }),
		],
		['missing active term', () => input({ terms: [] })],
		[
			'non-finite credits',
			() => input({ courses: [course('NAN', { credits: Number.NaN })] }),
		],
		[
			'infinite target credits',
			() =>
				input({
					settings: {
						...settings,
						totalCreditsTarget: Number.POSITIVE_INFINITY,
					},
				}),
		],
		[
			'infinite course credits',
			() =>
				input({
					courses: [course('INFINITY', { credits: Number.POSITIVE_INFINITY })],
				}),
		],
		[
			'negative priority',
			() => input({ courses: [course('NEG', { recommendationPriority: -1 })] }),
		],
		[
			'invalid status',
			() =>
				input({ courses: [course('STATUS', { status: 'unknown' as never })] }),
		],
	])('rejects %s at the engine boundary', (_label, makeInput) => {
		expect(() => recommendCourses(makeInput())).toThrow(
			RecommendationInputError,
		);
	});
});
