import { memo } from 'react';
import { LuArrowUpRight, LuMinus, LuPlus, LuX } from 'react-icons/lu';
import { Link } from 'react-router';
import { STUDENT_COURSE_STATUS_LABEL, type CourseSummary, type StudentCourseStatus } from '@/types';
import { nextSemester, previousSemester } from '../analysis/semester';
import { canPlan } from './structure';

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
 * Thẻ một môn, các vùng tách biệt:
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
    const statusLabel = planned ? 'Đã lên kế hoạch' : status ? STUDENT_COURSE_STATUS_LABEL[status] : 'Chưa khai';
    const previous = plannedSemester ? previousSemester(plannedSemester) : null;

    return (
        <div className="course-card" data-status={planned ? 'planned' : status ?? 'none'}>
            <button
                type="button"
                className="course-card-main"
                onClick={() => onToggle(course)}
                title={`${course.code} · ${course.name} — ${statusLabel}. Bấm để đổi trạng thái.`}
                aria-label={`${course.code} ${course.name}, ${course.credits} tín chỉ, ${statusLabel}${dirty ? ', chưa lưu' : ''}. Bấm để đổi trạng thái.`}
            >
                <span className="course-card-top">
                    <span className="course-card-code">{course.code}</span>
                    <span className="course-card-credits">{course.credits} TC</span>
                </span>
                <span className="course-card-name">{course.name}</span>
                <span className="course-card-meta">
                    <span className="course-card-status">{statusLabel}</span>
                    {!plannable && plannedSemester && <span className="course-card-plan">HK {plannedSemester}</span>}
                    {dirty && <span className="course-card-dirty" aria-hidden>●</span>}
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
                                aria-label={`Dời ${course.code} sớm hơn một học kỳ`}
                                title="Sớm hơn một kỳ"
                            >
                                <LuMinus aria-hidden />
                            </button>
                            <span className="course-card-plansem" aria-label={`Dự kiến học kỳ ${plannedSemester}`}>HK {plannedSemester}</span>
                            <button
                                type="button"
                                className="course-card-planbtn"
                                onClick={() => onPlanChange(course, nextSemester(plannedSemester!))}
                                aria-label={`Dời ${course.code} trễ hơn một học kỳ`}
                                title="Trễ hơn một kỳ"
                            >
                                <LuPlus aria-hidden />
                            </button>
                            <button
                                type="button"
                                className="course-card-planbtn course-card-planremove"
                                onClick={() => onPlanChange(course, null)}
                                aria-label={`Bỏ ${course.code} khỏi kế hoạch`}
                                title="Bỏ khỏi kế hoạch"
                            >
                                <LuX aria-hidden />
                            </button>
                        </>
                    ) : (
                        <button
                            type="button"
                            className="course-card-planadd"
                            onClick={() => onPlanChange(course, defaultSemester)}
                            aria-label={`Lên kế hoạch ${course.code} vào học kỳ ${defaultSemester}`}
                            title={`Lên kế hoạch vào HK ${defaultSemester}`}
                        >
                            <LuPlus aria-hidden /> Lên kế hoạch
                        </button>
                    )}
                </div>
            )}

            <Link
                to={`/courses/${encodeURIComponent(course.code)}`}
                state={{ from: '/courses' }}
                className="course-card-link"
                aria-label={`Xem chi tiết môn ${course.code}`}
                title="Xem chi tiết môn học"
            >
                <LuArrowUpRight aria-hidden />
            </Link>
        </div>
    );
};

export default memo(CourseCard);
