import { createContext } from 'react';
import type { AnalysisRecord, CourseStatus, UserRole } from '@/types';

export interface AppContextValue {
	role: UserRole;
	setRole: (role: UserRole) => void;
	email: string;
	setEmail: (email: string) => void;
	profileName: string;
	setProfileName: (name: string) => void;
	curriculumName: string;
	setCurriculumName: (name: string) => void;
	courseStatuses: Record<string, CourseStatus>;
	setCourseStatus: (courseId: string, status: CourseStatus) => void;
	analysisHistory: AnalysisRecord[];
	addAnalysis: (record: AnalysisRecord) => void;
}

export const AppContext = createContext<AppContextValue | null>(null);