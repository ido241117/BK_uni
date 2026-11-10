import { Alert, Form } from 'antd';
import { Link, useNavigate } from 'react-router';
import { ConfirmPasswordField, FormField, ISolidBtn, PasswordField } from '@/components';
import { register } from '@/apis/auth';
import { useAsyncAction } from '@/hooks';
import { emailRules } from '@/utils/auth-validation';

interface RegisterForm {
    email: string;
    password: string;
    confirm: string;
}

const RegisterPage = () => {
    const navigate = useNavigate();

    const submit = useAsyncAction(
        ({ email, password }: RegisterForm) => register({ email, password }),
        {
            // Đăng ký không tạo phiên (API-FRONTEND.md 3) → quay về trang đăng nhập.
            onSuccess: () => navigate('/login', { replace: true, state: { registered: true } }),
        },
    );

    return (
        <>
            <span className="auth-eyebrow">Tài khoản sinh viên</span>
            <h2>Tạo tài khoản</h2>
            <p>Đăng ký bằng email và mật khẩu để bắt đầu sử dụng BK Uni.</p>

            <Form<RegisterForm>
                layout="vertical"
                requiredMark={false}
                onFinish={values => void submit.run(values)}
                onValuesChange={submit.reset}
            >
                <FormField
                    name="email"
                    label="Email"
                    placeholder="you@example.com"
                    rules={emailRules}
                    hint="Sử dụng email bạn thường xuyên truy cập."
                    inputProps={{ type: 'email', autoComplete: 'email' }}
                />

                <PasswordField
                    name="password"
                    hint="Ít nhất 8 ký tự, tối đa 72 byte UTF-8. Không dùng lại mật khẩu quan trọng khác."
                    autoComplete="new-password"
                    placeholder="Tạo mật khẩu"
                />

                <ConfirmPasswordField hint="Nhập lại chính xác mật khẩu ở trên." />

                <ISolidBtn
                    className="auth-button"
                    htmlType="submit"
                    block
                    loading={submit.loading}
                >
                    Tạo tài khoản
                </ISolidBtn>
            </Form>

            {submit.error && (
                <Alert showIcon type="error" title={submit.error} style={{ marginTop: 16 }} />
            )}

            <p className="auth-footer">
                Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
            </p>
        </>
    );
};

export default RegisterPage;
