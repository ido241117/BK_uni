import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Card, Empty, Input, Popconfirm, Select, Space, Spin, Tabs, Tag, Typography } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { LuArrowLeft, LuMessageSquarePlus, LuSend, LuSparkles, LuTrash2 } from 'react-icons/lu';
import { Link, useSearchParams } from 'react-router';
import { IOutLinedBtn, ISolidBtn, PageHeader, TablePageSkeleton } from '@/components';
import { deleteAdvisorSession, getAdvisorSession, listAdvisorSessions, streamAdvisorMessage } from '@/apis/advisor';
import { useApiMutation, useApiQuery } from '@/hooks';
import type { AdvisorAnswer, AdvisorChoiceAnswer, AdvisorSession, AdvisorSessionDetail, AdvisorStep, SendAdvisorMessagePayload } from '@/types';
import { semesterLabel } from '@/pages/courses/analysis/semester';
import { useStudentAnalysis } from '@/pages/courses/analysis/useStudentAnalysis';
import { AnswerView } from './components/AnswerView';
import { RichText } from './components/RichText';
import { Trajectory } from './components/Trajectory';
import { buildAdvisorSnapshot } from './snapshot';

const { Text, Paragraph } = Typography;

const STARTERS = [
    'Kỳ tới mình nên đăng ký những môn nào?',
    'Mình nên theo chuyên ngành nào?',
    'Nên chọn môn tự chọn nào trong các khối còn thiếu?',
    'Với tiến độ hiện tại mình có kịp tốt nghiệp đúng hạn không?',
];

const sessionKey = (id: string | null) => ['advisor-session', id];

const TOOL_LABELS: Record<string, string> = {
    get_analysis_section: 'đọc kết quả phân tích học tập',
    get_course_detail: 'tra cứu môn học',
    check_offering: 'kiểm tra lịch mở lớp',
    get_course_outline: 'đọc đề cương',
    search_curriculum_courses: 'tìm môn trong chương trình',
    get_specialization_detail: 'xem chuyên ngành',
    search_outlines: 'tìm trong đề cương',
    find_similar_courses: 'tìm môn tương tự',
    submit_answer: 'soạn câu trả lời',
};

/** Mô tả việc AI đang làm, dựa trên bước mới nhất vừa nhận qua stream. */
const describeActivity = (step: AdvisorStep | null): string => {
    const calls = step?.role === 'assistant' ? step.tool_calls ?? [] : [];
    if (calls.length) {
        const labels = [...new Set(calls.map(call => TOOL_LABELS[call.name] ?? call.name))];
        return `AI đang ${labels.join(', ')}…`;
    }
    if (step?.role === 'tool') return 'AI đang đọc kết quả tra cứu…';
    return 'AI đang suy nghĩ…';
};

/** Gộp các bước đã tải từ server với các bước vừa nhận qua stream (bỏ trùng theo id, xếp theo seq). */
const mergeSteps = (saved: AdvisorStep[], streamed: AdvisorStep[]): AdvisorStep[] => {
    if (!streamed.length) return saved;
    const ids = new Set(saved.map(step => step.id));
    return [...saved, ...streamed.filter(step => !ids.has(step.id))].sort((a, b) => a.seq - b.seq);
};

interface PendingTurn {
    /** Câu hỏi vừa gửi, hiện tạm cho tới khi nhận được bước `user` của lượt. */
    text: string;
    userSaved: boolean;
    sessionId: string | null;
    steps: AdvisorStep[];
}

/** Phần tin nhắn sinh viên tự gõ (bỏ khối "[Trả lời lựa chọn]" do backend ghép thêm). */
const UserBubble = ({ step }: { step: AdvisorStep }) => {
    const answers = (step.data as { answers?: AdvisorChoiceAnswer[] } | null)?.answers;
    const typed = (step.content ?? '').split('\n[Trả lời lựa chọn]')[0];
    return (
        <div className="advisor-msg is-user">
            <div className="advisor-bubble">
                <div style={{ whiteSpace: 'pre-wrap' }}>{typed}</div>
                {answers?.map(answer => (
                    <div key={answer.id} className="advisor-user-answer">
                        <Text type="secondary">{answer.question}</Text>{' '}
                        <Text strong>{[...answer.values, ...(answer.text ? [answer.text] : [])].join('; ') || '(bỏ qua)'}</Text>
                    </div>
                ))}
            </div>
        </div>
    );
};

const AdvisorPage = () => {
    const queryClient = useQueryClient();
    const [params, setParams] = useSearchParams();
    const sessionId = params.get('session');
    const [draft, setDraft] = useState('');
    const [pending, setPending] = useState<PendingTurn | null>(null);
    const [tab, setTab] = useState('chat');
    const bottomRef = useRef<HTMLDivElement>(null);
    const abortRef = useRef<AbortController | null>(null);

    // Rời trang thì ngừng đọc stream; backend vẫn chạy nốt lượt và lưu kết quả.
    useEffect(() => () => abortRef.current?.abort(), []);

    const { profileLoading, profile, curriculumId, curriculum, isError, analysis } = useStudentAnalysis();
    const sessionsQuery = useApiQuery(['advisor-sessions'], listAdvisorSessions);
    const sessionQuery = useApiQuery(sessionKey(sessionId), () => getAdvisorSession(sessionId!), { enabled: Boolean(sessionId) });
    const steps = useMemo(() => {
        if (!sessionId) return [];
        const streamed = pending?.sessionId === sessionId ? pending.steps : [];
        return mergeSteps(sessionQuery.data?.steps ?? [], streamed);
    }, [sessionId, sessionQuery.data, pending]);

    const snapshot = useMemo(
        () => (analysis && curriculum ? buildAdvisorSnapshot(analysis, curriculum, profile?.credit_target ?? null) : null),
        [analysis, curriculum, profile?.credit_target],
    );

    const send = useApiMutation({
        mutationFn: (payload: SendAdvisorMessagePayload) => {
            abortRef.current?.abort();
            const controller = new AbortController();
            abortRef.current = controller;
            return streamAdvisorMessage(payload, {
                onSession: (session: AdvisorSession) => {
                    setPending(current => current && { ...current, sessionId: session.id });
                    if (session.id !== sessionId) {
                        // Cuộc trò chuyện mới: đặt sẵn cache để không hiện skeleton khi đổi URL.
                        queryClient.setQueryData<AdvisorSessionDetail>(sessionKey(session.id), old => old ?? { ...session, steps: [] });
                        setParams({ session: session.id });
                    }
                    void queryClient.invalidateQueries({ queryKey: ['advisor-sessions'] });
                },
                onStep: step => setPending(current => current && {
                    ...current,
                    steps: [...current.steps, step],
                    userSaved: current.userSaved || step.role === 'user',
                }),
            }, controller.signal);
        },
        onSettled: async session => {
            // Lấy lại bản đầy đủ từ CSDL rồi mới bỏ các bước tạm nhận qua stream.
            if (session) await queryClient.invalidateQueries({ queryKey: sessionKey(session.id) });
            await queryClient.invalidateQueries({ queryKey: ['advisor-sessions'] });
        },
    });

    const remove = useApiMutation({
        mutationFn: (id: string) => deleteAdvisorSession(id),
        successMessage: 'Đã xóa cuộc trò chuyện',
        onSuccess: async id => {
            queryClient.removeQueries({ queryKey: sessionKey(id) });
            setParams({});
            await queryClient.invalidateQueries({ queryKey: ['advisor-sessions'] });
        },
    });

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, [steps.length, pending]);

    const ask = (message: string, answers?: AdvisorChoiceAnswer[]) => {
        const text = message.trim();
        if (!text || !snapshot || send.isPending) return;
        setPending({ text, userSaved: false, sessionId, steps: [] });
        setDraft('');
        send.mutate(
            { session_id: sessionId ?? undefined, message: text, snapshot, answers },
            {
                onError: () => { if (!answers) setDraft(text); },
                onSettled: () => setPending(null),
            },
        );
    };

    const back = <Link to="/courses/analysis"><IOutLinedBtn icon={<LuArrowLeft />}>Phân tích học tập</IOutLinedBtn></Link>;

    if (profileLoading) return <TablePageSkeleton />;

    if (!curriculumId) {
        return (
            <section>
                <PageHeader title="Tư vấn với AI" extra={back} />
                <Alert
                    type="info"
                    showIcon
                    title="Chưa chọn chương trình đào tạo"
                    description="AI tư vấn dựa trên kết quả Phân tích học tập theo chương trình của bạn. Hãy chọn chương trình trong hồ sơ trước."
                    action={<Link to="/profile"><ISolidBtn size="small">Điền hồ sơ</ISolidBtn></Link>}
                />
            </section>
        );
    }

    if (isError) {
        return (
            <section>
                <PageHeader title="Tư vấn với AI" extra={back} />
                <Alert type="error" showIcon title="Không tải được dữ liệu học tập" description="Thử tải lại trang." />
            </section>
        );
    }

    const lastAnswerId = [...steps].reverse().find(step => step.role === 'answer' || step.role === 'error')?.id;
    const busy = send.isPending;

    const chat = (
        <div className="advisor-chat">
            <div className="advisor-thread">
                {!steps.length && !pending && (
                    <div className="advisor-empty">
                        <LuSparkles size={28} />
                        <Paragraph style={{ margin: 0 }}>
                            Hỏi AI về học phần kỳ tới, môn tự chọn hay chuyên ngành. AI đọc kết quả Phân tích học tập,
                            tra cứu CSDL (tiên quyết, mở lớp các kỳ trước) rồi trả lời và đưa ra lựa chọn khi cần.
                        </Paragraph>
                        <Space size={[8, 8]} wrap style={{ justifyContent: 'center' }}>
                            {STARTERS.map(starter => (
                                <IOutLinedBtn key={starter} size="small" disabled={!snapshot} onClick={() => ask(starter)}>{starter}</IOutLinedBtn>
                            ))}
                        </Space>
                    </div>
                )}
                {steps.map(step => {
                    if (step.role === 'user') return <UserBubble key={step.id} step={step} />;
                    if (step.role === 'error') {
                        return (
                            <div key={step.id} className="advisor-msg">
                                <Alert type="error" showIcon title="AI chưa trả lời được" description={step.content} />
                            </div>
                        );
                    }
                    if (step.role !== 'answer') return null;
                    return (
                        <div key={step.id} className="advisor-msg">
                            <div className="advisor-bubble is-ai">
                                <AnswerView
                                    answer={step.data as AdvisorAnswer}
                                    interactive={step.id === lastAnswerId && !busy}
                                    onAnswer={answers => ask('Mình đã trả lời các câu hỏi.', answers)}
                                    onAsk={question => ask(question)}
                                />
                            </div>
                        </div>
                    );
                })}
                {pending && (
                    <>
                        {!pending.userSaved && (
                            <div className="advisor-msg is-user"><div className="advisor-bubble"><RichText text={pending.text} /></div></div>
                        )}
                        {!pending.steps.some(step => step.role === 'answer' || step.role === 'error') && (
                            <div className="advisor-msg">
                                <div className="advisor-bubble is-ai">
                                    <Space><Spin size="small" /><Text type="secondary">{describeActivity(pending.steps.at(-1) ?? null)}</Text></Space>
                                </div>
                            </div>
                        )}
                    </>
                )}
                <div ref={bottomRef} />
            </div>

            <div className="advisor-composer">
                <Input.TextArea
                    value={draft}
                    onChange={event => setDraft(event.target.value)}
                    onPressEnter={event => {
                        if (event.shiftKey || event.nativeEvent.isComposing) return;
                        event.preventDefault();
                        ask(draft);
                    }}
                    placeholder={snapshot ? 'Nhập câu hỏi (Enter để gửi, Shift+Enter xuống dòng)' : 'Đang tải dữ liệu học tập…'}
                    autoSize={{ minRows: 1, maxRows: 6 }}
                    maxLength={2000}
                    disabled={!snapshot}
                />
                <ISolidBtn icon={<LuSend />} loading={busy} disabled={!snapshot || !draft.trim()} onClick={() => ask(draft)}>Gửi</ISolidBtn>
            </div>
        </div>
    );

    return (
        <section>
            <PageHeader
                title="Tư vấn với AI"
                subtitle={analysis
                    ? `Dựa trên Phân tích học tập tại ${semesterLabel(analysis.current)}; gợi ý cho ${semesterLabel(analysis.next)}. AI có thể sai — hãy kiểm tra lại trước khi đăng ký.`
                    : 'Đang tải dữ liệu học tập…'}
                extra={(
                    <Space wrap>
                        <Select
                            style={{ width: 260 }}
                            placeholder="Cuộc trò chuyện trước"
                            value={sessionId ?? undefined}
                            loading={sessionsQuery.isLoading}
                            onChange={id => setParams({ session: id })}
                            options={(sessionsQuery.data ?? []).map(session => ({ value: session.id, label: session.title }))}
                            notFoundContent={<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có cuộc trò chuyện" />}
                        />
                        <IOutLinedBtn icon={<LuMessageSquarePlus />} disabled={busy} onClick={() => { setParams({}); setTab('chat'); }}>Mới</IOutLinedBtn>
                        {sessionId && (
                            <Popconfirm title="Xóa cuộc trò chuyện này?" okText="Xóa" cancelText="Hủy" onConfirm={() => remove.mutate(sessionId)}>
                                <IOutLinedBtn color="danger" icon={<LuTrash2 />} disabled={busy} loading={remove.isPending}>Xóa</IOutLinedBtn>
                            </Popconfirm>
                        )}
                    </Space>
                )}
            />

            <Card size="small" styles={{ body: { paddingTop: 0 } }}>
                {sessionId && sessionQuery.isLoading ? <TablePageSkeleton /> : (
                    <Tabs
                        activeKey={tab}
                        onChange={setTab}
                        tabBarExtraContent={sessionQuery.data?.model && <Tag>{sessionQuery.data.model}</Tag>}
                        items={[
                            { key: 'chat', label: 'Trò chuyện', children: chat },
                            { key: 'trace', label: `Trajectory (${steps.length})`, children: <Trajectory steps={steps} /> },
                        ]}
                    />
                )}
            </Card>
        </section>
    );
};

export default AdvisorPage;
