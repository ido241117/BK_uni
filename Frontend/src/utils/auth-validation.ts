import type { Rule } from 'antd/es/form';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;
export const EMAIL_MAX_LENGTH = 255;

const byteLength = (value: string) => new TextEncoder().encode(value).length;

/**
 * Kiểm tra độ dài mật khẩu theo cả ký tự và byte UTF-8 (giới hạn bcrypt 72 byte).
 * Trả về thông điệp lỗi, hoặc `null` nếu hợp lệ.
 */
export const getPasswordError = (
    value: string | undefined,
    minLength = PASSWORD_MIN_LENGTH,
): string | null => {
    if (!value) return 'Vui lòng nhập mật khẩu.';
    if ([...value].length < minLength) return `Mật khẩu phải có ít nhất ${minLength} ký tự.`;
    if ([...value].length > PASSWORD_MAX_BYTES || byteLength(value) > PASSWORD_MAX_BYTES) {
        return `Mật khẩu không được vượt quá ${PASSWORD_MAX_BYTES} ký tự hoặc ${PASSWORD_MAX_BYTES} byte UTF-8.`;
    }
    return null;
};

export const emailRules: Rule[] = [
    { required: true, message: 'Vui lòng nhập email.' },
    { type: 'email', message: 'Vui lòng nhập địa chỉ email hợp lệ.' },
    { max: EMAIL_MAX_LENGTH, message: `Email không được vượt quá ${EMAIL_MAX_LENGTH} ký tự.` },
];

/** Rule mật khẩu dùng chung cho đăng nhập/đăng ký/đổi mật khẩu. */
export const passwordRules = (minLength = PASSWORD_MIN_LENGTH): Rule[] => [
    {
        required: true,
        message: 'Vui lòng nhập mật khẩu.',
    },
    {
        validator: (_, value: string | undefined) => {
            const error = getPasswordError(value, minLength);
            return error ? Promise.reject(new Error(error)) : Promise.resolve();
        },
    },
];

/** Rule "nhập lại mật khẩu" — so khớp với field `password` cùng form. */
export const confirmPasswordRules = (passwordField = 'password'): Rule[] => [
    { required: true, message: 'Vui lòng nhập lại mật khẩu.' },
    ({ getFieldValue }) => ({
        validator: (_, value: string | undefined) => {
            if (!value || value === getFieldValue(passwordField)) return Promise.resolve();
            return Promise.reject(new Error('Mật khẩu nhập lại chưa khớp.'));
        },
    }),
];
