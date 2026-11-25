import { Input, Switch, type InputProps, type InputRef } from 'antd';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PiMagnifyingGlass, PiX } from 'react-icons/pi';
import i18n from '@/i18n';

interface SearchLineProps extends Omit<InputProps, 'prefix' | 'suffix' | 'allowClear'> {
    /** Blush-washed variant for dense toolbars (controls.html `.search-line[data-tinted]`). */
    tinted?: boolean;
    /** Press "/" anywhere (outside a text field) to focus this search; shows a "/" hint while empty. */
    slashShortcut?: boolean;
}

const isTyping = (target: EventTarget | null) => target instanceof HTMLElement
    && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/** Underlined search with a magnifier and a clear button (controls.html `.search-line`). */
export const SearchLine = ({ className, tinted = false, slashShortcut = false, ...rest }: SearchLineProps) => {
    const ref = useRef<InputRef>(null);
    const [focused, setFocused] = useState(false);
    const empty = !rest.value && !rest.defaultValue;

    useEffect(() => {
        if (!slashShortcut) return undefined;
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== '/' || isTyping(event.target)) return;
            event.preventDefault();
            ref.current?.focus();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [slashShortcut]);

    return (
        <Input
            {...rest}
            ref={ref}
            className={['search-line', className].filter(Boolean).join(' ')}
            data-tinted={tinted}
            prefix={<PiMagnifyingGlass aria-hidden="true" />}
            suffix={slashShortcut && empty && !focused ? <kbd className="search-kbd">/</kbd> : <span />}
            allowClear={{ clearIcon: <PiX aria-label={i18n.t('Xóa tìm kiếm')} /> }}
            onFocus={(event) => { setFocused(true); rest.onFocus?.(event); }}
            onBlur={(event) => { setFocused(false); rest.onBlur?.(event); }}
        />
    );
};

interface LabeledSwitchProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    children: ReactNode;
    disabled?: boolean;
}

/** Thread switch with its label to the right, the whole row clickable (e.g. "Chỉ môn chưa đạt"). */
export const LabeledSwitch = ({ checked, onChange, children, disabled }: LabeledSwitchProps) => (
    <label className="switch-row" data-disabled={disabled}>
        <Switch checked={checked} onChange={onChange} disabled={disabled} />
        {children}
    </label>
);

interface ToggleRowProps {
    title: ReactNode;
    description?: ReactNode;
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
}

/** Setting row: title + description left, thread switch right (controls.html `.toggle-row`). */
export const ToggleRow = ({ title, description, checked, onChange, disabled }: ToggleRowProps) => (
    <label className="toggle-row" data-disabled={disabled}>
        <span className="toggle-text">
            <span className="toggle-title">{title}</span>
            {description && <span className="toggle-sub">{description}</span>}
        </span>
        <Switch checked={checked} onChange={onChange} disabled={disabled} />
    </label>
);
