import { useState, type ReactNode } from 'react';
import type { AnalysisRecord, CourseStatus, UserRole } from '@/types';
import { AppContext } from './app-context-value';
import type { AppContextValue } from './app-context-value';

export function AppProvider({ children }: { children: ReactNode }) {
	const [role, setRole] = useState<UserRole>('student');
	const [email, setEmail] = useState('sinhvien@example.test');
	const [profileName, setProfileName] = useState('Hồ sơ học tập của tôi');
	const [curriculumName, setCurriculumName] = useState('Khoa học Máy tính');
	const [courseStatuses, setCourseStatuses] = useState<Record<string, CourseStatus>>({
		ma101: 'completed',
		cs101: 'completed',
		ph101: 'in_progress',
		cs102: 'in_progress',
		cs201: 'not_started',
		cs202: 'not_started',
		cs203: 'not_started',
		el101: 'not_started',
	});
	const [analysisHistory, setAnalysisHistory] = useState<AnalysisRecord[]>([
		{
			id: 'analysis-1',
			createdAt: '2026-10-02T09:30:00+07:00',
			eligibleCourses: 6,
			ineligibleCourses: 2,
			missingRequiredCourses: 4,
		},
	]);

	const value: AppContextValue = {
		role,
		setRole,
		email,
		setEmail,
		profileName,
		setProfileName,
		curriculumName,
		setCurriculumName,
		courseStatuses,
		setCourseStatus: (courseId, status) =>
			setCourseStatuses((current) => ({ ...current, [courseId]: status })),
		analysisHistory,
		addAnalysis: (record) => setAnalysisHistory((current) => [record, ...current]),
	};

	return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}