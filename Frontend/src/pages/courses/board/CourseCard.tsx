import { memo } from 'react';
import { LuArrowUpRight, LuMinus, LuPlus, LuX } from 'react-icons/lu';
import { Link } from 'react-router';
import { Bead, Pip } from '@/components';
import { STUDENT_COURSE_STATUS_LABEL, type CourseSummary, type StudentCourseStatus } from '@/types';
import { nextSemester, previousSemester } from '@/utils/semester';
import { canPlan } from './structure';
import i18n from '@/i18n';

interface CourseCardProps {
    course: CourseSummary;
    status: StudentCourseStatus | null;
    plannedSemester: string | null;
    /** Học kỳ gán khi bấm "+" lần đầu (kỳ gợi ý của chương trình, không sớm hơn `minSemester`). */
    defaultSemester: string;
    /** Học kỳ sớm nhất được lên kế hoạch (học kỳ hiện tại): không cho xếp vào quá khứ. */
    minSemester: string;
    /** Khác dữ liệu đã lưu. */
    dirty: boolean;
    onToggle: (course: CourseSummary) => void;
    onPlanChange: (course: CourseSummary, semester: string | null) => void;
}

/**
 * Một môn dạng hạt (cùng kiểu với hạt môn ở trang Gợi ý lộ trình): chấm theo trạng thái + mã + TC, tên bên dưới.
 * Các vùng tách biệt:
 * - thân thẻ bấm để đổi trạng thái ngay (chỉ đổi nháp ở client);
 * - với môn chưa học: dải dưới "+ Lên kế hoạch", hoặc "− HK 262 + ×" để dời sớm/trễ hay bỏ kế hoạch;
 * - dải bên phải là link sang trang chi tiết môn (nháp vẫn giữ trong localStorage khi rời trang).
 * "Đã lên kế hoạch" không phải trạng thái lưu riêng: là môn chưa học + có học kỳ dự kiến.
 */
const CourseCard = ({
    course, status, plannedSemester, defaultSemester, minSemester, dirty, onToggle, onPlanChange,
}: CourseCardProps) => {
    const plannable = canPlan(status);
    const planned = plannable && plannedSemester !== null;
    const statusLabel = planned ? i18n.t('Đã lên kế hoạch') : status ? STUDENT_COURSE_STATUS_LABEL[status] : i18n.t('Chưa khai');
    const previous = plannedSemester ? previousSemester(plannedSemester) : null;

    return (
        <div className="course-card" data-status={planned ? 'planned' : status ?? 'none'}>
            <button
                type="button"
                className="course-card-main"
                onClick={() => onToggle(course)}
                title={i18n.t('{{code}} · {{name}} — {{statusLabel}}. Bấm để đổi trạng thái.', { code: course.code, name: course.name, statusLabel: statusLabel })}
                aria-label={i18n.t('{{code}} {{name}}, {{credits}} tín chỉ, {{statusLabel}}{{v4}}. Bấm để đổi trạng thái.', { code: course.code, name: course.name, credits: course.credits, statusLabel: statusLabel, v4: dirty ? ', chưa lưu' : '' })}
            >
                <span className="course-card-top">
                    <Bead state={planned ? 'planned' : status ?? 'none'} tone={planned ? 'brand' : undefined} />
                    <span className="course-card-code">{course.code}</span>
                    <span className="course-card-credits">{course.credits}{' '}{i18n.t('TC')}</span>
                </span>
                <span className="course-card-name">{course.name}</span>
                <span className="course-card-meta">
                    <span className="course-card-status">{statusLabel}</span>
                    {!plannable && plannedSemester && <span className="course-card-plan">{i18n.t('HK')}{' '}{plannedSemester}</span>}
                    {dirty && <Pip />}
                </span>
            </button>

            {plannable && (
                <div className="course-card-planbar">
                    {planned ? (
                        <>
                            <button
                                type="button"
                                className="course-card-planbtn"
                                disabled={!previous || previous < minSemester}
                                onClick={() => previous && onPlanChange(course, previous)}
                                aria-label={i18n.t('Dời {{code}} sớm hơn một học kỳ', { code: course.code })}
                                title={i18n.t('Sớm hơn một kỳ')}
                            >
                                <LuMinus aria-hidden />
                            </button>
                            <span className="course-card-plansem" aria-label={i18n.t('Dự kiến học kỳ {{plannedSemester}}', { plannedSemester: plannedSemester })}>{i18n.t('HK')}{' '}{plannedSemester}</span>
                            <button
                                type="button"
                                className="course-card-planbtn"
                                onClick={() => onPlanChange(course, nextSemester(plannedSemester!))}
                                aria-label={i18n.t('Dời {{code}} trễ hơn một học kỳ', { code: course.code })}
                                title={i18n.t('Trễ hơn một kỳ')}
                            >
                                <LuPlus aria-hidden />
                            </button>
                            <button
                                type="button"
                                className="course-card-planbtn course-card-planremove"
                                onClick={() => onPlanChange(course, null)}
                                aria-label={i18n.t('Bỏ {{code}} khỏi kế hoạch', { code: course.code })}
                                title={i18n.t('Bỏ khỏi kế hoạch')}
                            >
                                <LuX aria-hidden />
                            </button>
                        </>
                    ) : (
                        <button
                            type="button"
                            className="course-card-planadd"
                            onClick={() => onPlanChange(course, defaultSemester)}
                            aria-label={i18n.t('Lên kế hoạch {{code}} vào học kỳ {{defaultSemester}}', { code: course.code, defaultSemester: defaultSemester })}
                            title={i18n.t('Lên kế hoạch vào HK {{defaultSemester}}', { defaultSemester: defaultSemester })}
                        >
                            <LuPlus aria-hidden />{' '}{i18n.t('Lên kế hoạch')}
                        </button>
                    )}
                </div>
            )}

            <Link
                to={`/courses/${encodeURIComponent(course.code)}`}
                state={{ from: '/courses' }}
                className="course-card-link"
                aria-label={i18n.t('Xem chi tiết môn {{code}}', { code: course.code })}
                title={i18n.t('Xem chi tiết môn học')}
            >
                <LuArrowUpRight aria-hidden />
            </Link>
        </div>
    );
};

export default memo(CourseCard);
