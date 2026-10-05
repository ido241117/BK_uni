export type StudentCourseStatus = 'not_started' | 'in_progress' | 'completed';

export type AnalysisRule = {
	id: string;
	type: 'prerequisite' | 'minimum_credits';
	prerequisiteCourseId: string | null;
	minimumCredits: number | null;
};

export type AnalysisCourse = {
	id: string;
	code: string;
	version: string;
	name: string;
	credits: number;
	requirementType: 'required' | 'elective';
	electiveGroupId: string | null;
	status: StudentCourseStatus;
	rules: AnalysisRule[];
};

export type AnalysisElectiveGroup = {
	id: string;
	name: string;
	requiredCredits: number | null;
	requiredCourses: number | null;
};

export type AnalyzeCurriculumInput = {
	curriculum: { id: string; name: string };
	courses: AnalysisCourse[];
	electiveGroups: AnalysisElectiveGroup[];
};

export type CourseRuleReason = {
	ruleId: string;
	type: AnalysisRule['type'];
	passed: boolean;
	message: string;
};

const countsTowardProgress = (status: StudentCourseStatus) =>
	status === 'in_progress' || status === 'completed';

export function evaluateCourseEligibility(courses: AnalysisCourse[]) {
	const coursesById = new Map(courses.map((course) => [course.id, course]));
	const earnedCredits = courses.reduce(
		(total, course) =>
			total + (countsTowardProgress(course.status) ? course.credits : 0),
		0,
	);
	return courses.map((course) => {
		const reasons: CourseRuleReason[] = course.rules.map((rule) => {
			if (rule.type === 'prerequisite') {
				const prerequisite = rule.prerequisiteCourseId
					? coursesById.get(rule.prerequisiteCourseId)
					: undefined;
				const passed = Boolean(
					prerequisite && countsTowardProgress(prerequisite.status),
				);
				const prerequisiteLabel = prerequisite?.code ?? 'môn tiên quyết';
				return {
					ruleId: rule.id,
					type: rule.type,
					passed,
					message: passed
						? `Đã đáp ứng môn tiên quyết ${prerequisiteLabel}.`
						: `Chưa đáp ứng môn tiên quyết ${prerequisiteLabel}.`,
				};
			}

			const minimum = rule.minimumCredits ?? 0;
			const passed = earnedCredits >= minimum;
			return {
				ruleId: rule.id,
				type: rule.type,
				passed,
				message: passed
					? `Đã tích lũy ${earnedCredits} tín chỉ; yêu cầu tối thiểu ${minimum}.`
					: `Cần tối thiểu ${minimum} tín chỉ; hiện có ${earnedCredits}.`,
			};
		});
		return {
			courseId: course.id,
			eligible: reasons.every((reason) => reason.passed),
			reasons,
		};
	});
}

export function analyzeCurriculum(input: AnalyzeCurriculumInput) {
	const eligibilityByCourseId = new Map(
		evaluateCourseEligibility(input.courses).map((result) => [
			result.courseId,
			result,
		]),
	);
	const courseResults = input.courses.map((course) => {
		const eligibility = eligibilityByCourseId.get(course.id)!;
		return {
			course: {
				id: course.id,
				code: course.code,
				version: course.version,
				name: course.name,
			},
			studentStatus: course.status,
			eligible: eligibility.eligible,
			reasons: eligibility.reasons,
		};
	});
	const missingRequiredCourses = input.courses
		.filter(
			(course) =>
				course.requirementType === 'required' &&
				!countsTowardProgress(course.status),
		)
		.map((course) => ({
			id: course.id,
			code: course.code,
			name: course.name,
			credits: course.credits,
		}));
	const electiveProgress = input.electiveGroups.map((group) => {
		const groupCourses = input.courses.filter(
			(course) => course.electiveGroupId === group.id,
		);
		const earnedCourses = groupCourses.filter((course) =>
			countsTowardProgress(course.status),
		);
		const groupEarnedCredits = earnedCourses.reduce(
			(total, course) => total + course.credits,
			0,
		);
		const meetsRequiredCredits =
			group.requiredCredits === null ||
			groupEarnedCredits >= group.requiredCredits;
		const meetsRequiredCourses =
			group.requiredCourses === null ||
			earnedCourses.length >= group.requiredCourses;
		return {
			id: group.id,
			name: group.name,
			earnedCredits: groupEarnedCredits,
			earnedCourses: earnedCourses.length,
			requiredCredits: group.requiredCredits,
			requiredCourses: group.requiredCourses,
			meetsRequiredCredits,
			meetsRequiredCourses,
			complete: meetsRequiredCredits && meetsRequiredCourses,
			missingCourses: groupCourses
				.filter((course) => !countsTowardProgress(course.status))
				.map((course) => ({
					id: course.id,
					code: course.code,
					name: course.name,
				})),
		};
	});
	const eligibleCourses = courseResults.filter((course) => course.eligible).length;

	return {
		curriculum: input.curriculum,
		summary: {
			eligibleCourses,
			ineligibleCourses: courseResults.length - eligibleCourses,
			missingRequiredCourses: missingRequiredCourses.length,
		},
		courseResults,
		requirements: {
			requiredCreditsEarned: input.courses.reduce(
				(total, course) =>
					total +
					(course.requirementType === 'required' &&
						countsTowardProgress(course.status)
						? course.credits
						: 0),
				0,
			),
			missingRequiredCourses,
			electiveGroups: electiveProgress,
		},
	};
}