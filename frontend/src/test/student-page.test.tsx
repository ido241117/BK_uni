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
	},
}));

vi.mock('@/apis', () => ({ curriculumApi, studentApi }));

const curriculum = {
	id: 'curriculum-a',
	name: 'Chương trình A',
	description: null,
	source: { documentName: 'Nguồn A', reference: 'ref-a', version: '2026', verifiedAt: '2026-10-04' },
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

describe('StudentPage', () => {
	afterEach(() => cleanup());

	beforeEach(() => {
		curriculumApi.listStudent.mockReset().mockResolvedValue({ items: [curriculum, otherCurriculum], page: { limit: 100, offset: 0, total: 2 } });
		curriculumApi.courses.mockReset().mockResolvedValue({ items: [course], page: { limit: 100, offset: 0, total: 1 } });
		studentApi.profile.mockReset().mockResolvedValue(profile);
		studentApi.updateProfile.mockReset().mockImplementation(async (input) => ({ ...profile, ...input }));
		studentApi.updateStatuses.mockReset().mockResolvedValue({ updated: 1 });
		studentApi.deleteProfile.mockReset().mockResolvedValue(undefined);
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
});