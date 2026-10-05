import {
	AppstoreOutlined,
	DeleteOutlined,
	EditOutlined,
	PlusOutlined,
	SearchOutlined,
} from '@ant-design/icons';
import {
	Button,
	Checkbox,
	Empty,
	Form,
	Input,
	InputNumber,
	Modal,
	Popconfirm,
	Select,
	Table,
	Tabs,
	Tag,
	Tooltip,
	message,
} from 'antd';
import type { TableProps } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { curriculumApi } from '@/apis';
import type {
	CourseInput,
	CourseRuleInput,
	CurriculumInput,
	ElectiveGroupInput,
	TermInput,
} from '@/apis';
import type {
	AdminCurriculum,
	CourseRule,
	CurriculumCourse,
	CurriculumStructure,
	CurriculumTerm,
	ElectiveGroup,
	RecommendationSettings,
} from '@/types';

type DialogState =
	| { kind: 'curriculum'; item?: AdminCurriculum }
	| { kind: 'term'; item?: CurriculumTerm }
	| { kind: 'group'; item?: ElectiveGroup }
	| { kind: 'course'; item?: CurriculumCourse }
	| { kind: 'rule'; item?: CourseRule; courseId: string }
	| null;

type RuleRow = CourseRule & { courseId: string; courseCode: string; courseName: string };
type CurriculumValues = CurriculumInput & { recommendationEnabled?: boolean };
type TermValues = TermInput;
type GroupValues = ElectiveGroupInput;
type CourseValues = CourseInput;
type RuleValues = CourseRuleInput & { sourceEnabled?: boolean };

function getErrorMessage(error: unknown) {
	if (typeof error === 'object' && error !== null && 'response' in error) {
		const response = (error as { response?: { data?: { message?: unknown } } }).response;
		if (typeof response?.data?.message === 'string') return response.data.message;
	}
	return 'Không thể lưu thay đổi. Vui lòng thử lại.';
}

export default function AdminPage() {
	const [messageApi, contextHolder] = message.useMessage();
	const [curriculumForm] = Form.useForm<CurriculumValues>();
	const [termForm] = Form.useForm<TermValues>();
	const [groupForm] = Form.useForm<GroupValues>();
	const [courseForm] = Form.useForm<CourseValues>();
	const [ruleForm] = Form.useForm<RuleValues>();
	const [curricula, setCurricula] = useState<AdminCurriculum[]>([]);
	const [structure, setStructure] = useState<CurriculumStructure | null>(null);
	const [rules, setRules] = useState<RuleRow[]>([]);
	const [selectedId, setSelectedId] = useState('');
	const [ruleCourseId, setRuleCourseId] = useState('');
	const [search, setSearch] = useState('');
	const [dialog, setDialog] = useState<DialogState>(null);
	const [loading, setLoading] = useState(true);
	const [structureLoading, setStructureLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [structureVersion, setStructureVersion] = useState(0);

	const reloadCurricula = async (preferredId?: string) => {
		const result = await curriculumApi.listAdmin({ limit: 100, q: search || undefined });
		setCurricula(result.items);
		const nextId = result.items.some((item) => item.id === preferredId)
			? preferredId!
			: result.items.some((item) => item.id === selectedId)
				? selectedId
				: result.items[0]?.id ?? '';
		setSelectedId(nextId);
	};

	useEffect(() => {
		let active = true;
		setLoading(true);
		curriculumApi.listAdmin({ limit: 100, q: search.trim() || undefined })
			.then((result) => {
				if (!active) return;
				setCurricula(result.items);
				setSelectedId((current) => result.items.some((item) => item.id === current)
					? current
					: result.items[0]?.id ?? '');
			})
			.catch((error: unknown) => {
				if (active) messageApi.error(getErrorMessage(error));
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => { active = false; };
	}, [messageApi, search]);

	useEffect(() => {
		if (!selectedId) {
			setStructure(null);
			setRules([]);
			return;
		}
		let active = true;
		setStructureLoading(true);
		curriculumApi.structure(selectedId)
			.then((result) => {
				if (active) {
					setStructure(result);
					setRuleCourseId((current) => result.courses.some((course) => course.id === current) ? current : result.courses[0]?.id ?? '');
				}
			})
			.catch((error: unknown) => {
				if (active) messageApi.error(getErrorMessage(error));
			})
			.finally(() => {
				if (active) setStructureLoading(false);
			});
		return () => { active = false; };
	}, [selectedId, structureVersion, messageApi]);

	useEffect(() => {
		if (!selectedId || !ruleCourseId) {
			setRules([]);
			return;
		}
		let active = true;
		curriculumApi.rules(selectedId, ruleCourseId)
			.then((items) => {
				if (!active) return;
				const course = structure?.courses.find((item) => item.id === ruleCourseId);
				setRules(items.map((item) => ({
					...item,
					courseId: ruleCourseId,
					courseCode: course?.code ?? '',
					courseName: course?.name ?? '',
				})));
			})
			.catch((error: unknown) => {
				if (active) messageApi.error(getErrorMessage(error));
			});
		return () => { active = false; };
	}, [selectedId, ruleCourseId, structure, messageApi]);

	const selected = curricula.find((item) => item.id === selectedId);
	const visibleCurricula = useMemo(
		() => curricula.filter((item) => item.name.toLowerCase().includes(search.toLowerCase())),
		[curricula, search],
	);
	const courses = structure?.courses ?? [];
	const terms = structure?.terms ?? [];
	const groups = structure?.electiveGroups ?? [];

	const resetForms = () => {
		curriculumForm.resetFields();
		termForm.resetFields();
		groupForm.resetFields();
		courseForm.resetFields();
		ruleForm.resetFields();
	};

	const runSave = async (operation: () => Promise<string | void>, successMessage: string) => {
		setSaving(true);
		try {
			const preferredId = await operation();
			resetForms();
			setDialog(null);
			messageApi.success(successMessage);
			await reloadCurricula(preferredId || selectedId);
			setStructureVersion((version) => version + 1);
		} catch (error) {
			messageApi.error(getErrorMessage(error));
		} finally {
			setSaving(false);
		}
	};

	const runDelete = async (operation: () => Promise<void>) => {
		try {
			await operation();
			messageApi.success('Đã gỡ dữ liệu khỏi danh sách hoạt động.');
			await reloadCurricula(selectedId);
			setStructureVersion((version) => version + 1);
		} catch (error) {
			messageApi.error(getErrorMessage(error));
		}
	};

	const openCurriculum = (item?: AdminCurriculum) => {
		curriculumForm.setFieldsValue(item ? {
			name: item.name,
			description: item.description,
			source: item.source,
			recommendationEnabled: Boolean(item.recommendationSettings),
			recommendationSettings: item.recommendationSettings ?? undefined,
		} : {
			source: {} as CurriculumValues['source'],
			recommendationEnabled: false,
		});
		setDialog({ kind: 'curriculum', item });
	};

	const openTerm = (item?: CurriculumTerm) => {
		termForm.setFieldsValue(item ?? { code: '', name: '', sortOrder: terms.length });
		setDialog({ kind: 'term', item });
	};

	const openGroup = (item?: ElectiveGroup) => {
		groupForm.setFieldsValue(item ?? { name: '', sortOrder: groups.length });
		setDialog({ kind: 'group', item });
	};

	const openCourse = (item?: CurriculumCourse) => {
		courseForm.setFieldsValue(item ? {
			code: item.code,
			version: item.version,
			name: item.name,
			nameEn: item.nameEn,
			credits: item.credits,
			recommendationPriority: item.recommendationPriority,
			termId: item.term.id,
			requirementType: item.requirementType,
			electiveGroupId: item.electiveGroup?.id ?? null,
		} : {
			credits: 0,
			recommendationPriority: courses.length
				? Math.min(2147483647, Math.max(...courses.map((course) => course.recommendationPriority)) + 1)
				: 0,
			requirementType: 'required',
			termId: terms[0]?.id,
		});
		setDialog({ kind: 'course', item });
	};

	const openRule = (item?: CourseRule) => {
		ruleForm.setFieldsValue(item ? {
			type: item.type,
			prerequisiteCourseId: item.prerequisiteCourseId ?? undefined,
			minimumCredits: item.minimumCredits ?? undefined,
			sourceEnabled: item.source !== null,
			source: item.source ?? undefined,
		} : { type: 'prerequisite', sourceEnabled: false });
		setDialog({ kind: 'rule', item, courseId: ruleCourseId });
	};

	const saveCurriculum = (values: CurriculumValues) => runSave(async () => {
		const { recommendationEnabled, recommendationSettings, ...curriculumValues } = values;
		const input: CurriculumInput = {
			...curriculumValues,
			recommendationSettings: recommendationEnabled
				? recommendationSettings as RecommendationSettings
				: dialog?.kind === 'curriculum' && dialog.item?.recommendationSettings
					? null
					: undefined,
		};
		const item = dialog?.kind === 'curriculum' && dialog.item
			? await curriculumApi.updateCurriculum(dialog.item.id, input)
			: await curriculumApi.createCurriculum(input);
		return item.id;
	}, 'Đã lưu chương trình.');

	const saveTerm = (values: TermValues) => runSave(async () => {
		if (!selectedId) return;
		if (dialog?.kind === 'term' && dialog.item) await curriculumApi.updateTerm(selectedId, dialog.item.id, values);
		else await curriculumApi.createTerm(selectedId, values);
	}, 'Đã lưu học kỳ.');

	const saveGroup = (values: GroupValues) => runSave(async () => {
		if (!selectedId) return;
		if (dialog?.kind === 'group' && dialog.item) await curriculumApi.updateGroup(selectedId, dialog.item.id, values);
		else await curriculumApi.createGroup(selectedId, values);
	}, 'Đã lưu nhóm tự chọn.');

	const saveCourse = (values: CourseValues) => runSave(async () => {
		if (!selectedId) return;
		const payload = {
			...values,
			electiveGroupId: values.requirementType === 'elective' ? values.electiveGroupId : null,
		};
		if (dialog?.kind === 'course' && dialog.item) await curriculumApi.updateCourse(selectedId, dialog.item.id, payload);
		else await curriculumApi.createCourse(selectedId, payload);
	}, 'Đã lưu học phần.');

	const saveRule = (values: RuleValues) => runSave(async () => {
		if (dialog?.kind !== 'rule') return;
		const { sourceEnabled, ...input } = values;
		const payload: CourseRuleInput = { ...input, source: sourceEnabled ? input.source : null };
		if (dialog.item) await curriculumApi.updateRule(selectedId, dialog.courseId, dialog.item.id, payload);
		else await curriculumApi.createRule(selectedId, dialog.courseId, payload);
	}, 'Đã lưu ràng buộc.');

	const courseColumns: TableProps<CurriculumCourse>['columns'] = [
		{ title: 'MÃ MÔN', dataIndex: 'code', key: 'code', width: 105, render: (value: string, item) => <span className="course-code">{value} · {item.version}</span> },
		{ title: 'TÊN HỌC PHẦN', dataIndex: 'name', key: 'name' },
		{ title: 'HỌC KỲ', key: 'term', width: 125, render: (_, item) => item.term.name },
		{ title: 'TÍN CHỈ', dataIndex: 'credits', key: 'credits', width: 75, align: 'center' },
		{ title: 'ƯU TIÊN', dataIndex: 'recommendationPriority', key: 'recommendationPriority', width: 85, align: 'center' },
		{ title: 'LOẠI', dataIndex: 'requirementType', key: 'type', width: 105, render: (value: CurriculumCourse['requirementType'], item) => <Tag className={value === 'required' ? 'tag-required' : 'tag-elective'}>{value === 'required' ? 'Bắt buộc' : item.electiveGroup?.name ?? 'Tự chọn'}</Tag> },
		{ title: '', key: 'actions', width: 86, render: (_, item) => <div className="row-actions"><Tooltip title="Sửa học phần"><Button type="text" icon={<EditOutlined />} aria-label={`Sửa ${item.code}`} onClick={() => openCourse(item)} /></Tooltip><Popconfirm title="Gỡ học phần?" description="Học phần đang được rule tham chiếu sẽ không thể gỡ." okText="Gỡ" cancelText="Hủy" onConfirm={() => runDelete(() => curriculumApi.deleteCourse(selectedId, item.id))}><Tooltip title="Gỡ học phần"><Button danger type="text" icon={<DeleteOutlined />} aria-label={`Gỡ ${item.code}`} /></Tooltip></Popconfirm></div> },
	];

	const termColumns: TableProps<CurriculumTerm>['columns'] = [
		{ title: 'MÃ', dataIndex: 'code', key: 'code', width: 100 },
		{ title: 'HỌC KỲ', dataIndex: 'name', key: 'name' },
		{ title: 'THỨ TỰ', dataIndex: 'sortOrder', key: 'sortOrder', width: 90 },
		{ title: '', key: 'actions', width: 86, render: (_, item) => <div className="row-actions"><Tooltip title="Sửa học kỳ"><Button type="text" icon={<EditOutlined />} aria-label={`Sửa ${item.name}`} onClick={() => openTerm(item)} /></Tooltip><Popconfirm title="Gỡ học kỳ?" description="Chỉ gỡ được khi không còn học phần hoạt động tham chiếu." okText="Gỡ" cancelText="Hủy" onConfirm={() => runDelete(() => curriculumApi.deleteTerm(selectedId, item.id))}><Tooltip title="Gỡ học kỳ"><Button danger type="text" icon={<DeleteOutlined />} aria-label={`Gỡ ${item.name}`} /></Tooltip></Popconfirm></div> },
	];

	const groupColumns: TableProps<ElectiveGroup>['columns'] = [
		{ title: 'NHÓM TỰ CHỌN', dataIndex: 'name', key: 'name' },
		{ title: 'NGƯỠNG', key: 'threshold', render: (_, item) => [item.requiredCredits && `${item.requiredCredits} tín chỉ`, item.requiredCourses && `${item.requiredCourses} môn`].filter(Boolean).join(' · ') },
		{ title: '', key: 'actions', width: 86, render: (_, item) => <div className="row-actions"><Tooltip title="Sửa nhóm"><Button type="text" icon={<EditOutlined />} aria-label={`Sửa ${item.name}`} onClick={() => openGroup(item)} /></Tooltip><Popconfirm title="Gỡ nhóm tự chọn?" description="Chỉ gỡ được khi không còn học phần hoạt động tham chiếu." okText="Gỡ" cancelText="Hủy" onConfirm={() => runDelete(() => curriculumApi.deleteGroup(selectedId, item.id))}><Tooltip title="Gỡ nhóm"><Button danger type="text" icon={<DeleteOutlined />} aria-label={`Gỡ ${item.name}`} /></Tooltip></Popconfirm></div> },
	];

	const ruleColumns: TableProps<RuleRow>['columns'] = [
		{ title: 'LOẠI', dataIndex: 'type', key: 'type', width: 130, render: (value: CourseRule['type']) => value === 'prerequisite' ? 'Tiên quyết' : 'Tín chỉ tối thiểu' },
		{ title: 'ĐIỀU KIỆN', key: 'condition', render: (_, item) => item.type === 'prerequisite' ? (() => { const prerequisite = courses.find((course) => course.id === item.prerequisiteCourseId); return prerequisite ? `${prerequisite.code} · ${prerequisite.name}` : 'Không tìm thấy môn tiên quyết'; })() : `${item.minimumCredits} tín chỉ` },
		{ title: 'NGUỒN', key: 'source', render: (_, item) => item.source?.documentName ?? 'Kế thừa nguồn CTĐT' },
		{ title: '', key: 'actions', width: 86, render: (_, item) => <div className="row-actions"><Tooltip title="Sửa ràng buộc"><Button type="text" icon={<EditOutlined />} aria-label="Sửa ràng buộc" onClick={() => openRule(item)} /></Tooltip><Popconfirm title="Gỡ ràng buộc?" okText="Gỡ" cancelText="Hủy" onConfirm={() => runDelete(() => curriculumApi.deleteRule(selectedId, item.courseId, item.id))}><Tooltip title="Gỡ ràng buộc"><Button danger type="text" icon={<DeleteOutlined />} aria-label="Gỡ ràng buộc" /></Tooltip></Popconfirm></div> },
	];

	const modalTitle = dialog?.kind === 'curriculum'
		? dialog.item ? 'Sửa chương trình đào tạo' : 'Tạo chương trình đào tạo'
		: dialog?.kind === 'term' ? dialog.item ? 'Sửa học kỳ' : 'Thêm học kỳ'
			: dialog?.kind === 'group' ? dialog.item ? 'Sửa nhóm tự chọn' : 'Thêm nhóm tự chọn'
				: dialog?.kind === 'course' ? dialog.item ? 'Sửa học phần' : 'Thêm học phần'
					: 'Thiết lập ràng buộc';

	const submitDialog = () => {
		if (dialog?.kind === 'curriculum') curriculumForm.submit();
		if (dialog?.kind === 'term') termForm.submit();
		if (dialog?.kind === 'group') groupForm.submit();
		if (dialog?.kind === 'course') courseForm.submit();
		if (dialog?.kind === 'rule') ruleForm.submit();
	};

	return (
		<>
			{contextHolder}
			<div className="page-heading">
				<div><span className="eyebrow">KHÔNG GIAN QUẢN TRỊ</span><h1>Chương trình đào tạo</h1><p>Quản lý học kỳ, học phần, nhóm tự chọn và nguồn tham chiếu.</p></div>
				<Button type="primary" icon={<PlusOutlined />} onClick={() => openCurriculum()}>Tạo chương trình</Button>
			</div>

			<div className="admin-workspace">
				<aside className="program-index">
					<div className="program-index-head"><span className="eyebrow">DANH SÁCH CTĐT</span><strong>{curricula.length.toString().padStart(2, '0')}</strong></div>
					<Input prefix={<SearchOutlined />} placeholder="Tìm chương trình" value={search} onChange={(event) => setSearch(event.target.value)} allowClear />
					<div className="program-list" aria-busy={loading}>
						{visibleCurricula.map((item) => (
							<button className={`program-choice ${selectedId === item.id ? 'is-selected' : ''}`} key={item.id} onClick={() => setSelectedId(item.id)}>
								<span className="program-icon"><AppstoreOutlined /></span>
								<span><strong>{item.name}</strong><small>{item.courseCount} học phần</small></span>
							</button>
						))}
						{!loading && !visibleCurricula.length && <p className="program-empty">Chưa có chương trình phù hợp.</p>}
					</div>
					<button className="program-add-link" onClick={() => openCurriculum()}><PlusOutlined /> Thêm chương trình</button>
				</aside>

				<section className="program-detail" aria-busy={structureLoading}>
					{selected ? <>
						<div className="program-detail-heading">
							<div><span className="eyebrow">CHƯƠNG TRÌNH ĐANG CHỌN</span><h2>{selected.name}</h2><p>{selected.description || 'Chưa có mô tả cho chương trình này.'}</p><p className="curriculum-source">Nguồn: {selected.source.documentName} · {selected.source.version} · xác minh {selected.source.verifiedAt}</p><p className="curriculum-source">Gợi ý tải học kỳ: {selected.recommendationSettings ? `${selected.recommendationSettings.totalCreditsTarget} tín chỉ mục tiêu · ${selected.recommendationSettings.minimumSemesterCredits}–${selected.recommendationSettings.maximumSemesterCredits} tín chỉ/kỳ` : 'Chưa cấu hình'}</p></div>
							<div className="program-heading-actions"><Tag className="tag-success">Đang hoạt động</Tag><Tooltip title="Sửa chương trình"><Button icon={<EditOutlined />} aria-label="Sửa chương trình" onClick={() => openCurriculum(selected)} /></Tooltip></div>
						</div>
						<Tabs items={[
							{
								key: 'courses', label: `Học phần (${courses.length})`, children: <>
									<div className="admin-list-toolbar"><span>Danh mục môn trong CTĐT</span><Button icon={<PlusOutlined />} disabled={!terms.length} onClick={() => openCourse()}>Thêm môn</Button></div>
									<Table columns={courseColumns} dataSource={courses} rowKey="id" loading={structureLoading} pagination={{ pageSize: 7, hideOnSinglePage: true, showSizeChanger: false }} className="course-table admin-table" locale={{ emptyText: <Empty description="Chưa có học phần" /> }} />
								</>
							},
							{
								key: 'structure', label: 'Học kỳ & nhóm', children: <>
									<div className="admin-list-toolbar"><span>Học kỳ</span><Button icon={<PlusOutlined />} onClick={() => openTerm()}>Thêm học kỳ</Button></div>
									<Table columns={termColumns} dataSource={terms} rowKey="id" pagination={false} size="small" className="course-table admin-table" />
									<div className="admin-list-toolbar structure-subhead"><span>Nhóm tự chọn</span><Button icon={<PlusOutlined />} onClick={() => openGroup()}>Thêm nhóm</Button></div>
									<Table columns={groupColumns} dataSource={groups} rowKey="id" pagination={false} size="small" className="course-table admin-table" />
								</>
							},
							{
								key: 'rules', label: `Ràng buộc (${rules.length})`, children: <>
									<div className="admin-list-toolbar"><Select aria-label="Học phần áp dụng ràng buộc" value={ruleCourseId || undefined} placeholder="Chọn học phần" onChange={setRuleCourseId} options={courses.map((course) => ({ label: `${course.code} · ${course.name}`, value: course.id }))} className="rule-course-select" /><Button icon={<PlusOutlined />} disabled={!ruleCourseId} onClick={() => openRule()}>Thêm ràng buộc</Button></div>
									<Table columns={ruleColumns} dataSource={rules} rowKey="id" pagination={false} size="small" className="course-table admin-table" locale={{ emptyText: <Empty description="Học phần này chưa có ràng buộc" /> }} />
								</>
							},
						]} />
						<p className="section-footnote">Thay đổi chỉ áp dụng cho CTĐT đang chọn; gỡ dữ liệu là thao tác xóa mềm.</p>
					</> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={loading ? 'Đang tải chương trình...' : 'Chưa có chương trình đào tạo'} />}
				</section>
			</div>

			<Modal title={modalTitle} open={dialog !== null} okText="Lưu" cancelText="Hủy" confirmLoading={saving} onCancel={() => setDialog(null)} onOk={submitDialog} destroyOnHidden>
				{dialog?.kind === 'curriculum' && <Form form={curriculumForm} layout="vertical" onFinish={saveCurriculum}>
					<Form.Item label="Tên chương trình" name="name" rules={[{ required: true, whitespace: true, max: 160, message: 'Nhập tên chương trình.' }]}><Input placeholder="Ví dụ: Khoa học Máy tính" /></Form.Item>
					<Form.Item label="Mô tả" name="description"><Input.TextArea rows={2} maxLength={2000} /></Form.Item>
					<strong className="form-section-label">Nguồn chuẩn CTĐT</strong>
					<Form.Item label="Tên tài liệu" name={['source', 'documentName']} rules={[{ required: true, whitespace: true, message: 'Nhập tên tài liệu nguồn.' }]}><Input /></Form.Item>
					<Form.Item label="URL hoặc thông tin tham chiếu" name={['source', 'reference']} rules={[{ required: true, whitespace: true, message: 'Nhập nguồn tham chiếu.' }]}><Input /></Form.Item>
					<div className="form-row"><Form.Item label="Năm/phiên bản" name={['source', 'version']} rules={[{ required: true, whitespace: true, message: 'Nhập phiên bản.' }]}><Input /></Form.Item><Form.Item label="Ngày xác minh" name={['source', 'verifiedAt']} rules={[{ required: true, message: 'Chọn ngày xác minh.' }]}><Input type="date" /></Form.Item></div>
					<Form.Item name="recommendationEnabled" valuePropName="checked"><Checkbox>Cấu hình tải gợi ý học kỳ</Checkbox></Form.Item>
					<Form.Item noStyle shouldUpdate={(previous, current) => previous.recommendationEnabled !== current.recommendationEnabled}>{({ getFieldValue }) => getFieldValue('recommendationEnabled') ? <>
						<div className="form-row">
							<Form.Item label="Tổng tín chỉ mục tiêu" name={['recommendationSettings', 'totalCreditsTarget']} rules={[{ required: true, message: 'Nhập tổng tín chỉ mục tiêu.' }, { type: 'number', min: 0.01, max: 99999.99, message: 'Nhập số lớn hơn 0, tối đa 99999.99.' }]}><InputNumber min={0.01} max={99999.99} precision={2} className="full-width" /></Form.Item>
							<Form.Item label="Tín chỉ tối thiểu/kỳ" name={['recommendationSettings', 'minimumSemesterCredits']} rules={[{ required: true, message: 'Nhập tín chỉ tối thiểu.' }, { type: 'number', min: 0, max: 999.99, message: 'Nhập số không âm, tối đa 999.99.' }]}><InputNumber min={0} max={999.99} precision={2} className="full-width" /></Form.Item>
						</div>
						<Form.Item label="Tín chỉ tối đa/kỳ" name={['recommendationSettings', 'maximumSemesterCredits']} dependencies={[['recommendationSettings', 'minimumSemesterCredits']]} rules={[{ required: true, message: 'Nhập tín chỉ tối đa.' }, { type: 'number', min: 0.01, max: 999.99, message: 'Nhập số lớn hơn 0, tối đa 999.99.' }, ({ getFieldValue }) => ({ validator: (_, value) => value == null || getFieldValue(['recommendationSettings', 'minimumSemesterCredits']) == null || value >= getFieldValue(['recommendationSettings', 'minimumSemesterCredits']) ? Promise.resolve() : Promise.reject(new Error('Tín chỉ tối đa phải lớn hơn hoặc bằng mức tối thiểu.')) })]}><InputNumber min={0.01} max={999.99} precision={2} className="full-width" /></Form.Item>
					</> : null}</Form.Item>
				</Form>}
				{dialog?.kind === 'term' && <Form form={termForm} layout="vertical" onFinish={saveTerm}>
					<Form.Item label="Mã học kỳ" name="code" rules={[{ required: true, whitespace: true, message: 'Nhập mã học kỳ.' }]}><Input placeholder="HK1" /></Form.Item>
					<Form.Item label="Tên học kỳ" name="name" rules={[{ required: true, whitespace: true, message: 'Nhập tên học kỳ.' }]}><Input placeholder="Học kỳ 1" /></Form.Item>
					<Form.Item label="Thứ tự" name="sortOrder" rules={[{ required: true, message: 'Nhập thứ tự.' }]}><InputNumber min={0} precision={0} className="full-width" /></Form.Item>
				</Form>}
				{dialog?.kind === 'group' && <Form form={groupForm} layout="vertical" onFinish={saveGroup}>
					<Form.Item label="Tên nhóm" name="name" rules={[{ required: true, whitespace: true, message: 'Nhập tên nhóm.' }]}><Input /></Form.Item>
					<div className="form-row"><Form.Item label="Tối thiểu tín chỉ" name="requiredCredits"><InputNumber min={0.01} max={9999.99} precision={2} className="full-width" /></Form.Item><Form.Item label="Tối thiểu số môn" name="requiredCourses"><InputNumber min={1} precision={0} className="full-width" /></Form.Item></div>
					<Form.Item label="Thứ tự" name="sortOrder" rules={[{ required: true, message: 'Nhập thứ tự.' }]}><InputNumber min={0} precision={0} className="full-width" /></Form.Item>
					<p className="form-hint">Cần ít nhất một ngưỡng; nếu nhập cả hai thì cả hai đều phải đạt.</p>
				</Form>}
				{dialog?.kind === 'course' && <Form form={courseForm} layout="vertical" onFinish={saveCourse}>
					<div className="form-row"><Form.Item label="Mã môn" name="code" rules={[{ required: true, whitespace: true, message: 'Nhập mã môn.' }]}><Input /></Form.Item><Form.Item label="Phiên bản" name="version" rules={[{ required: true, whitespace: true, message: 'Nhập phiên bản.' }]}><Input /></Form.Item></div>
					<Form.Item label="Tên học phần" name="name" rules={[{ required: true, whitespace: true, message: 'Nhập tên học phần.' }]}><Input /></Form.Item>
					<Form.Item label="Tên tiếng Anh" name="nameEn"><Input /></Form.Item>
					<div className="form-row"><Form.Item label="Tín chỉ" name="credits" rules={[{ required: true, message: 'Nhập số tín chỉ.' }]}><InputNumber min={0} max={999.99} precision={2} className="full-width" /></Form.Item><Form.Item label="Học kỳ" name="termId" rules={[{ required: true, message: 'Chọn học kỳ.' }]}><Select options={terms.map((term) => ({ label: term.name, value: term.id }))} /></Form.Item></div>
					<Form.Item label="Độ ưu tiên gợi ý" name="recommendationPriority" rules={[{ required: true, message: 'Nhập độ ưu tiên.' }]}><InputNumber min={0} max={2147483647} precision={0} className="full-width" /></Form.Item>
					<Form.Item label="Phân loại" name="requirementType" rules={[{ required: true, message: 'Chọn phân loại.' }]}><Select options={[{ label: 'Bắt buộc', value: 'required' }, { label: 'Tự chọn', value: 'elective' }]} /></Form.Item>
					<Form.Item noStyle shouldUpdate={(previous, current) => previous.requirementType !== current.requirementType}>{({ getFieldValue }) => getFieldValue('requirementType') === 'elective' ? <Form.Item label="Nhóm tự chọn" name="electiveGroupId" rules={[{ required: true, message: 'Chọn nhóm tự chọn.' }]}><Select options={groups.map((group) => ({ label: group.name, value: group.id }))} /></Form.Item> : null}</Form.Item>
				</Form>}
				{dialog?.kind === 'rule' && <Form form={ruleForm} layout="vertical" onFinish={saveRule}>
					<Form.Item label="Loại ràng buộc" name="type" rules={[{ required: true, message: 'Chọn loại ràng buộc.' }]}><Select onChange={() => ruleForm.setFieldsValue({ prerequisiteCourseId: undefined, minimumCredits: undefined })} options={[{ label: 'Môn tiên quyết', value: 'prerequisite' }, { label: 'Tín chỉ tối thiểu', value: 'minimum_credits' }]} /></Form.Item>
					<Form.Item noStyle shouldUpdate={(previous, current) => previous.type !== current.type}>{({ getFieldValue }) => getFieldValue('type') === 'prerequisite' ? <Form.Item label="Môn tiên quyết" name="prerequisiteCourseId" rules={[{ required: true, message: 'Chọn môn tiên quyết.' }]}><Select options={courses.filter((course) => course.id !== ruleCourseId).map((course) => ({ label: `${course.code} · ${course.name}`, value: course.id }))} /></Form.Item> : <Form.Item label="Tín chỉ tối thiểu" name="minimumCredits" rules={[{ required: true, message: 'Nhập ngưỡng tín chỉ.' }]}><InputNumber min={0.01} precision={2} className="full-width" /></Form.Item>}</Form.Item>
					<Form.Item name="sourceEnabled" valuePropName="checked"><Checkbox>Ràng buộc dùng nguồn riêng</Checkbox></Form.Item>
					<Form.Item noStyle shouldUpdate={(previous, current) => previous.sourceEnabled !== current.sourceEnabled}>{({ getFieldValue }) => getFieldValue('sourceEnabled') ? <>
						<Form.Item label="Tên tài liệu" name={['source', 'documentName']} rules={[{ required: true, whitespace: true, message: 'Nhập tên tài liệu.' }]}><Input /></Form.Item>
						<Form.Item label="URL hoặc thông tin tham chiếu" name={['source', 'reference']} rules={[{ required: true, whitespace: true, message: 'Nhập nguồn tham chiếu.' }]}><Input /></Form.Item>
						<div className="form-row"><Form.Item label="Năm/phiên bản" name={['source', 'version']} rules={[{ required: true, whitespace: true, message: 'Nhập phiên bản.' }]}><Input /></Form.Item><Form.Item label="Ngày xác minh" name={['source', 'verifiedAt']} rules={[{ required: true, message: 'Chọn ngày xác minh.' }]}><Input type="date" /></Form.Item></div>
					</> : null}</Form.Item>
				</Form>}
			</Modal>
		</>
	);
}