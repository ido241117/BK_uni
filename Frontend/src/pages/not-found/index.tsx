import { Button, Result } from 'antd';
import { Link } from 'react-router';

const NotFoundPage = () => (
    <Result
        status="404"
        title="Không tìm thấy trang"
        subTitle="Trang bạn tìm không tồn tại."
        extra={<Link to="/"><Button type="primary">Về trang chủ</Button></Link>}
    />
);

export default NotFoundPage;
