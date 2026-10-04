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

export interface AdminCurriculum {
	id: string;
	name: string;
	description: string | null;
	source: CurriculumSource;
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