import { Alert, Form } from 'antd';
import { PiEnvelopeSimple, PiSignIn, PiSparkleFill, PiStudent } from 'react-icons/pi';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import { FormField, IOutLinedBtn, ISolidBtn, PasswordField } from '@/components';
import { useAsyncAction } from '@/hooks';
import { useAuthStore } from '@/stores';
import type { Credentials } from '@/types';
import { homeForRole } from '@/utils/auth';
import { emailRules } from '@/utils/auth-validation';

/** Login (ui-template/dang-nhap.html). No "remember me" / "forgot password": the backend has neither. */
const LoginPage = () => {
    const { t } = useTranslation();
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
            {/* The sparkle here is decoration (brand motif), not an icon with a meaning. */}
            <h1 className="auth-title">{t('Đăng nhập')} <PiSparkleFill aria-hidden="true" /></h1>

            {state?.registered && <Alert showIcon type="success" title={t('Đăng ký thành công. Vui lòng đăng nhập.')} />}

            <Form<Credentials>
                layout="vertical"
                requiredMark={false}
                onFinish={values => void login.run(values)}
                onValuesChange={login.reset}
                className="auth-form"
            >
                <FormField
                    name="email"
                    label={t('Email')}
                    placeholder="ten.ho@hcmut.edu.vn"
                    rules={emailRules}
                    inputProps={{ type: 'email', autoComplete: 'email', prefix: <PiEnvelopeSimple aria-hidden="true" /> }}
                />
                <PasswordField name="password" minLength={1} autoComplete="current-password" placeholder={t('Nhập mật khẩu của bạn')} />

                {login.error && <Alert showIcon type="error" title={login.error} />}

                <ISolidBtn htmlType="submit" size="large" block icon={<PiSignIn />} loading={login.loading}>
                    {t('Đăng nhập vào cổng học tập')}
                </ISolidBtn>
            </Form>

            <div className="divider-line">{t('hoặc')}</div>

            <IOutLinedBtn size="large" block icon={<PiStudent />} onClick={() => navigate('/register')}>
                {t('Tạo tài khoản')}
            </IOutLinedBtn>
        </>
    );
};

export default LoginPage;
