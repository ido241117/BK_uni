import { useMemo, useState } from 'react';
import {
    Alert, Card, Checkbox, Col, InputNumber, Row, Segmented, Select, Space, Switch, Typography,
} from 'antd';
import { LuPlus, LuTrash2 } from 'react-icons/lu';
import { Link } from 'react-router';
import { EmptyState, IconBtn, IOutLinedBtn, ISolidBtn, PageHeader, TablePageSkeleton } from '@/components';
import { getCurriculum, listCurriculumCourses } from '@/apis/curriculum';
import { getInterestTags, solvePlan } from '@/apis/planner';
import { getMyProfile, listMyCourses } from '@/apis/student';
import { useApiMutation, useApiQuery } from '@/hooks';
import {
    STUDENT_COURSE_STATUS,
    type CourseAtSemester,
    type PlanResult,
    type PlanSolver,
    type SolvePlanPayload,
} from '@/types';
import { currentSemester, semesterLabel, toSemesterCode, parseSemester } from '@/pages/courses/analysis/semester';
import PlanResultView from './PlanResultView';
import { baselineKey, loadBaseline, planOf, storeBaseline, type Baseline } from './whatIf';

const { Text } = Typography;

/** Mọi lựa chọn của kịch bản; lưu kèm mốc để "Về mốc" đặt lại đúng như lúc lưu. */
interface Scenario {
    solver: PlanSolver;
    maxCredits: number | null;
    graduateBy?: string;
    results: Record<string, 'pass' | 'fail'>;
    summers: string[];
    locked: CourseAtSemester[];
    notOffered: CourseAtSemester[];
    wanted: string[];
    balanced: boolean;
    recommendationsFirst: boolean;
    english: Flag;
    mos: Flag;
    /** Clingo only; missing in baselines saved before interests existed. */
    interests?: string[];
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

type Flag = 'unknown' | 'yes' | 'no';
const flagValue = (flag: Flag) => (flag === 'unknown' ? undefined : flag === 'yes');

const CourseSemesterList = ({
    title, hint, items, onChange, courseOptions, semesterOptions,
}: {
    title: string;
    hint: string;
    items: CourseAtSemester[];
    onChange: (items: CourseAtSemester[]) => void;
    courseOptions: { value: string; label: string }[];
    semesterOptions: { value: string; label: string }[];
}) => (
    <Space orientation="vertical" style={{ width: '100%' }}>
        <Text strong>{title}</Text>
        <Text type="secondary">{hint}</Text>
        {items.map((item, index) => (
            <Space key={index} wrap>
                <Select
                    showSearch
                    optionFilterProp="label"
                    style={{ width: 260 }}
                    placeholder="Chọn môn"
                    value={item.course_code || undefined}
                    options={courseOptions}
                    onChange={value => onChange(items.map((it, i) => (i === index ? { ...it, course_code: value } : it)))}
                />
                <Select
                    style={{ width: 200 }}
                    placeholder="Chọn kỳ"
                    value={item.semester_code || undefined}
                    options={semesterOptions}
                    onChange={value => onChange(items.map((it, i) => (i === index ? { ...it, semester_code: value } : it)))}
                />
                <IconBtn label="Bỏ dòng này" icon={<LuTrash2 />} onClick={() => onChange(items.filter((_, i) => i !== index))} />
            </Space>
        ))}
        <IOutLinedBtn icon={<LuPlus />} onClick={() => onChange([...items, { course_code: '', semester_code: '' }])}>
            Thêm
        </IOutLinedBtn>
    </Space>
);

const RecommendationsPage = () => {
    const profileQuery = useApiQuery(['my-profile'], getMyProfile);
    const curriculumId = profileQuery.data?.curriculum_id ?? undefined;
    const curriculumQuery = useApiQuery(['curriculum', curriculumId], () => getCurriculum(curriculumId!),
        { enabled: Boolean(curriculumId) });
    const coursesQuery = useApiQuery(['curriculum', curriculumId, 'courses'], () => listCurriculumCourses(curriculumId!),
        { enabled: Boolean(curriculumId) });
    const myCoursesQuery = useApiQuery(['my-courses'], listMyCourses);

    const [solver, setSolver] = useState<PlanSolver>('cpsat');
    /** Chỉ bộ giải Clingo (engine ASP): kỳ chủ động nghỉ, không báo là kỳ trống. */
    const [skipped, setSkipped] = useState<string[]>([]);
    /** Clingo only: interest tags; planned electives with these tags are preferred. */
    const [interests, setInterests] = useState<string[]>([]);
    const interestTagsQuery = useApiQuery(['interest-tags', curriculumId], getInterestTags,
        { enabled: Boolean(curriculumId) && solver === 'clingo' });
    const [maxCredits, setMaxCredits] = useState<number | null>(null);
    const [graduateBy, setGraduateBy] = useState<string | undefined>();
    const [results, setResults] = useState<Record<string, 'pass' | 'fail'>>({});
    const [summers, setSummers] = useState<string[]>([]);
    const [locked, setLocked] = useState<CourseAtSemester[]>([]);
    const [notOffered, setNotOffered] = useState<CourseAtSemester[]>([]);
    const [wanted, setWanted] = useState<string[]>([]);
    const [balanced, setBalanced] = useState(false);
    const [recommendationsFirst, setRecommendationsFirst] = useState(false);
    const [english, setEnglish] = useState<Flag>('unknown');
    const [mos, setMos] = useState<Flag>('unknown');
    const [result, setResult] = useState<PlanResult | null>(null);
    const [previousGraduation, setPreviousGraduation] = useState<string | null>(null);
    const [baseline, setBaseline] = useState<Baseline<Scenario> | null>(null);

    const storageKey = profileQuery.data?.user_id && curriculumId
        ? baselineKey(profileQuery.data.user_id, curriculumId) : null;

    const snapshot = (): Scenario => ({
        solver, maxCredits, graduateBy, results, summers, locked, notOffered, wanted, balanced,
        recommendationsFirst, english, mos, interests,
    });
    const applyScenario = (s: Scenario) => {
        setSolver(s.solver); setMaxCredits(s.maxCredits); setGraduateBy(s.graduateBy); setResults(s.results);
        setSummers(s.summers); setLocked(s.locked); setNotOffered(s.notOffered); setWanted(s.wanted);
        setBalanced(s.balanced); setRecommendationsFirst(s.recommendationsFirst); setEnglish(s.english); setMos(s.mos);
        setInterests(s.interests ?? []);
    };

    // Mở trang (hoặc đổi tài khoản/chương trình): có mốc đã lưu thì hiện lại mốc cùng kịch bản của nó.
    const [loadedKey, setLoadedKey] = useState<string | null>(null);
    if (storageKey && storageKey !== loadedKey) {
        setLoadedKey(storageKey);
        const stored = loadBaseline<Scenario>(storageKey);
        setBaseline(stored);
        if (stored) {
            applyScenario(stored.scenario);
            setResult(stored.result);
        }
    }

    const changeBaseline = (next: Baseline<Scenario> | null) => {
        setBaseline(next);
        if (storageKey) storeBaseline(storageKey, next);
    };

    const current = currentSemester();
    const semesters = useMemo(() => upcomingSemesters(current), [current]);
    const semesterOptions = semesters.map(code => ({ value: code, label: semesterLabel(code) }));
    const mainSemesterOptions = semesterOptions.filter(o => !o.value.endsWith('3'));

    const nameByCode = useMemo(() => new Map(
        (coursesQuery.data ?? []).map(item => [item.course.code, item.course.name]),
    ), [coursesQuery.data]);
    const statusByCode = useMemo(() => new Map(
        (myCoursesQuery.data ?? []).map(item => [item.course.code, item.status]),
    ), [myCoursesQuery.data]);
    const inProgress = (myCoursesQuery.data ?? [])
        .filter(item => item.status === STUDENT_COURSE_STATUS.IN_PROGRESS && nameByCode.has(item.course.code));
    const openCourseOptions = (coursesQuery.data ?? [])
        .filter(item => statusByCode.get(item.course.code) !== STUDENT_COURSE_STATUS.COMPLETED)
        .map(item => ({ value: item.course.code, label: `${item.course.code} · ${item.course.name}` }));
    const interestTags = interestTagsQuery.data?.tags ?? [];
    const interestOptions = interestTags.map(t => ({
        value: t.tag,
        label: `${t.tag} (${t.courses.length})`,
        title: t.courses.map(code => `${code} · ${nameByCode.get(code) ?? code}`).join('\n'),
    }));
    const coursesOfTag = new Map(interestTags.map(t => [t.tag, t.courses]));

    const solve = useApiMutation({
        mutationFn: (payload: SolvePlanPayload) => solvePlan(payload),
        onSuccess: data => {
            setPreviousGraduation(result?.graduation_semester ?? null);
            setResult(data);
        },
    });

    const buildPayload = (overrides: Partial<{ recommendationsFirst: boolean }> = {}): SolvePlanPayload => {
        const complete = (items: CourseAtSemester[]) => items.filter(i => i.course_code && i.semester_code);
        const flags = { english_grad_reading: flagValue(english), mos: flagValue(mos) };
        return {
            solver,
            ...(maxCredits ? { max_credits: maxCredits } : {}),
            ...(graduateBy ? { graduate_by: graduateBy } : {}),
            in_progress_results: results,
            locked: complete(locked),
            not_offered: complete(notOffered),
            summer_opt_in: summers,
            preferences: {
                wanted_courses: wanted,
                balanced_load: balanced,
                recommendations_first: overrides.recommendationsFirst ?? recommendationsFirst,
            },
            student_flags: Object.fromEntries(Object.entries(flags).filter(([, v]) => v !== undefined)),
            // What-if: gửi mốc để bộ giải giữ lộ trình gần mốc nhất (S3) và báo môn dời kỳ.
            ...(baseline ? { previous_plan: planOf(baseline.result) } : {}),
            ...(solver === 'clingo' && skipped.length ? { skip_semesters: skipped } : {}),
            ...(solver === 'clingo' && interests.length ? { interests } : {}),
        };
    };

    if (profileQuery.isLoading && !profileQuery.data) return <TablePageSkeleton />;

    if (!curriculumId) {
        return (
            <section>
                <PageHeader title="Gợi ý học phần" subtitle="Bộ giải xếp các môn còn lại vào từng kỳ theo quy định và lựa chọn của bạn." />
                <Card>
                    <EmptyState
                        title="Chưa chọn chương trình đào tạo"
                        description="Bạn cần chọn chương trình trong hồ sơ để bộ giải biết phải xếp những môn nào."
                        action={<Link to="/profile"><ISolidBtn>Cập nhật hồ sơ</ISolidBtn></Link>}
                    />
                </Card>
            </section>
        );
    }

    return (
        <section>
            <PageHeader
                title="Gợi ý học phần"
                subtitle={curriculumQuery.data
                    ? `Chương trình ${curriculumQuery.data.code} · ${curriculumQuery.data.name} · đang ở ${semesterLabel(current)}`
                    : 'Bộ giải xếp các môn còn lại vào từng kỳ theo quy định và lựa chọn của bạn.'}
            />

            <Row gutter={[16, 16]}>
                <Col xs={24} lg={9}>
                    <div className="stack">
                        <Card size="small">
                            <Text type="secondary">
                                Bộ giải dùng trạng thái môn lấy từ file PDF tiến độ myBK ở trang{' '}
                                <Link to="/courses">Môn học</Link>. File myBK không ghi môn đang học, nên hiện chưa có môn
                                nào "đang học" cho tới khi có màn hình khai môn đang học.
                            </Text>
                        </Card>

                        <Card title="Bạn đang học gì, nếu đậu hoặc rớt thì sao?">
                            {inProgress.length === 0
                                ? <Text type="secondary">Bạn chưa khai môn nào "đang học" ở trang Môn học. Mặc định mọi môn đang học được giả định đậu.</Text>
                                : (
                                    <Space orientation="vertical" style={{ width: '100%' }}>
                                        {inProgress.map(item => (
                                            <Space key={item.course.code} style={{ justifyContent: 'space-between', width: '100%' }}>
                                                <Text>{item.course.code} · {item.course.name}</Text>
                                                <Segmented
                                                    size="small"
                                                    value={results[item.course.code] ?? 'pass'}
                                                    options={[{ value: 'pass', label: 'Đậu' }, { value: 'fail', label: 'Rớt' }]}
                                                    onChange={value => setResults({ ...results, [item.course.code]: value as 'pass' | 'fail' })}
                                                />
                                            </Space>
                                        ))}
                                    </Space>
                                )}
                        </Card>

                        <Card title="Bắt buộc phải theo">
                            <Space orientation="vertical" size={16} style={{ width: '100%' }}>
                                <Space wrap>
                                    <Text>Tối đa mỗi kỳ</Text>
                                    <InputNumber min={11} max={25} placeholder="25" value={maxCredits} onChange={setMaxCredits} addonAfter="TC" />
                                </Space>
                                <Space wrap>
                                    <Text>Học xong trước</Text>
                                    <Select allowClear style={{ width: 220 }} placeholder="Không giới hạn"
                                        value={graduateBy} options={mainSemesterOptions} onChange={setGraduateBy} />
                                </Space>
                                <Space orientation="vertical">
                                    <Text strong>Kỳ hè muốn học</Text>
                                    <Text type="secondary">Chỉ kỳ được chọn mới xếp môn (tối đa 12 TC, không xếp đồ án). Thực tập luôn xếp hè được.</Text>
                                    <Checkbox.Group
                                        value={summers}
                                        onChange={values => setSummers(values as string[])}
                                        options={semesterOptions.filter(o => o.value.endsWith('3')).slice(0, 4)}
                                    />
                                </Space>
                                <CourseSemesterList
                                    title="Khóa môn vào kỳ"
                                    hint="Môn chắc chắn học ở kỳ đó (ví dụ đã đăng ký xong đợt 2)."
                                    items={locked}
                                    onChange={setLocked}
                                    courseOptions={openCourseOptions}
                                    semesterOptions={semesterOptions}
                                />
                                <CourseSemesterList
                                    title="Môn không mở ở kỳ"
                                    hint="Ví dụ sau đợt đăng ký 2, môn không mở lớp."
                                    items={notOffered}
                                    onChange={setNotOffered}
                                    courseOptions={openCourseOptions}
                                    semesterOptions={semesterOptions}
                                />
                            </Space>
                        </Card>

                        <Card title="Mong muốn (cố gắng đáp ứng)">
                            <Space orientation="vertical" size={12} style={{ width: '100%' }}>
                                <Text>Môn muốn học</Text>
                                <Select mode="multiple" style={{ width: '100%' }} placeholder="Chọn môn tự chọn bạn thích"
                                    value={wanted} options={openCourseOptions} onChange={setWanted} optionFilterProp="label" />
                                <Space><Switch checked={balanced} onChange={setBalanced} /><Text>Các kỳ đều tải</Text></Space>
                                <Space><Switch checked={recommendationsFirst} onChange={setRecommendationsFirst} />
                                    <Text>Ưu tiên giữ khuyến nghị (có thể lùi kỳ tốt nghiệp)</Text></Space>
                                <Space wrap>
                                    <Text>Chuẩn tiếng Anh tốt nghiệp</Text>
                                    <Segmented size="small" value={english} onChange={v => setEnglish(v as Flag)}
                                        options={[{ value: 'unknown', label: 'Chưa khai' }, { value: 'yes', label: 'Đã đạt' }, { value: 'no', label: 'Chưa đạt' }]} />
                                </Space>
                                <Space wrap>
                                    <Text>Chứng chỉ MOS</Text>
                                    <Segmented size="small" value={mos} onChange={v => setMos(v as Flag)}
                                        options={[{ value: 'unknown', label: 'Chưa khai' }, { value: 'yes', label: 'Đã có' }, { value: 'no', label: 'Chưa có' }]} />
                                </Space>
                            </Space>
                        </Card>

                        <Card>
                            <Space orientation="vertical" style={{ width: '100%' }}>
                                <Space wrap>
                                    <Text>Bộ giải</Text>
                                    <Segmented value={solver} onChange={v => setSolver(v as PlanSolver)}
                                        options={[{ value: 'cpsat', label: 'CP-SAT (nhanh)' }, { value: 'clingo', label: 'Clingo' }]} />
                                </Space>
                                {solver === 'clingo' && (
                                    <Space orientation="vertical" style={{ width: '100%' }}>
                                        <Text>Kỳ muốn nghỉ (chỉ Clingo)</Text>
                                        <Select mode="multiple" style={{ width: '100%' }} placeholder="Không nghỉ kỳ nào"
                                            value={skipped} options={mainSemesterOptions} onChange={setSkipped} />
                                        <Text>Interests (Clingo only)</Text>
                                        <Text type="secondary">
                                            Electives with these tags are preferred when every other goal (graduating
                                            early, offering history, balanced load...) is equal. The number is how many
                                            courses of your program have the tag.
                                        </Text>
                                        <Select mode="multiple" style={{ width: '100%' }} placeholder="No interests"
                                            value={interests} options={interestOptions} onChange={setInterests}
                                            optionFilterProp="label" loading={interestTagsQuery.isLoading}
                                            notFoundContent="No interest tags for your program yet" />
                                        {interests.map(tag => (
                                            <Text key={tag} type="secondary">
                                                {tag}: {(coursesOfTag.get(tag) ?? [])
                                                    .map(code => `${code} ${nameByCode.get(code) ?? ''}`.trim()).join(', ')
                                                    || 'no course of your program'}
                                            </Text>
                                        ))}
                                    </Space>
                                )}
                                <ISolidBtn block loading={solve.isPending} onClick={() => solve.mutate(buildPayload())}>
                                    Giải lộ trình
                                </ISolidBtn>
                            </Space>
                        </Card>
                    </div>
                </Col>

                <Col xs={24} lg={15}>
                    {result
                        ? (
                            <PlanResultView
                                result={result}
                                courseName={code => nameByCode.get(code) ?? code}
                                previousGraduation={previousGraduation}
                                baseline={baseline}
                                onSaveBaseline={() => changeBaseline({
                                    savedAt: new Date().toISOString(), scenario: snapshot(), result,
                                })}
                                onRestoreBaseline={() => {
                                    if (!baseline) return;
                                    applyScenario(baseline.scenario);
                                    setPreviousGraduation(null);
                                    setResult(baseline.result);
                                }}
                                onClearBaseline={() => changeBaseline(null)}
                                recommendationsFirst={recommendationsFirst}
                                onPreferRecommendations={() => {
                                    setRecommendationsFirst(true);
                                    solve.mutate(buildPayload({ recommendationsFirst: true }));
                                }}
                            />
                        )
                        : (
                            <Card>
                                <Alert
                                    type="info"
                                    showIcon
                                    title="Chỉnh kịch bản bên trái rồi bấm Giải lộ trình"
                                    description="Bộ giải đọc chương trình đào tạo và trạng thái môn bạn đã khai ở trang Môn học, rồi xếp các môn còn lại vào từng kỳ. Mọi môn xếp trong tương lai được giả định sẽ đậu."
                                />
                            </Card>
                        )}
                </Col>
            </Row>
        </section>
    );
};

export default RecommendationsPage;
