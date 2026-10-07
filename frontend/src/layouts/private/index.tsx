import {
	AppstoreOutlined,
	AuditOutlined,
	BookOutlined,
	HistoryOutlined,
	LogoutOutlined,
	UserOutlined,
} from '@ant-design/icons';
import { Avatar, Button, Dropdown, Layout, Menu, Tag, Typography } from 'antd';
import type { MenuProps } from 'antd';
import { useMemo, useRef } from 'react';
import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { useAppContext } from '@/contexts/use-app-context';
import apiClient, { unwrapApiResponse, type ApiEnvelope } from '@/apis';

const { Header, Sider, Content } = Layout;

export default function PrivateLayout() {
	const { role, setRole, email, setEmail } = useAppContext();
	const location = useLocation();
	const navigate = useNavigate();
	const [sessionChecked, setSessionChecked] = useState(false);
	const [sessionValid, setSessionValid] = useState(false);
	const loggingOut = useRef(false);

	useEffect(() => {
		let active = true;
		apiClient
			.get<ApiEnvelope<{ id: string; email: string; role: 'student' | 'admin' }>>('/me')
			.then((response) => {
				const account = unwrapApiResponse(response);
				if (!active) return;
				setRole(account.role);
				setEmail(account.email);
				setSessionValid(true);
			})
			.catch(() => {
				if (active) navigate('/login', { replace: true });
			})
			.finally(() => {
				if (active) setSessionChecked(true);
			});
		return () => {
			active = false;
		};
	}, [navigate, setEmail, setRole]);

	useEffect(() => {
		if (!sessionChecked || loggingOut.current) return;
		if (role === 'admin' && !location.pathname.startsWith('/admin') && location.pathname !== '/account') {
			navigate('/admin', { replace: true });
		} else if (role === 'student' && location.pathname.startsWith('/admin')) {
			navigate('/student', { replace: true });
		}
	}, [location.pathname, navigate, role, sessionChecked]);

	const items = useMemo(() => {
		if (role === 'admin') {
			return [
				{ key: '/admin', icon: <AppstoreOutlined />, label: 'Quản lý chương trình' },
			];
		}
		return [
			{ key: '/student', icon: <BookOutlined />, label: 'Hồ sơ học tập' },
			{ key: '/analysis', icon: <AuditOutlined />, label: 'Phân tích' },
			{ key: '/history', icon: <HistoryOutlined />, label: 'Lịch sử phân tích' },
		];
	}, [role]);

	const accountMenu: MenuProps['items'] = [
		{ key: 'account', icon: <UserOutlined />, label: 'Thông tin tài khoản' },
		{ type: 'divider' },
		{ key: 'logout', icon: <LogoutOutlined />, label: 'Đăng xuất' },
	];

	const handleAccountAction: MenuProps['onClick'] = ({ key }) => {
		if (key === 'account') navigate('/account');
		if (key === 'logout') {
			loggingOut.current = true;
			void (async () => {
				try {
					await apiClient.get('/auth/csrf');
					await apiClient.post('/auth/logout');
				} finally {
					await navigate('/login', { replace: true });
					setRole('student');
					setEmail('');
				}
			})();
		}
	};

	const selectedKey = items.some((item) => item.key === location.pathname)
		? location.pathname
		: location.pathname.startsWith('/analysis')
			? '/analysis'
			: location.pathname.startsWith('/history')
				? '/history'
				: location.pathname.startsWith('/admin')
					? '/admin'
					: '/student';

	if (!sessionChecked || !sessionValid || !email) {
		return <div className="route-loading">BK Uni · Đang xác thực phiên</div>;
	}

	return (
		<Layout className="workspace-layout">
			<Sider width={244} breakpoint="lg" collapsedWidth={0} className="workspace-sider">
				<div className="brand-lockup">
					<span className="brand-mark">B</span>
					<span>
						<strong>BK Uni</strong>
						<small>HỌC TẬP &amp; HỌC PHẦN</small>
					</span>
				</div>
				<div className="sider-label">KHÔNG GIAN LÀM VIỆC</div>
				<Menu
					mode="inline"
					selectedKeys={[selectedKey]}
					items={items}
					onClick={({ key }) => navigate(key)}
					className="workspace-menu"
				/>
				<div className="sider-footer">
					<div className="sider-footer-mark"><span /></div>
					<div>
						<strong>{role === 'admin' ? 'Quản trị viên' : 'Hồ sơ sinh viên'}</strong>
						<span>{role === 'admin' ? 'Quản lý dữ liệu CTĐT' : 'Khoa học Máy tính'}</span>
					</div>
				</div>
			</Sider>
			<Layout className="workspace-main">
				<Header className="workspace-header">
					<div className="header-context">
						<span className="header-kicker">CỔNG TƯ VẤN HỌC PHẦN</span>
						<span className="header-title">{role === 'admin' ? 'Quản trị' : 'Không gian học tập'}</span>
					</div>
					<div className="header-actions">
						<Tag variant="filled" className="demo-tag">PHIÊN BẢO MẬT</Tag>
						<Dropdown menu={{ items: accountMenu, onClick: handleAccountAction }} trigger={['click']}>
							<Button type="text" className="account-trigger">
								<Avatar size={34} icon={<UserOutlined />} />
								<span className="account-email">{email}</span>
							</Button>
						</Dropdown>
					</div>
				</Header>
				<Content className="workspace-content">
					<div className="page-frame">
						<Outlet />
					</div>
					<footer className="workspace-footer">
						<Typography.Text type="secondary">BK Uni · Dữ liệu minh họa phục vụ phát triển MVP</Typography.Text>
						<span>2026</span>
					</footer>
				</Content>
			</Layout>
		</Layout>
	);
}