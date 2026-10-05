import fixture from './synthetic-curriculum.json';

type SyntheticRule =
	| { type: 'prerequisite'; courseId: string }
	| { type: 'minimum_credits'; minimumCredits: number };

interface SyntheticCurriculumFixture {
	synthetic: boolean;
	courses: Array<{
		status: 'not_started' | 'in_progress' | 'completed';
		requirementType: 'required' | 'elective';
		recommendationPriority: number;
		rules: SyntheticRule[];
	}>;
	expected: {
		eligibleCourseCodes: string[];
		ineligibleCourseCodes: string[];
		requiredCreditsEarned: number;
		electiveProgress: {
			credits: number;
			courses: number;
			meetsRequiredCredits: boolean;
			meetsRequiredCourses: boolean;
			complete: boolean;
		};
	};
}

const typedFixture = fixture as unknown as SyntheticCurriculumFixture;

describe('synthetic curriculum fixture', () => {
	it('contains exactly five explicitly synthetic courses and expected results', () => {
		expect(typedFixture.synthetic).toBe(true);
		expect(typedFixture.courses).toHaveLength(5);
		expect(typedFixture.courses.map((course) => course.recommendationPriority)).toEqual([
			0, 1, 2, 0, 1,
		]);
		expect(typedFixture.expected).toEqual({
			eligibleCourseCodes: ['SYN101', 'SYN201', 'SYN110', 'SYN120'],
			ineligibleCourseCodes: ['SYN301'],
			requiredCreditsEarned: 3,
			electiveProgress: {
				credits: 3,
				courses: 1,
				meetsRequiredCredits: true,
				meetsRequiredCourses: true,
				complete: true,
			},
		});
	});

	it('covers prerequisites, minimum credits, AND, electives, no-rule and all statuses', () => {
		const statuses = new Set(
			typedFixture.courses.map((course) => course.status),
		);
		const ruleTypes = typedFixture.courses.flatMap((course) =>
			course.rules.map((rule) => rule.type),
		);
		const coursesWithMultipleRules = typedFixture.courses.filter(
			(course) => course.rules.length > 1,
		);

		expect(statuses).toEqual(
			new Set(['completed', 'in_progress', 'not_started']),
		);
		expect(ruleTypes).toContain('prerequisite');
		expect(ruleTypes).toContain('minimum_credits');
		expect(coursesWithMultipleRules).toHaveLength(2);
		expect(
			typedFixture.courses.some((course) => course.rules.length === 0),
		).toBe(true);
		expect(
			typedFixture.courses.filter(
				(course) => course.requirementType === 'elective',
			),
		).toHaveLength(2);
	});
});
