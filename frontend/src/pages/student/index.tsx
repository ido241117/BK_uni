import { ArrowRightOutlined, CheckCircleFilled, DeleteOutlined, SaveOutlined, SearchOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { Alert, Button, Input, message, Modal, Progress, Select, Spin, Table, Tag } from 'antd';
import type { TableProps } from 'antd';
import { isAxiosError } from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { curriculumApi, studentApi } from '@/apis';
import type { StudentCourse, StudentProfile } from '@/apis';
import type { AdminCurriculum, CourseRecommendationResponse, CourseStatus } from '@/types';

type StudentCourseRow = Omit<StudentCourse, 'term'> & { term: string };

const statusOptions = [
	{ value: 'not_started', label: 'Chưa học' },
	{ value: 'in_progress', label: 'Đang học' },
	{ value: 'completed', label: 'Đã học' },
];

const deferredReasonLabels = {
	RULE_NOT_SATISFIED: 'Chưa đạt điều kiện học phần',
	MAX_CREDITS_REACHED: 'Không còn đủ chỗ trong giới hạn tín chỉ tối đa',
	TARGET_REACHED: 'Đã đạt tải tín chỉ mục tiêu',
} as const;

function recommendationErrorMessage(error: unknown) {
	const code = isAxiosError(error) ? error.response?.data?.code : undefined;
	const messages: Record<string, string> = {
		PROFILE_REQUIRED_FIELDS: 'Hãy lưu hồ sơ và chọn chương trình đào tạo trước khi yêu cầu gợi ý.',
		CURRICULUM_NOT_SELECTED: 'Hồ sơ hiện chưa có chương trình đào tạo hợp lệ.',
		CURRICULUM_RECOMMENDATION_NOT_CONFIGURED: 'Chương trình chưa cấu hình tải gợi ý học kỳ.',
		CURRICULUM_RECOMMENDATION_SETTINGS_INVALID: 'Cấu hình tải gợi ý của chương trình không hợp lệ.',
		CURRICULUM_HAS_NO_TERMS: 'Chương trình chưa có học kỳ hoạt động.',
		CURRICULUM_HAS_NO_COURSES: 'Chương trình chưa có học phần hoạt động.',
		COURSE_RECOMMENDATION_PRIORITY_INVALID: 'Có học phần thiếu độ ưu tiên gợi ý hợp lệ.',
		CURRICULUM_RECOMMENDATION_DATA_INVALID: 'Dữ liệu chương trình chưa đủ hợp lệ để tạo gợi ý.',
	};
	return messages[code] ?? 'Không thể tạo gợi ý lúc này. Hồ sơ đang chỉnh sửa vẫn được giữ nguyên.';
}

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
	const [recommendation, setRecommendation] = useState<CourseRecommendationResponse | null>(null);
	const [recommendationLoading, setRecommendationLoading] = useState(false);
	const [recommendationError, setRecommendationError] = useState('');
	const [statusesDirty, setStatusesDirty] = useState(false);
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
	const canRecommend = Boolean(profile?.curriculumId && selectedCurriculum?.recommendationSettings && !statusesDirty);

	useEffect(() => {
		setRecommendation(null);
		setRecommendationError('');
	}, [profile?.curriculumId]);

	const requestRecommendation = async () => {
		setRecommendationLoading(true);
		setRecommendationError('');
		try {
			setRecommendation(await studentApi.courseRecommendations());
		} catch (error) {
			setRecommendationError(recommendationErrorMessage(error));
		} finally {
			setRecommendationLoading(false);
		}
	};
	const persistCourseStatuses = async () => {
		const items = courses.map((course) => ({
			courseId: course.id,
			status: courseStatuses[course.id] ?? 'not_started',
		}));
		for (let offset = 0; offset < items.length; offset += 500) {
			await studentApi.updateStatuses(items.slice(offset, offset + 500));
		}
		setStatusesDirty(false);
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
				setStatusesDirty(false);
				setRecommendation(null);
				setRecommendationError('');
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
					onChange={(value: CourseStatus) => {
						setCourseStatuses((current) => ({ ...current, [course.id]: value }));
						setStatusesDirty(true);
					}}
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

			<section className="recommendation-section" aria-labelledby="recommendation-title">
				<div className="section-heading">
					<div><span className="eyebrow">KẾ HOẠCH HỌC TẬP</span><h2 id="recommendation-title">Gợi ý học kỳ</h2><p>Kỳ ước tính dựa trên tín chỉ tích lũy, không phải lựa chọn kỳ đăng ký.</p></div>
					<Button type="primary" icon={<ThunderboltOutlined />} loading={recommendationLoading} disabled={!canRecommend || recommendationLoading} onClick={() => void requestRecommendation()}>
						{recommendation ? 'Tạo gợi ý mới' : 'Tạo gợi ý'}
					</Button>
				</div>
				{!profile?.curriculumId ? <Alert type="info" showIcon title="Tạo hồ sơ và chọn chương trình đào tạo để yêu cầu gợi ý." /> : null}
				{profile?.curriculumId && !selectedCurriculum?.recommendationSettings ? <Alert type="info" showIcon title="Chương trình chưa cấu hình tải gợi ý học kỳ." /> : null}
				{statusesDirty ? <Alert type="info" showIcon title="Bạn đã thay đổi trạng thái môn; hãy lưu hồ sơ để gợi ý dùng tiến độ mới nhất." /> : null}
				{recommendationError ? <Alert className="recommendation-alert" type="error" showIcon title={recommendationError} /> : null}
				{recommendation ? <RecommendationResult result={recommendation} /> : null}
			</section>
		</>
	);
}

function RecommendationResult({ result }: { result: CourseRecommendationResponse }) {
	if (result.status === 'program_completed') {
		return <Alert className="recommendation-result" type="success" showIcon title="Đã hoàn thành chương trình đào tạo." description={`Đã tích lũy ${result.progress.accumulatedCredits} / ${result.progress.totalCreditsTarget} tín chỉ mục tiêu. Không có môn học nào được đề xuất.`} />;
	}

	const { progress, warnings } = result;
	return (
		<div className="recommendation-result">
			<div className="recommendation-progress" aria-label="Tải tín chỉ mục tiêu">
				<div><span>KỲ ƯỚC TÍNH</span><strong>{result.estimatedTerm ? `${result.estimatedTerm.name} (${result.estimatedTerm.code})` : 'Chưa xác định'}</strong></div>
				<div><span>ĐÃ TÍCH LŨY</span><strong>{progress.accumulatedCredits} / {progress.totalCreditsTarget} tín chỉ</strong></div>
				<div><span>TRUNG BÌNH / KỲ</span><strong>{progress.averageCreditsPerTerm} tín chỉ</strong></div>
				<div><span>TẢI KỲ</span><strong>{progress.minimumSemesterCredits}–{progress.maximumSemesterCredits} tín chỉ</strong></div>
				<div><span>MỤC TIÊU HIỆU LỰC</span><strong>{progress.effectiveTarget} tín chỉ</strong></div>
			</div>
			{warnings.minimumSemesterCreditsNotMet ? <Alert className="recommendation-alert" type="warning" showIcon title="Chưa đạt mức tín chỉ tối thiểu của kỳ." /> : null}
			{warnings.effectiveTargetNotReached ? <Alert className="recommendation-alert" type="warning" showIcon title="Danh sách đề xuất chưa đạt tải tín chỉ mục tiêu; giới hạn và điều kiện môn được giữ nguyên." /> : null}
			{warnings.noEligibleCandidates ? <Alert className="recommendation-alert" type="warning" showIcon title="Không có học phần đủ điều kiện để đề xuất." /> : null}
			{warnings.noCoursesRecommended && !warnings.noEligibleCandidates ? <Alert className="recommendation-alert" type="info" showIcon title="Không có học phần nào được đề xuất." /> : null}
			<div className="recommendation-list-heading"><h3>Học phần đề xuất</h3><strong>{result.summary.recommendedCredits} tín chỉ</strong></div>
			{result.recommendedCourses.length ? <ol className="recommendation-course-list">
				{result.recommendedCourses.map((item) => <li key={item.course.id}>
					<div><span className="course-code">{item.course.code} · {item.course.version}</span><strong>{item.course.name}</strong>{item.reasons.length ? <ul className="recommendation-reasons">{item.reasons.map((reason) => <li key={reason.ruleId}>{reason.message}</li>)}</ul> : <span className="recommendation-reason">Không có điều kiện bổ sung.</span>}</div>
					<div className="recommendation-course-meta"><Tag className={item.requirementType === 'required' ? 'tag-required' : 'tag-elective'}>{item.requirementType === 'required' ? 'Bắt buộc' : 'Tự chọn'}</Tag><span>{item.credits} tín chỉ</span></div>
				</li>)}
			</ol> : <p className="recommendation-empty">Chưa có học phần trong danh sách đề xuất.</p>}
			{result.deferredRequiredCourses.length ? <div className="deferred-section">
				<h3>Môn bắt buộc chưa được đề xuất</h3>
				<ul>{result.deferredRequiredCourses.map((item) => <li key={item.course.id}>
					<strong>{item.course.code} · {item.course.name}</strong><span>{item.credits} tín chỉ · {deferredReasonLabels[item.reason]}</span>
					{item.reasons.map((reason) => <small key={reason.ruleId}>{reason.message}</small>)}
				</li>)}</ul>
			</div> : null}
		</div>
	);
}