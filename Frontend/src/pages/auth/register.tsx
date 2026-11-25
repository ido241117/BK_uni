import { Alert, Form } from 'antd';
import { PiEnvelopeSimple, PiSignIn, PiSparkleFill, PiStudent } from 'react-icons/pi';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { ConfirmPasswordField, FormField, IOutLinedBtn, ISolidBtn, PasswordField } from '@/components';
import { register } from '@/apis/auth';
import { useAsyncAction } from '@/hooks';
import { emailRules } from '@/utils/auth-validation';

interface RegisterForm {
    email: string;
    password: string;
    confirm: string;
}

/** Register: same layout as login. Registering does not sign in, so it returns to the login page. */
const RegisterPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const submit = useAsyncAction(
        ({ email, password }: RegisterForm) => register({ email, password }),
        { onSuccess: () => navigate('/login', { replace: true, state: { registered: true } }) },
    );

    return (
        <>
            <h1 className="auth-title">{t('Tạo tài khoản')} <PiSparkleFill aria-hidden="true" /></h1>

            <Form<RegisterForm>
                layout="vertical"
                requiredMark={false}
                onFinish={values => void submit.run(values)}
                onValuesChange={submit.reset}
                className="auth-form"
            >
                <FormField
                    name="email"
                    label={t('Email')}
                    placeholder="ten.ho@hcmut.edu.vn"
                    rules={emailRules}
                    hint={t('Sử dụng email bạn thường xuyên truy cập.')}
                    inputProps={{ type: 'email', autoComplete: 'email', prefix: <PiEnvelopeSimple aria-hidden="true" /> }}
                />
                <PasswordField
                    name="password"
                    autoComplete="new-password"
                    placeholder={t('Tạo mật khẩu')}
                    hint={t('Ít nhất 8 ký tự, tối đa 72 byte UTF-8. Không dùng lại mật khẩu quan trọng khác.')}
                />
                <ConfirmPasswordField hint={t('Nhập lại chính xác mật khẩu ở trên.')} />

                {submit.error && <Alert showIcon type="error" title={submit.error} />}

                <ISolidBtn htmlType="submit" size="large" block icon={<PiStudent />} loading={submit.loading}>
                    {t('Tạo tài khoản')}
                </ISolidBtn>
            </Form>

            <div className="divider-line">{t('hoặc')}</div>

            <IOutLinedBtn size="large" block icon={<PiSignIn />} onClick={() => navigate('/login')}>
                {t('Đăng nhập')}
            </IOutLinedBtn>
        </>
    );
};

export default RegisterPage;
