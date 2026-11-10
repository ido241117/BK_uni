import { Button, type ButtonProps } from 'antd';
import type { ReactNode } from 'react';

/**
 * Nút dùng chung. Chỉ chọn `color` + `variant` của antd; 4 trạng thái
 * (default / hover / active / disabled) do theme token sinh ra, không viết CSS tay.
 */
export interface IButtonProps extends Omit<ButtonProps, 'type' | 'color' | 'variant'> {
    color?: ButtonProps['color'];
}

export const ISolidBtn = ({ color = 'primary', htmlType = 'button', ...rest }: IButtonProps) => (
    <Button {...rest} htmlType={htmlType} color={color} variant="solid" />
);

export const IOutLinedBtn = ({ color = 'primary', htmlType = 'button', ...rest }: IButtonProps) => (
    <Button {...rest} htmlType={htmlType} color={color} variant="outlined" />
);

export const ITextBtn = ({ htmlType = 'button', ...rest }: IButtonProps) => (
    <Button {...rest} htmlType={htmlType} variant="text" />
);

export interface IconBtnProps extends Omit<IButtonProps, 'children' | 'icon' | 'shape'> {
    icon: ReactNode;
    /** Nhãn cho trình đọc màn hình (bắt buộc vì nút chỉ có icon). */
    label: string;
}

export const IconBtn = ({ icon, label, ...rest }: IconBtnProps) => (
    <Button {...rest} type="text" shape="circle" icon={icon} aria-label={label} title={label} />
);
