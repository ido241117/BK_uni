import { Form, Input, type FormItemProps, type InputProps } from 'antd';
import type { Rule } from 'antd/es/form';
import type { ReactNode } from 'react';

export interface FormFieldProps {
    name: FormItemProps['name'];
    label?: ReactNode;
    rules?: Rule[];
    /** Gợi ý hiển thị dưới ô nhập. */
    hint?: ReactNode;
    placeholder?: string;
    inputProps?: InputProps;
    formItemProps?: Omit<FormItemProps, 'name' | 'label' | 'rules' | 'extra'>;
}

/** `Input` + `Form.Item` gói sẵn: nhãn, rule, gợi ý, debounce validate. */
export const FormField = ({
    name,
    label,
    rules,
    hint,
    placeholder,
    inputProps,
    formItemProps,
}: FormFieldProps) => (
    <Form.Item
        name={name}
        label={label}
        rules={rules}
        extra={hint}
        validateDebounce={rules ? 400 : undefined}
        {...formItemProps}
    >
        <Input size="large" placeholder={placeholder} {...inputProps} />
    </Form.Item>
);

export default FormField;
