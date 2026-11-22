import { Button, Space, Switch, Typography } from 'antd';
import { LuArrowDown, LuArrowUp } from 'react-icons/lu';
import { DEFAULT_PRIORITIES, PRIORITY_LABEL, type PriorityItem } from './priorities';

const { Text } = Typography;

const PriorityList = ({ items, onChange }: { items: PriorityItem[]; onChange: (next: PriorityItem[], message: string) => void }) => {
    const move = (from: number, to: number) => {
        if (to < 0 || to >= items.length) return;
        const next = [...items];
        const [m] = next.splice(from, 1);
        next.splice(to, 0, m);
        onChange(next, `Đổi thứ tự: ${PRIORITY_LABEL[m.id]}`);
    };
    return (
        <Space orientation="vertical" style={{ width: '100%' }} size={4}>
            {items.map((p, i) => (
                <Space key={p.id} style={{ justifyContent: 'space-between', width: '100%' }}>
                    <Space size={6}>
                        <Text type="secondary" style={{ width: 16, display: 'inline-block' }}>{p.on ? i + 1 : ''}</Text>
                        <Text type={p.on ? undefined : 'secondary'}>{PRIORITY_LABEL[p.id]}</Text>
                    </Space>
                    <Space size={2}>
                        <Button size="small" type="text" icon={<LuArrowUp />} disabled={i === 0} aria-label="Lên" onClick={() => move(i, i - 1)} />
                        <Button size="small" type="text" icon={<LuArrowDown />} disabled={i === items.length - 1} aria-label="Xuống" onClick={() => move(i, i + 1)} />
                        <Switch size="small" checked={p.on}
                            onChange={v => onChange(items.map(x => (x.id === p.id ? { ...x, on: v } : x)), `${v ? 'Bật' : 'Tắt'}: ${PRIORITY_LABEL[p.id]}`)} />
                    </Space>
                </Space>
            ))}
            <Button size="small" type="link" style={{ paddingInline: 0 }} onClick={() => onChange(DEFAULT_PRIORITIES, 'Ưu tiên về mặc định')}>
                Về mặc định
            </Button>
        </Space>
    );
};

export default PriorityList;
