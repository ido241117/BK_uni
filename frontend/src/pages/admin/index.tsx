import { AppstoreOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Form, Input, InputNumber, Modal, Select, Table, Tabs, Tag, message } from 'antd';
import type { TableProps } from 'antd';
import { useMemo, useState } from 'react';
import { demoCourses, demoCurricula } from '@/data/demo';
import { useAppContext } from '@/contexts/use-app-context';
import type { Course, Curriculum } from '@/types';

export default function AdminPage() {
	const { curriculumName } = useAppContext();
	const [curricula, setCurricula] = useState(demoCurricula);
	const [selectedId, setSelectedId] = useState(demoCurricula[0].id);
	const [search, setSearch] = useState('');
	const [curriculumModal, setCurriculumModal] = useState(false);
	const [courseModal, setCourseModal] = useState(false);
	const [ruleModal, setRuleModal] = useState(false);
	const [courses, setCourses] = useState(demoCourses);
	const [messageApi, contextHolder] = message.useMessage();
	const [curriculumForm] = Form.useForm<Pick<Curriculum, 'name' | 'description'>>();
	const [courseForm] = Form.useForm<Pick<Course, 'code' | 'name' | 'credits' | 'term'>>();
	const [ruleForm] = Form.useForm<{ courseId: string; prerequisiteId: string }>();

	const selected = curricula.find((item) => item.id === selectedId) ?? curricula.find((item) => item.name === curriculumName) ?? curricula[0];
	const visibleCurricula = useMemo(() => curricula.filter((item) => item.name.toLowerCase().includes(search.toLowerCase())), [curricula, search]);
	const curriculumCourses = courses.filter((course) => selected?.id === 'cs' || course.term !== 'Học kỳ 1');
	const prerequisites = curriculumCourses.filter((course) => course.prerequisiteId);

	const createCurriculum = (values: Pick<Curriculum, 'name' | 'description'>) => {
		const item = { ...values, id: `curriculum-${Date.now()}`, courseCount: 0 };
		setCurricula((current) => [...current, item]);
		setSelectedId(item.id);
		setCurriculumModal(false);
		curriculumForm.resetFields();
		messageApi.success('Đã tạo chương trình trong dữ liệu demo.');
	};

	const createCourse = (values: Pick<Course, 'code' | 'name' | 'credits' | 'term'>) => {
		const item: Course = { ...values, id: `course-${Date.now()}`, requirementType: 'required' };
		setCourses((current) => [...current, item]);
		setCourseModal(false);
		courseForm.resetFields();
		messageApi.success('Đã thêm môn vào chương trình demo.');
	};

	const courseColumns: TableProps<Course>['columns'] = [
		{ title: 'MÃ MÔN', dataIndex: 'code', key: 'code', width: 110, render: (value: string) => <span className="course-code">{value}</span> },
		{ title: 'TÊN HỌC PHẦN', dataIndex: 'name', key: 'name' },
		{ title: 'HỌC KỲ', dataIndex: 'term', key: 'term', width: 120 },
		{ title: 'TÍN CHỈ', dataIndex: 'credits', key: 'credits', width: 90, align: 'center' },
		{ title: 'LOẠI', dataIndex: 'requirementType', key: 'type', width: 120, render: (value: Course['requirementType']) => <Tag className={value === 'required' ? 'tag-required' : 'tag-elective'}>{value === 'required' ? 'Bắt buộc' : 'Tự chọn'}</Tag> },
	];

	return (
		<>
			{contextHolder}
			<div className="page-heading">
				<div><span className="eyebrow">KHÔNG GIAN QUẢN TRỊ</span><h1>Chương trình đào tạo</h1><p>Tạo chương trình, sắp xếp học phần và quản lý điều kiện trong từng CTĐT.</p></div>
				<Button type="primary" icon={<PlusOutlined />} onClick={() => setCurriculumModal(true)}>Tạo chương trình</Button>
			</div>

			<div className="admin-workspace">
				<aside className="program-index">
					<div className="program-index-head"><span className="eyebrow">DANH SÁCH CTĐT</span><strong>{curricula.length.toString().padStart(2, '0')}</strong></div>
					<Input prefix={<SearchOutlined />} placeholder="Tìm chương trình" value={search} onChange={(event) => setSearch(event.target.value)} allowClear />
					<div className="program-list">
						{visibleCurricula.map((item) => (
							<button className={`program-choice ${selectedId === item.id ? 'is-selected' : ''}`} key={item.id} onClick={() => setSelectedId(item.id)}>
								<span className="program-icon"><AppstoreOutlined /></span>
								<span><strong>{item.name}</strong><small>{item.courseCount || courses.length} học phần</small></span>
							</button>
						))}
						{!visibleCurricula.length && <p className="program-empty">Không tìm thấy chương trình.</p>}
					</div>
					<button className="program-add-link" onClick={() => setCurriculumModal(true)}><PlusOutlined /> Thêm chương trình</button>
				</aside>

				<section className="program-detail">
					<div className="program-detail-heading">
						<div><span className="eyebrow">CHƯƠNG TRÌNH ĐANG CHỌN</span><h2>{selected?.name}</h2><p>{selected?.description || 'Chưa có mô tả cho chương trình này.'}</p></div>
						<Tag className="tag-success">Đang hoạt động</Tag>
					</div>
					<Tabs
						items={[
							{
								key: 'courses',
								label: `Học phần (${curriculumCourses.length})`,
								children: (
									<>
										<div className="admin-list-toolbar"><span>Danh mục môn trong CTĐT</span><Button icon={<PlusOutlined />} onClick={() => setCourseModal(true)}>Thêm môn</Button></div>
										<Table columns={courseColumns} dataSource={curriculumCourses} rowKey="id" pagination={{ pageSize: 7, hideOnSinglePage: true, showSizeChanger: false }} className="course-table admin-table" />
									</>
								),
							},
							{
								key: 'rules',
								label: `Ràng buộc (${prerequisites.length})`,
								children: (
									<>
										<div className="admin-list-toolbar"><span>Luật hoạt động trong chương trình</span><Button icon={<PlusOutlined />} onClick={() => setRuleModal(true)}>Thêm ràng buộc</Button></div>
										<div className="rules-list">
											{prerequisites.length ? prerequisites.map((course) => {
												const prerequisite = courses.find((item) => item.id === course.prerequisiteId);
												return <div className="rule-row" key={course.id}><span className="rule-type">TIÊN QUYẾT</span><strong>{course.code} · {course.name}</strong><span>Cần hoàn thành {prerequisite?.code} · {prerequisite?.name}</span><Tag className="tag-success">Đang áp dụng</Tag></div>;
											}) : <div className="empty-rule">Chưa có ràng buộc trong chương trình này.</div>}
										</div>
									</>
								),
							},
						]}
					/>
					<p className="section-footnote">Môn học và ràng buộc được quản lý riêng trong chương trình đang chọn.</p>
				</section>
			</div>

			<Modal title="Tạo chương trình đào tạo" open={curriculumModal} okText="Tạo chương trình" cancelText="Hủy" onCancel={() => setCurriculumModal(false)} onOk={() => curriculumForm.submit()} destroyOnHidden>
				<Form form={curriculumForm} layout="vertical" onFinish={createCurriculum}>
					<Form.Item label="Tên chương trình" name="name" rules={[{ required: true, message: 'Nhập tên chương trình.' }]}><Input placeholder="Ví dụ: Khoa học Máy tính" /></Form.Item>
					<Form.Item label="Mô tả" name="description"><Input.TextArea rows={3} placeholder="Mô tả ngắn về chương trình" /></Form.Item>
				</Form>
			</Modal>
			<Modal title="Thêm học phần" open={courseModal} okText="Thêm môn" cancelText="Hủy" onCancel={() => setCourseModal(false)} onOk={() => courseForm.submit()} destroyOnHidden>
				<Form form={courseForm} layout="vertical" onFinish={createCourse}>
					<Form.Item label="Mã môn" name="code" rules={[{ required: true, message: 'Nhập mã môn.' }]}><Input placeholder="CS301" /></Form.Item>
					<Form.Item label="Tên học phần" name="name" rules={[{ required: true, message: 'Nhập tên học phần.' }]}><Input placeholder="Tên môn học" /></Form.Item>
					<div className="form-row"><Form.Item label="Tín chỉ" name="credits" rules={[{ required: true, message: 'Nhập số tín chỉ.' }]}><InputNumber min={1} max={12} className="full-width" /></Form.Item><Form.Item label="Học kỳ" name="term" rules={[{ required: true, message: 'Chọn học kỳ.' }]}><Select options={['Học kỳ 1', 'Học kỳ 2', 'Học kỳ 3', 'Học kỳ 4', 'Học kỳ 5', 'Học kỳ 6'].map((value) => ({ label: value, value }))} /></Form.Item></div>
				</Form>
			</Modal>
			<Modal title="Thêm tiên quyết" open={ruleModal} okText="Lưu ràng buộc" cancelText="Hủy" onCancel={() => setRuleModal(false)} onOk={() => ruleForm.submit()} destroyOnHidden>
				<Form form={ruleForm} layout="vertical" onFinish={() => { setRuleModal(false); ruleForm.resetFields(); messageApi.success('Ràng buộc đã được thêm trong bản demo.'); }}>
					<Form.Item label="Học phần áp dụng" name="courseId" rules={[{ required: true, message: 'Chọn học phần.' }]}><Select options={curriculumCourses.map((course) => ({ label: `${course.code} · ${course.name}`, value: course.id }))} /></Form.Item>
					<Form.Item label="Học phần tiên quyết" name="prerequisiteId" rules={[{ required: true, message: 'Chọn học phần tiên quyết.' }]}><Select options={curriculumCourses.map((course) => ({ label: `${course.code} · ${course.name}`, value: course.id }))} /></Form.Item>
				</Form>
			</Modal>
		</>
	);
}