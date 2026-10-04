import { LockOutlined, SaveOutlined, UserOutlined } from '@ant-design/icons';
import { Avatar, Button, Descriptions, Form, Input, message, Tag } from 'antd';
import { useState } from 'react';
import { useAppContext } from '@/contexts/use-app-context';
import apiClient from '@/apis';

interface PasswordValues {
	password: string;
	confirmPassword: string;
}

export default function AccountPage() {
	const { email, role } = useAppContext();
	const [messageApi, contextHolder] = message.useMessage();
	const [form] = Form.useForm<PasswordValues>();
	const [saving, setSaving] = useState(false);

	const updatePassword = async (values: PasswordValues) => {
		setSaving(true);
		try {
			await apiClient.get('/auth/csrf');
			await apiClient.put('/me/password', { newPassword: values.password });
			form.resetFields();
			messageApi.success('Mật khẩu đã được cập nhật. Các phiên khác đã đăng xuất.');
		} catch {
			messageApi.error('Không thể cập nhật mật khẩu. Vui lòng thử lại.');
		} finally {
			setSaving(false);
		}
	};

	return (
		<>
			{contextHolder}
			<div className="page-heading"><div><span className="eyebrow">CÀI ĐẶT CÁ NHÂN</span><h1>Thông tin tài khoản</h1><p>Quản lý thông tin đăng nhập và bảo mật tài khoản.</p></div></div>
			<section className="account-section">
				<div className="account-profile">
					<Avatar size={60} icon={<UserOutlined />} />
					<div><span className="eyebrow">TÀI KHOẢN BK UNI</span><h2>{email}</h2><Tag className={role === 'admin' ? 'tag-warning' : 'tag-success'}>{role === 'admin' ? 'Admin' : 'Học sinh'}</Tag></div>
				</div>
				<Descriptions column={1} className="account-descriptions">
					<Descriptions.Item label="Email đăng nhập">{email}</Descriptions.Item>
					<Descriptions.Item label="Vai trò">{role === 'admin' ? 'Quản trị viên' : 'Học sinh'}</Descriptions.Item>
					<Descriptions.Item label="Phương thức">Phiên cookie bảo mật</Descriptions.Item>
				</Descriptions>
			</section>
			<section className="password-section">
				<div className="section-heading"><div><span className="eyebrow">BẢO MẬT</span><h2>Đổi mật khẩu</h2><p>Chọn mật khẩu mới có ít nhất 8 ký tự.</p></div></div>
				<Form form={form} layout="vertical" onFinish={updatePassword} className="password-form">
					<Form.Item label="Mật khẩu mới" name="password" rules={[{ required: true, message: 'Nhập mật khẩu mới.' }, { min: 8, message: 'Mật khẩu tối thiểu 8 ký tự.' }]}><Input.Password prefix={<LockOutlined />} autoComplete="new-password" /></Form.Item>
					<Form.Item label="Xác nhận mật khẩu mới" name="confirmPassword" dependencies={['password']} rules={[{ required: true, message: 'Nhập lại mật khẩu mới.' }, ({ getFieldValue }) => ({ validator(_, value) { return !value || getFieldValue('password') === value ? Promise.resolve() : Promise.reject(new Error('Hai mật khẩu chưa trùng khớp.')); } })]}><Input.Password prefix={<LockOutlined />} autoComplete="new-password" /></Form.Item>
					<Button type="primary" htmlType="submit" loading={saving} icon={<SaveOutlined />}>Lưu mật khẩu mới</Button>
				</Form>
			</section>
		</>
	);
}