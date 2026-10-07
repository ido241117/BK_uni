import fixture from '../fixtures/synthetic-curriculum.json';
import {
	ruleTestCurricula,
	ruleTestProfiles,
} from '../fixtures/rule-test-data';
import {
	AnalyzeCurriculumInput,
	analyzeCurriculum,
} from './analysis.engine';

type FixtureRule =
	| { type: 'prerequisite'; courseId: string }
	| { type: 'minimum_credits'; minimumCredits: number };

interface SyntheticAnalysisFixture {
	curriculum: { id: string; name: string };
	electiveGroup: {
		id: string;
		name: string;
		requiredCredits: number;
		requiredCourses: number;
	};
	courses: Array<{
		id: string;
		code: string;
		name: string;
		credits: number;
		requirementType: 'required' | 'elective';
		electiveGroupId?: string;
		status: 'not_started' | 'in_progress' | 'completed';
		rules: FixtureRule[];
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

const typedFixture = fixture as unknown as SyntheticAnalysisFixture;

const fixtureInput = (): AnalyzeCurriculumInput => ({
	curriculum: {
		id: typedFixture.curriculum.id,
		name: typedFixture.curriculum.name,
	},
	courses: typedFixture.courses.map((course) => ({
		id: course.id,
		code: course.code,
		version: '1',
		name: course.name,
		credits: course.credits,
		requirementType: course.requirementType,
		electiveGroupId: course.electiveGroupId ?? null,
		status: course.status,
		rules: course.rules.map((rule, index) => ({
			id: `${course.id}-rule-${index + 1}`,
			type: rule.type,
			prerequisiteCourseId:
				rule.type === 'prerequisite' ? rule.courseId : null,
			minimumCredits:
				rule.type === 'minimum_credits' ? rule.minimumCredits : null,
		})),
	})),
	electiveGroups: [
		{
			id: typedFixture.electiveGroup.id,
			name: typedFixture.electiveGroup.name,
			requiredCredits: typedFixture.electiveGroup.requiredCredits,
			requiredCourses: typedFixture.electiveGroup.requiredCourses,
		},
	],
});

describe('analyzeCurriculum', () => {
	it('matches the synthetic five-course expected result and explains each rule', () => {
		const result = analyzeCurriculum(fixtureInput());

		expect(
			result.courseResults
				.filter((course) => course.eligible)
				.map((course) => course.course.code),
		).toEqual(typedFixture.expected.eligibleCourseCodes);
		expect(
			result.courseResults
				.filter((course) => !course.eligible)
				.map((course) => course.course.code),
		).toEqual(typedFixture.expected.ineligibleCourseCodes);
		expect(result.requirements.requiredCreditsEarned).toBe(
			typedFixture.expected.requiredCreditsEarned,
		);
		expect(result.requirements.electiveGroups[0]).toMatchObject({
			earnedCredits: typedFixture.expected.electiveProgress.credits,
			earnedCourses: typedFixture.expected.electiveProgress.courses,
			meetsRequiredCredits:
				typedFixture.expected.electiveProgress.meetsRequiredCredits,
			meetsRequiredCourses:
				typedFixture.expected.electiveProgress.meetsRequiredCourses,
			complete: typedFixture.expected.electiveProgress.complete,
		});
		expect(result.summary.missingRequiredCourses).toBe(2);
		expect(
			result.courseResults.find((course) => course.course.code === 'SYN301')
				?.reasons,
		).toHaveLength(2);
		expect(
			result.courseResults.find((course) => course.course.code === 'SYN301')
				?.reasons.every((reason) => reason.message.length > 0),
		).toBe(true);
	});

	it('requires both elective thresholds and does not count not-started statuses', () => {
		const input = fixtureInput();
		input.courses.forEach((course) => {
			course.status = 'not_started';
		});
		const result = analyzeCurriculum(input);
		expect(result.requirements.electiveGroups[0]).toMatchObject({
			earnedCredits: 0,
			earnedCourses: 0,
			meetsRequiredCredits: false,
			meetsRequiredCourses: false,
			complete: false,
		});
	});

	it('handles an elective group with no member courses', () => {
		const input = fixtureInput();
		input.courses = input.courses.filter((course) => !course.electiveGroupId);

		const group = analyzeCurriculum(input).requirements.electiveGroups[0];
		expect(group.earnedCredits).toBe(0);
		expect(group.earnedCourses).toBe(0);
		expect(group.complete).toBe(false);
		expect(group.missingCourses).toEqual([]);
	});

	it('accepts an elective group at both exact thresholds', () => {
		const input = fixtureInput();
		input.courses.find((course) => course.code === 'SYN110')!.status =
			'in_progress';
		const group = analyzeCurriculum(input).requirements.electiveGroups[0];
		expect(group.earnedCredits).toBe(3);
		expect(group.earnedCourses).toBe(1);
		expect(group.complete).toBe(true);
	});
});

describe('rule-test seed profiles', () => {
	test.each([
		{ email: 'prerequisite-pass@demo.test', eligible: 4, ineligible: 1, missing: 4, target: 'PR102', targetEligible: true, reasons: [true] },
		{ email: 'prerequisite-fail@demo.test', eligible: 3, ineligible: 2, missing: 5, target: 'PR102', targetEligible: false, reasons: [false] },
		{ email: 'credits-fail@demo.test', eligible: 4, ineligible: 1, missing: 4, target: 'CR201', targetEligible: false, reasons: [false] },
		{ email: 'credits-pass@demo.test', eligible: 5, ineligible: 0, missing: 3, target: 'CR201', targetEligible: true, reasons: [true] },
		{ email: 'combined-rule-fail@demo.test', eligible: 5, ineligible: 1, missing: 3, target: 'AN201', targetEligible: false, reasons: [false, false] },
		{ email: 'combined-rule-pass@demo.test', eligible: 6, ineligible: 0, missing: 1, target: 'AN201', targetEligible: true, reasons: [true, true] },
	])('$email matches its documented analysis output', (expected) => {
		const profile = ruleTestProfiles.find(
			(candidate) => candidate.email === expected.email,
		)!;
		const curriculum = ruleTestCurricula.find(
			(candidate) => candidate.id === profile.curriculumId,
		)!;
		const courses = curriculum.courses.map((course) => ({
			id: course.id,
			code: course.code,
			version: '1',
			name: course.name,
			credits: course.credits,
			requirementType: course.requirementType,
			electiveGroupId: course.electiveGroup ? curriculum.electiveGroup!.id : null,
			status: profile.statuses[course.code] ?? 'not_started',
			rules: course.rules.map((rule, index) => ({
				id: `${course.id}-rule-${index + 1}`,
				type: rule.type,
				prerequisiteCourseId:
					rule.type === 'prerequisite'
						? curriculum.courses.find(
							(candidate) => candidate.code === rule.courseCode,
						)!.id
						: null,
				minimumCredits:
					rule.type === 'minimum_credits' ? rule.minimumCredits : null,
			})),
		}));
		const result = analyzeCurriculum({
			curriculum: { id: curriculum.id, name: curriculum.name },
			courses,
			electiveGroups: curriculum.electiveGroup
				? [{
					id: curriculum.electiveGroup.id,
					name: curriculum.electiveGroup.name,
					requiredCredits: curriculum.electiveGroup.requiredCredits,
					requiredCourses: curriculum.electiveGroup.requiredCourses,
				}]
				: [],
		});

		expect(result.summary).toEqual({
			eligibleCourses: expected.eligible,
			ineligibleCourses: expected.ineligible,
			missingRequiredCourses: expected.missing,
		});
		const target = result.courseResults.find(
			(course) => course.course.code === expected.target,
		)!;
		expect(target.eligible).toBe(expected.targetEligible);
		expect(target.reasons.map((reason) => reason.passed)).toEqual(
			expected.reasons,
		);
	});
});