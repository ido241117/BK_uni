import { useEffect, useMemo } from 'react';
import { Alert, Card, DatePicker, Descriptions, Form, Input, InputNumber, Select, Typography } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { LuCalendarRange } from 'react-icons/lu';
import { Link } from 'react-router';
import { FormField, IOutLinedBtn, ISolidBtn, PageHeader, TablePageSkeleton } from '@/components';
import { listCurricula } from '@/apis/curriculum';
import { getMyProfile, saveMyProfile } from '@/apis/student';
import { useApiMutation, useApiQuery, useCurrentUser } from '@/hooks';
import { ROLE_LABEL, type StudentProfile, type StudentProfilePayload } from '@/types';

const { Paragraph, Text } = Typography;

interface ProfileFormValues {
    full_name?: string;
    student_number?: string;
    phone?: string;
    birth_date?: Dayjs | null;
    admission_year?: number | null;
    address?: string;
    curriculum_id?: string | null;
    credit_target?: number | null;
}

/** Chuỗi trắng ⇒ `null` để backend xoá giá trị (API-FRONTEND.md 5.7). */
const textOrNull = (value?: string): string | null => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
};

const toFormValues = (profile: StudentProfile | null): ProfileFormValues => ({
    full_name: profile?.full_name ?? undefined,
    student_number: profile?.student_number ?? undefined,
    phone: profile?.phone ?? undefined,
    birth_date: profile?.birth_date ? dayjs(profile.birth_date) : null,
    admission_year: profile?.admission_year ?? undefined,
    address: profile?.address ?? undefined,
    curriculum_id: profile?.curriculum_id ?? undefined,
    credit_target: profile?.credit_target ?? undefined,
});

const toPayload = (values: ProfileFormValues): StudentProfilePayload => ({
    full_name: textOrNull(values.full_name),
    student_number: textOrNull(values.student_number),
    phone: textOrNull(values.phone),
    birth_date: values.birth_date ? values.birth_date.format('YYYY-MM-DD') : null,
    admission_year: values.admission_year ?? null,
    address: textOrNull(values.address),
    curriculum_id: values.curriculum_id ?? null,
    credit_target: values.credit_target ?? null,
});

const ProfilePage = () => {
    const user = useCurrentUser();
    const queryClient = useQueryClient();
    const [form] = Form.useForm<ProfileFormValues>();

    const profileQuery = useApiQuery(['my-profile'], getMyProfile);
    const curriculaQuery = useApiQuery(['curricula', 'profile-options'], () => listCurricula({ take: 100 }));

    const profile = profileQuery.data ?? null;

    const curricula = curriculaQuery.data?.items;
    const curriculumOptions = useMemo(
        () => (curricula ?? []).map(item => ({ value: item.id, label: `${item.code} · ${item.name}` })),
        [curricula],
    );
    const currentCurriculum = useMemo(
        () => (curricula ?? []).find(item => item.id === profile?.curriculum_id),
        [curricula, profile?.curriculum_id],
    );

    // Nạp lại form khi hồ sơ về (kể cả `null` ⇒ form trống) và sau mỗi lần lưu.
    // `resetFields` trước để trường đã xoá trên server về đúng trạng thái rỗng.
    useEffect(() => {
        if (!profileQuery.isSuccess) return;
        form.resetFields();
        form.setFieldsValue(toFormValues(profile));
    }, [form, profile, profileQuery.isSuccess]);

    const saveProfile = useApiMutation<StudentProfile, StudentProfilePayload>({
        mutationFn: payload => saveMyProfile(payload),
        successMessage: 'Đã lưu hồ sơ sinh viên.',
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-profile'] }),
    });

    if (profileQuery.isLoading) {
        return <TablePageSkeleton rows={5} />;
    }

    return (
        <section>
            <PageHeader
                title="Hồ sơ cá nhân"
                subtitle="Cập nhật thông tin sinh viên và chương trình đào tạo đang theo học."
                extra={(
                    <Link to="/courses">
                        <IOutLinedBtn icon={<LuCalendarRange />}>Môn học & kế hoạch</IOutLinedBtn>
                    </Link>
                )}
            />

            <div className="stack">
                <Card title="Tài khoản đăng nhập">
                    <Descriptions column={{ xs: 1, sm: 2 }} size="middle">
                        <Descriptions.Item label="Email">
                            <Text strong>{user?.email ?? '—'}</Text>
                        </Descriptions.Item>
                        <Descriptions.Item label="Vai trò">
                            {user ? ROLE_LABEL[user.role] : '—'}
                        </Descriptions.Item>
                    </Descriptions>
                    <Paragraph type="secondary" style={{ margin: '12px 0 0' }}>
                        Email dùng để đăng nhập và chưa đổi được ở phiên bản này.
                    </Paragraph>
                </Card>

                {profileQuery.isError && (
                    <Alert
                        type="error"
                        showIcon
                        title="Không tải được hồ sơ"
                        description="Vui lòng tải lại trang để thử lại."
                    />
                )}

                {!profile && !profileQuery.isError && (
                    <Alert
                        type="info"
                        showIcon
                        title="Bạn chưa tạo hồ sơ, điền và lưu để tạo mới"
                        description="Hồ sơ giúp hệ thống biết chương trình đào tạo của bạn để lập kế hoạch học tập."
                    />
                )}

                <Card title={profile ? 'Thông tin sinh viên' : 'Tạo hồ sơ sinh viên'}>
                    <Form<ProfileFormValues>
                        form={form}
                        layout="vertical"
                        requiredMark={false}
                        onFinish={values => saveProfile.mutate(toPayload(values))}
                    >
                        <div className="stack">
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                                    gap: 16,
                                }}
                            >
                                <FormField
                                    name="full_name"
                                    label="Họ và tên"
                                    placeholder="Nguyễn Minh Anh"
                                    hint="Ghi đúng như trên giấy tờ."
                                />

                                <FormField
                                    name="student_number"
                                    label="Mã số sinh viên"
                                    placeholder="2312345"
                                    hint="Mã số không được trùng với sinh viên khác."
                                />

                                <FormField
                                    name="phone"
                                    label="Số điện thoại"
                                    placeholder="0901234567"
                                    inputProps={{ inputMode: 'tel', maxLength: 20 }}
                                />

                                <Form.Item name="birth_date" label="Ngày sinh">
                                    <DatePicker
                                        size="large"
                                        format="DD/MM/YYYY"
                                        placeholder="Chọn ngày sinh"
                                        style={{ width: '100%' }}
                                        disabledDate={date => date.isAfter(dayjs(), 'day')}
                                    />
                                </Form.Item>

                                <Form.Item name="admission_year" label="Năm nhập học">
                                    <InputNumber
                                        size="large"
                                        min={1950}
                                        max={2100}
                                        precision={0}
                                        placeholder="2023"
                                        style={{ width: '100%' }}
                                    />
                                </Form.Item>

                                <Form.Item name="credit_target" label="Mục tiêu tín chỉ">
                                    <InputNumber
                                        size="large"
                                        min={0}
                                        max={300}
                                        precision={0}
                                        placeholder="18"
                                        style={{ width: '100%' }}
                                    />
                                </Form.Item>

                                <Form.Item
                                    name="curriculum_id"
                                    label="Chương trình đào tạo"
                                    extra="Dùng làm chương trình mặc định ở trang Kế hoạch học tập."
                                >
                                    <Select
                                        size="large"
                                        allowClear
                                        showSearch
                                        optionFilterProp="label"
                                        placeholder="Chọn chương trình đào tạo"
                                        loading={curriculaQuery.isLoading}
                                        options={curriculumOptions}
                                        style={{ width: '100%' }}
                                    />
                                </Form.Item>
                            </div>

                            <Form.Item name="address" label="Địa chỉ liên hệ">
                                <Input.TextArea
                                    autoSize={{ minRows: 2, maxRows: 4 }}
                                    placeholder="Phường 14, Quận 10, TP. Hồ Chí Minh"
                                />
                            </Form.Item>

                            <div>
                                <ISolidBtn htmlType="submit" loading={saveProfile.isPending}>
                                    {profile ? 'Lưu thay đổi' : 'Tạo hồ sơ'}
                                </ISolidBtn>

                                {profile && (
                                    <p className="hint" style={{ margin: '8px 0 0' }}>
                                        Cập nhật lần cuối: {new Date(profile.updated_at).toLocaleString('vi-VN')}
                                    </p>
                                )}
                            </div>
                        </div>
                    </Form>
                </Card>

                <Card
                    title="Chương trình đang theo học"
                    extra={(
                        <Link to="/courses">
                            <IOutLinedBtn size="small">Lập kế hoạch học tập</IOutLinedBtn>
                        </Link>
                    )}
                >
                    {currentCurriculum ? (
                        <Descriptions column={{ xs: 1, sm: 2 }} size="middle">
                            <Descriptions.Item label="Mã chương trình">
                                <Text strong>{currentCurriculum.code}</Text>
                            </Descriptions.Item>
                            <Descriptions.Item label="Tên chương trình">{currentCurriculum.name}</Descriptions.Item>
                            <Descriptions.Item label="Ngành">{currentCurriculum.major}</Descriptions.Item>
                            <Descriptions.Item label="Khoa">{currentCurriculum.faculty}</Descriptions.Item>
                            <Descriptions.Item label="Khóa">{currentCurriculum.cohort}</Descriptions.Item>
                            <Descriptions.Item label="Tín chỉ mỗi học kỳ">
                                {`${currentCurriculum.min_semester_credits} – ${currentCurriculum.max_semester_credits} TC`}
                            </Descriptions.Item>
                        </Descriptions>
                    ) : (
                        <Paragraph type="secondary" style={{ margin: 0 }}>
                            {profile?.curriculum_id
                                ? 'Chương trình trong hồ sơ không còn trong danh sách — hãy chọn lại ở mục Thông tin sinh viên.'
                                : 'Bạn chưa chọn chương trình đào tạo. Chọn ở mục Thông tin sinh viên để lập kế hoạch học tập.'}
                        </Paragraph>
                    )}
                </Card>
            </div>
        </section>
    );
};

export default ProfilePage;
