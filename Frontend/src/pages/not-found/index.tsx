import { Button } from 'antd';
import { PiArrowLeft, PiHouse } from 'react-icons/pi';
import { useNavigate } from 'react-router';
import { EmptyState } from '@/components';
import i18n from '@/i18n';

const NotFoundPage = () => {
    const navigate = useNavigate();

    return (
        <EmptyState
            size="page"
            illustration="error"
            title={i18n.t('Không tìm thấy trang')}
            description={i18n.t('Đường dẫn này không tồn tại hoặc đã đổi.')}
            action={(
                <>
                    <Button icon={<PiArrowLeft />} onClick={() => navigate(-1)}>{i18n.t('Quay lại')}</Button>
                    <Button type="primary" icon={<PiHouse />} onClick={() => navigate('/')}>{i18n.t('Về trang chủ')}</Button>
                </>
            )}
        />
    );
};

export default NotFoundPage;
