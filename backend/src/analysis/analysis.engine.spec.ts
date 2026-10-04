import fixture from '../fixtures/synthetic-curriculum.json';
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