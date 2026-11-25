import { Button, type ButtonProps } from 'antd';
import type { ReactNode } from 'react';

/**
 * Shared buttons. Each wrapper only picks antd's `color` + `variant`; the look comes from ./button.css
 * (ui-template/controls.html). `size`: small = dense rows, large = login. `color="danger"` for destructive actions.
 */
export interface IButtonProps extends Omit<ButtonProps, 'type' | 'color' | 'variant'> {
    color?: ButtonProps['color'];
}

/** Primary stamp: the one main action of a section ("Nhập tiến độ học tập", "Lưu hiệu chỉnh", "Giải"). */
export const ISolidBtn = ({ color = 'primary', htmlType = 'button', ...rest }: IButtonProps) => (
    <Button {...rest} htmlType={htmlType} color={color} variant="solid" />
);

/** Secondary stamp: supporting actions next to a primary one. */
export const IOutLinedBtn = ({ color = 'primary', htmlType = 'button', ...rest }: IButtonProps) => (
    <Button {...rest} htmlType={htmlType} color={color} variant="outlined" />
);

/** Tertiary: underlined low-emphasis action such as "Hủy", "Hoàn tác". */
export const ITextBtn = ({ htmlType = 'button', ...rest }: IButtonProps) => (
    <Button {...rest} htmlType={htmlType} variant="text" />
);

export interface IconBtnProps extends Omit<IButtonProps, 'children' | 'icon' | 'shape'> {
    icon: ReactNode;
    /** Nhãn cho trình đọc màn hình (bắt buộc vì nút chỉ có icon). */
    label: string;
}

/** Icon-only 34px hairline box (e.g. close, edit in a row). */
export const IconBtn = ({ icon, label, ...rest }: IconBtnProps) => (
    <Button {...rest} type="text" icon={icon} aria-label={label} title={label} />
);
