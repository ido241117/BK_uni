import { Component, type ReactNode } from 'react';
import { Button, Result } from 'antd';

interface ErrorBoundaryProps {
    children: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
}

/** Chặn crash toàn app: hiển thị màn hình lỗi thay vì trang trắng. */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { hasError: false };

    static getDerivedStateFromError(): ErrorBoundaryState {
        return { hasError: true };
    }

    componentDidCatch(error: Error) {
        console.error('[ErrorBoundary]', error);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 16 }}>
                    <Result
                        status="500"
                        title="Đã xảy ra lỗi giao diện"
                        subTitle="Vui lòng tải lại trang. Nếu lỗi tiếp tục, hãy liên hệ quản trị hệ thống."
                        extra={(
                            <Button type="primary" onClick={() => window.location.reload()}>
                                Tải lại trang
                            </Button>
                        )}
                    />
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
