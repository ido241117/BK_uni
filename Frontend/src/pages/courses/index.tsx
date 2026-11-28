import { Alert, Space } from 'antd';
import { PageHeader, TablePageSkeleton } from '@/components';
import { getMyProfile } from '@/apis/student';
import { useApiQuery, useCurrentRole } from '@/hooks';
import { ROLE } from '@/types';
import CourseCatalog from './CourseCatalog';
import { MybkProgressCard, MybkUploadButton } from './components/MybkProgress';

/**
 * Trang Môn học.
 * - Sinh viên: tiến độ đọc từ PDF myBK + Hiệu chỉnh. Mã môn trong bảng là link tới `/courses/:code`.
 *   (28/11: đã gỡ tab "Chương trình" (bảng thẻ, sơ đồ điều kiện) và trang `/courses/analysis`.)
 * - Quản trị: `CourseCatalog` tra cứu danh mục môn.
 */
const CoursesPage = () => {
    const role = useCurrentRole();
    return role === ROLE.STUDENT ? <MybkTab /> : <CourseCatalog />;
};

/** Tiến độ đọc từ PDF myBK (người duyệt 21/11 bỏ hàng thống kê, bảng tóm tắt theo kỳ và bảng môn bên dưới). */
const MybkTab = () => {
    const profileQuery = useApiQuery(['my-profile'], getMyProfile);
    const hasCurriculum = Boolean(profileQuery.data?.curriculum_id);

    if (profileQuery.isLoading) return <TablePageSkeleton />;

    return (
        <section>
            <PageHeader
                title="Môn học & kế hoạch"
                subtitle='Trạng thái học tập lấy từ trang "Tiến độ hoàn thành CTĐT" của myBK (file PDF hoặc nội dung trang dán vào). Nhập lại để cập nhật.'
                extra={(
                    <Space wrap>
                        <MybkUploadButton />
                    </Space>
                )}
            />

            <div className="stack">
                {!hasCurriculum && (
                    <Alert
                        type="info"
                        showIcon
                        title="Chưa có chương trình đào tạo"
                        description='Nhập tiến độ từ myBK (file PDF hoặc dán nội dung trang) rồi bấm Xác nhận: web nhận chương trình theo mã CTĐT.'
                        action={<MybkUploadButton />}
                    />
                )}

                <MybkProgressCard />
            </div>
        </section>
    );
};

export default CoursesPage;
