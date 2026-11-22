import { Space, Tag, Tooltip, Typography } from 'antd';
import type { InterestTag } from '@/types';

const { Text } = Typography;

interface InterestTagPickerProps {
    /** Tags of the student's program (GET /plans/interest-tags). */
    tags: InterestTag[];
    value: string[];
    onChange: (next: string[]) => void;
    courseName: (code: string) => string;
    loading?: boolean;
}

const CourseList = ({ codes, courseName }: { codes: string[]; courseName: (code: string) => string }) => (
    <Space orientation="vertical" size={0}>
        {codes.map(code => <span key={code}>{code} · {courseName(code)}</span>)}
    </Space>
);

/** Clingo only: interest tags as toggleable chips; hovering a chip lists its courses, picked tags show them below. */
const InterestTagPicker = ({ tags, value, onChange, courseName, loading }: InterestTagPickerProps) => {
    const coursesOf = new Map(tags.map(t => [t.tag, t.courses]));
    // Picked tags no longer offered (e.g. a baseline saved before the tag file changed) stay visible so they can be removed.
    const stale = value.filter(tag => !coursesOf.has(tag));
    const toggle = (tag: string, checked: boolean) =>
        onChange(checked ? [...value, tag] : value.filter(t => t !== tag));

    if (loading) return <Text type="secondary">Loading interest tags...</Text>;
    if (tags.length === 0 && stale.length === 0) return <Text type="secondary">No interest tags for your program yet.</Text>;

    return (
        <Space orientation="vertical" size={8} style={{ width: '100%' }}>
            <Space size={[4, 8]} wrap>
                {tags.map(t => (
                    <Tooltip key={t.tag} title={<CourseList codes={t.courses} courseName={courseName} />}>
                        <Tag.CheckableTag checked={value.includes(t.tag)} onChange={checked => toggle(t.tag, checked)}
                            style={{ border: '1px solid var(--ant-color-border)' }}>
                            {t.tag} ({t.courses.length})
                        </Tag.CheckableTag>
                    </Tooltip>
                ))}
                {stale.map(tag => (
                    <Tag key={tag} color="warning" closable onClose={() => toggle(tag, false)}>
                        {tag} (not in your program)
                    </Tag>
                ))}
            </Space>
            {value.length > 0 && (
                <Space orientation="vertical" size={4} style={{ width: '100%' }}>
                    <Space>
                        <Text strong>Picked ({value.length})</Text>
                        <Typography.Link onClick={() => onChange([])}>Clear</Typography.Link>
                    </Space>
                    {value.filter(tag => coursesOf.has(tag)).map(tag => (
                        <div key={tag}>
                            <Tag color="blue">{tag}</Tag>
                            <Space size={[4, 4]} wrap style={{ marginTop: 4 }}>
                                {coursesOf.get(tag)!.map(code => (
                                    <Tooltip key={code} title={courseName(code)}>
                                        <Tag>{code}</Tag>
                                    </Tooltip>
                                ))}
                            </Space>
                        </div>
                    ))}
                </Space>
            )}
        </Space>
    );
};

export default InterestTagPicker;
