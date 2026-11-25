import { Button, Space, Switch, Typography } from 'antd';
import { LuArrowDown, LuArrowUp } from 'react-icons/lu';
import { DEFAULT_PRIORITIES, PRIORITY_LABEL, type PriorityItem } from './priorities';
import i18n from '@/i18n';

const { Text } = Typography;

/** Giai đoạn 12 (M4): 3 mục bật/tắt, lên/xuống; học phí và sở thích hiện mờ "bàn sau". */
const PriorityList = ({ items, onChange }: { items: PriorityItem[]; onChange: (next: PriorityItem[], message: string) => void }) => {
    const move = (from: number, to: number) => {
        if (to < 0 || to >= items.length) return;
        const next = [...items];
        const [m] = next.splice(from, 1);
        next.splice(to, 0, m);
        onChange(next, i18n.t('Đổi thứ tự: {{v0}}', { v0: PRIORITY_LABEL[m.id] }));
    };
    return (
        <Space orientation="vertical" style={{ width: '100%' }} size={4}>
            <Text type="secondary" style={{ fontSize: 12 }}>{i18n.t('Trên cùng là quan trọng nhất. Tắt nếu không cần.')}</Text>
            {items.map((p, i) => (
                <Space key={p.id} style={{ justifyContent: 'space-between', width: '100%' }}>
                    <Space size={6}>
                        <Text type="secondary" style={{ width: 16, display: 'inline-block' }}>{p.on ? i + 1 : ''}</Text>
                        <Text type={p.on ? undefined : 'secondary'}>{PRIORITY_LABEL[p.id]}</Text>
                    </Space>
                    <Space size={2}>
                        <Button size="small" type="text" icon={<LuArrowUp />} disabled={i === 0} aria-label={i18n.t('Lên')} onClick={() => move(i, i - 1)} />
                        <Button size="small" type="text" icon={<LuArrowDown />} disabled={i === items.length - 1} aria-label={i18n.t('Xuống')} onClick={() => move(i, i + 1)} />
                        <Switch size="small" checked={p.on} aria-label={i18n.t('Bật {{v0}}', { v0: PRIORITY_LABEL[p.id] })}
                            onChange={v => onChange(items.map(x => (x.id === p.id ? { ...x, on: v } : x)), `${v ? i18n.t('Bật') : i18n.t('Tắt')}: ${PRIORITY_LABEL[p.id]}`)} />
                    </Space>
                </Space>
            ))}
            {[i18n.t('Học phí thấp'), i18n.t('Theo sở thích')].map(label => (
                <Space key={label} style={{ justifyContent: 'space-between', width: '100%' }}>
                    <Text disabled style={{ marginLeft: 22 }}>{label}{' '}{i18n.t('(bàn sau)')}</Text>
                    <Switch size="small" disabled checked={false} />
                </Space>
            ))}
            <Button size="small" type="link" style={{ paddingInline: 0 }} onClick={() => onChange(DEFAULT_PRIORITIES, i18n.t('Ưu tiên về mặc định'))}>
                {i18n.t('Về mặc định')}
            </Button>
        </Space>
    );
};

export default PriorityList;
