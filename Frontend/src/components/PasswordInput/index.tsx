import { Form, Input, type FormItemProps } from 'antd';
import type { ReactNode } from 'react';
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

/** Ô mật khẩu dùng chung: rule độ dài + byte UTF-8 lấy từ `utils/auth-validation`. */
export const PasswordField = ({
    name,
    label = 'Mật khẩu',
    hint,
    placeholder = 'Nhập mật khẩu',
    minLength = PASSWORD_MIN_LENGTH,
    autoComplete = 'current-password',
    formItemProps,
}: PasswordFieldProps) => (
    <Form.Item
        name={name}
        label={label}
        rules={passwordRules(minLength)}
        extra={hint}
        {...formItemProps}
    >
        <Input.Password size="large" autoComplete={autoComplete} placeholder={placeholder} />
    </Form.Item>
);

export interface ConfirmPasswordFieldProps extends Omit<BasePasswordProps, 'name'> {
    /** Mặc định `confirm`. */
    name?: FormItemProps['name'];
    /** Tên field mật khẩu gốc trong cùng form. */
    passwordField?: string;
}

export const ConfirmPasswordField = ({
    name = 'confirm',
    label = 'Nhập lại mật khẩu',
    hint,
    placeholder = 'Nhập lại mật khẩu',
    passwordField = 'password',
    formItemProps,
}: ConfirmPasswordFieldProps) => (
    <Form.Item
        name={name}
        label={label}
        dependencies={[passwordField]}
        rules={confirmPasswordRules(passwordField)}
        extra={hint}
        {...formItemProps}
    >
        <Input.Password size="large" autoComplete="new-password" placeholder={placeholder} />
    </Form.Item>
);
