import { useState } from 'react';
import { Alert, Checkbox, Input, Radio, Space, Tag, Tooltip, Typography } from 'antd';
import { LuCircleAlert, LuCircleCheck, LuSend } from 'react-icons/lu';
import { Link } from 'react-router';
import { IOutLinedBtn, ISolidBtn } from '@/components';
import type { AdvisorAnswer, AdvisorChoice, AdvisorChoiceAnswer, AdvisorRecommendation, OfferingVerdict } from '@/types';
import { RichText } from './RichText';

const { Text } = Typography;

const PRIORITY: Record<AdvisorRecommendation['priority'], { label: string; color: string }> = {
    high: { label: 'Ưu tiên cao', color: 'red' },
    medium: { label: 'Nên học', color: 'blue' },
    low: { label: 'Có thể học', color: 'default' },
};

const OFFERING: Record<OfferingVerdict, { label: string; color: string }> = {
    confirmed: { label: 'Có mở lớp', color: 'green' },
    not_offered: { label: 'Không mở lớp', color: 'red' },
    likely: { label: 'Nhiều khả năng mở', color: 'green' },
    uncertain: { label: 'Chưa chắc mở', color: 'gold' },
    unlikely: { label: 'Khó mở', color: 'orange' },
    never: { label: 'Chưa từng mở kỳ này', color: 'red' },
    no_data: { label: 'Chưa có dữ liệu mở lớp', color: 'default' },
};

/** "thi trắc nghiệm 90′ · ≈ 183 giờ · có thí nghiệm" từ đề cương; câu trả lời cũ (chưa có trường này) thì bỏ qua. */
const outlineLine = (item: AdvisorRecommendation): string | null => {
    const outline = item.outline;
    if (!outline) return null;
    const exam = outline.final_exam
        ? `thi ${[outline.final_exam.format?.toLowerCase(), outline.final_exam.duration_minutes ? `${outline.final_exam.duration_minutes}′` : null].filter(Boolean).join(' ')}`
        : null;
    return [
        exam,
        outline.study_hours ? `≈ ${Math.round(outline.study_hours)} giờ` : null,
        outline.has_lab ? 'có thí nghiệm' : null,
        outline.has_project ? 'có đồ án' : null,
    ].filter(Boolean).join(' · ') || null;
};

const Recommendation = ({ item }: { item: AdvisorRecommendation }) => (
    <div className="advisor-rec">
        <div className="advisor-rec-head">
            <span>
                <Link to={`/courses/${encodeURIComponent(item.code)}`}><Text strong>{item.code}</Text></Link>
                {' '}<Text>{item.name}</Text>
                {item.credits !== null && <Text type="secondary"> · {item.credits} TC</Text>}
            </span>
            <Tag color={PRIORITY[item.priority].color}>{PRIORITY[item.priority].label}</Tag>
        </div>
        {item.reason && <div className="advisor-rec-reason">{item.reason}</div>}
        {outlineLine(item) && <div className="hint">Đề cương: {outlineLine(item)}</div>}
        <Space size={[4, 4]} wrap>
            {item.eligible === true && (
                <Tag color="green" icon={<LuCircleCheck style={{ marginRight: 4, verticalAlign: -2 }} />}>Đủ điều kiện</Tag>
            )}
            {item.eligible === false && (
                <Tag color="red" icon={<LuCircleAlert style={{ marginRight: 4, verticalAlign: -2 }} />}>
                    Thiếu {item.missing.join(', ') || 'điều kiện'}
                </Tag>
            )}
            {!item.in_curriculum && <Tag color="purple">Ngoài chương trình</Tag>}
            {item.offering && (
                <Tooltip title={item.offering.note}>
                    <Tag color={OFFERING[item.offering.verdict].color}>
                        HK {item.offering.semester}: {OFFERING[item.offering.verdict].label}
                    </Tag>
                </Tooltip>
            )}
        </Space>
    </div>
);

interface ChoiceState {
    values: string[];
    text: string;
}

const ChoicesForm = ({ choices, disabled, onSubmit }: {
    choices: AdvisorChoice[];
    disabled: boolean;
    onSubmit: (answers: AdvisorChoiceAnswer[]) => void;
}) => {
    const [state, setState] = useState<Record<string, ChoiceState>>({});
    const get = (id: string) => state[id] ?? { values: [], text: '' };
    const set = (id: string, patch: Partial<ChoiceState>) => setState(prev => ({ ...prev, [id]: { ...get(id), ...patch } }));
    const answered = choices.some(choice => get(choice.id).values.length || get(choice.id).text.trim());

    const submit = () => onSubmit(choices.map(choice => {
        const current = get(choice.id);
        const labels = current.values.map(value => choice.options.find(option => option.value === value)?.label ?? value);
        return { id: choice.id, question: choice.question, values: labels, text: current.text.trim() || undefined };
    }));

    return (
        <div className="advisor-choices">
            {choices.map(choice => {
                const current = get(choice.id);
                return (
                    <div key={choice.id} className="advisor-choice">
                        <Text strong>{choice.question}</Text>
                        {choice.type === 'single' && (
                            <Radio.Group
                                disabled={disabled}
                                value={current.values[0]}
                                onChange={event => set(choice.id, { values: [event.target.value as string] })}
                            >
                                <Space direction="vertical" size={4}>
                                    {choice.options.map(option => (
                                        <Radio key={option.value} value={option.value}>
                                            {option.label}
                                            {option.description && <div className="hint">{option.description}</div>}
                                        </Radio>
                                    ))}
                                </Space>
                            </Radio.Group>
                        )}
                        {choice.type === 'multiple' && (
                            <Checkbox.Group
                                disabled={disabled}
                                value={current.values}
                                onChange={values => set(choice.id, { values: values as string[] })}
                            >
                                <Space direction="vertical" size={4}>
                                    {choice.options.map(option => (
                                        <Checkbox key={option.value} value={option.value}>
                                            {option.label}
                                            {option.description && <div className="hint">{option.description}</div>}
                                        </Checkbox>
                                    ))}
                                </Space>
                            </Checkbox.Group>
                        )}
                        <Input
                            size="small"
                            disabled={disabled}
                            placeholder={choice.type === 'text' ? 'Nhập câu trả lời' : 'Ý khác (không bắt buộc)'}
                            value={current.text}
                            onChange={event => set(choice.id, { text: event.target.value })}
                            maxLength={1000}
                        />
                    </div>
                );
            })}
            <div>
                <ISolidBtn size="small" icon={<LuSend />} disabled={disabled || !answered} onClick={submit}>Gửi lựa chọn</ISolidBtn>
            </div>
        </div>
    );
};

export const AnswerView = ({ answer, interactive, onAnswer, onAsk }: {
    answer: AdvisorAnswer;
    /** Chỉ câu trả lời mới nhất (khi AI không bận) mới cho chọn/bấm gợi ý. */
    interactive: boolean;
    onAnswer: (answers: AdvisorChoiceAnswer[]) => void;
    onAsk: (question: string) => void;
}) => (
    <div className="advisor-answer">
        <RichText text={answer.message} />
        {answer.recommendations.length > 0 && (
            <div className="advisor-recs">
                <Text type="secondary" style={{ fontSize: 12 }}>
                    Môn đề xuất · {answer.recommendations.reduce((total, item) => total + (item.credits ?? 0), 0)} TC.
                    {' '}Điều kiện lấy từ trang Phân tích học tập; mở lớp lấy từ dữ liệu myBK hoặc dự đoán theo các năm trước.
                </Text>
                {answer.recommendations.map(item => <Recommendation key={item.code} item={item} />)}
            </div>
        )}
        {answer.choices.length > 0 && <ChoicesForm choices={answer.choices} disabled={!interactive} onSubmit={onAnswer} />}
        {answer.suggestions.length > 0 && interactive && (
            <Space size={[6, 6]} wrap>
                {answer.suggestions.map(question => (
                    <IOutLinedBtn key={question} size="small" onClick={() => onAsk(question)}>{question}</IOutLinedBtn>
                ))}
            </Space>
        )}
        {answer.notes.length > 0 && <Alert type="info" showIcon title={answer.notes.join(' ')} />}
    </div>
);

export default AnswerView;
