import { Card, Empty, Select, Space, Table, Typography } from 'antd';
import type { PlanResult } from '@/types';
import { semesterLabel } from '@/utils/semester';
import { PRIORITY_LABEL } from './priorities';
import { describeScenario, type Scenario } from './scenario';
import { order, planMetrics, planOf, type PlanMetrics } from './whatIf';
import i18n from '@/i18n';
import { trLive } from '@/i18n/live';

const { Text } = Typography;

/** Một bản để so: đang xem, kế hoạch giảng dạy, hoặc bản đã lưu. */
export interface CompareItem {
    key: string;
    name: string;
    result: PlanResult;
    scenario: Scenario | null;
    /** Kế hoạch giảng dạy: không có cảnh báo của bộ giải. */
    teaching?: boolean;
}

interface Props {
    items: CompareItem[];
    left: string;
    right: string;
    onPick: (side: 'left' | 'right', key: string) => void;
    courseName: (code: string) => string;
    recommended: Map<string, string>;
    required: Set<string>;
    /** Số môn còn lại có kỳ khuyến nghị / tổng (để ghi rõ "chỉ tính môn có kỳ khuyến nghị"). */
    coverage: { withSemester: number; total: number };
}

type Row = { label: string; value: (m: PlanMetrics) => string; num: (m: PlanMetrics) => number | null; lowerBetter: boolean };

const ROWS: Row[] = trLive([
    { label: 'Ra trường', value: m => (m.graduation ? semesterLabel(m.graduation) : '—'), num: m => (m.graduation ? order(m.graduation) : null), lowerBetter: true },
    { label: 'Kỳ chính ngoài 15–18 TC', value: m => `${m.band} kỳ`, num: m => m.band, lowerBetter: true },
    { label: 'Kỳ chính nặng nhất', value: m => `${m.heaviest} TC`, num: m => m.heaviest, lowerBetter: true },
    { label: 'Học hè', value: m => `${m.summer} TC`, num: () => null, lowerBetter: false },
    { label: 'Môn bắt buộc trễ hơn kế hoạch khoa', value: m => (m.lateRequired == null ? '—' : `${m.lateRequired} môn`), num: m => m.lateRequired, lowerBetter: true },
    { label: 'Cảnh báo', value: m => (m.warnings == null ? '—' : String(m.warnings)), num: m => m.warnings, lowerBetter: true },
]);

/** Giai đoạn 12 (M16, mục 12.7): so hai bản; tính trên trang, không gọi bộ giải. */
const ComparePanel = ({ items, left, right, onPick, courseName, recommended, required, coverage }: Props) => {
    const options = items.map(i => ({ value: i.key, label: i.name }));
    const a = items.find(i => i.key === left);
    const b = items.find(i => i.key === right);
    const picker = (
        <Space wrap>
            <Select style={{ minWidth: 220 }} value={a?.key} options={options} onChange={v => onPick('left', v)} aria-label={i18n.t('Bản thứ nhất')} />
            <Text type="secondary">{i18n.t('so với')}</Text>
            <Select style={{ minWidth: 220 }} value={b?.key} options={options} onChange={v => onPick('right', v)} aria-label={i18n.t('Bản thứ hai')} />
        </Space>
    );
    if (!a || !b) return <Card>{picker}<Empty description={i18n.t('Chọn hai bản để so')} /></Card>;

    const ma = planMetrics(a.result, recommended, required, !a.teaching);
    const mb = planMetrics(b.result, recommended, required, !b.teaching);
    const label = (id: string) => PRIORITY_LABEL[id as keyof typeof PRIORITY_LABEL] ?? id;
    const da = a.scenario ? describeScenario(a.scenario, label) : [];
    const db = b.scenario ? describeScenario(b.scenario, label) : [];
    const keys = [...new Set([...da.map(x => x[0]), ...db.map(x => x[0])])];
    const val = (d: [string, string][], k: string, teaching?: boolean) => (teaching ? i18n.t('Theo kỳ khuyến nghị của khoa') : d.find(x => x[0] === k)?.[1] ?? '—');
    const pa = planOf(a.result);
    const pb = planOf(b.result);
    const moves = Object.keys(pa).filter(c => pb[c] && pb[c] !== pa[c]).sort();

    return (
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            <Card size="small">{picker}</Card>
            <Card size="small" title={i18n.t('Chỉ số')}>
                <Table
                    size="small" pagination={false} rowKey="label" dataSource={ROWS}
                    columns={[
                        { title: '', dataIndex: 'label' },
                        ...[{ m: ma, other: mb, item: a }, { m: mb, other: ma, item: b }].map(({ m, other, item }) => ({
                            title: item.name,
                            key: item.key,
                            render: (_: unknown, r: Row) => {
                                const x = r.num(m);
                                const y = r.num(other);
                                const best = r.lowerBetter && x != null && y != null && x < y;
                                return <Text strong={best} type={best ? 'success' : undefined}>{r.value(m)}</Text>;
                            },
                        })),
                    ]}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                    {i18n.t('Chữ xanh: bản tốt hơn. "Trễ hơn kế hoạch khoa" chỉ tính môn có kỳ khuyến nghị (')}{coverage.withSemester}/{coverage.total}{' '}{i18n.t('môn còn lại).')}
                </Text>
            </Card>
            <Card size="small" title={i18n.t('Giả định khác nhau')}>
                <Table
                    className="compare-table"
                    size="small" pagination={false} rowKey={r => r}
                    dataSource={keys}
                    rowClassName={k => (val(da, k, a.teaching) !== val(db, k, b.teaching) ? 'is-changed' : '')}
                    columns={[
                        { title: '', render: (_: unknown, k: string) => k },
                        { title: a.name, className: 'compare-value', render: (_: unknown, k: string) => val(da, k, a.teaching) },
                        { title: b.name, className: 'compare-value', render: (_: unknown, k: string) => val(db, k, b.teaching) },
                    ]}
                />
                <span className="compare-legend">{i18n.t('Chấm hồng: hai bản khác nhau ở dòng này.')}</span>
            </Card>
            <Card size="small" title={i18n.t('Môn đổi kỳ ({{length}})', { length: moves.length })}>
                {moves.length === 0
                    ? <Text type="secondary">{i18n.t('Không môn nào đổi kỳ.')}</Text>
                    : (
                        <Table
                            size="small" pagination={false} rowKey={c => c} dataSource={moves}
                            columns={[
                                { title: i18n.t('Mã'), render: (_: unknown, c: string) => c, width: 110 },
                                { title: i18n.t('Môn'), render: (_: unknown, c: string) => courseName(c) },
                                { title: `${a.name} → ${b.name}`, render: (_: unknown, c: string) => `${pa[c]} → ${pb[c]}`, width: 200 },
                            ]}
                        />
                    )}
            </Card>
        </Space>
    );
};

export default ComparePanel;
