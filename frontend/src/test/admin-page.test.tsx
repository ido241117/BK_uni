import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminPage from '@/pages/admin';

const { api } = vi.hoisted(() => ({
	api: {
		listAdmin: vi.fn(),
		structure: vi.fn(),
		rules: vi.fn(),
		createCurriculum: vi.fn(),
		updateCurriculum: vi.fn(),
		createTerm: vi.fn(),
		updateTerm: vi.fn(),
		deleteTerm: vi.fn(),
		createGroup: vi.fn(),
		updateGroup: vi.fn(),
		deleteGroup: vi.fn(),
		createCourse: vi.fn(),
		updateCourse: vi.fn(),
		deleteCourse: vi.fn(),
		createRule: vi.fn(),
		updateRule: vi.fn(),
		deleteRule: vi.fn(),
	},
}));

vi.mock('@/apis', () => ({ curriculumApi: api }));

const curriculum = {
	id: 'curriculum-1',
	name: 'CTĐT thật từ API',
	description: 'Bản đã lưu',
	source: {
		documentName: 'Quyết định 01',
		reference: 'https://example.test/ctdt',
		version: '2026',
		verifiedAt: '2026-10-04',
	},
	courseCount: 0,
};

describe('AdminPage', () => {
	afterEach(() => cleanup());

	beforeEach(() => {
		Object.values(api).forEach((mock) => mock.mockReset());
		api.listAdmin.mockResolvedValue({ items: [curriculum], page: { limit: 100, offset: 0, total: 1 } });
		api.structure.mockResolvedValue({ curriculum, terms: [], electiveGroups: [], courses: [] });
		api.rules.mockResolvedValue([]);
	});

	it('renders curricula returned by the API instead of demo records', async () => {
		render(<AdminPage />);

		expect((await screen.findAllByText('CTĐT thật từ API')).length).toBeGreaterThan(0);
		expect(screen.getByText(/Quyết định 01/)).toBeInTheDocument();
		expect(screen.queryByText('Khoa học Máy tính')).not.toBeInTheDocument();
		expect(api.structure).toHaveBeenCalledWith('curriculum-1');
	}, 15000);

	it('keeps entered source and name fields when curriculum creation fails', async () => {
		api.createCurriculum.mockRejectedValue({
			response: { data: { message: 'Tên chương trình đã tồn tại.' } },
		});
		render(<AdminPage />);

		fireEvent.click(await screen.findByRole('button', { name: /Tạo chương trình/ }));
		const name = screen.getByLabelText('Tên chương trình');
		fireEvent.change(name, { target: { value: 'CTĐT mới' } });
		fireEvent.change(screen.getByLabelText('Tên tài liệu'), { target: { value: 'Nguồn mới' } });
		fireEvent.change(screen.getByLabelText('URL hoặc thông tin tham chiếu'), { target: { value: 'https://example.test/new' } });
		fireEvent.change(screen.getByLabelText('Năm/phiên bản'), { target: { value: '2027' } });
		fireEvent.change(screen.getByLabelText('Ngày xác minh'), { target: { value: '2026-10-04' } });
		fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

		await waitFor(() => expect(api.createCurriculum).toHaveBeenCalled());
		expect(await screen.findByText('Tên chương trình đã tồn tại.')).toBeInTheDocument();
		expect(name).toHaveValue('CTĐT mới');
		expect(screen.getByLabelText('Tên tài liệu')).toHaveValue('Nguồn mới');

		api.createCurriculum.mockResolvedValue({ ...curriculum, id: 'curriculum-2' });
		fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
		await waitFor(() => expect(api.createCurriculum).toHaveBeenCalledTimes(2));
		expect(await screen.findByText('Đã lưu chương trình.')).toBeInTheDocument();
		expect(api.createCurriculum).toHaveBeenLastCalledWith({
			name: 'CTĐT mới',
			description: undefined,
			source: {
				documentName: 'Nguồn mới',
				reference: 'https://example.test/new',
				version: '2027',
				verifiedAt: '2026-10-04',
			},
		});
	}, 15000);
});