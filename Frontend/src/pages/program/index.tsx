import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { EmptyState, ISolidBtn, PageHeader, PageLoading } from '@/components';
import { getCurriculum } from '@/apis/curriculum';
import { getMyProfile } from '@/apis/student';
import { useApiQuery, useCurrentUser } from '@/hooks';
import CurriculumBoard from '@/pages/courses/board/CurriculumBoard';

/**
 * "Chương trình" page: the editable curriculum board of the student's curriculum (moved out of the
 * "Phân tích" tab of Tiến độ học tập). Saving refreshes the analysis there through the shared queries.
 */
const ProgramPage = () => {
    const { t } = useTranslation();
    const user = useCurrentUser();
    const profileQuery = useApiQuery(['my-profile'], getMyProfile);
    const curriculumId = profileQuery.data?.curriculum_id ?? undefined;
    const curriculumQuery = useApiQuery(['curriculum', curriculumId], () => getCurriculum(curriculumId!), { enabled: Boolean(curriculumId) });
    const curriculum = curriculumQuery.data;

    return (
        <section>
            <PageHeader
                title={curriculum ? t('Chương trình {{code}}', { code: curriculum.code }) : t('Chương trình')}
                subtitle={t('Bấm vào thẻ môn để đổi trạng thái ngay. Thay đổi được giữ tạm trên trình duyệt và chỉ lưu khi bạn bấm “Lưu”.')}
            />
            {profileQuery.isLoading ? (
                <PageLoading label={t('Đang tải chương trình...')} />
            ) : !curriculumId ? (
                <EmptyState
                    size="panel"
                    title={t('Chưa chọn chương trình đào tạo')}
                    description={t('Hãy nhập tiến độ từ myBK hoặc chọn chương trình trong hồ sơ trước.')}
                    action={<Link to="/profile"><ISolidBtn size="small">{t('Mở hồ sơ')}</ISolidBtn></Link>}
                />
            ) : (
                user && <CurriculumBoard key={curriculumId} userId={user.id} curriculumId={curriculumId} />
            )}
        </section>
    );
};

export default ProgramPage;
