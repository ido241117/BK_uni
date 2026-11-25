import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, Input, Modal, Segmented, Select, Space, Tabs, Tag, Typography } from 'antd';
import { LuPanelRightClose, LuPanelRightOpen, LuStar } from 'react-icons/lu';
import { Link } from 'react-router';
import { EmptyState, ISolidBtn, ITextBtn, PageHeader, StatusLine, TablePageSkeleton } from '@/components';
import { getCurriculum, listCourseGroups, listCourseRelations, listCurriculumCourses } from '@/apis/curriculum';
import { adjustMybk, getPlannerSettings, savePlannerSettings, solvePlan } from '@/apis/planner';
import { getMyProfile, listMyCourses } from '@/apis/student';
import { useApiMutation, useApiQuery } from '@/hooks';
import { STUDENT_COURSE_STATUS, type PlanFix, type PlanResult, type PlanWarningItem, type SolvePlanPayload } from '@/types';
import { countMainSemesters, currentSemester, semesterLabel, toSemesterCode, parseSemester } from '@/utils/semester';
import ComparePanel, { type CompareItem } from './ComparePanel';
import PlanResultView from './PlanResultView';
import PriorityList from './PriorityList';
import SemesterBoard, { type BlockChoice } from './SemesterBoard';
import { applyFix, buildPayload, EMPTY_SCENARIO, normalizeScenario, type Scenario } from './scenario';
import {
    addPlan, baselineKey, loadBaseline, MAX_PLANS, planOf, recommendedSemester, teachingPlan, trimResult,
    type Baseline, type SavedPlan,
} from './whatIf';
import i18n from '@/i18n';

const { Text } = Typography;

/**
 * Trang Gợi ý, giai đoạn 12 (đặc tả mục 12 của docs/02-ke-hoach.md, chức năng M1–M18).
 * - Mọi lựa chọn là kịch bản what-if; **chỉ bấm Giải mới gọi bộ giải** (W6, W10), kể cả lúc mở trang.
 * - Trạng thái trang (kịch bản, lộ trình đang xem, số chỗ đã sửa, lịch sử 10 bản) lưu trong tài khoản
 *   (`PUT /plans/settings`, `data.web.planner`), đăng xuất rồi vào lại vẫn còn (M17).
 * Giao diện giữ design system hiện tại; thiết kế mới áp sau (người duyệt 23/11).
 */

type Plan = SavedPlan<Scenario>;
interface SavedSettings {
    scenario?: unknown;
    view?: PlanResult | null;
    dirty?: number;
    plans?: Plan[];
    /** Cài đặt cũ (trước giai đoạn 12): một mốc. */
    baseline?: Baseline<unknown> | null;
}

/** Các kỳ sau kỳ hiện tại (cả kỳ hè), đủ cho khoảng 5 năm. */
const upcomingSemesters = (from: string, count = 15): string[] => {
    const out: string[] = [];
    let { year, term } = parseSemester(from)!;
    for (let i = 0; i < count; i += 1) {
        term += 1;
        if (term > 3) { term = 1; year += 1; }
        out.push(toSemesterCode(year, term));
    }
    return out;
};

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/** Lộ trình đang xem lưu kèm dữ liệu kiểm nhanh (course_facts) để mở lại trang vẫn chọn môn được. */
const viewOf = (r: PlanResult): PlanResult => ({ ...trimResult(r), course_facts: r.course_facts, credit_rules: r.credit_rules });

const RecommendationsPage = () => {
    const profileQuery = useApiQuery(['my-profile'], getMyProfile);
    const curriculumId = profileQuery.data?.curriculum_id ?? undefined;
    const enabled = { enabled: Boolean(curriculumId) };
    const curriculumQuery = useApiQuery(['curriculum', curriculumId], () => getCurriculum(curriculumId!), enabled);
    const coursesQuery = useApiQuery(['curriculum', curriculumId, 'courses'], () => listCurriculumCourses(curriculumId!), enabled);
    const groupsQuery = useApiQuery(['curriculum-groups', curriculumId], () => listCourseGroups(curriculumId!), enabled);
    const relationsQuery = useApiQuery(['curriculum-relations', curriculumId], () => listCourseRelations(curriculumId!), enabled);
    const myCoursesQuery = useApiQuery(['my-courses'], listMyCourses);
    const settingsQuery = useApiQuery(['planner-settings'], getPlannerSettings);

    const [scenario, setScenario] = useState<Scenario>(EMPTY_SCENARIO);
    const [result, setResult] = useState<PlanResult | null>(null);
    const [previousResult, setPreviousResult] = useState<PlanResult | null>(null);
    const [plans, setPlans] = useState<Plan[]>([]);
    const [dirty, setDirty] = useState(0);
    const [undoStack, setUndoStack] = useState<{ scenario: Scenario; dirty: number }[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [lastChange, setLastChange] = useState<string | null>(null);
    const [planName, setPlanName] = useState('');
    const [tab, setTab] = useState<'plan' | 'compare'>('plan');
    const [compare, setCompare] = useState<{ left: string; right: string }>({ left: 'current', right: 'teaching' });
    const [panelOpen, setPanelOpen] = useState(true);
    const queryClient = useQueryClient();
    const pendingSave = useRef<string | null>(null);

    /** Mọi chỉnh sửa kịch bản: nhớ để Hoàn tác, đếm "đã sửa N chỗ, chưa kiểm". Không gọi bộ giải. */
    const change = (next: Scenario, message: string) => {
        setUndoStack(stack => [...stack.slice(-29), { scenario, dirty }]);
        setScenario(next);
        setDirty(d => d + 1);
        setLastChange(message);
    };
    const update = (patch: Partial<Scenario>, message: string) => change({ ...scenario, ...patch }, message);
    const undo = () => {
        const last = undoStack[undoStack.length - 1];
        if (!last) return;
        setUndoStack(stack => stack.slice(0, -1));
        setScenario(last.scenario);
        setDirty(last.dirty);
        setLastChange(i18n.t('Hoàn tác'));
    };

    // Mở trang: đọc trạng thái đã lưu; KHÔNG giải (W10). Cài đặt cũ có "mốc" thì chuyển thành một bản gắn sao.
    if (!loaded && settingsQuery.isFetched && profileQuery.data?.user_id && curriculumId) {
        setLoaded(true);
        const saved = (settingsQuery.data?.settings ?? null) as SavedSettings | null;
        const legacy = saved ? saved.baseline ?? null : loadBaseline<unknown>(baselineKey(profileQuery.data.user_id, curriculumId));
        setScenario(normalizeScenario(saved?.scenario ?? legacy?.scenario));
        setResult(saved?.view ?? legacy?.result ?? null);
        setDirty(saved?.dirty ?? 0);
        const savedPlans = Array.isArray(saved?.plans) ? saved!.plans! : [];
        setPlans(savedPlans.length || !legacy ? savedPlans.map(p => ({ ...p, scenario: normalizeScenario(p.scenario) }))
            : [{ id: newId(), name: i18n.t('Mốc cũ'), savedAt: legacy.savedAt, starred: true, checked: true,
                scenario: normalizeScenario(legacy.scenario), result: trimResult(legacy.result) }]);
    }

    // Tự lưu trạng thái trang vào tài khoản (không giải).
    const stateJson = JSON.stringify({ scenario, view: result ? viewOf(result) : null, dirty, plans });
    useEffect(() => {
        if (!loaded) return undefined;
        // Keep the cached copy current: reopening the page in this session starts from it, not from the copy
        // fetched when the page first opened (that was why saved plans "disappeared" after changing pages).
        queryClient.setQueryData(['planner-settings'], { settings: JSON.parse(stateJson) as Record<string, unknown> });
        pendingSave.current = stateJson;
        const timer = setTimeout(() => {
            pendingSave.current = null;
            savePlannerSettings(JSON.parse(stateJson) as Record<string, unknown>)
                .then(() => setSaveError(null))
                .catch((e: Error) => setSaveError(e.message || i18n.t('Không lưu được trạng thái trang vào tài khoản.')));
        }, 600);
        return () => clearTimeout(timer);
    }, [loaded, stateJson, queryClient]);
    // Leaving the page before the 600 ms debounce fires: save now instead of dropping the last change.
    useEffect(() => {
        const pending = pendingSave;
        return () => {
            if (pending.current) void savePlannerSettings(JSON.parse(pending.current) as Record<string, unknown>).catch(() => undefined);
        };
    }, []);

    const current = currentSemester();
    const allSemesters = useMemo(() => upcomingSemesters(current), [current]);
    const mainSemesterOptions = allSemesters.filter(code => !code.endsWith('3')).map(code => ({ value: code, label: semesterLabel(code) }));

    const inCurriculum = useMemo(() => new Set((coursesQuery.data ?? []).map(i => i.course.code)), [coursesQuery.data]);
    const nameByCode = useMemo(() => new Map([
        ...(myCoursesQuery.data ?? []).map(i => [i.course.code, i.course.name] as const),
        ...(coursesQuery.data ?? []).map(i => [i.course.code, i.course.name] as const),
    ]), [coursesQuery.data, myCoursesQuery.data]);
    const courseName = (code: string) => nameByCode.get(code) ?? code;
    const statusByCode = useMemo(() => new Map((myCoursesQuery.data ?? []).map(i => [i.course.code, i.status])), [myCoursesQuery.data]);
    const passed = useMemo(() => new Set((myCoursesQuery.data ?? [])
        .filter(i => i.status === STUDENT_COURSE_STATUS.COMPLETED || (i.status === STUDENT_COURSE_STATUS.IN_PROGRESS
            && scenario.results[i.course.code] !== 'fail'))
        .map(i => i.course.code)), [myCoursesQuery.data, scenario.results]);
    const inProgress = (myCoursesQuery.data ?? []).filter(item => item.status === STUDENT_COURSE_STATUS.IN_PROGRESS);
    const openCourseOptions = (coursesQuery.data ?? [])
        .filter(item => statusByCode.get(item.course.code) !== STUDENT_COURSE_STATUS.COMPLETED)
        .map(item => ({ value: item.course.code, label: `${item.course.code} · ${item.course.name}` }));

    // Ô khối (Q7): khối gốc → các khối con (chuyên ngành) → môn; môn đã đạt không hiện.
    const blockChoices = useMemo(() => {
        const out = new Map<string, BlockChoice[]>();
        const groups = groupsQuery.data ?? [];
        const opt = (g: (typeof groups)[number]) => g.members.filter(m => !passed.has(m.course.code))
            .map(m => ({ value: m.course.code, label: `${m.course.code} · ${m.course.name}`, credits: m.course.credits }));
        for (const root of groups.filter(g => g.kind === 'elective' && g.pool_scope === 'listed' && !g.parent_group_id)) {
            const children = groups.filter(g => g.parent_group_id === root.id);
            const inChild = new Set(children.flatMap(c => c.members.map(m => m.course.code)));
            const list: BlockChoice[] = children.map(c => ({ group: c.name.replace(`${root.name} - `, ''), options: opt(c) }));
            const rest = opt(root).filter(o => !inChild.has(o.value));
            if (rest.length) list.push({ group: children.length ? i18n.t('Môn khác của khối') : root.name, options: rest });
            out.set(root.name, list.filter(g => g.options.length));
        }
        return out;
    }, [groupsQuery.data, passed]);
    const prerequisites = useMemo(() => {
        const m = new Map<string, string[]>();
        for (const r of relationsQuery.data ?? []) {
            if (r.type !== 'prerequisite' && r.type !== 'corequisite') continue;
            m.set(r.course_code, [...(m.get(r.course_code) ?? []), r.related_course_code]);
        }
        return m;
    }, [relationsQuery.data]);

    const starred = plans.find(p => p.starred) ?? null;
    const solve = useApiMutation({
        mutationFn: (payload: SolvePlanPayload) => solvePlan(payload),
        onSuccess: data => {
            if (result && result.semesters.length) setPreviousResult(result);
            setResult(data);
            setDirty(0);
        },
    });
    const runSolve = (s: Scenario = scenario) => {
        setLastChange(null);
        solve.mutate(buildPayload(s, starred ? planOf(starred.result) : null));
    };
    const onApplyFix = (fix: PlanFix) => {
        const next = applyFix(scenario, fix);
        change(next, fix.label);
        runSolve(next);
    };

    // Kế hoạch giảng dạy (M16) và dữ liệu cho chỉ số so sánh.
    const cohort = curriculumQuery.data?.cohort ?? 0;
    const recommended = useMemo(() => new Map((coursesQuery.data ?? [])
        .map(i => [i.course.code, recommendedSemester(cohort, i.recommended_year, i.recommended_term)] as const)
        .filter((e): e is readonly [string, string] => !!e[1])), [coursesQuery.data, cohort]);
    const required = useMemo(() => new Set((result?.semesters ?? []).flatMap(s => s.courses)
        .filter(c => c.reason === 'required').map(c => c.code)), [result]);
    const remaining = useMemo(() => {
        const facts = result?.course_facts;
        return (coursesQuery.data ?? []).filter(i => (facts ? i.course.code in facts : !passed.has(i.course.code)))
            .map(i => ({ code: i.course.code, credits: i.course.credits, semester: recommended.get(i.course.code) ?? null }));
    }, [coursesQuery.data, result, passed, recommended]);

    if (profileQuery.isLoading && !profileQuery.data) return <TablePageSkeleton />;

    if (!curriculumId) {
        return (
            <section>
                <PageHeader title={i18n.t('Gợi ý học phần')} subtitle={i18n.t('Bộ giải xếp các môn còn lại vào từng kỳ theo quy định và lựa chọn của bạn.')} />
                <Card>
                    <EmptyState title={i18n.t('Chưa chọn chương trình đào tạo')}
                        description={i18n.t('Nhập tiến độ từ myBK ở trang Môn học để web nhận chương trình của bạn.')}
                        action={<Link to="/courses"><ISolidBtn>{i18n.t('Tới trang Môn học')}</ISolidBtn></Link>} />
                </Card>
            </section>
        );
    }

    // Cảnh báo gắn được vào môn / kỳ thì hiện trên bảng; thẻ "Cần lưu ý" chỉ còn phần chung.
    const warningItems = dirty ? [] : result?.warning_items ?? [];
    const onBoard = new Set((result?.warning_items ?? []).map(w => w.text));
    const shownResult = result && { ...result, warnings: (result.warnings ?? []).filter(w => !onBoard.has(w)) };
    const confirmCondition = (item: PlanWarningItem) => {
        if (item.confirm === 'offered' && item.course && item.semester) {
            update({ offered: [...scenario.offered.filter(o => !(o.course_code === item.course && o.semester_code === item.semester)),
                { course_code: item.course, semester_code: item.semester }] }, i18n.t('{{course}} có mở ở {{semester}}', { course: item.course, semester: item.semester }));
            return;
        }
        const condition = (myCoursesQuery.data ?? []).find(i => (item.confirm === 'english' ? i.course.code.startsWith('ENG_GC') : false));
        if (!condition) {
            Modal.info({ title: i18n.t('Bạn xác nhận ở trang Môn học → Hiệu chỉnh nhé'), okText: 'OK' });
            return;
        }
        Modal.confirm({
            title: i18n.t('Bạn đã đạt chuẩn tiếng Anh tốt nghiệp?'),
            content: i18n.t('Web ghi vào tài khoản của bạn. Sửa lại được ở trang Môn học → Hiệu chỉnh. Bấm Giải để cập nhật lộ trình.'),
            okText: i18n.t('Đúng, mình đạt rồi'), cancelText: i18n.t('Hủy'),
            onOk: async () => {
                await adjustMybk({ items: [{ course_id: condition.course_id, status: STUDENT_COURSE_STATUS.COMPLETED }] });
                await myCoursesQuery.refetch();
                setDirty(d => d + 1);
                setLastChange(i18n.t('Bạn xác nhận đạt chuẩn tiếng Anh'));
            },
        });
    };
    // Bảng hiện tới kỳ tốt nghiệp + 3 kỳ (ít nhất 6), đủ chỗ chuyển môn ra sau.
    const lastIndex = Math.max(
        allSemesters.indexOf(result?.graduation_semester ?? ''),
        ...scenario.locked.map(l => allSemesters.indexOf(l.semester_code)),
        ...Object.keys(scenario.targets).map(code => allSemesters.indexOf(code)),
    );
    const shown = allSemesters.slice(0, Math.max(6, lastIndex + 4));
    // Timeline head: the cohort's first semester up to the current one; count = main semesters already finished.
    const cohortStart = cohort ? toSemesterCode(cohort, 1) : null;
    const pastRange = cohortStart && cohortStart <= current ? {
        from: cohortStart,
        current,
        count: countMainSemesters(cohortStart, current) - (current.endsWith('3') ? 0 : 1),
    } : null;

    const savePlan = () => {
        if (!result) return;
        const name = planName.trim() || i18n.t('Bản {{v0}}', { v0: plans.length + 1 });
        setPlans(list => addPlan(list, {
            id: newId(), name, savedAt: new Date().toISOString(), starred: false, checked: dirty === 0, scenario, result: trimResult(result),
        }));
        setPlanName('');
        setLastChange(i18n.t('Đã lưu "{{name}}"', { name: name }));
    };
    const openPlan = (p: Plan) => {
        setUndoStack(stack => [...stack.slice(-29), { scenario, dirty }]);
        setScenario(p.scenario);
        setResult(p.result);
        setPreviousResult(null);
        setDirty(p.checked ? 0 : 1);
        setTab('plan');
        setLastChange(i18n.t('Mở "{{name}}"', { name: p.name }));
    };

    const actionBar = (
        <div className="plan-actions">
            <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
                <Space wrap>
                    <ISolidBtn loading={solve.isPending} onClick={() => runSolve()}>{i18n.t('Giải')}</ISolidBtn>
                    <ITextBtn disabled={!undoStack.length} onClick={undo}>{i18n.t('Hoàn tác')}</ITextBtn>
                    <Text type="secondary" style={{ fontSize: 12 }}>{i18n.t('Chỉ bấm Giải mới gọi bộ giải.')}</Text>
                </Space>
                <Space.Compact>
                    <Input style={{ width: 220 }} placeholder={i18n.t('Tên bản, vd Không học hè')} value={planName} maxLength={60}
                        onChange={e => setPlanName(e.target.value)} onPressEnter={savePlan} aria-label={i18n.t('Tên bản lộ trình')} />
                    <Button disabled={!result} onClick={savePlan}>{i18n.t('Lưu bản này')}</Button>
                </Space.Compact>
            </Space>
            <Text type="secondary" style={{ fontSize: 12 }}>{i18n.t('Lưu cả lộ trình và mọi giả định what-if. Giữ tối đa')}{' '}{MAX_PLANS}{' '}{i18n.t('bản.')}</Text>
        </div>
    );

    const history = (
        <Card size="small" title={i18n.t('Lịch sử ({{length}}/{{MAX_PLANS}})', { length: plans.length, MAX_PLANS: MAX_PLANS })}>
            {plans.length === 0
                ? <Text type="secondary">{i18n.t('Chưa có bản nào. Giải xong rồi bấm "Lưu bản này".')}</Text>
                : (
                    <Space orientation="vertical" style={{ width: '100%' }} size={8}>
                        {[...plans].reverse().map(p => (
                            <div key={p.id} style={{ borderBottom: '1px solid var(--line-hairline)', paddingBottom: 6 }}>
                                <Space size={4} wrap>
                                    <Button size="small" type="text" aria-label={p.starred ? i18n.t('Bỏ mốc') : i18n.t('Đặt làm mốc')}
                                        icon={<LuStar fill={p.starred ? 'currentColor' : 'none'} />}
                                        onClick={() => setPlans(list => list.map(x => ({ ...x, starred: x.id === p.id ? !x.starred : false })))} />
                                    <Text strong>{p.name}</Text>
                                    {p.starred && <Tag color="magenta">{i18n.t('Mốc')}</Tag>}
                                    {!p.checked && <Tag>{i18n.t('chưa kiểm')}</Tag>}
                                </Space>
                                <div>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        {new Date(p.savedAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })} ·{' '}
                                        {p.result.status === 'UNSAT' ? i18n.t('không giải được')
                                            : p.result.graduation_semester ? i18n.t('ra trường {{v0}}', { v0: semesterLabel(p.result.graduation_semester) }) : ''}
                                    </Text>
                                </div>
                                <Space size={4} wrap>
                                    <Button size="small" type="link" style={{ paddingInline: 0 }} onClick={() => openPlan(p)}>{i18n.t('Mở')}</Button>
                                    <Button size="small" type="link" onClick={() => { setCompare({ left: p.id, right: 'current' }); setTab('compare'); }}>
                                        {i18n.t('So với đang xem')}
                                    </Button>
                                    <Button size="small" type="link" danger onClick={() => setPlans(list => list.filter(x => x.id !== p.id))}>{i18n.t('Xóa')}</Button>
                                </Space>
                            </div>
                        ))}
                        <Text type="secondary" style={{ fontSize: 12 }}>{i18n.t('Gắn sao = mốc: mỗi lần Giải, bộ giải cố giữ gần mốc.')}</Text>
                    </Space>
                )}
        </Card>
    );

    const scenarioPanel = (
        <aside className="scenario-aside stack" aria-label={i18n.t('Kịch bản')}>
            <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                <Text strong style={{ fontSize: 18 }}>{i18n.t('Kịch bản')}</Text>
                <Button size="small" type="text" icon={<LuPanelRightClose />} aria-label={i18n.t('Thu gọn Kịch bản')} onClick={() => setPanelOpen(false)} />
            </Space>
            <Card size="small" title={i18n.t('Môn đang học: nếu đậu hoặc rớt')}>
                {inProgress.length === 0
                    ? <Text type="secondary">{i18n.t('Bạn chưa thêm môn đang học (Hiệu chỉnh, trang')}{' '}<Link to="/courses">{i18n.t('Môn học')}</Link>).</Text>
                    : (
                        <Space orientation="vertical" style={{ width: '100%' }}>
                            {inProgress.map(item => (
                                <Space key={item.course.code} style={{ justifyContent: 'space-between', width: '100%' }}>
                                    <Space size={4} wrap>
                                        <Text>{item.course.code} · {item.course.name}</Text>
                                        {!inCurriculum.has(item.course.code) && <Tag>{i18n.t('Ngoài CTĐT')}</Tag>}
                                    </Space>
                                    <Segmented size="small" value={scenario.results[item.course.code] ?? 'pass'}
                                        options={[{ value: 'pass', label: i18n.t('Đậu') }, { value: 'fail', label: i18n.t('Rớt') }]}
                                        onChange={value => update({ results: { ...scenario.results, [item.course.code]: value as 'pass' | 'fail' } },
                                            `${item.course.code}: ${value === 'pass' ? i18n.t('đậu') : i18n.t('rớt')}`)} />
                                </Space>
                            ))}
                        </Space>
                    )}
            </Card>
            <Card size="small" title={i18n.t('Ưu tiên')}>
                <PriorityList items={scenario.priorities} onChange={(priorities, m) => update({ priorities }, m)} />
            </Card>
            {history}
            <Card size="small" title={i18n.t('Yêu cầu khác')}>
                <Space orientation="vertical" size={12} style={{ width: '100%' }}>
                    <Space wrap>
                        <Text>{i18n.t('Học xong trước')}</Text>
                        <Select allowClear style={{ width: 200 }} placeholder={i18n.t('Không giới hạn')} value={scenario.graduateBy}
                            options={mainSemesterOptions} onChange={v => update({ graduateBy: v }, i18n.t('Đổi hạn tốt nghiệp'))} />
                    </Space>
                    <Select mode="multiple" style={{ width: '100%' }} placeholder={i18n.t('Môn bạn thích (bộ giải cố gắng xếp)')}
                        value={scenario.wanted} options={openCourseOptions} optionFilterProp="label"
                        onChange={wanted => update({ wanted }, i18n.t('Đổi môn muốn học'))} />
                </Space>
            </Card>
        </aside>
    );

    const board = result && result.status !== 'UNSAT' && result.status !== 'INPUT_ERROR' ? (
        <SemesterBoard
            result={result}
            semesters={shown}
            scenario={scenario}
            onChange={change}
            courseName={courseName}
            blockChoices={blockChoices}
            passed={passed}
            prerequisites={prerequisites}
            warnings={warningItems}
            onConfirm={confirmCondition}
            totalCredits={curriculumQuery.data?.total_credits}
            past={pastRange}
        />
    ) : undefined;

    const planTab = (
        <div className="stack">
            {saveError && <StatusLine tone="err">{i18n.t('Chưa lưu được trạng thái trang: {{saveError}}', { saveError: saveError })}</StatusLine>}
            {result
                ? (
                    <div className="plan-result" data-busy={solve.isPending}>
                        <PlanResultView
                            result={shownResult ?? result}
                            courseName={courseName}
                            previous={previousResult}
                            stale={dirty > 0}
                            dirty={dirty}
                            lastChange={lastChange}
                            solving={solve.isPending}
                            onApplyFix={onApplyFix}
                            recommendationsFirst={false}
                            board={board && <div className="stack">{board}{actionBar}</div>}
                        />
                    </div>
                )
                : (
                    <Card>
                        <EmptyState title={i18n.t('Chưa có lộ trình')}
                            description={i18n.t('Chỉnh kịch bản nếu muốn, rồi bấm Giải để bộ giải xếp các môn còn lại vào từng kỳ.')} />
                    </Card>
                )}
            {!board && actionBar}
        </div>
    );

    const compareItems: CompareItem[] = [
        ...(result ? [{ key: 'current', name: i18n.t('Đang xem'), result, scenario }] : []),
        { key: 'teaching', name: i18n.t('Kế hoạch giảng dạy'), result: teachingPlan(remaining, current), scenario: null, teaching: true },
        ...plans.map(p => ({ key: p.id, name: p.name, result: p.result, scenario: p.scenario })),
    ];

    return (
        <section>
            <PageHeader
                title={i18n.t('Gợi ý học phần')}
                subtitle={curriculumQuery.data
                    ? i18n.t('Chương trình {{code}} · {{name}} · đang ở {{v2}}', { code: curriculumQuery.data.code, name: curriculumQuery.data.name, v2: semesterLabel(current) })
                    : i18n.t('Bộ giải xếp các môn còn lại vào từng kỳ theo quy định và lựa chọn của bạn.')}
            />
            <Tabs
                activeKey={tab}
                onChange={k => setTab(k as 'plan' | 'compare')}
                items={[
                    { key: 'plan', label: i18n.t('Lộ trình') },
                    { key: 'compare', label: i18n.t('So sánh ({{length}})', { length: plans.length }) },
                ]}
            />
            {tab === 'plan'
                ? (
                    <div style={{ display: 'grid', gap: 24, alignItems: 'start',
                        gridTemplateColumns: panelOpen ? 'minmax(0, 1fr) 340px' : 'minmax(0, 1fr) 44px' }}>
                        <div>{planTab}</div>
                        {panelOpen
                            ? scenarioPanel
                            : (
                                <button type="button" className="scenario-rail" aria-label={i18n.t('Mở Kịch bản')} onClick={() => setPanelOpen(true)}>
                                    <LuPanelRightOpen />
                                    <span>{i18n.t('Kịch bản')}</span>
                                </button>
                            )}
                    </div>
                )
                : (
                    <ComparePanel
                        items={compareItems}
                        left={compare.left}
                        right={compare.right}
                        onPick={(side, key) => setCompare(c => ({ ...c, [side]: key }))}
                        courseName={courseName}
                        recommended={recommended}
                        required={required}
                        coverage={{ withSemester: remaining.filter(r => r.semester).length, total: remaining.length }}
                    />
                )}
        </section>
    );
};

export default RecommendationsPage;
