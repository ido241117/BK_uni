import { ArrowLeftOutlined, CheckCircleFilled, ClockCircleOutlined, FileSearchOutlined, WarningOutlined } from '@ant-design/icons';
import { Alert, Button, Empty, Modal, Progress, Table, Tag, message } from 'antd';
import type { TableProps } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { analysisApi, studentApi } from '@/apis';
import type { AnalysisHistoryDetail, AnalysisHistoryItem, AnalysisSnapshot } from '@/types';

export default function AnalysisPage() {
	const [snapshot, setSnapshot] = useState<AnalysisSnapshot | null>(null);
	const [profileName, setProfileName] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [messageApi, contextHolder] = message.useMessage();
	const navigate = useNavigate();

	useEffect(() => {
		let active = true;
		studentApi.profile().then((profile) => {
			if (active) setProfileName(profile.displayName ?? '');
		}).catch(() => {
			if (active) setError('Không thể tải hồ sơ học tập.');
		});
		return () => { active = false; };
	}, []);

	const runAnalysis = async () => {
		setLoading(true);
		setError('');
		try {
			setSnapshot(await analysisApi.run());
			messageApi.success('Đã lưu snapshot phân tích mới.');
		} catch {
			setError('Không thể phân tích. Hãy hoàn tất tên hồ sơ và chọn chương trình có học phần hoạt động.');
		} finally {
			setLoading(false);
		}
	};

	const columns: TableProps<AnalysisSnapshot['courseResults'][number]>['columns'] = [
		{ title: 'MÃ MÔN', dataIndex: ['course', 'code'], key: 'code', width: 110, render: (value: string) => <span className="course-code">{value}</span> },
		{ title: 'HỌC PHẦN', dataIndex: ['course', 'name'], key: 'name' },
		{
			title: 'ĐIỀU KIỆN',
			dataIndex: 'eligible',
			key: 'eligible',
			width: 150,
			render: (value: boolean) => <Tag className={value ? 'tag-success' : 'tag-warning'}>{value ? 'Đủ điều kiện' : 'Chưa đủ'}</Tag>,
		},
		{
			title: 'LÝ DO',
			key: 'reasons',
			render: (_, result) => result.reasons.length
				? <ul className="analysis-reasons">{result.reasons.map((reason) => <li key={reason.ruleId}>{reason.message}</li>)}</ul>
				: 'Không có điều kiện bổ sung.',
		},
	];
	const eligiblePercent = snapshot
		? Math.round(snapshot.summary.eligibleCourses / snapshot.courseResults.length * 100)
		: 0;

	return (
		<>
			{contextHolder}
			<div className="breadcrumb-line"><Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/student')}>Hồ sơ học tập</Button><span>/</span><span>Phân tích</span></div>
			<div className="page-heading">
				<div>
					<span className="eyebrow">KẾT QUẢ ĐÁNH GIÁ</span>
					<h1>Phân tích điều kiện học phần</h1>
					<p>{profileName || 'Hồ sơ học tập'}{snapshot ? <><span className="inline-separator"> · </span>{snapshot.curriculum.name}</> : null}</p>
				</div>
				<Button type="primary" icon={<FileSearchOutlined />} loading={loading} onClick={runAnalysis}>Chạy phân tích mới</Button>
			</div>
			{error ? <Alert type="error" showIcon message={error} /> : null}
			{snapshot ? <>
				<section className="analysis-summary">
					<div className="analysis-score">
						<span className="eyebrow">ĐỦ ĐIỀU KIỆN</span>
						<div className="score-number">{snapshot.summary.eligibleCourses}<span>/{snapshot.courseResults.length}</span></div>
						<Progress percent={eligiblePercent} showInfo={false} strokeColor="#176b57" railColor="#e6ebe5" />
						<p>học phần đủ điều kiện theo các ràng buộc đã khai báo</p>
					</div>
					<div className="analysis-stat"><span>CHƯA ĐỦ ĐIỀU KIỆN</span><strong>{snapshot.summary.ineligibleCourses}</strong><p>không thỏa tất cả điều kiện của học phần</p></div>
					<div className="analysis-stat"><span>MÔN BẮT BUỘC CÒN THIẾU</span><strong>{snapshot.summary.missingRequiredCourses}</strong><p>chưa học hoặc đang chưa hoàn tất</p></div>
					<div className="analysis-status"><CheckCircleFilled /><span>Snapshot đã lưu<br /><strong>{dayjs(snapshot.createdAt).format('DD/MM/YYYY HH:mm')}</strong></span></div>
				</section>

				<section className="analysis-section">
					<div className="section-heading"><div><span className="eyebrow">TỪNG HỌC PHẦN</span><h2>Điều kiện đăng ký</h2></div><span className="updated-label"><ClockCircleOutlined /> Snapshot</span></div>
					<Table columns={columns} dataSource={snapshot.courseResults} rowKey={(result) => result.course.id} pagination={false} className="course-table analysis-table" />
				</section>

				<section className="missing-section">
					<div className="section-heading"><div><span className="eyebrow">TIẾN ĐỘ CHƯƠNG TRÌNH</span><h2>Yêu cầu còn thiếu</h2></div></div>
					{snapshot.requirements.missingRequiredCourses.length ? (
						<div className="missing-list">
							{snapshot.requirements.missingRequiredCourses.map((course) => (
								<div className="missing-row" key={course.id}>
									<span className="missing-icon"><WarningOutlined /></span>
									<span className="course-code">{course.code}</span>
									<strong>{course.name}</strong>
									<span>{course.credits} tín chỉ</span>
									<Tag className="tag-warning">Chưa hoàn thành</Tag>
								</div>
							))}
						</div>
					) : <div className="empty-success"><CheckCircleFilled /> Đã hoàn thành các môn bắt buộc.</div>}
					{snapshot.requirements.electiveGroups.map((group) => (
						<div className="elective-progress" key={group.id}>
							<strong>{group.name}</strong>
							<span>{group.earnedCredits} tín chỉ · {group.earnedCourses} môn</span>
							<Tag className={group.complete ? 'tag-success' : 'tag-warning'}>{group.complete ? 'Đạt ngưỡng' : 'Còn thiếu'}</Tag>
						</div>
					))}
				</section>
			</> : <section className="analysis-section"><Empty description="Chưa có snapshot phân tích. Chạy phân tích để lưu kết quả." /></section>}
		</>
	);
}

export function HistoryPage() {
	const [items, setItems] = useState<AnalysisHistoryItem[]>([]);
	const [total, setTotal] = useState(0);
	const [offset, setOffset] = useState(0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [detail, setDetail] = useState<AnalysisHistoryDetail | null>(null);
	const [detailLoading, setDetailLoading] = useState(false);
	const limit = 20;

	useEffect(() => {
		let active = true;
		setLoading(true);
		analysisApi.history({ limit, offset }).then((result) => {
			if (!active) return;
			setItems(result.items);
			setTotal(result.page.total);
			setError('');
		}).catch(() => {
			if (active) setError('Không thể tải lịch sử phân tích.');
		}).finally(() => {
			if (active) setLoading(false);
		});
		return () => { active = false; };
	}, [offset]);

	const openDetail = async (analysisId: string) => {
		setDetailLoading(true);
		try {
			setDetail(await analysisApi.detail(analysisId));
		} catch {
			setError('Không thể tải snapshot đã lưu.');
		} finally {
			setDetailLoading(false);
		}
	};
	const columns: TableProps<AnalysisHistoryItem>['columns'] = [
		{ title: 'THỜI ĐIỂM', dataIndex: 'createdAt', key: 'createdAt', render: (value: string) => dayjs(value).format('DD/MM/YYYY HH:mm') },
		{ title: 'CHƯƠNG TRÌNH', dataIndex: ['curriculum', 'name'], key: 'curriculum' },
		{ title: 'KẾT QUẢ', key: 'summary', render: (_, item) => `${item.summary.eligibleCourses} đủ điều kiện · ${item.summary.ineligibleCourses} chưa đủ` },
		{ title: '', key: 'detail', align: 'right', render: (_, item) => <Button type="link" loading={detailLoading} onClick={() => void openDetail(item.id)}>Xem snapshot</Button> },
	];
	const detailColumns: TableProps<AnalysisHistoryDetail['courseResults'][number]>['columns'] = [
		{ title: 'MÃ MÔN', dataIndex: ['course', 'code'], key: 'code' },
		{ title: 'HỌC PHẦN', dataIndex: ['course', 'name'], key: 'name' },
		{ title: 'ĐIỀU KIỆN', dataIndex: 'eligible', key: 'eligible', render: (value: boolean) => value ? 'Đủ' : 'Chưa đủ' },
		{ title: 'LÝ DO', key: 'reasons', render: (_, result) => result.reasons.map((reason) => reason.message).join(' ') || 'Không có điều kiện bổ sung.' },
	];

	return (
		<>
			<div className="page-heading">
				<div><span className="eyebrow">HỒ SƠ / SNAPSHOT</span><h1>Lịch sử phân tích</h1><p>Các kết quả được lưu tại thời điểm phân tích.</p></div>
			</div>
			{error ? <Alert type="error" showIcon message={error} /> : null}
			<section className="history-section">
				<div className="section-heading"><div><span className="eyebrow">CÁC LẦN ĐÁNH GIÁ</span><h2>Kết quả đã lưu</h2></div><span className="result-count">{total} lần phân tích</span></div>
				<Table
					columns={columns}
					dataSource={items}
					rowKey="id"
					loading={loading}
					pagination={{ current: Math.floor(offset / limit) + 1, pageSize: limit, total, showSizeChanger: false, onChange: (page) => setOffset((page - 1) * limit) }}
					locale={{ emptyText: <Empty description="Chưa có lần phân tích nào được lưu." /> }}
				/>
			</section>
			<Modal open={Boolean(detail)} title={detail ? `Snapshot · ${detail.curriculum.name}` : 'Snapshot'} footer={null} width={920} destroyOnHidden onCancel={() => setDetail(null)}>
				{detail ? <>
					<p>{dayjs(detail.createdAt).format('DD/MM/YYYY HH:mm')}</p>
					<p>{detail.summary.eligibleCourses} học phần đủ điều kiện · {detail.summary.ineligibleCourses} chưa đủ · {detail.summary.missingRequiredCourses} môn bắt buộc còn thiếu</p>
					<Table columns={detailColumns} dataSource={detail.courseResults} rowKey={(result) => result.course.id} pagination={false} size="small" scroll={{ x: 700 }} />
				</> : null}
			</Modal>
		</>
	);
}