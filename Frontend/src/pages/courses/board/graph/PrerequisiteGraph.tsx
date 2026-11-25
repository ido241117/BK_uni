import { memo, useMemo, useState } from 'react';
import {
    Background,
    Controls,
    Handle,
    MarkerType,
    MiniMap,
    Position,
    ReactFlow,
    type Edge,
    type Node,
    type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Alert, Card, Checkbox, Empty, Skeleton, Switch, Tag, Typography } from 'antd';
import { LuArrowUpRight, LuX } from 'react-icons/lu';
import { Link } from 'react-router';
import { IconBtn } from '@/components';
import { listCourseRelations } from '@/apis/curriculum';
import { useAppTheme } from '@/contexts';
import { useApiQuery, useMediaQuery } from '@/hooks';
import {
    COURSE_RELATION_TYPE,
    COURSE_RELATION_TYPE_LABEL,
    STUDENT_COURSE_STATUS_LABEL,
    type CourseGroup,
    type CourseRelationType,
    type CurriculumCourse,
    type StudentCourseStatus,
} from '@/types';
import { canPlan } from '../structure';
import { buildPrerequisiteGraph, chainOf, type GraphEdge, type GraphNode } from './layout';
import i18n from '@/i18n';

const { Paragraph, Text } = Typography;

const NODE_W = 196;
const NODE_H = 66;
const COL_GAP = 84;
const ROW_GAP = 14;
const HEADER_Y = -48;

const SHORT_LABEL: Record<CourseRelationType, string> = {
    prerequisite: 'TQ',
    prior: 'HT',
    corequisite: 'SHT',
    recommended: 'KN',
};

/**
 * Edge colors (SVG markers cannot read CSS variables): theme ink / rose / sage / soft ink, with terracotta for unmet
 * and amber for backward edges. Relation types are also named in the filter legend, so color is never the only cue.
 */
const EDGE_COLORS = {
    light: { prerequisite: '#3B2230', prior: '#B83E6C', corequisite: '#5E7F5D', recommended: '#BE9EAA', unmet: '#AE4B33', backward: '#A0702A' },
    dark: { prerequisite: '#F4E6EC', prior: '#EC8DB2', corequisite: '#9CC79A', recommended: '#8F7482', unmet: '#F08D77', backward: '#E2B56E' },
};

const EDGE_STYLE: Record<CourseRelationType, { width: number; dash?: string }> = {
    prerequisite: { width: 2.2 },
    prior: { width: 1.5 },
    corequisite: { width: 1.5, dash: '6 4' },
    recommended: { width: 1.2, dash: '2 4' },
};

const ALL_TYPES = Object.values(COURSE_RELATION_TYPE);

type Focus = 'self' | 'before' | 'after' | 'dim' | null;

interface CourseNodeData extends Record<string, unknown> {
    node: GraphNode;
    focus: Focus;
}

interface HeaderNodeData extends Record<string, unknown> {
    label: string;
}

const statusLabel = (node: Pick<GraphNode, 'status' | 'plannedSemester'>) => {
    if (canPlan(node.status) && node.plannedSemester) return i18n.t('Kế hoạch HK {{plannedSemester}}', { plannedSemester: node.plannedSemester });
    return node.status ? STUDENT_COURSE_STATUS_LABEL[node.status] : i18n.t('Chưa khai');
};

const dataStatus = (status: StudentCourseStatus | null, planned: string | null) => (
    canPlan(status) && planned ? 'planned' : status ?? 'none'
);

const CourseNode = memo(({ data }: NodeProps<Node<CourseNodeData>>) => {
    const { node, focus } = data;
    return (
        <div
            className="graph-node"
            data-status={dataStatus(node.status, node.plannedSemester)}
            data-focus={focus ?? undefined}
            data-unmet={node.unmetCount > 0 || undefined}
            style={{ width: NODE_W, height: NODE_H }}
            title={`${node.course.code} · ${node.course.name}`}
        >
            <Handle type="target" position={Position.Left} className="graph-handle" isConnectable={false} />
            <div className="graph-node-top">
                <span className="graph-node-code">{node.course.code}</span>
                <span className="graph-node-credits">{node.course.credits}{' '}{i18n.t('TC')}</span>
            </div>
            <div className="graph-node-name">{node.course.name}</div>
            <div className="graph-node-status">
                {node.unmetCount > 0 ? i18n.t('⚠ Thiếu {{unmetCount}} điều kiện', { unmetCount: node.unmetCount }) : statusLabel(node)}
            </div>
            <Handle type="source" position={Position.Right} className="graph-handle" isConnectable={false} />
        </div>
    );
});

const HeaderNode = ({ data }: NodeProps<Node<HeaderNodeData>>) => (
    <div className="graph-column-header" style={{ width: NODE_W }}>{data.label}</div>
);

const nodeTypes = { course: CourseNode, header: HeaderNode };

interface PrerequisiteGraphProps {
    curriculumId: string;
    courses: CurriculumCourse[];
    groups: CourseGroup[];
    statusMap: Map<string, StudentCourseStatus>;
    planMap: Map<string, string>;
}

/** Một dòng điều kiện trong panel chi tiết / danh sách mobile. */
const ConditionRow = ({ edge, other, satisfiedText }: { edge: GraphEdge; other: GraphNode | undefined; satisfiedText?: string }) => (
    <div className="graph-condition" data-unmet={edge.unmet || undefined}>
        <Tag style={{ marginInlineEnd: 0 }} color={edge.type === COURSE_RELATION_TYPE.PREREQUISITE ? 'red' : edge.type === COURSE_RELATION_TYPE.RECOMMENDED ? undefined : 'blue'}>
            {SHORT_LABEL[edge.type]}
        </Tag>
        <span style={{ minWidth: 0 }}>
            <Text strong>{other?.course.code}</Text> {other?.course.name}
            <div className="hint">
                {other ? statusLabel(other) : ''}
                {edge.unmet && <Text type="danger">{' '}{i18n.t('· chưa thỏa')}</Text>}
                {!edge.unmet && satisfiedText && ` · ${satisfiedText}`}
                {edge.backward && <Text type="warning">{' '}{i18n.t('· kỳ gợi ý không khớp thứ tự')}</Text>}
            </div>
        </span>
    </div>
);

/**
 * Đồ thị điều kiện môn học (tiên quyết, học trước, song hành, khuyến nghị) theo cột học kỳ của chương trình.
 * Màu môn lấy từ bản nháp trạng thái; bấm một môn để làm nổi bật chuỗi môn phải học trước và môn được mở khóa.
 */
const PrerequisiteGraph = ({ curriculumId, courses, groups, statusMap, planMap }: PrerequisiteGraphProps) => {
    const { isDark } = useAppTheme();
    const narrow = useMediaQuery('(max-width: 767px)');
    const relationsQuery = useApiQuery(['curriculum-relations', curriculumId], () => listCourseRelations(curriculumId));

    const [types, setTypes] = useState<CourseRelationType[]>([
        COURSE_RELATION_TYPE.PREREQUISITE, COURSE_RELATION_TYPE.PRIOR, COURSE_RELATION_TYPE.COREQUISITE, COURSE_RELATION_TYPE.RECOMMENDED,
    ]);
    const [showIsolated, setShowIsolated] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const graph = useMemo(() => buildPrerequisiteGraph({
        courses,
        groups,
        relations: relationsQuery.data ?? [],
        statusMap,
        planMap,
        types: new Set(types),
        showIsolated,
    }), [courses, groups, relationsQuery.data, statusMap, planMap, types, showIsolated]);

    const nodeById = useMemo(() => new Map(graph.nodes.map(node => [node.course.id, node])), [graph.nodes]);
    const selected = selectedId ? nodeById.get(selectedId) ?? null : null;
    const chain = useMemo(() => (selected ? chainOf(selected.course.id, graph.edges) : null), [selected, graph.edges]);

    const colors = isDark ? EDGE_COLORS.dark : EDGE_COLORS.light;

    const flowNodes = useMemo<Node[]>(() => {
        const focusOf = (id: string): Focus => {
            if (!chain || !selected) return null;
            if (id === selected.course.id) return 'self';
            if (chain.before.has(id)) return 'before';
            if (chain.after.has(id)) return 'after';
            return 'dim';
        };
        return [
            ...graph.columns.map((column, index): Node<HeaderNodeData> => ({
                id: `header-${column.key}`,
                type: 'header',
                position: { x: index * (NODE_W + COL_GAP), y: HEADER_Y },
                data: { label: column.label },
                draggable: false,
                selectable: false,
                focusable: false,
            })),
            ...graph.nodes.map((node): Node<CourseNodeData> => ({
                id: node.course.id,
                type: 'course',
                position: { x: node.column * (NODE_W + COL_GAP), y: node.row * (NODE_H + ROW_GAP) },
                data: { node, focus: focusOf(node.course.id) },
                draggable: false,
            })),
        ];
    }, [graph, chain, selected]);

    const flowEdges = useMemo<Edge[]>(() => graph.edges.map(edge => {
        const inChain = !selected || (
            (edge.to === selected.course.id || chain!.before.has(edge.to)) && (edge.from === selected.course.id || chain!.before.has(edge.from))
        ) || (
            (edge.from === selected.course.id || chain!.after.has(edge.from)) && (edge.to === selected.course.id || chain!.after.has(edge.to))
        );
        const color = edge.unmet ? colors.unmet : edge.backward ? colors.backward : colors[edge.type];
        const style = EDGE_STYLE[edge.type];
        return {
            id: edge.id,
            source: edge.from,
            target: edge.to,
            animated: edge.unmet,
            label: edge.backward ? '!' : undefined,
            markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
            style: {
                stroke: color,
                strokeWidth: edge.unmet ? 2.6 : style.width,
                strokeDasharray: style.dash,
                opacity: inChain ? 1 : 0.12,
            },
            zIndex: inChain && selected ? 10 : 0,
        };
    }), [graph.edges, selected, chain, colors]);

    const unmetNodes = graph.nodes.filter(node => node.unmetCount > 0);
    const incomingOf = (id: string) => graph.edges.filter(edge => edge.to === id);
    const outgoingOf = (id: string) => graph.edges.filter(edge => edge.from === id);

    const toolbar = (
        <div className="graph-toolbar">
            <Checkbox.Group<CourseRelationType>
                value={types}
                onChange={setTypes}
                options={ALL_TYPES.map(type => ({
                    value: type,
                    label: (
                        <span className="graph-legend-item">
                            <svg width="28" height="8" aria-hidden>
                                <line
                                    x1="0" y1="4" x2="28" y2="4"
                                    stroke={colors[type]}
                                    strokeWidth={EDGE_STYLE[type].width + 0.4}
                                    strokeDasharray={EDGE_STYLE[type].dash}
                                />
                            </svg>
                            {COURSE_RELATION_TYPE_LABEL[type]} ({SHORT_LABEL[type]})
                        </span>
                    ),
                }))}
            />
            <label className="graph-legend-item">
                <Switch size="small" checked={showIsolated} onChange={setShowIsolated} />
                {i18n.t('Hiện môn không có điều kiện')}
            </label>
            <span className="hint">{graph.relatedCount}/{graph.totalCount}{' '}{i18n.t('môn có điều kiện')}</span>
        </div>
    );

    if (relationsQuery.isLoading) return <Card><Skeleton active paragraph={{ rows: 8 }} /></Card>;
    if (relationsQuery.isError) {
        return <Alert type="error" showIcon title={i18n.t('Không tải được điều kiện môn học')} description={i18n.t('Vui lòng tải lại trang để thử lại.')} />;
    }
    if (!graph.relatedCount) {
        return <Card><Empty description={i18n.t('Chương trình chưa có dữ liệu điều kiện môn học.')} /></Card>;
    }

    const unmetAlert = unmetNodes.length > 0 && (
        <Alert
            type="warning"
            showIcon
            title={i18n.t('{{length}} môn đang học / đã lên kế hoạch chưa đủ điều kiện', { length: unmetNodes.length })}
            description={(
                <div className="program-chip-list" style={{ marginTop: 4 }}>
                    {unmetNodes.map(node => (
                        <Tag key={node.course.id} color="red" style={{ cursor: 'pointer', marginInlineEnd: 0 }} onClick={() => setSelectedId(node.course.id)}>
                            {node.course.code}
                        </Tag>
                    ))}
                </div>
            )}
        />
    );

    // Màn hình hẹp: đồ thị khó thao tác, hiện danh sách "môn → điều kiện".
    if (narrow) {
        const withConditions = graph.nodes.filter(node => incomingOf(node.course.id).length > 0);
        return (
            <div className="stack">
                {toolbar}
                {unmetAlert}
                {withConditions.map(node => (
                    <Card key={node.course.id} size="small" title={`${node.course.code} · ${node.course.name}`}>
                        <div className="stack" style={{ gap: 8 }}>
                            {incomingOf(node.course.id).map(edge => (
                                <ConditionRow key={edge.id} edge={edge} other={nodeById.get(edge.from)} />
                            ))}
                        </div>
                    </Card>
                ))}
            </div>
        );
    }

    return (
        <div className="stack">
            {toolbar}
            {unmetAlert}
            <div className="graph-layout" data-panel={selected ? 'open' : undefined}>
                <div className="graph-canvas">
                    <ReactFlow
                        nodes={flowNodes}
                        edges={flowEdges}
                        nodeTypes={nodeTypes}
                        colorMode={isDark ? 'dark' : 'light'}
                        fitView
                        fitViewOptions={{ padding: 0.08, maxZoom: 1 }}
                        minZoom={0.15}
                        maxZoom={1.6}
                        nodesDraggable={false}
                        nodesConnectable={false}
                        edgesFocusable={false}
                        onNodeClick={(_event, node) => {
                            if (node.type !== 'course') return;
                            setSelectedId(current => (current === node.id ? null : node.id));
                        }}
                        onPaneClick={() => setSelectedId(null)}
                    >
                        <Background gap={24} size={1} />
                        <Controls showInteractive={false} />
                        <MiniMap pannable zoomable nodeStrokeWidth={2} />
                    </ReactFlow>
                </div>

                {selected && (
                    <aside className="graph-panel" aria-label={i18n.t('Điều kiện của {{code}}', { code: selected.course.code })}>
                        <div className="graph-panel-head">
                            <div style={{ minWidth: 0 }}>
                                <Text strong>{selected.course.code}</Text>
                                <div>{selected.course.name}</div>
                                <div className="hint">{selected.course.credits}{' '}{i18n.t('TC ·')}{' '}{statusLabel(selected)}</div>
                            </div>
                            <IconBtn size="small" icon={<LuX />} label={i18n.t('Đóng')} onClick={() => setSelectedId(null)} />
                        </div>

                        <div>
                            <Text strong>{i18n.t('Cần có trước (')}{incomingOf(selected.course.id).length})</Text>
                            <div className="stack" style={{ gap: 8, marginTop: 8 }}>
                                {incomingOf(selected.course.id).length
                                    ? incomingOf(selected.course.id).map(edge => (
                                        <ConditionRow key={edge.id} edge={edge} other={nodeById.get(edge.from)} satisfiedText={selected.active ? i18n.t('đã thỏa') : undefined} />
                                    ))
                                    : <Text type="secondary">{i18n.t('Không có điều kiện.')}</Text>}
                            </div>
                        </div>

                        <div>
                            <Text strong>{i18n.t('Là điều kiện của (')}{outgoingOf(selected.course.id).length})</Text>
                            <div className="stack" style={{ gap: 8, marginTop: 8 }}>
                                {outgoingOf(selected.course.id).length
                                    ? outgoingOf(selected.course.id).map(edge => (
                                        <ConditionRow key={edge.id} edge={edge} other={nodeById.get(edge.to)} />
                                    ))
                                    : <Text type="secondary">{i18n.t('Không mở khóa môn nào.')}</Text>}
                            </div>
                        </div>

                        {chain && (
                            <Paragraph type="secondary" style={{ margin: 0, fontSize: 12 }}>
                                {i18n.t('Chuỗi:')}{' '}{chain.before.size}{' '}{i18n.t('môn phía trước ·')}{' '}{chain.after.size}{' '}{i18n.t('môn phía sau (đang làm nổi bật trên đồ thị).')}
                            </Paragraph>
                        )}

                        <Link to={`/courses/${encodeURIComponent(selected.course.code)}`} state={{ from: '/courses' }}>
                            <span className="graph-panel-link">{i18n.t('Xem chi tiết môn')}{' '}<LuArrowUpRight aria-hidden /></span>
                        </Link>
                    </aside>
                )}
            </div>
            <Paragraph type="secondary" style={{ margin: 0, fontSize: 12 }}>
                {i18n.t('Cột theo kỳ gợi ý của chương trình (môn tự chọn lấy kỳ của khối). Viền đỏ, cạnh đỏ chạy: môn đang học hoặc đã lên kế hoạch nhưng điều kiện chưa thỏa. Dấu “!” vàng: môn điều kiện lại nằm ở kỳ sau. Kéo để di chuyển, cuộn để phóng to.')}
            </Paragraph>
        </div>
    );
};

export default PrerequisiteGraph;
