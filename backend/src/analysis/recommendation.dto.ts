import { AnalysisCourse, CourseRuleReason } from './analysis.engine';
import {
	DeferredRequiredReason,
	RecommendationTerm,
} from './recommendation.engine';

type RecommendationCourseIdentity = Pick<
	AnalysisCourse,
	'id' | 'code' | 'version' | 'name'
>;

export interface RecommendationResponseDto {
	status: 'ready' | 'program_completed';
	progress: {
		accumulatedCredits: number;
		totalCreditsTarget: number;
		averageCreditsPerTerm: number;
		minimumSemesterCredits: number;
		maximumSemesterCredits: number;
		effectiveTarget: number;
	};
	estimatedTerm: RecommendationTerm | null;
	summary: { recommendedCredits: number };
	recommendedCourses: Array<{
		course: RecommendationCourseIdentity;
		credits: number;
		requirementType: AnalysisCourse['requirementType'];
		recommendationPriority: number;
		eligible: true;
		reasons: CourseRuleReason[];
	}>;
	deferredRequiredCourses: Array<{
		course: RecommendationCourseIdentity;
		credits: number;
		reason: DeferredRequiredReason;
		eligible: boolean;
		reasons: CourseRuleReason[];
	}>;
	warnings: {
		minimumSemesterCreditsNotMet: boolean;
		effectiveTargetNotReached: boolean;
		noEligibleCandidates: boolean;
		noCoursesRecommended: boolean;
	};
}
