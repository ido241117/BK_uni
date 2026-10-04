import { ArrowRightOutlined, CheckCircleFilled, DeleteOutlined, SaveOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Input, message, Modal, Progress, Select, Spin, Table, Tag } from 'antd';
import type { TableProps } from 'antd';
import { isAxiosError } from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { curriculumApi, studentApi } from '@/apis';
import type { StudentCourse, StudentProfile } from '@/apis';
import type { AdminCurriculum, CourseStatus } from '@/types';

type StudentCourseRow = Omit<StudentCourse, 'term'> & { term: string };

const statusOptions = [
	{ value: 'not_started', label: 'Chưa học' },
	{ value: 'in_progress', label: 'Đang học' },
	{ value: 'completed', label: 'Đã học' },
];

export default function StudentPage() {
	const [profile, setProfile] = useState<StudentProfile | null>(null);
	const [profileName, setProfileName] = useState('');
	const [curriculumId, setCurriculumId] = useState<string | null>(null);
	const [curricula, setCurricula] = useState<AdminCurriculum[]>([]);
	const [courses, setCourses] = useState<StudentCourseRow[]>([]);
	const [courseStatuses, setCourseStatuses] = useState<Record<string, CourseStatus>>({});
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [profileReady, setProfileReady] = useState(false);
	const [search, setSearch] = useState('');
	const [term, setTerm] = useState('all');
	const [messageApi, contextHolder] = message.useMessage();
	const navigate = useNavigate();

	useEffect(() => {
		let active = true;
		Promise.all([
			curriculumApi.listStudent(),
			studentApi.profile().catch((error: unknown) => {
				if (isAxiosError(error) && error.response?.status === 404) return null;
				throw error;
			}),
		])
			.then(([curriculumResult, profileResult]) => {
				if (!active) return;
				setCurricula(curriculumResult.items);
				setProfile(profileResult);
				setProfileName(profileResult?.displayName ?? '');
				setCurriculumId(profileResult?.curriculumId ?? null);
			})
			.catch(() => {
				if (active) messageApi.error('Không thể tải hồ sơ học tập.');
			})
			.finally(() => {
				if (active) {
					setLoading(false);
					setProfileReady(true);
				}
			});
		return () => { active = false; };
	}, [messageApi]);

	useEffect(() => {
		if (!profileReady || !profile?.curriculumId) {
			setCourses([]);
			setCourseStatuses({});
			return;
		}
		let active = true;
		setLoading(true);
		const loadCourses = async () => {
			const firstPage = await curriculumApi.courses(profile.curriculumId!, { offset: 0 });
			const remainingPages = await Promise.all(
				Array.from(
					{ length: Math.ceil(firstPage.page.total / 100) - 1 },
					(_, index) => curriculumApi.courses(profile.curriculumId!, { offset: (index + 1) * 100 }),
				),
			);
			return [firstPage, ...remainingPages].flatMap((page) => page.items);
		};
		loadCourses()
			.then((items) => {
				if (!active) return;
				const rows = items.map((course) => ({ ...course, term: course.term.name }));
				setCourses(rows);
				setCourseStatuses(Object.fromEntries(rows.map((course) => [course.id, course.status ?? 'not_started'])));
			})
			.catch(() => {
				if (active) messageApi.error('Không thể tải danh sách học phần.');
			})
			.finally(() => { if (active) setLoading(false); });
		return () => { active = false; };
	}, [messageApi, profile?.curriculumId, profileReady]);

	const filteredCourses = useMemo(
		() => courses.filter((course) => {
			const matchesSearch = `${course.code} ${course.name}`.toLowerCase().includes(search.toLowerCase());
			return matchesSearch && (term === 'all' || course.term === term);
		}),
		[courses, search, term],
	);
	const completed = courses.filter((course) => courseStatuses[course.id] === 'completed').length;
	const inProgress = courses.filter((course) => courseStatuses[course.id] === 'in_progress').length;
	const notStarted = courses.length - completed - inProgress;
	const selectedCurriculum = curricula.find((item) => item.id === profile?.curriculumId);
	const persistCourseStatuses = async () => {
		const items = courses.map((course) => ({
			courseId: course.id,
			status: courseStatuses[course.id] ?? 'not_started',
		}));
		for (let offset = 0; offset < items.length; offset += 500) {
			await studentApi.updateStatuses(items.slice(offset, offset + 500));
		}
	};

	const saveProfile = async () => {
		setSaving(true);
		try {
			const updated = await studentApi.updateProfile({
				displayName: profileName.trim() || null,
				curriculumId,
			});
			setProfile(updated);
			await persistCourseStatuses();
			messageApi.success('Hồ sơ và trạng thái học phần đã được lưu.');
		} catch {
			messageApi.error('Không thể lưu hồ sơ. Dữ liệu đang chỉnh sửa vẫn được giữ.');
		} finally {
			setSaving(false);
		}
	};

	const selectCurriculum = async (nextCurriculumId: string) => {
		setSaving(true);
		try {
			if (profile?.curriculumId && courses.length) await persistCourseStatuses();
			const updated = await studentApi.updateProfile({
				displayName: profileName.trim() || null,
				curriculumId: nextCurriculumId,
			});
			setProfile(updated);
			setCurriculumId(nextCurriculumId);
		} catch {
			messageApi.error('Không thể đổi chương trình. Lựa chọn hiện tại được giữ nguyên.');
		} finally {
			setSaving(false);
		}
	};

	const requestCurriculumChange = (nextCurriculumId: string) => {
		if (nextCurriculumId === profile?.curriculumId) return;
		if (!profile?.curriculumId) {
			void selectCurriculum(nextCurriculumId);
			return;
		}
		Modal.confirm({
			title: 'Đổi chương trình đào tạo?',
			content: 'Trạng thái môn của chương trình hiện tại sẽ được giữ lại.',
			okText: 'Đổi chương trình',
			cancelText: 'Ở lại',
			onOk: () => selectCurriculum(nextCurriculumId),
		});
	};

	const deleteProfile = () => Modal.confirm({
		title: 'Xóa hồ sơ học tập?',
		content: 'Tài khoản và lịch sử phân tích không bị xóa.',
		okText: 'Xóa hồ sơ',
		okButtonProps: { danger: true },
		cancelText: 'Hủy',
		onOk: async () => {
			try {
				await studentApi.deleteProfile();
				setProfile(null);
				setProfileName('');
				setCurriculumId(null);
				setCourses([]);
				setCourseStatuses({});
				messageApi.success('Hồ sơ học tập đã được xóa.');
			} catch {
				messageApi.error('Không thể xóa hồ sơ.');
			}
		},
	});

	const columns: TableProps<StudentCourseRow>['columns'] = [
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
			render: (value: StudentCourseRow['requirementType']) => <Tag className={value === 'required' ? 'tag-required' : 'tag-elective'}>{value === 'required' ? 'Bắt buộc' : 'Tự chọn'}</Tag>,
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
					onChange={(value: CourseStatus) => setCourseStatuses((current) => ({ ...current, [course.id]: value }))}
				/>
			),
		},
	];

	return (
		<>
			{contextHolder}
			{loading && !profileReady ? <Spin className="route-loading" /> : null}
			<div className="page-heading student-heading">
				<div>
					<span className="eyebrow">HỒ SƠ HỌC TẬP / SINH VIÊN</span>
					<h1>Chào mừng trở lại.</h1>
					<p>Theo dõi tiến độ môn học và cập nhật hồ sơ theo chương trình của bạn.</p>
				</div>
				<div className="heading-actions">
					{profile ? <Button danger icon={<DeleteOutlined />} onClick={deleteProfile}>Xóa hồ sơ</Button> : null}
					<Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={saveProfile}>{profile ? 'Lưu hồ sơ' : 'Tạo hồ sơ'}</Button>
				</div>
			</div>

			<section className="profile-strip">
				<label className="profile-field">
					<span>TÊN HỒ SƠ</span>
					<Input value={profileName} onChange={(event) => setProfileName(event.target.value)} aria-label="Tên hồ sơ" />
				</label>
				<label className="profile-field curriculum-field">
					<span>CHƯƠNG TRÌNH ĐÀO TẠO</span>
					<Select value={curriculumId ?? undefined} onChange={requestCurriculumChange} options={curricula.map((item) => ({ label: item.name, value: item.id }))} placeholder="Chọn chương trình" />
				</label>
				<div className="profile-progress">
					<div className="progress-copy"><span>TIẾN ĐỘ HỌC PHẦN</span><strong>{completed}/{courses.length}</strong></div>
					<Progress percent={courses.length ? Math.round((completed / courses.length) * 100) : 0} showInfo={false} strokeColor="#176b57" railColor="#e6ebe5" />
				</div>
			</section>

			<section className="metric-row" aria-label="Thống kê trạng thái môn học">
				<div className="metric-item"><span className="metric-dot done" /><span>Đã học</span><strong>{completed}</strong></div>
				<div className="metric-item"><span className="metric-dot current" /><span>Đang học</span><strong>{inProgress}</strong></div>
				<div className="metric-item"><span className="metric-dot todo" /><span>Chưa học</span><strong>{notStarted}</strong></div>
				<div className="metric-note"><CheckCircleFilled /> {selectedCurriculum ? `Đang theo học ${selectedCurriculum.name}` : 'Chưa chọn chương trình'}</div>
			</section>

			<section className="course-section">
				<div className="section-heading">
					<div><span className="eyebrow">DANH MỤC ĐÀO TẠO</span><h2>Môn thuộc chương trình</h2></div>
					<Button type="primary" icon={<ArrowRightOutlined />} disabled={!profile?.curriculumId} onClick={() => navigate('/analysis')}>Xem phân tích</Button>
				</div>
				<div className="course-toolbar">
					<Input allowClear prefix={<SearchOutlined />} placeholder="Tìm theo mã hoặc tên môn" value={search} onChange={(event) => setSearch(event.target.value)} />
					<Select value={term} onChange={setTerm} options={[{ value: 'all', label: 'Tất cả học kỳ' }, ...Array.from(new Set(courses.map((course) => course.term))).map((value) => ({ value, label: value }))]} />
					<span className="result-count">{filteredCourses.length} học phần</span>
				</div>
				<Table<StudentCourseRow>
					columns={columns}
					dataSource={filteredCourses}
					loading={loading}
					rowKey="id"
					pagination={{ pageSize: 8, hideOnSinglePage: true, showSizeChanger: false }}
					locale={{ emptyText: profile?.curriculumId ? 'Không tìm thấy học phần phù hợp.' : 'Chọn chương trình để xem học phần.' }}
					className="course-table"
				/>
				<p className="section-footnote">Môn chưa cập nhật trạng thái được tính là <strong>chưa học</strong>. Trạng thái đang học vẫn được tính là đã đáp ứng điều kiện tiên quyết.</p>
			</section>
		</>
	);
}