import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AnalysisPage, { HistoryPage } from '@/pages/analysis';

const { analysisApi, studentApi } = vi.hoisted(() => ({
	analysisApi: {
		run: vi.fn(),
		history: vi.fn(),
		detail: vi.fn(),
	},
	studentApi: { profile: vi.fn() },
}));

vi.mock('@/apis', () => ({ analysisApi, studentApi }));

const snapshot = {
	id: 'analysis-a',
	createdAt: '2026-10-04T10:00:00Z',
	curriculum: { id: 'curriculum-a', name: 'Chương trình tại thời điểm chạy' },
	summary: { eligibleCourses: 1, ineligibleCourses: 1, missingRequiredCourses: 1 },
	courseResults: [
		{
			course: { id: 'course-a', code: 'CS101', version: '1', name: 'Lập trình cơ bản' },
			studentStatus: 'completed' as const,
			eligible: true,
			reasons: [],
		},
		{
			course: { id: 'course-b', code: 'CS201', version: '1', name: 'Cấu trúc dữ liệu' },
			studentStatus: 'not_started' as const,
			eligible: false,
			reasons: [
				{ ruleId: 'rule-a', type: 'prerequisite' as const, passed: false, message: 'Chưa đáp ứng môn tiên quyết CS101.' },
			],
		},
	],
	requirements: {
		requiredCreditsEarned: 3,
		missingRequiredCourses: [{ id: 'course-b', code: 'CS201', name: 'Cấu trúc dữ liệu', credits: 3 }],
		electiveGroups: [{
			id: 'group-a',
			name: 'Tự chọn chuyên ngành',
			earnedCredits: 0,
			earnedCourses: 0,
			requiredCredits: 3,
			requiredCourses: 1,
			meetsRequiredCredits: false,
			meetsRequiredCourses: false,
			complete: false,
			missingCourses: [],
		}],
	},
};

describe('AnalysisPage', () => {
	afterEach(() => cleanup());

	beforeEach(() => {
		analysisApi.run.mockReset().mockResolvedValue(snapshot);
		analysisApi.history.mockReset().mockResolvedValue({ items: [], page: { limit: 20, offset: 0, total: 0 } });
		analysisApi.detail.mockReset().mockResolvedValue(snapshot);
		studentApi.profile.mockReset().mockResolvedValue({ id: 'profile-a', displayName: 'Minh', curriculumId: 'curriculum-a' });
	});

	it('runs analysis and displays the saved rule explanations and progress', async () => {
		render(<MemoryRouter><AnalysisPage /></MemoryRouter>);
		fireEvent.click(screen.getByRole('button', { name: /Chạy phân tích mới/ }));

		await waitFor(() => expect(analysisApi.run).toHaveBeenCalledTimes(1));
		expect(await screen.findByText('Chưa đáp ứng môn tiên quyết CS101.')).toBeInTheDocument();
		expect(screen.getByText('Tự chọn chuyên ngành')).toBeInTheDocument();
		expect(screen.getByText((_, element) => element?.tagName === 'P' && element.textContent?.includes('Chương trình tại thời điểm chạy') === true)).toBeInTheDocument();
	});

	it('loads history and displays the stored snapshot detail', async () => {
		analysisApi.history.mockResolvedValue({
			items: [{
				id: snapshot.id,
				createdAt: snapshot.createdAt,
				curriculum: snapshot.curriculum,
				summary: snapshot.summary,
			}],
			page: { limit: 20, offset: 0, total: 1 },
		});
		analysisApi.detail.mockResolvedValue({ ...snapshot, inputSnapshot: { curriculum: snapshot.curriculum } });
		render(<MemoryRouter><HistoryPage /></MemoryRouter>);

		fireEvent.click(await screen.findByRole('button', { name: /Xem snapshot/ }));

		await screen.findByRole('dialog');
		expect(screen.getByText('CS201')).toBeInTheDocument();
		expect(analysisApi.detail).toHaveBeenCalledWith('analysis-a');
		expect(analysisApi.history).toHaveBeenCalledWith({ limit: 20, offset: 0 });
	});
});