import { ArrowRightOutlined, CheckCircleFilled, SaveOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Input, message, Progress, Select, Table, Tag } from 'antd';
import type { TableProps } from 'antd';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAppContext } from '@/contexts/use-app-context';
import { demoCourses, demoCurricula } from '@/data/demo';
import type { Course, CourseStatus } from '@/types';

const statusOptions = [
	{ value: 'not_started', label: 'Chưa học' },
	{ value: 'in_progress', label: 'Đang học' },
	{ value: 'completed', label: 'Đã học' },
];

export default function StudentPage() {
	const {
		profileName,
		setProfileName,
		curriculumName,
		setCurriculumName,
		courseStatuses,
		setCourseStatus,
	} = useAppContext();
	const [search, setSearch] = useState('');
	const [term, setTerm] = useState('all');
	const [messageApi, contextHolder] = message.useMessage();
	const navigate = useNavigate();

	const filteredCourses = useMemo(
		() => demoCourses.filter((course) => {
			const matchesSearch = `${course.code} ${course.name}`.toLowerCase().includes(search.toLowerCase());
			return matchesSearch && (term === 'all' || course.term === term);
		}),
		[search, term],
	);
	const completed = Object.values(courseStatuses).filter((status) => status === 'completed').length;
	const inProgress = Object.values(courseStatuses).filter((status) => status === 'in_progress').length;
	const notStarted = demoCourses.length - completed - inProgress;

	const columns: TableProps<Course>['columns'] = [
		{
			title: 'HỌC PHẦN',
			dataIndex: 'name',
			key: 'course',
			render: (_, course) => (
				<div className="course-cell">
					<span className="course-code">{course.code}</span>
					<strong>{course.name}</strong>
				</div>
			),
		},
		{ title: 'HỌC KỲ', dataIndex: 'term', key: 'term', width: 130 },
		{ title: 'TÍN CHỈ', dataIndex: 'credits', key: 'credits', width: 90, align: 'center' },
		{
			title: 'PHÂN LOẠI',
			dataIndex: 'requirementType',
			key: 'type',
			width: 132,
			render: (value: Course['requirementType']) => <Tag className={value === 'required' ? 'tag-required' : 'tag-elective'}>{value === 'required' ? 'Bắt buộc' : 'Tự chọn'}</Tag>,
		},
		{
			title: 'TRẠNG THÁI',
			key: 'status',
			width: 154,
			render: (_, course) => (
				<Select
					value={courseStatuses[course.id] ?? 'not_started'}
					options={statusOptions}
					size="small"
					className="status-select"
					onChange={(value: CourseStatus) => setCourseStatus(course.id, value)}
				/>
			),
		},
	];

	return (
		<>
			{contextHolder}
			<div className="page-heading student-heading">
				<div>
					<span className="eyebrow">HỒ SƠ HỌC TẬP / SINH VIÊN</span>
					<h1>Chào mừng trở lại.</h1>
					<p>Theo dõi tiến độ môn học và cập nhật hồ sơ theo chương trình của bạn.</p>
				</div>
				<Button type="primary" icon={<SaveOutlined />} onClick={() => messageApi.success('Hồ sơ đã được lưu trong bản demo.')}>Lưu hồ sơ</Button>
			</div>

			<section className="profile-strip">
				<label className="profile-field">
					<span>TÊN HỒ SƠ</span>
					<Input value={profileName} onChange={(event) => setProfileName(event.target.value)} aria-label="Tên hồ sơ" />
				</label>
				<label className="profile-field curriculum-field">
					<span>CHƯƠNG TRÌNH ĐÀO TẠO</span>
					<Select value={curriculumName} onChange={setCurriculumName} options={demoCurricula.map((item) => ({ label: item.name, value: item.name }))} />
				</label>
				<div className="profile-progress">
					<div className="progress-copy"><span>TIẾN ĐỘ HỌC PHẦN</span><strong>{completed}/{demoCourses.length}</strong></div>
					<Progress percent={Math.round((completed / demoCourses.length) * 100)} showInfo={false} strokeColor="#176b57" railColor="#e6ebe5" />
				</div>
			</section>

			<section className="metric-row" aria-label="Thống kê trạng thái môn học">
				<div className="metric-item"><span className="metric-dot done" /><span>Đã học</span><strong>{completed}</strong></div>
				<div className="metric-item"><span className="metric-dot current" /><span>Đang học</span><strong>{inProgress}</strong></div>
				<div className="metric-item"><span className="metric-dot todo" /><span>Chưa học</span><strong>{notStarted}</strong></div>
				<div className="metric-note"><CheckCircleFilled /> Đang theo học {curriculumName}</div>
			</section>

			<section className="course-section">
				<div className="section-heading">
					<div><span className="eyebrow">DANH MỤC ĐÀO TẠO</span><h2>Môn thuộc chương trình</h2></div>
					<Button type="primary" icon={<ArrowRightOutlined />} onClick={() => navigate('/analysis')}>Xem phân tích</Button>
				</div>
				<div className="course-toolbar">
					<Input allowClear prefix={<SearchOutlined />} placeholder="Tìm theo mã hoặc tên môn" value={search} onChange={(event) => setSearch(event.target.value)} />
					<Select value={term} onChange={setTerm} options={[{ value: 'all', label: 'Tất cả học kỳ' }, ...Array.from(new Set(demoCourses.map((course) => course.term))).map((value) => ({ value, label: value }))]} />
					<span className="result-count">{filteredCourses.length} học phần</span>
				</div>
				<Table<Course>
					columns={columns}
					dataSource={filteredCourses}
					rowKey="id"
					pagination={{ pageSize: 8, hideOnSinglePage: true, showSizeChanger: false }}
					locale={{ emptyText: 'Không tìm thấy học phần phù hợp.' }}
					className="course-table"
				/>
				<p className="section-footnote">Môn chưa cập nhật trạng thái được tính là <strong>chưa học</strong>. Trạng thái đang học vẫn được tính là đã đáp ứng điều kiện tiên quyết.</p>
			</section>
		</>
	);
}