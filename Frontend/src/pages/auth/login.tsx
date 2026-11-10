import { Alert, Form } from 'antd';
import { Link, useLocation, useNavigate } from 'react-router';
import { FormField, ISolidBtn, PasswordField } from '@/components';
import { useAsyncAction } from '@/hooks';
import { useAuthStore } from '@/stores';
import type { Credentials } from '@/types';
import { homeForRole } from '@/utils/auth';
import { emailRules } from '@/utils/auth-validation';

const LoginPage = () => {
    const signIn = useAuthStore(state => state.signIn);
    const navigate = useNavigate();
    const location = useLocation();

    const state = location.state as { registered?: boolean; from?: string } | null;
    const redirectTo = state?.from;

    const login = useAsyncAction((values: Credentials) => signIn(values), {
        onSuccess: (account) => {
            navigate(redirectTo ?? homeForRole(account.role), { replace: true });
        },
    });

    return (
        <>
            <span className="auth-eyebrow">Tài khoản sinh viên</span>
            <h2>Đăng nhập</h2>
            <p>Nhập email và mật khẩu để tiếp tục sử dụng BK Uni.</p>

            {state?.registered && (
                <Alert
                    showIcon
                    type="success"
                    title="Đăng ký thành công. Vui lòng đăng nhập."
                    style={{ marginBottom: 16 }}
                />
            )}

            <Form<Credentials>
                layout="vertical"
                requiredMark={false}
                onFinish={values => void login.run(values)}
                onValuesChange={login.reset}
            >
                <FormField
                    name="email"
                    label="Email"
                    placeholder="you@example.com"
                    rules={emailRules}
                    hint="Dùng email đã đăng ký tài khoản BK Uni."
                    inputProps={{ type: 'email', autoComplete: 'email' }}
                />

                <PasswordField
                    name="password"
                    minLength={1}
                    autoComplete="current-password"
                    hint="Mật khẩu phân biệt chữ hoa và chữ thường."
                />

                <ISolidBtn
                    className="auth-button"
                    htmlType="submit"
                    block
                    loading={login.loading}
                >
                    Đăng nhập
                </ISolidBtn>
            </Form>

            {login.error && (
                <Alert showIcon type="error" title={login.error} style={{ marginTop: 16 }} />
            )}

            <p className="auth-footer">
                Chưa có tài khoản? <Link to="/register">Tạo tài khoản</Link>
            </p>
        </>
    );
};

export default LoginPage;
