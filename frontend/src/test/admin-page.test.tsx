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
		expect(screen.getByText('Gợi ý tải học kỳ: Chưa cấu hình')).toBeInTheDocument();
		expect(screen.queryByText('Khoa học Máy tính')).not.toBeInTheDocument();
		expect(api.structure).toHaveBeenCalledWith('curriculum-1');
	}, 15000);

	it('does not request rules for the previous curriculum course after switching programs', async () => {
		const secondCurriculum = { ...curriculum, id: 'curriculum-2', name: 'CTĐT thứ hai' };
		const firstCourse = {
			id: 'course-1', code: 'CS101', version: '2026', name: 'Nhập môn', nameEn: null,
			credits: 3, recommendationPriority: 0, termId: 'term-1', requirementType: 'required' as const,
			electiveGroupId: null, term: { id: 'term-1', code: 'T1', name: 'Học kỳ 1', sortOrder: 0 }, electiveGroup: null,
		};
		const secondCourse = { ...firstCourse, id: 'course-2', code: 'CS201', name: 'Cấu trúc dữ liệu' };
		api.listAdmin.mockResolvedValue({ items: [curriculum, secondCurriculum], page: { limit: 100, offset: 0, total: 2 } });
		api.structure.mockImplementation(async (id: string) => ({
			curriculum: id === curriculum.id ? curriculum : secondCurriculum,
			terms: [],
			electiveGroups: [],
			courses: [id === curriculum.id ? firstCourse : secondCourse],
		}));
		render(<AdminPage />);

		await waitFor(() => expect(api.rules).toHaveBeenCalledWith('curriculum-1', 'course-1'));
		fireEvent.click(await screen.findByRole('button', { name: /CTĐT thứ hai/ }));

		await waitFor(() => expect(api.rules).toHaveBeenCalledWith('curriculum-2', 'course-2'));
		expect(api.rules).not.toHaveBeenCalledWith('curriculum-2', 'course-1');
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
		fireEvent.click(screen.getByLabelText('Cấu hình tải gợi ý học kỳ'));
		fireEvent.change(screen.getByLabelText('Tổng tín chỉ mục tiêu'), { target: { value: '140' } });
		fireEvent.change(screen.getByLabelText('Tín chỉ tối thiểu/kỳ'), { target: { value: '11' } });
		fireEvent.change(screen.getByLabelText('Tín chỉ tối đa/kỳ'), { target: { value: '24' } });
		fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

		await waitFor(() => expect(api.createCurriculum).toHaveBeenCalled());
		expect(await screen.findByText('Tên chương trình đã tồn tại.')).toBeInTheDocument();
		expect(name).toHaveValue('CTĐT mới');
		expect(screen.getByLabelText('Tên tài liệu')).toHaveValue('Nguồn mới');
		expect(screen.getByLabelText('Tổng tín chỉ mục tiêu')).toHaveValue('140.00');

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
			recommendationSettings: {
				totalCreditsTarget: 140,
				minimumSemesterCredits: 11,
				maximumSemesterCredits: 24,
			},
		});
	}, 15000);

	it('preserves configured values during a partial edit and sends null to clear', async () => {
		const configuredCurriculum = {
			...curriculum,
			recommendationSettings: {
				totalCreditsTarget: 140,
				minimumSemesterCredits: 11,
				maximumSemesterCredits: 24,
			},
		};
		api.listAdmin.mockResolvedValue({ items: [configuredCurriculum], page: { limit: 100, offset: 0, total: 1 } });
		api.structure.mockResolvedValue({ curriculum: configuredCurriculum, terms: [], electiveGroups: [], courses: [] });
		render(<AdminPage />);

		fireEvent.click(await screen.findByRole('button', { name: 'Sửa chương trình' }));
		expect(screen.getByLabelText('Tổng tín chỉ mục tiêu')).toHaveValue('140.00');
		fireEvent.change(screen.getByLabelText('Tín chỉ tối đa/kỳ'), { target: { value: '30' } });
		fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

		await waitFor(() => expect(api.updateCurriculum).toHaveBeenCalledWith(
			'curriculum-1',
			expect.objectContaining({
				recommendationSettings: {
					totalCreditsTarget: 140,
					minimumSemesterCredits: 11,
					maximumSemesterCredits: 30,
				},
			}),
		));

		fireEvent.click(await screen.findByRole('button', { name: 'Sửa chương trình' }));
		fireEvent.click(screen.getByLabelText('Cấu hình tải gợi ý học kỳ'));
		fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
		await waitFor(() => expect(api.updateCurriculum).toHaveBeenLastCalledWith(
			'curriculum-1',
			expect.objectContaining({ recommendationSettings: null }),
		));
	}, 15000);

	it('blocks settings with a minimum greater than the maximum', async () => {
		render(<AdminPage />);
		fireEvent.click(await screen.findByRole('button', { name: /Tạo chương trình/ }));
		fireEvent.click(screen.getByLabelText('Cấu hình tải gợi ý học kỳ'));
		fireEvent.change(screen.getByLabelText('Tổng tín chỉ mục tiêu'), { target: { value: '140' } });
		fireEvent.change(screen.getByLabelText('Tín chỉ tối thiểu/kỳ'), { target: { value: '20' } });
		fireEvent.change(screen.getByLabelText('Tín chỉ tối đa/kỳ'), { target: { value: '10' } });
		fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

		expect(await screen.findByText('Tín chỉ tối đa phải lớn hơn hoặc bằng mức tối thiểu.')).toBeInTheDocument();
		expect(api.createCurriculum).not.toHaveBeenCalled();
	}, 15000);

	it('blocks total, minimum, and maximum values outside their valid ranges', async () => {
		render(<AdminPage />);
		fireEvent.click(await screen.findByRole('button', { name: /Tạo chương trình/ }));
		fireEvent.change(screen.getByLabelText('Tên chương trình'), { target: { value: 'CTĐT mới' } });
		fireEvent.change(screen.getByLabelText('Tên tài liệu'), { target: { value: 'Nguồn' } });
		fireEvent.change(screen.getByLabelText('URL hoặc thông tin tham chiếu'), { target: { value: 'https://example.test/source' } });
		fireEvent.change(screen.getByLabelText('Năm/phiên bản'), { target: { value: '2026' } });
		fireEvent.change(screen.getByLabelText('Ngày xác minh'), { target: { value: '2026-10-04' } });
		fireEvent.click(screen.getByLabelText('Cấu hình tải gợi ý học kỳ'));
		fireEvent.change(screen.getByLabelText('Tổng tín chỉ mục tiêu'), { target: { value: '100000' } });
		fireEvent.change(screen.getByLabelText('Tín chỉ tối thiểu/kỳ'), { target: { value: '1000' } });
		fireEvent.change(screen.getByLabelText('Tín chỉ tối đa/kỳ'), { target: { value: '1000' } });
		expect(screen.getByLabelText('Tổng tín chỉ mục tiêu')).toHaveValue('100000');
		expect(screen.getByLabelText('Tín chỉ tối thiểu/kỳ')).toHaveValue('1000');
		expect(screen.getByLabelText('Tín chỉ tối đa/kỳ')).toHaveValue('1000');
		fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

		expect(api.createCurriculum).not.toHaveBeenCalled();
	}, 15000);

	it('loads and saves a course recommendation priority', async () => {
		const term = { id: 'term-1', code: 'T1', name: 'Học kỳ 1', sortOrder: 0 };
		const course = {
			id: 'course-1',
			code: 'CS101',
			version: '2026',
			name: 'Nhập môn lập trình',
			nameEn: null,
			credits: 3,
			recommendationPriority: 4,
			termId: term.id,
			requirementType: 'required' as const,
			electiveGroupId: null,
			term,
			electiveGroup: null,
		};
		api.structure.mockResolvedValue({ curriculum, terms: [term], electiveGroups: [], courses: [course] });
		api.updateCourse.mockResolvedValue({ ...course, recommendationPriority: 1 });
		render(<AdminPage />);

		fireEvent.click(await screen.findByRole('button', { name: 'Sửa CS101' }));
		const priority = screen.getByLabelText('Độ ưu tiên gợi ý');
		expect(priority).toHaveValue('4');
		fireEvent.change(priority, { target: { value: '1' } });
		fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

		await waitFor(() => expect(api.updateCourse).toHaveBeenCalledWith(
			'curriculum-1',
			'course-1',
			expect.objectContaining({ recommendationPriority: 1 }),
		));
	}, 15000);
});