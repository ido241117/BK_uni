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