import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Card, Col, InputNumber, Modal, Row, Segmented, Select, Space, Tag, Typography } from 'antd';
import { Link } from 'react-router';
import { EmptyState, ISolidBtn, PageHeader, TablePageSkeleton } from '@/components';
import { getCurriculum, listCourseGroups, listCourseRelations, listCurriculumCourses } from '@/apis/curriculum';
import { adjustMybk, getPlannerSettings, savePlannerSettings, solvePlan } from '@/apis/planner';
import { getMyProfile, listMyCourses } from '@/apis/student';
import { useApiMutation, useApiQuery } from '@/hooks';
import {
    STUDENT_COURSE_STATUS,
    type CourseAtSemester,
    type PlanWarningItem,
    type PlanResult,
    type SolvePlanPayload,
} from '@/types';
import { currentSemester, semesterLabel, toSemesterCode, parseSemester } from '@/pages/courses/analysis/semester';
import PlanResultView from './PlanResultView';
import PriorityList from './PriorityList';
import { DEFAULT_PRIORITIES, type PriorityItem } from './priorities';
import SemesterBoard, { type BlockChoice, type BoardSettings } from './SemesterBoard';
import { baselineKey, loadBaseline, planOf, type Baseline } from './whatIf';

const { Text } = Typography;

/**
 * Mọi lựa chọn của sinh viên trên trang Gợi ý (sprint 11, 22/11). Lưu vào tài khoản (`PUT /plans/settings`,
 * T43) cùng mốc what-if; mỗi lần đổi là giải lại. Bộ giải phải tuân theo mọi lựa chọn, không đáp ứng được thì
 * báo trong thẻ "Yêu cầu của bạn".
 */
interface Scenario {
    maxCredits: number | null;
    graduateBy?: string;
    results: Record<string, 'pass' | 'fail'>;
    summers: string[];
    locked: CourseAtSemester[];
    notOffered: CourseAtSemester[];
    wanted: string[];
    priorities: PriorityItem[];
    skipped: string[];
    frozen: string[];
    targets: Record<string, number>;
}

const EMPTY: Scenario = {
    maxCredits: null, results: {}, summers: [], locked: [], notOffered: [], wanted: [],
    priorities: DEFAULT_PRIORITIES, skipped: [], frozen: [], targets: {},
};

/** Cài đặt cũ (trước 22/11, kể cả mốc trong trình duyệt) thiếu trường mới: lấy mặc định, không làm hỏng trang. */
const normalizeScenario = (raw: unknown): Scenario => {
    const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<Scenario>;
    const known = new Set(DEFAULT_PRIORITIES.map(p => p.id));
    const priorities = Array.isArray(s.priorities) && s.priorities.every(p => known.has(p.id))
        ? s.priorities : DEFAULT_PRIORITIES;
    return {
        ...EMPTY, ...s, priorities,
        results: s.results ?? {}, summers: s.summers ?? [], locked: s.locked ?? [], notOffered: s.notOffered ?? [],
        wanted: s.wanted ?? [], skipped: s.skipped ?? [], frozen: s.frozen ?? [], targets: s.targets ?? {},
    };
};

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

    const [scenario, setScenario] = useState<Scenario>(EMPTY);
    const [result, setResult] = useState<PlanResult | null>(null);
    const [previousGraduation, setPreviousGraduation] = useState<string | null>(null);
    const [baseline, setBaseline] = useState<Baseline<Scenario> | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [lastChange, setLastChange] = useState<string | null>(null);
    const update = (patch: Partial<Scenario>, message?: string) => {
        setScenario(s => ({ ...s, ...patch }));
        if (message) setLastChange(message);
    };

    // Mở trang: đọc cài đặt đã lưu trong tài khoản; chưa có thì lấy mốc cũ trong trình duyệt (trước 22/11).
    if (!loaded && settingsQuery.isFetched && profileQuery.data?.user_id && curriculumId) {
        setLoaded(true);
        const saved = settingsQuery.data?.settings as { scenario?: unknown; baseline?: Baseline<unknown> | null } | null | undefined;
        const legacy = saved ? null : loadBaseline<unknown>(baselineKey(profileQuery.data.user_id, curriculumId));
        const base = saved?.baseline ?? legacy;
        if (saved?.scenario || base) setScenario(normalizeScenario(saved?.scenario ?? base?.scenario));
        if (base) {
            setBaseline({ ...base, scenario: normalizeScenario(base.scenario) });
            setResult(base.result);
        }
    }

    const current = currentSemester();
    const allSemesters = useMemo(() => upcomingSemesters(current), [current]);
    const semesterOptions = allSemesters.map(code => ({ value: code, label: semesterLabel(code) }));
    const mainSemesterOptions = semesterOptions.filter(o => !o.value.endsWith('3'));

    const inCurriculum = useMemo(() => new Set((coursesQuery.data ?? []).map(i => i.course.code)), [coursesQuery.data]);
    // Tên môn: của chương trình, rồi môn sinh viên đã thêm ngoài CTĐT (22/11: trước đây môn ngoài CTĐT chỉ hiện mã).
    const nameByCode = useMemo(() => new Map([
        ...(myCoursesQuery.data ?? []).map(i => [i.course.code, i.course.name] as const),
        ...(coursesQuery.data ?? []).map(i => [i.course.code, i.course.name] as const),
    ]), [coursesQuery.data, myCoursesQuery.data]);
    const statusByCode = useMemo(() => new Map((myCoursesQuery.data ?? []).map(i => [i.course.code, i.status])), [myCoursesQuery.data]);
    const passed = useMemo(() => new Set((myCoursesQuery.data ?? [])
        .filter(i => i.status === STUDENT_COURSE_STATUS.COMPLETED || (i.status === STUDENT_COURSE_STATUS.IN_PROGRESS
            && scenario.results[i.course.code] !== 'fail'))
        .map(i => i.course.code)), [myCoursesQuery.data, scenario.results]);
    const inProgress = (myCoursesQuery.data ?? [])
        .filter(item => item.status === STUDENT_COURSE_STATUS.IN_PROGRESS);
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
            if (rest.length) list.push({ group: children.length ? 'Môn khác của khối' : root.name, options: rest });
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

    const solve = useApiMutation({
        mutationFn: (payload: SolvePlanPayload) => solvePlan(payload),
        onSuccess: data => {
            setPreviousGraduation(result?.graduation_semester ?? null);
            setResult(data);
        },
    });

    const buildPayload = (s: Scenario): SolvePlanPayload => {
        const complete = (items: CourseAtSemester[]) => items.filter(i => i.course_code && i.semester_code);
        const order = s.priorities.filter(p => p.on).map(p => p.id);
        return {
            solver: 'cpsat', // Q13 (22/11): sinh viên chỉ dùng CP-SAT
            ...(s.maxCredits ? { max_credits: s.maxCredits } : {}),
            ...(s.graduateBy ? { graduate_by: s.graduateBy } : {}),
            in_progress_results: s.results,
            locked: complete(s.locked),
            not_offered: complete(s.notOffered),
            summer_opt_in: s.summers,
            skip_semesters: s.skipped,
            frozen_semesters: s.frozen,
            semester_targets: s.targets,
            preferences: { wanted_courses: s.wanted, order, balanced_load: order.includes('S5') },
            ...(baseline ? { previous_plan: planOf(baseline.result) } : {}),
        };
    };

    // Mỗi lần đổi lựa chọn: lưu vào tài khoản và giải lại (Q5: "mỗi lần chỉnh là tính lại").
    const scenarioJson = JSON.stringify(scenario);
    const firstSolve = useRef(false);
    useEffect(() => {
        if (!loaded) return undefined;
        const timer = setTimeout(() => {
            savePlannerSettings({ scenario, baseline })
                .then(() => setSaveError(null))
                .catch((e: Error) => setSaveError(e.message || 'Không lưu được cài đặt vào tài khoản.'));
            // 22/11: mở trang cũng giải lại, vì trạng thái môn / khối có thể vừa đổi ở Hiệu chỉnh (database).
            // `firstSolve` giữ lại để không đổi luồng lưu cài đặt.
            solve.mutate(buildPayload(scenario));
            firstSolve.current = true;
        }, 500);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loaded, scenarioJson, baseline]);

    if (profileQuery.isLoading && !profileQuery.data) return <TablePageSkeleton />;

    if (!curriculumId) {
        return (
            <section>
                <PageHeader title="Gợi ý học phần" subtitle="Bộ giải xếp các môn còn lại vào từng kỳ theo quy định và lựa chọn của bạn." />
                <Card>
                    <EmptyState title="Chưa chọn chương trình đào tạo"
                        description="Nhập tiến độ từ myBK ở trang Môn học để web nhận chương trình của bạn."
                        action={<Link to="/courses"><ISolidBtn>Tới trang Môn học</ISolidBtn></Link>} />
                </Card>
            </section>
        );
    }

    const board: BoardSettings = {
        locked: scenario.locked, skipped: scenario.skipped, frozen: scenario.frozen, summers: scenario.summers, targets: scenario.targets,
        notOffered: scenario.notOffered,
    };
    // 22/11: cảnh báo gắn được vào môn / kỳ thì hiện trên bảng; thẻ "Cần lưu ý" chỉ còn phần chung.
    const warningItems = result?.warning_items ?? [];
    const onBoard = new Set(warningItems.map(w => w.text));
    const shownResult = result && { ...result, warnings: (result.warnings ?? []).filter(w => !onBoard.has(w)) };
    // Sinh viên tự xác nhận đạt chuẩn tiếng Anh: ghi ENG_GC* = Đã hoàn thành vào database (Q12: một nguồn là Hiệu chỉnh).
    const confirmCondition = (item: PlanWarningItem) => {
        const condition = (myCoursesQuery.data ?? []).find(i => (item.confirm === 'english' ? i.course.code.startsWith('ENG_GC') : false));
        if (!condition) {
            Modal.info({ title: 'Bạn xác nhận ở trang Môn học → Hiệu chỉnh nhé', okText: 'OK' });
            return;
        }
        Modal.confirm({
            title: 'Bạn đã đạt chuẩn tiếng Anh tốt nghiệp?',
            content: 'Web ghi vào tài khoản của bạn. Sửa lại được ở trang Môn học → Hiệu chỉnh.',
            okText: 'Đúng, mình đạt rồi', cancelText: 'Hủy',
            onOk: async () => {
                await adjustMybk({ items: [{ course_id: condition.course_id, status: STUDENT_COURSE_STATUS.COMPLETED }] });
                await myCoursesQuery.refetch();
                setLastChange('Bạn xác nhận đạt chuẩn tiếng Anh');
                solve.mutate(buildPayload(scenario));
            },
        });
    };
    // Bảng hiện tới kỳ tốt nghiệp + 3 kỳ (ít nhất 6), đủ chỗ kéo môn ra sau.
    const lastIndex = Math.max(
        allSemesters.indexOf(result?.graduation_semester ?? ''),
        ...scenario.locked.map(l => allSemesters.indexOf(l.semester_code)),
        ...Object.keys(scenario.targets).map(code => allSemesters.indexOf(code)),
    );
    const shown = allSemesters.slice(0, Math.max(6, lastIndex + 4));
    const s6First = scenario.priorities.findIndex(p => p.id === 'S6') < scenario.priorities.findIndex(p => p.id === 'S1');
    const changeBaseline = (next: Baseline<Scenario> | null) => setBaseline(next);

    return (
        <section>
            <PageHeader
                title="Gợi ý học phần"
                subtitle={curriculumQuery.data
                    ? `Chương trình ${curriculumQuery.data.code} · ${curriculumQuery.data.name} · đang ở ${semesterLabel(current)}`
                    : 'Bộ giải xếp các môn còn lại vào từng kỳ theo quy định và lựa chọn của bạn.'}
            />

            <Row gutter={[16, 16]}>
                <Col xs={24} xl={7}>
                    <div className="stack">
                        <Card size="small">
                            <Text type="secondary">
                                Trạng thái môn lấy từ tiến độ myBK và phần Hiệu chỉnh ở trang <Link to="/courses">Môn học</Link>.
                                Môn đang học thêm ở Hiệu chỉnh; mặc định giả định đậu. Mỗi lần bạn chỉnh, lộ trình được xếp lại
                                và lưu vào tài khoản.
                            </Text>
                            <ISolidBtn block style={{ marginTop: 8 }} loading={solve.isPending}
                                onClick={() => { setLastChange('Bạn bấm giải lại'); solve.mutate(buildPayload(scenario)); }}>
                                Giải lại lộ trình
                            </ISolidBtn>
                            {saveError && <Alert style={{ marginTop: 8 }} type="warning" showIcon title={`Chưa lưu được cài đặt: ${saveError}`} />}
                        </Card>

                        <Card size="small" title="Nếu đậu hoặc rớt môn đang học">
                            {inProgress.length === 0
                                ? <Text type="secondary">Bạn chưa thêm môn đang học (Hiệu chỉnh, trang Môn học).</Text>
                                : (
                                    <Space orientation="vertical" style={{ width: '100%' }}>
                                        {inProgress.map(item => (
                                            <Space key={item.course.code} style={{ justifyContent: 'space-between', width: '100%' }}>
                                                <Space size={4} wrap>
                                                    <Text>{item.course.code} · {item.course.name}</Text>
                                                    {!inCurriculum.has(item.course.code) && <Tag>Ngoài CTĐT</Tag>}
                                                </Space>
                                                <Segmented size="small" value={scenario.results[item.course.code] ?? 'pass'}
                                                    options={[{ value: 'pass', label: 'Đậu' }, { value: 'fail', label: 'Rớt' }]}
                                                    onChange={value => update({ results: { ...scenario.results, [item.course.code]: value as 'pass' | 'fail' } },
                                                        `${item.course.code}: ${value === 'pass' ? 'đậu' : 'rớt'}`)} />
                                            </Space>
                                        ))}
                                    </Space>
                                )}
                        </Card>

                        <Card size="small" title="Điều bạn ưu tiên">
                            <PriorityList items={scenario.priorities} onChange={(priorities, m) => update({ priorities }, m)} />
                        </Card>

                        <Card size="small" title="Yêu cầu khác">
                            <Space orientation="vertical" size={16} style={{ width: '100%' }}>
                                <Space wrap>
                                    <Text>Tối đa mỗi kỳ</Text>
                                    <InputNumber min={11} max={25} placeholder="25" value={scenario.maxCredits}
                                        onChange={v => update({ maxCredits: v }, 'Đổi mức tối đa mỗi kỳ')} addonAfter="TC" />
                                </Space>
                                <Space wrap>
                                    <Text>Học xong trước</Text>
                                    <Select allowClear style={{ width: 220 }} placeholder="Không giới hạn" value={scenario.graduateBy}
                                        options={mainSemesterOptions} onChange={v => update({ graduateBy: v }, 'Đổi hạn tốt nghiệp')} />
                                </Space>
                                <Space orientation="vertical" style={{ width: '100%' }}>
                                    <Text strong>Môn muốn học</Text>
                                    <Select mode="multiple" style={{ width: '100%' }} placeholder="Môn bạn thích (bộ giải cố gắng xếp)"
                                        value={scenario.wanted} options={openCourseOptions} optionFilterProp="label"
                                        onChange={wanted => update({ wanted }, 'Đổi môn muốn học')} />
                                </Space>
                            </Space>
                        </Card>
                    </div>
                </Col>

                <Col xs={24} xl={17}>
                    {lastChange && solve.isPending && <Text type="secondary">Đang xếp lại: {lastChange}…</Text>}
                    {result
                        ? (
                            <PlanResultView
                                result={shownResult ?? result}
                                courseName={code => nameByCode.get(code) ?? code}
                                previousGraduation={previousGraduation}
                                baseline={baseline}
                                onSaveBaseline={() => changeBaseline({ savedAt: new Date().toISOString(), scenario, result })}
                                onRestoreBaseline={() => {
                                    if (!baseline) return;
                                    update(normalizeScenario(baseline.scenario), 'Về mốc');
                                    setPreviousGraduation(null);
                                    setResult(baseline.result);
                                }}
                                onClearBaseline={() => changeBaseline(null)}
                                recommendationsFirst={s6First}
                                onPreferRecommendations={() => {
                                    const others = scenario.priorities.filter(p => p.id !== 'S6');
                                    update({ priorities: [{ id: 'S6', on: true }, ...others] }, 'Ưu tiên kế hoạch giảng dạy');
                                }}
                                board={result.status === 'UNSAT' || result.status === 'INPUT_ERROR' ? undefined : (
                                    <SemesterBoard
                                        result={result}
                                        semesters={shown}
                                        settings={board}
                                        onChange={(next, message) => update(next, message)}
                                        courseName={code => nameByCode.get(code) ?? code}
                                        blockChoices={blockChoices}
                                        passed={passed}
                                        prerequisites={prerequisites}
                                        warnings={warningItems}
                                        onConfirm={confirmCondition}
                                    />
                                )}
                            />
                        )
                        : (
                            <Card>
                                <Alert type="info" showIcon title={solve.isPending ? 'Đang xếp lộ trình…' : 'Đang tải cài đặt của bạn'}
                                    description="Bộ giải đọc chương trình đào tạo và trạng thái môn của bạn, rồi xếp các môn còn lại vào từng kỳ." />
                            </Card>
                        )}
                </Col>
            </Row>
        </section>
    );
};

export default RecommendationsPage;
