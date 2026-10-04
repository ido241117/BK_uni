import type { Course, Curriculum } from '@/types';

export const demoCurricula: Curriculum[] = [
	{
		id: 'cs',
		name: 'Khoa học Máy tính',
		description: 'Chương trình đào tạo thử nghiệm',
		courseCount: 8,
	},
	{
		id: 'se',
		name: 'Kỹ thuật Phần mềm',
		description: 'Chương trình đào tạo thử nghiệm',
		courseCount: 6,
	},
];

export const demoCourses: Course[] = [
	{ id: 'ma101', code: 'MA101', name: 'Giải tích 1', credits: 4, term: 'Học kỳ 1', requirementType: 'required' },
	{ id: 'cs101', code: 'CS101', name: 'Nhập môn lập trình', credits: 4, term: 'Học kỳ 1', requirementType: 'required' },
	{ id: 'ph101', code: 'PH101', name: 'Vật lý đại cương', credits: 3, term: 'Học kỳ 2', requirementType: 'required' },
	{ id: 'cs102', code: 'CS102', name: 'Cấu trúc dữ liệu', credits: 4, term: 'Học kỳ 2', requirementType: 'required', prerequisiteId: 'cs101' },
	{ id: 'cs201', code: 'CS201', name: 'Giải thuật', credits: 4, term: 'Học kỳ 3', requirementType: 'required', prerequisiteId: 'cs102' },
	{ id: 'cs202', code: 'CS202', name: 'Cơ sở dữ liệu', credits: 3, term: 'Học kỳ 3', requirementType: 'required', prerequisiteId: 'cs102' },
	{ id: 'cs203', code: 'CS203', name: 'Mạng máy tính', credits: 3, term: 'Học kỳ 4', requirementType: 'required' },
	{ id: 'el101', code: 'EL101', name: 'Thiết kế trải nghiệm số', credits: 2, term: 'Học kỳ 4', requirementType: 'elective' },
];