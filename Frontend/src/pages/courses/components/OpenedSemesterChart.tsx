import { useMemo } from 'react';
import { Tooltip, Typography } from 'antd';
import { LuCheck, LuMinus } from 'react-icons/lu';
import { currentSemester, parseSemester, toSemesterCode } from '../analysis/semester';

const { Text } = Typography;

const TERMS = [
    { term: 1, label: 'Kỳ 1', months: 'Th 8 – 12' },
    { term: 2, label: 'Kỳ 2', months: 'Th 1 – 5' },
    { term: 3, label: 'Kỳ hè', months: 'Th 6 – 7' },
] as const;

/** Số năm học tối đa hiển thị (lấy các năm gần nhất). */
const MAX_YEARS = 8;

type CellState = 'opened' | 'closed' | 'future';

const CELL_TEXT: Record<CellState, string> = {
    opened: 'Có mở lớp',
    closed: 'Không mở',
    future: 'Chưa diễn ra',
};

interface OpenedSemesterChartProps {
    semesterCodes: string[];
}

/**
 * Lưới năm học × học kỳ: mỗi hàng là một năm học, ba cột là kỳ 1, kỳ 2, kỳ hè.
 * Ô có mở lớp được tô màu và có dấu ✓, ô không mở để trống, ô sau học kỳ hiện tại là "chưa diễn ra".
 */
const OpenedSemesterChart = ({ semesterCodes }: OpenedSemesterChartProps) => {
    const current = currentSemester();

    const { years, opened, stats, summary } = useMemo(() => {
        const openedSet = new Set(semesterCodes);
        const parsed = semesterCodes.map(parseSemester).filter((parts): parts is NonNullable<typeof parts> => parts !== null);
        const currentYear = parseSemester(current)!.year;
        const firstYear = Math.max(Math.min(currentYear, ...parsed.map(parts => parts.year)), currentYear - MAX_YEARS + 1);
        const lastYear = Math.max(currentYear, ...parsed.map(parts => parts.year));
        const yearList = Array.from({ length: lastYear - firstYear + 1 }, (_, index) => firstYear + index);

        // Tần suất chỉ tính trên các kỳ đã diễn ra (tới học kỳ hiện tại).
        const termStats = TERMS.map(({ term }) => {
            const past = yearList.map(year => toSemesterCode(year, term)).filter(code => code <= current);
            const count = past.filter(code => openedSet.has(code)).length;
            return { term, count, total: past.length };
        });

        const always = termStats.filter(stat => stat.total > 0 && stat.count === stat.total);
        const never = termStats.filter(stat => stat.total > 0 && stat.count === 0);
        const name = (term: number) => TERMS.find(item => item.term === term)!.label.toLowerCase();
        const parts: string[] = [];
        if (always.length) parts.push(`Năm nào cũng mở ở ${always.map(stat => name(stat.term)).join(', ')}`);
        const sometimes = termStats.filter(stat => stat.count > 0 && stat.count < stat.total);
        if (sometimes.length) parts.push(`thỉnh thoảng mở ở ${sometimes.map(stat => `${name(stat.term)} (${stat.count}/${stat.total} năm)`).join(', ')}`);
        if (never.length) parts.push(`chưa từng mở ở ${never.map(stat => name(stat.term)).join(', ')}`);

        const text = parts.join('; ');
        return {
            years: yearList,
            opened: openedSet,
            stats: termStats,
            summary: text ? text[0].toUpperCase() + text.slice(1) : '',
        };
    }, [semesterCodes, current]);

    const stateOf = (code: string): CellState => {
        if (opened.has(code)) return 'opened';
        return code > current ? 'future' : 'closed';
    };

    return (
        <div className="opened-chart">
            <div className="opened-grid" role="table" aria-label="Học kỳ đã mở theo năm học">
                <div className="opened-row opened-head" role="row">
                    <span role="columnheader" className="opened-year">Năm học</span>
                    {TERMS.map(item => (
                        <span key={item.term} role="columnheader" className="opened-term-head">
                            <span className="opened-term-name">{item.label}</span>
                            <span className="hint">{item.months}</span>
                        </span>
                    ))}
                </div>

                {years.slice().reverse().map(year => (
                    <div key={year} className="opened-row" role="row">
                        <span role="rowheader" className="opened-year">
                            {year}–{year + 1}
                        </span>
                        {TERMS.map(item => {
                            const code = toSemesterCode(year, item.term);
                            const state = stateOf(code);
                            const isCurrent = code === current;
                            return (
                                <Tooltip
                                    key={code}
                                    title={`HK ${code} · ${item.label} ${year}–${year + 1}: ${CELL_TEXT[state]}${isCurrent ? ' (học kỳ hiện tại)' : ''}`}
                                >
                                    <div
                                        role="cell"
                                        tabIndex={0}
                                        className={`opened-cell is-${state}${isCurrent ? ' is-current' : ''}`}
                                        aria-label={`HK ${code}: ${CELL_TEXT[state]}`}
                                    >
                                        {state === 'opened' && <LuCheck aria-hidden />}
                                        {state === 'closed' && <LuMinus aria-hidden />}
                                        <span className="opened-cell-code">{code}</span>
                                        <span className="opened-cell-text">{CELL_TEXT[state]}</span>
                                    </div>
                                </Tooltip>
                            );
                        })}
                    </div>
                ))}

                <div className="opened-row opened-foot" role="row">
                    <span role="rowheader" className="opened-year">Tần suất</span>
                    {stats.map(stat => (
                        <div key={stat.term} role="cell" className="opened-freq">
                            <div className="viz-hbar" style={{ height: 8 }}>
                                {stat.count > 0 && (
                                    <div className="viz-hbar-seg viz-fill-done" style={{ width: `${(stat.count / Math.max(1, stat.total)) * 100}%` }} />
                                )}
                            </div>
                            <span className="opened-freq-text">{stat.count}/{stat.total} năm</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="opened-legend">
                <span><span className="opened-swatch is-opened"><LuCheck /></span>Có mở lớp</span>
                <span><span className="opened-swatch is-closed"><LuMinus /></span>Không mở</span>
                <span><span className="opened-swatch is-future" />Chưa diễn ra</span>
                <span><span className="opened-swatch is-current-swatch" />Học kỳ hiện tại</span>
            </div>

            {summary && <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>Nhận xét: {summary}.</Text>}
        </div>
    );
};

export default OpenedSemesterChart;
