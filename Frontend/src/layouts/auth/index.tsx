import { Link, Outlet, useLocation } from 'react-router';

const COPY = {
    login: {
        eyebrow: 'Chào mừng bạn trở lại',
        title: 'Tiếp tục hành trình học tập.',
        description: 'Đăng nhập để xem chương trình đào tạo, khai trạng thái môn học và xây dựng kế hoạch học tập của bạn.',
    },
    register: {
        eyebrow: 'Bắt đầu hành trình của bạn',
        title: 'Học tập có kế hoạch. Tiến bước vững vàng.',
        description: 'Tạo tài khoản để theo dõi tiến độ, khám phá chương trình đào tạo và chủ động xây dựng kế hoạch học tập.',
    },
} as const;

/** Layout hai cột cho trang đăng nhập/đăng ký. */
const AuthLayout = () => {
    const isRegister = useLocation().pathname === '/register';
    const copy = isRegister ? COPY.register : COPY.login;

    return (
        <main className="auth-page">
            <aside className="auth-intro" aria-label="Giới thiệu BK Uni">
                <Link to="/" className="app-brand">
                    <span className="app-brand-mark">bk</span>
                    <span className="app-brand-text">
                        <strong>BK Uni</strong>
                        <small>Hành trình học tập</small>
                    </span>
                </Link>

                <div className="auth-copy">
                    <span className="auth-eyebrow">{copy.eyebrow}</span>
                    <h1>{copy.title}</h1>
                    <p>{copy.description}</p>
                </div>

                <p>BK Uni hỗ trợ lập kế hoạch học tập; kết quả không thay thế xác nhận chính thức của nhà trường.</p>
            </aside>

            <section className="auth-form-side">
                <div className="auth-form-wrap">
                    <Outlet />
                </div>
            </section>
        </main>
    );
};

export default AuthLayout;
