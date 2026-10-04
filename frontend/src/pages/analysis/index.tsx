import { ArrowLeftOutlined, CheckCircleFilled, ClockCircleOutlined, FileSearchOutlined, WarningOutlined } from '@ant-design/icons';
import { Button, Progress, Table, Tag, Timeline, message } from 'antd';
import type { TableProps } from 'antd';
import dayjs from 'dayjs';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useAppContext } from '@/contexts/use-app-context';
import { demoCourses } from '@/data/demo';
import type { AnalysisRecord } from '@/types';

export default function AnalysisPage() {
	const { courseStatuses, curriculumName, profileName, addAnalysis } = useAppContext();
	const [messageApi, contextHolder] = message.useMessage();
	const navigate = useNavigate();

	const results = useMemo(() => demoCourses.map((course) => {
		const prerequisite = course.prerequisiteId
			? demoCourses.find((item) => item.id === course.prerequisiteId)
			: undefined;
		const prerequisiteMet = !prerequisite || ['completed', 'in_progress'].includes(courseStatuses[prerequisite.id]);
		return {
			...course,
			eligible: prerequisiteMet,
			reason: prerequisiteMet ? 'Đủ điều kiện theo dữ liệu hiện có' : `Chưa đáp ứng ${prerequisite?.code}`,
		};
	}), [courseStatuses]);

	const eligibleCount = results.filter((course) => course.eligible).length;
	const ineligibleCount = results.length - eligibleCount;
	const missingRequired = results.filter((course) => course.requirementType === 'required' && !['completed', 'in_progress'].includes(courseStatuses[course.id]));

	const columns: TableProps<(typeof results)[number]>['columns'] = [
		{ title: 'MÃ MÔN', dataIndex: 'code', key: 'code', width: 110, render: (value: string) => <span className="course-code">{value}</span> },
		{ title: 'HỌC PHẦN', dataIndex: 'name', key: 'name' },
		{
			title: 'ĐIỀU KIỆN',
			dataIndex: 'eligible',
			key: 'eligible',
			width: 150,
			render: (value: boolean) => <Tag className={value ? 'tag-success' : 'tag-warning'}>{value ? 'Đủ điều kiện' : 'Chưa đủ'}</Tag>,
		},
		{ title: 'GHI CHÚ', dataIndex: 'reason', key: 'reason' },
	];

	const runAnalysis = () => {
		const record: AnalysisRecord = {
			id: `analysis-${Date.now()}`,
			createdAt: new Date().toISOString(),
			eligibleCourses: eligibleCount,
			ineligibleCourses: ineligibleCount,
			missingRequiredCourses: missingRequired.length,
		};
		addAnalysis(record);
		messageApi.success('Đã tạo snapshot phân tích mới.');
	};

	return (
		<>
			{contextHolder}
			<div className="breadcrumb-line"><Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/student')}>Hồ sơ học tập</Button><span>/</span><span>Phân tích</span></div>
			<div className="page-heading">
				<div>
					<span className="eyebrow">KẾT QUẢ ĐÁNH GIÁ</span>
					<h1>Phân tích điều kiện học phần</h1>
					<p>{profileName} <span className="inline-separator">·</span> {curriculumName}</p>
				</div>
				<Button type="primary" icon={<FileSearchOutlined />} onClick={runAnalysis}>Chạy phân tích mới</Button>
			</div>

			<section className="analysis-summary">
				<div className="analysis-score">
					<span className="eyebrow">ĐỦ ĐIỀU KIỆN</span>
					<div className="score-number">{eligibleCount}<span>/{results.length}</span></div>
					<Progress percent={Math.round((eligibleCount / results.length) * 100)} showInfo={false} strokeColor="#176b57" railColor="#e6ebe5" />
					<p>học phần có thể đăng ký theo các điều kiện đã khai báo</p>
				</div>
				<div className="analysis-stat"><span>CHƯA ĐỦ ĐIỀU KIỆN</span><strong>{ineligibleCount}</strong><p>cần hoàn thành môn tiên quyết</p></div>
				<div className="analysis-stat"><span>MÔN BẮT BUỘC CÒN THIẾU</span><strong>{missingRequired.length}</strong><p>chưa học hoặc đang chưa hoàn tất</p></div>
				<div className="analysis-status"><CheckCircleFilled /><span>Kết quả mới nhất<br /><strong>Đã cập nhật theo hồ sơ</strong></span></div>
			</section>

			<section className="analysis-section">
				<div className="section-heading"><div><span className="eyebrow">TỪNG HỌC PHẦN</span><h2>Điều kiện đăng ký</h2></div><span className="updated-label"><ClockCircleOutlined /> Vừa cập nhật</span></div>
				<Table columns={columns} dataSource={results} rowKey="id" pagination={false} className="course-table analysis-table" />
			</section>

			<section className="missing-section">
				<div className="section-heading"><div><span className="eyebrow">TIẾN ĐỘ CHƯƠNG TRÌNH</span><h2>Yêu cầu còn thiếu</h2></div></div>
				{missingRequired.length ? (
					<div className="missing-list">
						{missingRequired.map((course) => (
							<div className="missing-row" key={course.id}>
								<span className="missing-icon"><WarningOutlined /></span>
								<span className="course-code">{course.code}</span>
								<strong>{course.name}</strong>
								<span>{course.credits} tín chỉ</span>
								<Tag className="tag-warning">Chưa hoàn thành</Tag>
							</div>
						))}
					</div>
				) : <div className="empty-success"><CheckCircleFilled /> Bạn đã hoàn thành các môn bắt buộc trong dữ liệu mẫu.</div>}
			</section>
			<p className="demo-disclaimer">Kết quả minh họa dựa trên dữ liệu mẫu; chưa thay thế kết quả từ backend.</p>
		</>
	);
}

export function HistoryPage() {
	const { analysisHistory, curriculumName, profileName } = useAppContext();

	return (
		<>
			<div className="page-heading">
				<div><span className="eyebrow">HỒ SƠ / SNAPSHOT</span><h1>Lịch sử phân tích</h1><p>{profileName} <span className="inline-separator">·</span> {curriculumName}</p></div>
			</div>
			<section className="history-section">
				<div className="section-heading"><div><span className="eyebrow">CÁC LẦN ĐÁNH GIÁ</span><h2>Kết quả đã lưu</h2></div><span className="result-count">{analysisHistory.length} lần phân tích</span></div>
				<Timeline
					items={analysisHistory.map((record) => ({
						dot: <span className="timeline-dot"><CheckCircleFilled /></span>,
						children: (
							<div className="history-item">
								<div className="history-date"><strong>{dayjs(record.createdAt).format('DD MMM YYYY')}</strong><span>{dayjs(record.createdAt).format('HH:mm')}</span></div>
								<div className="history-result"><strong>{record.eligibleCourses} học phần đủ điều kiện</strong><span>{record.ineligibleCourses} chưa đủ · {record.missingRequiredCourses} môn bắt buộc còn thiếu</span></div>
								<Tag className="tag-success">Snapshot</Tag>
							</div>
						),
					}))}
				/>
			</section>
			{!analysisHistory.length && <div className="empty-success">Chưa có lần phân tích nào được lưu.</div>}
		</>
	);
}