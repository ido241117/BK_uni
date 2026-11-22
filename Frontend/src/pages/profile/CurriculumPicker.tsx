import { useMemo, useState } from 'react';
import { Dropdown, Empty, Input, Modal, Table, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { LuSearch } from 'react-icons/lu';
import { IOutLinedBtn, ITextBtn } from '@/components';
import type { Curriculum } from '@/types';
import { cohortsOfLabel, SCHOOL_PROGRAMS, type SchoolProgramRow } from './school-programs';

const { Text } = Typography;

/** `CS-2024-KHMT` (hoặc biến thể `MSE-2023-KTVL-VKH`) → khoá `CS/KHMT` + khóa 2024. */
const parseCode = (code: string) => {
    const [prefix, cohort, suffix] = code.split('-');
    return suffix ? { key: `${prefix}/${suffix}`, cohort: Number(cohort) } : null;
};

interface PickerRow extends SchoolProgramRow {
    index: number;
    /** Số dòng khoa này chiếm (chỉ dòng đầu của khoa > 0), để gộp ô "Khoa". */
    facultySpan: number;
}

const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

interface ChipProps {
    label: string;
    matches: Curriculum[];
    selectedId: string | null | undefined;
    onPick: (curriculum: Curriculum) => void;
}

/** Một khóa trong bảng: có dữ liệu thì bấm chọn được (nhiều bản thì mở danh sách), chưa có thì xám. */
const ProgramChip = ({ label, matches, selectedId, onPick }: ChipProps) => {
    if (!matches.length) {
        return (
            <Tooltip title="Sẽ hỗ trợ sau">
                <span className="program-chip" data-state="unavailable" tabIndex={0} aria-disabled="true" aria-label={`${label}: sẽ hỗ trợ sau`}>
                    {label}
                </span>
            </Tooltip>
        );
    }
    const selected = matches.some(item => item.id === selectedId);
    const state = selected ? 'selected' : 'available';
    if (matches.length === 1) {
        const [curriculum] = matches;
        return (
            <Tooltip title={`${curriculum.code} · ${curriculum.name}`}>
                <button type="button" className="program-chip" data-state={state} onClick={() => onPick(curriculum)}>
                    {label}
                </button>
            </Tooltip>
        );
    }
    return (
        <Dropdown
            trigger={['click']}
            menu={{
                selectedKeys: selectedId ? [selectedId] : [],
                items: matches.map(item => ({ key: item.id, label: `${item.code} · ${item.name}` })),
                onClick: ({ key }) => onPick(matches.find(item => item.id === key)!),
            }}
        >
            <button type="button" className="program-chip" data-state={state} aria-haspopup="menu">
                {label} ({matches.length})
            </button>
        </Dropdown>
    );
};

interface CurriculumPickerProps {
    /** Do `Form.Item` truyền vào. */
    value?: string | null;
    onChange?: (value: string | null) => void;
    curricula: Curriculum[];
    loading?: boolean;
}

/**
 * Chọn chương trình đào tạo qua bảng CTĐT quen thuộc của trường: khoa → ngành → khóa.
 * Khóa đã có dữ liệu trong hệ thống thì tô màu và bấm chọn ngay; khóa chưa có thì xám ("Sẽ hỗ trợ sau").
 */
const CurriculumPicker = ({ value, onChange, curricula, loading }: CurriculumPickerProps) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const selected = curricula.find(item => item.id === value) ?? null;

    /** Chương trình trong database theo khoá `TIỀN_TỐ/HẬU_TỐ`. */
    const byProgram = useMemo(() => {
        const map = new Map<string, (Curriculum & { cohortYear: number })[]>();
        for (const item of curricula) {
            const parsed = parseCode(item.code);
            if (!parsed) continue;
            map.set(parsed.key, [...(map.get(parsed.key) ?? []), { ...item, cohortYear: parsed.cohort }]);
        }
        map.forEach(list => list.sort((a, b) => a.code.localeCompare(b.code)));
        return map;
    }, [curricula]);

    const matchesOf = (row: SchoolProgramRow, label: string): Curriculum[] => {
        if (!row.program) return [];
        const cohorts = cohortsOfLabel(label);
        return (byProgram.get(row.program) ?? []).filter(item => cohorts.includes(item.cohortYear));
    };

    /** Chương trình có trong database nhưng bảng của trường không trỏ tới (vd khóa bảng không liệt kê). */
    const others = useMemo(() => {
        const reachable = new Set<string>();
        for (const row of SCHOOL_PROGRAMS) {
            if (!row.program) continue;
            const cohorts = [...row.latest, ...row.previous].flatMap(cohortsOfLabel);
            (byProgram.get(row.program) ?? []).forEach(item => { if (cohorts.includes(item.cohortYear)) reachable.add(item.id); });
        }
        return curricula.filter(item => !reachable.has(item.id)).sort((a, b) => a.code.localeCompare(b.code));
    }, [curricula, byProgram]);

    const rows = useMemo<PickerRow[]>(() => {
        const needle = normalize(search.trim());
        const filtered = SCHOOL_PROGRAMS
            .map((row, index) => ({ ...row, index }))
            .filter(row => !needle || normalize(`${row.faculty} ${row.major}`).includes(needle));
        return filtered.map((row, position) => {
            const firstOfFaculty = position === 0 || filtered[position - 1].faculty !== row.faculty;
            let span = 0;
            if (firstOfFaculty) {
                span = 1;
                while (filtered[position + span]?.faculty === row.faculty) span += 1;
            }
            return { ...row, facultySpan: span };
        });
    }, [search]);

    const pick = (curriculum: Curriculum) => {
        onChange?.(curriculum.id);
        setOpen(false);
    };

    const chips = (row: SchoolProgramRow, labels: string[]) => (labels.length ? (
        <div className="program-chip-list">
            {labels.map(label => (
                <ProgramChip key={label} label={label} matches={matchesOf(row, label)} selectedId={value} onPick={pick} />
            ))}
        </div>
    ) : <Text type="secondary">—</Text>);

    const columns: ColumnsType<PickerRow> = [
        {
            title: 'Khoa',
            dataIndex: 'faculty',
            width: '20%',
            onCell: row => ({ rowSpan: row.facultySpan }),
            render: (faculty: string) => <Text strong>{faculty}</Text>,
        },
        { title: 'Ngành', dataIndex: 'major', width: '32%' },
        {
            title: 'CTĐT/Kế hoạch giảng dạy mới nhất',
            key: 'latest',
            width: '18%',
            render: (_value, row) => chips(row, row.latest),
        },
        {
            title: 'Chương trình đào tạo các khóa',
            key: 'previous',
            render: (_value, row) => chips(row, row.previous),
        },
    ];

    return (
        <>
            <div className="curriculum-picker-field">
                <div style={{ minWidth: 0, flex: 1 }}>
                    {selected ? (
                        <>
                            <Text strong style={{ display: 'block' }} ellipsis>{selected.name}</Text>
                            <Text type="secondary" style={{ fontSize: 12 }}>{`${selected.code} · Khóa ${selected.cohort} · ${selected.major}`}</Text>
                        </>
                    ) : (
                        <Text type="secondary">{value ? 'Chương trình không còn trong hệ thống' : 'Chưa chọn chương trình đào tạo'}</Text>
                    )}
                </div>
                <IOutLinedBtn loading={loading} onClick={() => setOpen(true)}>
                    {selected ? 'Đổi' : 'Chọn chương trình đào tạo'}
                </IOutLinedBtn>
                {value && <ITextBtn onClick={() => onChange?.(null)}>Bỏ chọn</ITextBtn>}
            </div>

            <Modal
                open={open}
                onCancel={() => setOpen(false)}
                footer={null}
                width={1120}
                title="Chọn chương trình đào tạo"
                destroyOnHidden
            >
                <div className="stack" style={{ gap: 12 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
                        <Input
                            allowClear
                            autoFocus
                            prefix={<LuSearch />}
                            placeholder="Tìm theo khoa hoặc ngành (gõ không dấu được)"
                            aria-label="Tìm khoa hoặc ngành"
                            value={search}
                            onChange={event => setSearch(event.target.value)}
                            style={{ maxWidth: 360 }}
                        />
                        <span className="program-chip-legend">
                            <span className="program-chip" data-state="available">Khóa</span> đã có dữ liệu, bấm để chọn
                            <span className="program-chip" data-state="unavailable">Khóa</span> sẽ hỗ trợ sau
                        </span>
                    </div>

                    <Table<PickerRow>
                        rowKey="index"
                        size="small"
                        bordered
                        pagination={false}
                        columns={columns}
                        dataSource={rows}
                        className="table-wrap-text"
                        scroll={{ x: 820, y: '58vh' }}
                        locale={{ emptyText: <Empty description="Không có ngành nào khớp từ khoá." /> }}
                    />

                    {others.length > 0 && !search && (
                        <div>
                            <Text strong>Chương trình khác đã có dữ liệu</Text>
                            <div className="program-chip-list" style={{ marginTop: 8 }}>
                                {others.map(item => (
                                    <ProgramChip key={item.id} label={`${item.code}`} matches={[item]} selectedId={value} onPick={pick} />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </Modal>
        </>
    );
};

export default CurriculumPicker;
