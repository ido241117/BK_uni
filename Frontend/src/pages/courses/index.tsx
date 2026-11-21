import { TablePageSkeleton } from '@/components';
import { getMyProfile } from '@/apis/student';
import { useApiQuery, useCurrentRole, useCurrentUser } from '@/hooks';
import { ROLE } from '@/types';
import CurriculumBoard from './board/CurriculumBoard';
import CourseCatalog from './CourseCatalog';

/**
 * Trang môn học.
 * - Sinh viên đã chọn chương trình: toàn bộ chương trình dạng thẻ, bấm để đổi trạng thái (lưu nháp, ghi khi bấm Lưu).
 * - Sinh viên chưa chọn chương trình và admin: tra cứu danh mục môn.
 */
const CoursesPage = () => {
    const role = useCurrentRole();
    const user = useCurrentUser();
    const isStudent = role === ROLE.STUDENT;
    const profileQuery = useApiQuery(['my-profile'], getMyProfile, { enabled: isStudent });
    const curriculumId = profileQuery.data?.curriculum_id ?? null;

    if (isStudent && profileQuery.isLoading) return <TablePageSkeleton />;

    if (isStudent && curriculumId && user) {
        // key: đổi chương trình thì nạp bản nháp riêng của chương trình đó.
        return <CurriculumBoard key={curriculumId} userId={user.id} curriculumId={curriculumId} />;
    }
    return <CourseCatalog isStudent={isStudent} />;
};

export default CoursesPage;
