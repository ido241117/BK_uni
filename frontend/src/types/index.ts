export type UserRole = 'student' | 'admin';

export type CourseStatus = 'not_started' | 'in_progress' | 'completed';

export interface Course {
	id: string;
	code: string;
	name: string;
	credits: number;
	term: string;
	requirementType: 'required' | 'elective';
	prerequisiteId?: string;
}

export interface Curriculum {
	id: string;
	name: string;
	description: string;
	courseCount: number;
}

export interface AnalysisRecord {
	id: string;
	createdAt: string;
	eligibleCourses: number;
	ineligibleCourses: number;
	missingRequiredCourses: number;
}

export interface CurriculumSource {
	documentName: string;
	reference: string;
	version: string;
	verifiedAt: string;
}

export interface RecommendationSettings {
	totalCreditsTarget: number;
	minimumSemesterCredits: number;
	maximumSemesterCredits: number;
}

export interface AdminCurriculum {
	id: string;
	name: string;
	description: string | null;
	source: CurriculumSource;
	recommendationSettings: RecommendationSettings | null;
	courseCount: number;
}

export interface CurriculumTerm {
	id: string;
	code: string;
	name: string;
	sortOrder: number;
}

export interface ElectiveGroup {
	id: string;
	name: string;
	requiredCredits: number | null;
	requiredCourses: number | null;
	sortOrder: number;
}

export interface CurriculumCourse {
	id: string;
	code: string;
	version: string;
	name: string;
	nameEn: string | null;
	credits: number;
	term: Pick<CurriculumTerm, 'id' | 'code' | 'name'> & Partial<Pick<CurriculumTerm, 'sortOrder'>>;
	requirementType: 'required' | 'elective';
	electiveGroup: { id: string; name: string } | null;
	status?: CourseStatus;
}

export interface CourseRule {
	id: string;
	type: 'prerequisite' | 'minimum_credits';
	prerequisiteCourseId: string | null;
	minimumCredits: number | null;
	source: CurriculumSource | null;
}

export interface CurriculumStructure {
	curriculum: Omit<AdminCurriculum, 'courseCount'>;
	terms: CurriculumTerm[];
	electiveGroups: ElectiveGroup[];
	courses: CurriculumCourse[];
}

export interface PageResult<T> {
	items: T[];
	page: { limit: number; offset: number; total: number };
}

export interface AnalysisSummary {
	eligibleCourses: number;
	ineligibleCourses: number;
	missingRequiredCourses: number;
}

export interface AnalysisRuleReason {
	ruleId: string;
	type: 'prerequisite' | 'minimum_credits';
	passed: boolean;
	message: string;
}

export interface AnalysisCourseResult {
	course: Pick<CurriculumCourse, 'id' | 'code' | 'version' | 'name'>;
	studentStatus: CourseStatus;
	eligible: boolean;
	reasons: AnalysisRuleReason[];
}

export interface AnalysisElectiveProgress {
	id: string;
	name: string;
	earnedCredits: number;
	earnedCourses: number;
	requiredCredits: number | null;
	requiredCourses: number | null;
	meetsRequiredCredits: boolean;
	meetsRequiredCourses: boolean;
	complete: boolean;
	missingCourses: Array<{ id: string; code: string; name: string }>;
}

export interface AnalysisSnapshot {
	id: string;
	createdAt: string;
	curriculum: { id: string; name: string };
	summary: AnalysisSummary;
	courseResults: AnalysisCourseResult[];
	requirements: {
		requiredCreditsEarned: number;
		missingRequiredCourses: Array<{
			id: string;
			code: string;
			name: string;
			credits: number;
		}>;
		electiveGroups: AnalysisElectiveProgress[];
	};
}

export interface AnalysisHistoryItem {
	id: string;
	createdAt: string;
	curriculum: { id: string; name: string };
	summary: AnalysisSummary;
}

export interface AnalysisHistoryDetail extends AnalysisSnapshot {
	inputSnapshot: Record<string, unknown>;
}