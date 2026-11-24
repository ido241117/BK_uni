import { Alert, Space, Tabs } from 'antd';
import { useSearchParams } from 'react-router';
import { PageHeader, TablePageSkeleton } from '@/components';
import { getMyProfile } from '@/apis/student';
import { useApiQuery, useCurrentRole, useCurrentUser } from '@/hooks';
import { ROLE } from '@/types';
import CurriculumBoard from './board/CurriculumBoard';
import CourseCatalog from './CourseCatalog';
import { MybkProgressCard, MybkUploadButton } from './components/MybkProgress';

/**
 * Trang Môn học.
 * - Sinh viên: hai tab (22/11, người duyệt sửa dần từng trang):
 *   - "Tiến độ myBK": phần tiến độ đọc từ PDF myBK + Hiệu chỉnh (nhánh feature/goi-y-hoc-phan).
 *   - "Chương trình": trang của nhánh main giữ nguyên (bảng thẻ `CurriculumBoard` có tab "Sơ đồ điều kiện";
 *     chưa chọn chương trình thì `CourseCatalog`).
 * - Quản trị: `CourseCatalog` của nhánh main.
 * Tab đang mở lưu ở `?tab=` để tải lại trang không mất.
 */
const CoursesPage = () => {
    const role = useCurrentRole();
    const isStudent = role === ROLE.STUDENT;
    const [params, setParams] = useSearchParams();

    if (!isStudent) return <CourseCatalog isStudent={false} />;

    const tab = params.get('tab') === 'board' ? 'board' : 'mybk';
    return (
        <Tabs
            activeKey={tab}
            onChange={key => setParams(key === 'mybk' ? {} : { tab: key }, { replace: true })}
            destroyOnHidden
            items={[
                { key: 'mybk', label: 'Tiến độ myBK', children: <MybkTab /> },
                { key: 'board', label: 'Chương trình', children: <MainBoardTab /> },
            ]}
        />
    );
};

/** Trang Môn học của nhánh main, giữ nguyên (người duyệt 22/11). */
const MainBoardTab = () => {
    const user = useCurrentUser();
    const profileQuery = useApiQuery(['my-profile'], getMyProfile);
    const curriculumId = profileQuery.data?.curriculum_id ?? null;

    if (profileQuery.isLoading) return <TablePageSkeleton />;
    if (curriculumId && user) {
        // key: đổi chương trình thì nạp bản nháp riêng của chương trình đó.
        return <CurriculumBoard key={curriculumId} userId={user.id} curriculumId={curriculumId} />;
    }
    return <CourseCatalog isStudent />;
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
                        {/*
                          Người duyệt 22/11: tạm ẩn nút Phân tích (file PDF tiến độ myBK đã là phần phân tích tốt nhất;
                          chưa rõ vai trò cho sinh viên). Trang /courses/analysis vẫn còn; bật lại thì thêm lại import
                          Link (react-router), IOutLinedBtn (@/components), LuChartColumn (react-icons/lu).
                          {hasCurriculum && (
                              <Link to="/courses/analysis">
                                  <IOutLinedBtn icon={<LuChartColumn />}>Phân tích</IOutLinedBtn>
                              </Link>
                          )}
                        */}
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
