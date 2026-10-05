import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StudentPage from '@/pages/student';

const { curriculumApi, studentApi } = vi.hoisted(() => ({
	curriculumApi: {
		listStudent: vi.fn(),
		courses: vi.fn(),
	},
	studentApi: {
		profile: vi.fn(),
		updateProfile: vi.fn(),
		deleteProfile: vi.fn(),
		updateStatuses: vi.fn(),
		courseRecommendations: vi.fn(),
	},
}));

vi.mock('@/apis', () => ({ curriculumApi, studentApi }));

const curriculum = {
	id: 'curriculum-a',
	name: 'Chương trình A',
	description: null,
	source: { documentName: 'Nguồn A', reference: 'ref-a', version: '2026', verifiedAt: '2026-10-04' },
	recommendationSettings: { totalCreditsTarget: 120, minimumSemesterCredits: 9, maximumSemesterCredits: 24 },
	courseCount: 1,
};
const otherCurriculum = { ...curriculum, id: 'curriculum-b', name: 'Chương trình B' };

const profile = { id: 'profile-a', displayName: 'Minh', curriculumId: curriculum.id };
const course = {
	id: 'course-a',
	code: 'CS101',
	version: '1',
	name: 'Nhập môn lập trình',
	nameEn: null,
	credits: 3,
	term: { id: 'term-a', code: 'T1', name: 'Học kỳ 1' },
	requirementType: 'required' as const,
	electiveGroup: null,
	status: 'not_started' as const,
};

const readyRecommendation = {
	status: 'ready' as const,
	progress: {
		accumulatedCredits: 45,
		totalCreditsTarget: 120,
		averageCreditsPerTerm: 20,
		minimumSemesterCredits: 9,
		maximumSemesterCredits: 24,
		effectiveTarget: 20,
	},
	estimatedTerm: { id: 'term-b', code: 'T4', name: 'Học kỳ 4', sortOrder: 3 },
	summary: { recommendedCredits: 18 },
	recommendedCourses: [{
		course: { id: 'course-b', code: 'CS201', version: '2026', name: 'Cấu trúc dữ liệu' },
		credits: 3,
		requirementType: 'required' as const,
		recommendationPriority: 1,
		eligible: true as const,
		reasons: [{ ruleId: 'rule-a', type: 'prerequisite' as const, passed: true, message: 'Đã đáp ứng môn tiên quyết CS101.' }],
	}],
	deferredRequiredCourses: [{
		course: { id: 'course-c', code: 'CS301', version: '2026', name: 'Thuật toán' },
		credits: 4,
		reason: 'RULE_NOT_SATISFIED' as const,
		eligible: false,
		reasons: [{ ruleId: 'rule-b', type: 'prerequisite' as const, passed: false, message: 'Chưa đáp ứng môn tiên quyết CS201.' }],
	}],
	warnings: {
		minimumSemesterCreditsNotMet: true,
		effectiveTargetNotReached: true,
		noEligibleCandidates: false,
		noCoursesRecommended: false,
	},
};

describe('StudentPage', () => {
	afterEach(() => cleanup());

	beforeEach(() => {
		curriculumApi.listStudent.mockReset().mockResolvedValue({ items: [curriculum, otherCurriculum], page: { limit: 100, offset: 0, total: 2 } });
		curriculumApi.courses.mockReset().mockResolvedValue({ items: [course], page: { limit: 100, offset: 0, total: 1 } });
		studentApi.profile.mockReset().mockResolvedValue(profile);
		studentApi.updateProfile.mockReset().mockImplementation(async (input) => ({ ...profile, ...input }));
		studentApi.updateStatuses.mockReset().mockResolvedValue({ updated: 1 });
		studentApi.deleteProfile.mockReset().mockResolvedValue(undefined);
		studentApi.courseRecommendations.mockReset().mockResolvedValue(readyRecommendation);
	});

	it('loads persisted course data and saves status changes through the API', async () => {
		render(<MemoryRouter><StudentPage /></MemoryRouter>);

		const row = await screen.findByRole('row', { name: /CS101/ });
		fireEvent.mouseDown(within(row).getByRole('combobox'));
		await waitFor(() => expect(screen.getAllByText('Đã học').length).toBeGreaterThan(1));
		fireEvent.click(screen.getAllByText('Đã học').at(-1)!);
		fireEvent.click(screen.getByRole('button', { name: /Lưu hồ sơ/ }));

		await waitFor(() => expect(studentApi.updateStatuses).toHaveBeenCalledWith([
			{ courseId: 'course-a', status: 'completed' },
		]));
		expect(curriculumApi.courses).toHaveBeenCalledWith('curriculum-a', { offset: 0 });
	});

	it('requires confirmation before changing the selected curriculum', async () => {
		render(<MemoryRouter><StudentPage /></MemoryRouter>);
		const row = await screen.findByRole('row', { name: /CS101/ });
		fireEvent.mouseDown(within(row).getByRole('combobox'));
		await waitFor(() => expect(screen.getAllByText('Đã học').length).toBeGreaterThan(1));
		fireEvent.click(screen.getAllByText('Đã học').at(-1)!);

		const selectors = screen.getAllByRole('combobox');
		fireEvent.mouseDown(selectors[0]);
		fireEvent.click(await screen.findByText('Chương trình B'));
		await screen.findByRole('dialog');
		expect(studentApi.updateProfile).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole('button', { name: /Đổi chương trình/ }));
		await waitFor(() => expect(studentApi.updateProfile).toHaveBeenCalledWith({
			displayName: 'Minh',
			curriculumId: 'curriculum-b',
		}));
		expect(studentApi.updateStatuses).toHaveBeenCalledWith([
			{ courseId: 'course-a', status: 'completed' },
		]);
		expect(studentApi.updateStatuses.mock.invocationCallOrder[0]).toBeLessThan(
			studentApi.updateProfile.mock.invocationCallOrder[0],
		);
	});

	it('shows loading, recommendation details, warnings, and deferred required courses', async () => {
		let resolveRecommendation!: (value: typeof readyRecommendation) => void;
		studentApi.courseRecommendations.mockReturnValue(new Promise((resolve) => {
			resolveRecommendation = resolve;
		}));
		render(<MemoryRouter><StudentPage /></MemoryRouter>);

		const recommendationPanel = await screen.findByRole('region', { name: 'Gợi ý học kỳ' });
		const requestButton = within(recommendationPanel).getByRole('button');
		expect(requestButton).toHaveTextContent('Tạo gợi ý');
		fireEvent.click(requestButton);
		expect(studentApi.courseRecommendations).toHaveBeenCalledTimes(1);
		expect(requestButton).toBeDisabled();
		resolveRecommendation(readyRecommendation);

		expect(await screen.findByText('Học kỳ 4 (T4)')).toBeInTheDocument();
		expect(screen.getByText('45 / 120 tín chỉ')).toBeInTheDocument();
		expect(screen.getByText('Cấu trúc dữ liệu')).toBeInTheDocument();
		expect(screen.getByText('Đã đáp ứng môn tiên quyết CS101.')).toBeInTheDocument();
		expect(screen.getByText('Chưa đạt mức tín chỉ tối thiểu của kỳ.')).toBeInTheDocument();
		expect(screen.getByText('Danh sách đề xuất chưa đạt tải tín chỉ mục tiêu; giới hạn và điều kiện môn được giữ nguyên.')).toBeInTheDocument();
		expect(screen.getByText('Chưa đáp ứng môn tiên quyết CS201.')).toBeInTheDocument();
		expect(screen.getByText('4 tín chỉ · Chưa đạt điều kiện học phần')).toBeInTheDocument();
	});

	it('shows completed-program state without a term or recommended courses', async () => {
		studentApi.courseRecommendations.mockResolvedValue({
			...readyRecommendation,
			status: 'program_completed',
			estimatedTerm: null,
			recommendedCourses: [],
			deferredRequiredCourses: [],
			summary: { recommendedCredits: 0 },
		});
		render(<MemoryRouter><StudentPage /></MemoryRouter>);
		const recommendationPanel = await screen.findByRole('region', { name: 'Gợi ý học kỳ' });
		fireEvent.click(within(recommendationPanel).getByRole('button'));

		expect(await screen.findByText('Đã hoàn thành chương trình đào tạo.')).toBeInTheDocument();
		expect(screen.getByText(/Không có môn học nào được đề xuất/)).toBeInTheDocument();
		expect(screen.queryByText('Học phần đề xuất')).not.toBeInTheDocument();
	});

	it('keeps unsaved profile edits when the recommendation API returns an error', async () => {
		studentApi.courseRecommendations.mockRejectedValue({
			isAxiosError: true,
			response: { status: 422, data: { code: 'CURRICULUM_HAS_NO_TERMS' } },
		});
		render(<MemoryRouter><StudentPage /></MemoryRouter>);
		const nameInput = await screen.findByRole('textbox', { name: 'Tên hồ sơ' });
		fireEvent.change(nameInput, { target: { value: 'Tên chưa lưu' } });
		const recommendationPanel = screen.getByRole('region', { name: 'Gợi ý học kỳ' });
		fireEvent.click(within(recommendationPanel).getByRole('button'));

		expect(await screen.findByText('Chương trình chưa có học kỳ hoạt động.')).toBeInTheDocument();
		expect(nameInput).toHaveValue('Tên chưa lưu');
	});

	it('disables recommendations when the selected curriculum has no settings', async () => {
		curriculumApi.listStudent.mockResolvedValue({
			items: [{ ...curriculum, recommendationSettings: null }],
			page: { limit: 100, offset: 0, total: 1 },
		});
		render(<MemoryRouter><StudentPage /></MemoryRouter>);

		const recommendationPanel = await screen.findByRole('region', { name: 'Gợi ý học kỳ' });
		expect(within(recommendationPanel).getByRole('button')).toBeDisabled();
		expect(screen.getByText('Chương trình chưa cấu hình tải gợi ý học kỳ.')).toBeInTheDocument();
		expect(studentApi.courseRecommendations).not.toHaveBeenCalled();
	});

	it('requires saving course status edits before requesting a recommendation', async () => {
		render(<MemoryRouter><StudentPage /></MemoryRouter>);
		const row = await screen.findByRole('row', { name: /CS101/ });
		fireEvent.mouseDown(within(row).getByRole('combobox'));
		const completedOptions = await screen.findAllByText('Đã học');
		fireEvent.click(completedOptions.at(-1)!);

		const recommendationPanel = screen.getByRole('region', { name: 'Gợi ý học kỳ' });
		expect(within(recommendationPanel).getByRole('button')).toBeDisabled();
		expect(screen.getByText('Bạn đã thay đổi trạng thái môn; hãy lưu hồ sơ để gợi ý dùng tiến độ mới nhất.')).toBeInTheDocument();
		expect(studentApi.courseRecommendations).not.toHaveBeenCalled();
	});
});