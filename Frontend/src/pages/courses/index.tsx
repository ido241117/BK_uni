import { Alert } from 'antd';
import { useTranslation } from 'react-i18next';
import { Navigate, useSearchParams } from 'react-router';
import { PageHeader, PageTabs, TablePageSkeleton } from '@/components';
import { getMyProfile } from '@/apis/student';
import { useApiQuery, useCurrentRole } from '@/hooks';
import { ROLE } from '@/types';
import { AnalysisTab } from './analysis/AnalysisTab';
import CourseCatalog from './CourseCatalog';
import { MybkProgressCard, MybkUploadButton } from './components/MybkProgress';

/**
 * "Tiến độ học tập" page (ui-template/tien-do-hoc-tap-page.html).
 * - Student: header with the import button, then the tabs "Tiến độ" and "Phân tích" (the merged former
 *   analysis page and regulations page; the board is its own page, /program). The open tab is kept in `?tab=`.
 *   Old `?tab=board` links go to /program.
 * - Admin: the course catalog.
 */
const CoursesPage = () => {
    const { t } = useTranslation();
    const role = useCurrentRole();
    const [params, setParams] = useSearchParams();

    if (role !== ROLE.STUDENT) return <CourseCatalog isStudent={false} />;
    if (params.get('tab') === 'board') return <Navigate to="/program" replace />;

    const tab = params.get('tab') === 'analysis' ? 'analysis' : 'progress';
    const tabs = [
        { key: 'progress', label: t('Tiến độ'), children: <ProgressTab /> },
        { key: 'analysis', label: t('Phân tích'), children: <AnalysisTab /> },
    ];
    return (
        <section>
            <PageHeader
                title={t('Tiến độ học tập')}
                subtitle={t('Trạng thái học tập lấy từ trang "Tiến độ hoàn thành CTĐT" của myBK (file PDF hoặc nội dung trang dán vào). Nhập lại để cập nhật.')}
                extra={<MybkUploadButton />}
            />
            <PageTabs
                activeKey={tab}
                onChange={key => setParams(key === 'progress' ? {} : { tab: key }, { replace: true })}
                destroyOnHidden
                items={tabs}
            />
        </section>
    );
};

/** Progress read from the myBK file, with "Hiệu chỉnh" for what myBK does not record. */
const ProgressTab = () => {
    const { t } = useTranslation();
    const profileQuery = useApiQuery(['my-profile'], getMyProfile);
    const hasCurriculum = Boolean(profileQuery.data?.curriculum_id);

    if (profileQuery.isLoading) return <TablePageSkeleton label={t('Đang tải dữ liệu tiến độ học tập...')} />;

    return (
        <div className="stack">
            {!hasCurriculum && (
                <Alert
                    type="info"
                    showIcon
                    title={t('Chưa có chương trình đào tạo')}
                    description={t('Nhập tiến độ từ myBK (file PDF hoặc dán nội dung trang) rồi bấm Xác nhận: web nhận chương trình theo mã CTĐT.')}
                />
            )}
            <MybkProgressCard />
        </div>
    );
};

export default CoursesPage;
