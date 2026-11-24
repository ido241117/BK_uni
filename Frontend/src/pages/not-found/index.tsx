import { Button } from 'antd';
import { PiArrowLeft, PiHouse } from 'react-icons/pi';
import { useNavigate } from 'react-router';
import { EmptyState } from '@/components';

const NotFoundPage = () => {
    const navigate = useNavigate();

    return (
        <EmptyState
            size="page"
            illustration="error"
            title="Không tìm thấy trang"
            description="Đường dẫn này không tồn tại hoặc đã đổi."
            action={(
                <>
                    <Button icon={<PiArrowLeft />} onClick={() => navigate(-1)}>Quay lại</Button>
                    <Button type="primary" icon={<PiHouse />} onClick={() => navigate('/')}>Về trang chủ</Button>
                </>
            )}
        />
    );
};

export default NotFoundPage;
