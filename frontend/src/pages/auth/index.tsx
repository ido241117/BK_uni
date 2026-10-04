import { ArrowRightOutlined, BookOutlined, LockOutlined, MailOutlined } from '@ant-design/icons';
import { Button, Checkbox, Form, Input, Segmented, message } from 'antd';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAppContext } from '@/contexts/use-app-context';

interface AuthValues {
	email: string;
	password: string;
}

export default function AuthPage({ initialMode = 'login' }: { initialMode?: 'login' | 'register' }) {
	const [mode, setMode] = useState<'login' | 'register'>(initialMode);
	const [form] = Form.useForm<AuthValues>();
	const [messageApi, contextHolder] = message.useMessage();
	const { setRole, setEmail } = useAppContext();
	const navigate = useNavigate();

	const enterWorkspace = (role: 'student' | 'admin', email: string) => {
		setRole(role);
		setEmail(email);
		navigate(role === 'admin' ? '/admin' : '/student');
	};

	const submit = (values: AuthValues) => {
		enterWorkspace('student', values.email);
		messageApi.success(mode === 'register' ? 'Tài khoản học sinh đã sẵn sàng.' : 'Đăng nhập thành công.');
	};

	return (
		<main className="auth-page">
			{contextHolder}
			<section className="auth-editorial">
				<div className="auth-photo" />
				<div className="auth-shade" />
				<div className="auth-brand">
					<span className="brand-mark brand-mark-light">B</span>
					<span>BK Uni</span>
				</div>
				<div className="auth-story">
					<span className="eyebrow eyebrow-light">HỌC TẬP CÓ ĐỊNH HƯỚNG</span>
					<h1>Chủ động<br />lộ trình học tập.</h1>
					<p>Theo dõi học phần, điều kiện tiên quyết và tiến độ chương trình trong một không gian thống nhất.</p>
					<div className="story-rule"><span /> DÀNH CHO SINH VIÊN BÁCH KHOA</div>
				</div>
				<div className="auth-image-credit">Không gian học tập · BK Uni</div>
			</section>

			<section className="auth-panel">
				<div className="auth-form-wrap">
					<div className="auth-mobile-brand"><span className="brand-mark">B</span><strong>BK Uni</strong></div>
					<span className="eyebrow">CỔNG TƯ VẤN HỌC PHẦN</span>
					<h2>{mode === 'login' ? 'Chào mừng trở lại' : 'Tạo tài khoản học sinh'}</h2>
					<p className="auth-intro">{mode === 'login' ? 'Đăng nhập để tiếp tục hồ sơ học tập của bạn.' : 'Tạo tài khoản để bắt đầu xây dựng hồ sơ học tập.'}</p>

					<Segmented
						block
						value={mode}
						options={[{ label: 'Đăng nhập', value: 'login' }, { label: 'Đăng ký', value: 'register' }]}
						onChange={(value) => {
							const nextMode = value as 'login' | 'register';
							setMode(nextMode);
							navigate(nextMode === 'register' ? '/register' : '/login', { replace: true });
						}}
						className="auth-segment"
					/>

					<Form form={form} layout="vertical" onFinish={submit} requiredMark={false} className="auth-form">
						<Form.Item label="Email" name="email" rules={[{ required: true, message: 'Nhập email của bạn.' }, { type: 'email', message: 'Email chưa đúng định dạng.' }]}>
							<Input size="large" prefix={<MailOutlined />} placeholder="ten@email.edu.vn" autoComplete="email" />
						</Form.Item>
						<Form.Item label="Mật khẩu" name="password" rules={[{ required: true, message: 'Nhập mật khẩu.' }, { min: 8, message: 'Mật khẩu tối thiểu 8 ký tự.' }]}>
							<Input.Password size="large" prefix={<LockOutlined />} placeholder="Tối thiểu 8 ký tự" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
						</Form.Item>
						{mode === 'login' ? (
							<div className="auth-options"><Checkbox>Ghi nhớ email</Checkbox><span>Phiên đăng nhập an toàn</span></div>
						) : (
							<p className="student-role-note"><BookOutlined /> Tài khoản đăng ký mới luôn có quyền học sinh.</p>
						)}
						<Button type="primary" size="large" htmlType="submit" block className="auth-submit">
							{mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'} <ArrowRightOutlined />
						</Button>
					</Form>

					<div className="auth-demo">
						<span className="auth-demo-label">KHÁM PHÁ BẢN DEMO</span>
						<div className="demo-actions">
							<Button onClick={() => enterWorkspace('student', 'sinhvien@example.test')}>Vào với vai trò học sinh</Button>
							<Button onClick={() => enterWorkspace('admin', 'admin@example.test')}>Vào với vai trò admin</Button>
						</div>
					</div>
					<p className="auth-terms">Bằng việc tiếp tục, bạn đồng ý sử dụng dữ liệu thử nghiệm của BK Uni.</p>
					<div className="auth-footer"><span>© 2026 BK Uni</span><Link to="/login">Hỗ trợ đăng nhập</Link></div>
				</div>
			</section>
		</main>
	);
}