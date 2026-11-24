import { Select, type SelectProps } from 'antd';
import type { ReactNode } from 'react';
import {
    PiArrowRight, PiCalendarBlank, PiCheckBold, PiCheckCircleFill, PiCircleDashed, PiCircleHalfFill, PiWarningCircleFill,
    PiWarningFill, PiXCircle,
} from 'react-icons/pi';
import { STUDENT_COURSE_STATUS_LABEL, type StudentCourseStatus } from '@/types';

/*
 * Status and marker pieces from ui-template/components-template.html (status micro-glyphs) and
 * components-template-2.html (file column, differs-from-file flag, load warning, source badge, status change,
 * course option). The template's sparkle placeholders are replaced by icons that say what they mean.
 */

const STATUS_ICON: Record<StudentCourseStatus, ReactNode> = {
    completed: <PiCheckCircleFill />,
    'in-progress': <PiCircleHalfFill />,
    'not-started': <PiCircleDashed />,
    failed: <PiXCircle />,
};

/** Course status as glyph + label: done sage, in progress rose, not started muted, failed terracotta. */
export const CourseStatus = ({ status }: { status: StudentCourseStatus }) => (
    <span className="course-status" data-status={status}>
        <span className="course-status-icon" aria-hidden="true">{STATUS_ICON[status]}</span>
        {STUDENT_COURSE_STATUS_LABEL[status]}
    </span>
);

const STATUS_ORDER: StudentCourseStatus[] = ['completed', 'in-progress', 'not-started', 'failed'];

/** Status dropdown whose trigger and options show the status glyphs. */
export const CourseStatusSelect = (props: Omit<SelectProps<StudentCourseStatus>, 'options'>) => (
    <Select<StudentCourseStatus>
        {...props}
        options={STATUS_ORDER.map(value => ({ value, label: <CourseStatus status={value} /> }))}
    />
);

/** "Đạt" column of the myBK file: check when passed, "--" otherwise. */
export const FileMark = ({ passed }: { passed: boolean }) => (passed
    ? <span className="file-mark" data-passed="true" role="img" aria-label="Đạt"><PiCheckBold /></span>
    : <span className="file-mark" data-passed="false">--</span>);

/** Web status differs from the myBK file (terracotta: a conflict). */
export const DiffFlag = ({ children = 'Khác file tiến độ' }: { children?: ReactNode }) => (
    <span className="diff-flag"><PiWarningFill aria-hidden="true" />{children}</span>
);

/** Inline warning next to a count, e.g. "nhiều hơn mức tối đa 25 TC". */
export const LoadWarning = ({ children }: { children: ReactNode }) => (
    <span className="load-warn"><PiWarningCircleFill aria-hidden="true" />{children}</span>
);

/** Small badge saying where a value came from, e.g. "tự tính theo ngày". */
export const SourceBadge = ({ children, icon = <PiCalendarBlank /> }: { children: ReactNode; icon?: ReactNode }) => (
    <span className="source-badge"><span aria-hidden="true">{icon}</span>{children}</span>
);

/** "from → to" status change, e.g. in the review modal. */
export const StatusChange = ({ from, to }: { from: StudentCourseStatus; to: StudentCourseStatus }) => (
    <span className="status-change">
        <CourseStatus status={from} />
        <PiArrowRight aria-label="thành" />
        <CourseStatus status={to} />
    </span>
);

/** Course code in tables (12.5-13px, 600). */
export const CourseCode = ({ children }: { children: ReactNode }) => <span className="course-code">{children}</span>;

/** One add-course search result: rose code, name, credits on the right. */
export const CourseOption = ({ code, name, credits }: { code: string; name: string; credits?: number }) => (
    <span className="course-option">
        <span className="course-option-main">
            <span className="course-option-code">{code}</span>
            <span>{name}</span>
        </span>
        {credits !== undefined && <span className="course-option-tc">{credits} TC</span>}
    </span>
);
