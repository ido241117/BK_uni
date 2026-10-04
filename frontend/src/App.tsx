import { ConfigProvider } from 'antd';
import viVN from 'antd/locale/vi_VN';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import { AppProvider } from '@/contexts/app-context';
import AppRoutes from '@/routes';
import './styles/app.css';

dayjs.locale('vi');

export default function App() {
	return (
		<ConfigProvider
			locale={viVN}
			theme={{
				token: {
					colorPrimary: '#176b57',
					colorInfo: '#176b57',
					colorSuccess: '#38765d',
					colorWarning: '#bd6b31',
					colorError: '#b84836',
					colorTextBase: '#18221d',
					colorBgBase: '#f3f5f1',
					colorBgContainer: '#ffffff',
					colorBorder: '#dce2db',
					borderRadius: 7,
					controlHeight: 40,
					fontFamily: 'DM Sans, sans-serif',
					fontSize: 14,
				},
			}}
		>
			<AppProvider>
				<AppRoutes />
			</AppProvider>
		</ConfigProvider>
	);
}