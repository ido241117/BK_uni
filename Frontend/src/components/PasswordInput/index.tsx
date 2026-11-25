import { Form, Input, type FormItemProps } from 'antd';
import type { ReactNode } from 'react';
import { PiLockSimple } from 'react-icons/pi';
import { useTranslation } from 'react-i18next';
import { PASSWORD_MIN_LENGTH, confirmPasswordRules, passwordRules } from '@/utils/auth-validation';

interface BasePasswordProps {
    name: FormItemProps['name'];
    label?: ReactNode;
    hint?: ReactNode;
    placeholder?: string;
    formItemProps?: Omit<FormItemProps, 'name' | 'label' | 'rules' | 'extra'>;
}

export interface PasswordFieldProps extends BasePasswordProps {
    minLength?: number;
    autoComplete?: string;
}

/** Shared password field (underlined, leading lock icon): length + UTF-8 byte rules from `utils/auth-validation`. */
export const PasswordField = ({
    name,
    label,
    hint,
    placeholder,
    minLength = PASSWORD_MIN_LENGTH,
    autoComplete = 'current-password',
    formItemProps,
}: PasswordFieldProps) => {
    const { t } = useTranslation();
    return (
        <Form.Item name={name} label={label ?? t('Mật khẩu')} rules={passwordRules(minLength)} extra={hint} {...formItemProps}>
            <Input.Password
                size="large" autoComplete={autoComplete} placeholder={placeholder ?? t('Nhập mật khẩu')}
                prefix={<PiLockSimple aria-hidden="true" />}
            />
        </Form.Item>
    );
};

export interface ConfirmPasswordFieldProps extends Omit<BasePasswordProps, 'name'> {
    /** Default `confirm`. */
    name?: FormItemProps['name'];
    /** Name of the original password field in the same form. */
    passwordField?: string;
}

export const ConfirmPasswordField = ({
    name = 'confirm',
    label,
    hint,
    placeholder,
    passwordField = 'password',
    formItemProps,
}: ConfirmPasswordFieldProps) => {
    const { t } = useTranslation();
    return (
        <Form.Item
            name={name}
            label={label ?? t('Nhập lại mật khẩu')}
            dependencies={[passwordField]}
            rules={confirmPasswordRules(passwordField)}
            extra={hint}
            {...formItemProps}
        >
            <Input.Password
                size="large" autoComplete="new-password" placeholder={placeholder ?? t('Nhập lại mật khẩu')}
                prefix={<PiLockSimple aria-hidden="true" />}
            />
        </Form.Item>
    );
};
