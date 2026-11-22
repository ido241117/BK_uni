import { useState, type ReactNode } from 'react';
import { Card, Empty, Tag, Typography } from 'antd';
import { LuChevronDown, LuChevronRight } from 'react-icons/lu';
import { ITextBtn } from '@/components';
import {
    COURSE_GROUP_KIND,
    COURSE_GROUP_SCOPE,
    STUDENT_COURSE_STATUS,
    type CourseGroup,
    type CourseSummary,
    type CurriculumCategory,
    type CurriculumSpecialization,
    type StudentCourseStatus,
} from '@/types';
import { describeGroupRequirement, type CurriculumBlockProgress } from '@/utils/curriculum-credits';
import { groupCourses, termLabel, type CurriculumStructure } from './structure';

const { Paragraph, Text } = Typography;

/** Những gì các phần của bảng cần từ trang: bộ lọc, trạng thái hiệu lực và thao tác hàng loạt. */
export interface BoardView {
    /** Môn khớp tìm kiếm + lọc trạng thái. */
    visible: (course: CourseSummary) => boolean;
    filtering: boolean;
    statusOf: (courseId: string) => StudentCourseStatus | null;
    renderCard: (course: CourseSummary) => ReactNode;
    setMany: (courses: CourseSummary[], status: StudentCourseStatus | null) => void;
    blockByGroupId: Map<string, CurriculumBlockProgress>;
    standaloneBlock: CurriculumBlockProgress | undefined;
}

const Grid = ({ courses, view }: { courses: CourseSummary[]; view: BoardView }) => (
    <div className="course-grid">{courses.map(course => view.renderCard(course))}</div>
);

const sumCredits = (courses: CourseSummary[]) => courses.reduce((total, course) => total + course.credits, 0);

/** "Hoàn thành tất cả" / "Bỏ đánh dấu" cho một nhóm môn. */
const MarkAll = ({ courses, view }: { courses: CourseSummary[]; view: BoardView }) => {
    if (!courses.length) return null;
    const allDone = courses.every(course => view.statusOf(course.id) === STUDENT_COURSE_STATUS.COMPLETED);
    return allDone
        ? <ITextBtn size="small" onClick={() => view.setMany(courses, null)}>Bỏ đánh dấu</ITextBtn>
        : <ITextBtn size="small" onClick={() => view.setMany(courses, STUDENT_COURSE_STATUS.COMPLETED)}>Hoàn thành tất cả</ITextBtn>;
};

const progressText = (block: CurriculumBlockProgress | undefined) => (
    block ? `${block.doneCount}/${block.needCount} môn · ${block.doneCredits}/${block.needCredits} TC` : ''
);

/** Một khối tự chọn: tiêu đề + tiến độ, danh sách môn thu gọn được (khối lớn mặc định thu gọn). */
export const GroupSection = ({
    group,
    view,
    outsideCourses = [],
    defaultOpen,
}: {
    group: CourseGroup;
    view: BoardView;
    /** Khối `any`: môn ngoài chương trình đang được tính cho khối này. */
    outsideCourses?: CourseSummary[];
    defaultOpen?: boolean;
}) => {
    const members = group.pool_scope === COURSE_GROUP_SCOPE.ANY ? outsideCourses : groupCourses(group);
    const shown = members.filter(view.visible);
    const [open, setOpen] = useState(defaultOpen ?? members.length <= 12);
    if (view.filtering && !shown.length) return null;
    const expanded = open || view.filtering;
    const block = view.blockByGroupId.get(group.id);

    return (
        <div className="board-group">
            <div className="board-section-head" style={{ marginBottom: expanded ? 10 : 0 }}>
                <button
                    type="button"
                    onClick={() => setOpen(value => !value)}
                    aria-expanded={expanded}
                    style={{ all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                    {expanded ? <LuChevronDown aria-hidden /> : <LuChevronRight aria-hidden />}
                    <span className="board-section-title">{group.name}</span>
                    <Tag color={group.kind === COURSE_GROUP_KIND.REQUIRED ? 'green' : 'blue'} style={{ marginInlineEnd: 0 }}>
                        {describeGroupRequirement(group)}
                    </Tag>
                </button>
                <span className="board-section-sub">
                    {progressText(block)}
                    {group.pool_scope === COURSE_GROUP_SCOPE.LISTED && ` · ${members.length} môn để chọn`}
                </span>
            </div>
            {expanded && (group.pool_scope === COURSE_GROUP_SCOPE.ANY ? (
                <>
                    <Paragraph type="secondary" style={{ margin: shown.length ? '0 0 10px' : 0, fontSize: 13 }}>
                        Chọn môn bất kỳ ngoài chương trình. Tìm và đánh dấu môn ở tab “Danh mục môn học”; môn đã hoàn thành sẽ được tính vào khối này.
                    </Paragraph>
                    {shown.length > 0 && <Grid courses={shown} view={view} />}
                </>
            ) : <Grid courses={shown} view={view} />)}
        </div>
    );
};

const Section = ({ title, sub, extra, children }: { title: string; sub?: string; extra?: ReactNode; children: ReactNode }) => (
    <Card size="small">
        <div className="board-section-head">
            <span>
                <span className="board-section-title">{title}</span>
                {sub && <span className="board-section-sub">{` — ${sub}`}</span>}
            </span>
            {extra}
        </div>
        <div className="stack" style={{ gap: 12 }}>{children}</div>
    </Card>
);

/** Theo kế hoạch giảng dạy: mỗi kỳ là môn bắt buộc của kỳ + các khối tự chọn nên bắt đầu ở kỳ đó. */
export const SemesterView = ({
    structure,
    view,
    outsideCourses,
}: {
    structure: CurriculumStructure;
    view: BoardView;
    outsideCourses: CourseSummary[];
}) => {
    const sections: ReactNode[] = [];

    for (const semester of structure.semesters) {
        const shown = semester.courses.filter(view.visible);
        const groups = semester.groups;
        if (view.filtering && !shown.length && !groups.some(group => groupCourses(group).some(view.visible))) continue;
        const done = sumCredits(semester.courses.filter(course => view.statusOf(course.id) === STUDENT_COURSE_STATUS.COMPLETED));
        sections.push(
            <Section
                key={semester.key}
                title={`Năm ${semester.year} · ${termLabel(semester.term)}`}
                sub={`${done}/${sumCredits(semester.courses)} TC bắt buộc đã hoàn thành${groups.length ? ` · ${groups.length} khối tự chọn` : ''}`}
                extra={<MarkAll courses={semester.courses} view={view} />}
            >
                {shown.length > 0 && <Grid courses={shown} view={view} />}
                {groups.map(group => (
                    <GroupSection key={group.id} group={group} view={view} outsideCourses={outsideCourses} defaultOpen={false} />
                ))}
            </Section>,
        );
    }

    const unscheduled = structure.unscheduled.filter(view.visible);
    if (unscheduled.length) {
        sections.push(
            <Section key="unscheduled" title="Chưa xếp kỳ" sub={`${structure.unscheduled.length} môn`} extra={<MarkAll courses={structure.unscheduled} view={view} />}>
                <Grid courses={unscheduled} view={view} />
            </Section>,
        );
    }

    if (structure.floatingGroups.length) {
        const groups = structure.floatingGroups.map(group => (
            <GroupSection key={group.id} group={group} view={view} outsideCourses={outsideCourses} defaultOpen={false} />
        ));
        sections.push(
            <Section key="floating" title="Khối tự chọn không gắn kỳ">{groups}</Section>,
        );
    }

    return sections.length
        ? <div className="stack">{sections}</div>
        : <Card><Empty description="Không có môn nào khớp bộ lọc." /></Card>;
};

/**
 * Theo nhóm học phần (nhóm mô tả admin đặt cho chương trình, vd "Đại cương", "Cơ sở ngành"):
 * không ràng buộc số môn/tín chỉ, chỉ đếm số tín chỉ đã hoàn thành trên tổng tín chỉ các môn trong nhóm.
 * Một môn có thể thuộc nhiều nhóm; môn chương trình không thuộc nhóm nào gom vào "Chưa phân nhóm".
 */
export const CategoriesView = ({
    categories,
    structure,
    view,
}: {
    categories: CurriculumCategory[];
    structure: CurriculumStructure;
    view: BoardView;
}) => {
    const categorized = new Set(categories.flatMap(category => category.members.map(member => member.course_id)));
    const uncategorized = structure.allCourses.filter(course => !categorized.has(course.id));
    const lists = [
        ...categories.map(category => ({
            key: category.id,
            name: category.name,
            courses: category.members.map(member => member.course).sort((a, b) => a.code.localeCompare(b.code)),
        })),
        ...(uncategorized.length ? [{ key: 'uncategorized', name: 'Chưa phân nhóm', courses: uncategorized }] : []),
    ];

    if (!categories.length) return <Card><Empty description="Chương trình chưa chia nhóm học phần." /></Card>;

    const sections = lists.flatMap(list => {
        const shown = list.courses.filter(view.visible);
        if (view.filtering && !shown.length) return [];
        const done = sumCredits(list.courses.filter(course => view.statusOf(course.id) === STUDENT_COURSE_STATUS.COMPLETED));
        return [(
            <Section
                key={list.key}
                title={list.name}
                sub={`${done}/${sumCredits(list.courses)} TC đã hoàn thành · ${list.courses.length} môn`}
                extra={<MarkAll courses={list.courses} view={view} />}
            >
                <Grid courses={shown} view={view} />
            </Section>
        )];
    });

    return sections.length
        ? <div className="stack">{sections}</div>
        : <Card><Empty description="Không có môn nào khớp bộ lọc." /></Card>;
};

/** Theo khối kiến thức xét tốt nghiệp, kèm tiến độ từng khối. */
export const GroupsView = ({
    structure,
    view,
    outsideCourses,
}: {
    structure: CurriculumStructure;
    view: BoardView;
    outsideCourses: CourseSummary[];
}) => {
    const standalone = structure.standalone.filter(view.visible);
    return (
        <div className="stack">
            {(!view.filtering || standalone.length > 0) && (
                <Section
                    title="Môn bắt buộc"
                    sub={progressText(view.standaloneBlock)}
                    extra={<MarkAll courses={structure.standalone} view={view} />}
                >
                    <Grid courses={standalone} view={view} />
                </Section>
            )}
            {structure.rootGroups.map(group => (
                <GroupSection key={group.id} group={group} view={view} outsideCourses={outsideCourses} />
            ))}
        </div>
    );
};

/** Chuyên ngành: các khối con thu hẹp khối tự chọn gốc. */
export const SpecializationsView = ({
    specializations,
    required,
    view,
}: {
    specializations: CurriculumSpecialization[];
    required: boolean;
    view: BoardView;
}) => {
    if (!specializations.length) return <Card><Empty description="Chương trình không chia chuyên ngành." /></Card>;
    return (
        <div className="stack">
            <Text type="secondary">
                {required
                    ? 'Phải đạt đúng một chuyên ngành mới đủ điều kiện tốt nghiệp. Môn chuyên ngành vẫn được tính vào khối tự chọn gốc.'
                    : 'Chuyên ngành không bắt buộc. Môn chuyên ngành vẫn được tính vào khối tự chọn gốc.'}
            </Text>
            {specializations.map(specialization => (
                <Section key={specialization.id} title={specialization.name} sub={specialization.code}>
                    {specialization.description && <Text type="secondary">{specialization.description}</Text>}
                    {specialization.groups.map(group => <GroupSection key={group.id} group={group} view={view} defaultOpen />)}
                </Section>
            ))}
        </div>
    );
};
