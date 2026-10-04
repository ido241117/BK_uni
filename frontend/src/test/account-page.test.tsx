import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '@/contexts/app-context';
import AccountPage from '@/pages/account';

const { mockGet, mockPut } = vi.hoisted(() => ({
	mockGet: vi.fn(),
	mockPut: vi.fn(),
}));

vi.mock('@/apis', () => ({
	default: { get: mockGet, put: mockPut },
}));

describe('AccountPage', () => {
	afterEach(() => cleanup());

	beforeEach(() => {
		mockGet.mockReset().mockResolvedValue({});
		mockPut.mockReset().mockResolvedValue({});
	});

	it('updates the password through the authenticated API', async () => {
		render(
			<AppProvider>
				<AccountPage />
			</AppProvider>,
		);

		fireEvent.change(screen.getByLabelText('Mật khẩu mới'), {
			target: { value: 'new-password' },
		});
		fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu mới'), {
			target: { value: 'new-password' },
		});
		fireEvent.click(screen.getByRole('button', { name: /Lưu mật khẩu mới/ }));

		await waitFor(() =>
			expect(mockPut).toHaveBeenCalledWith('/me/password', {
				newPassword: 'new-password',
			}),
		);
		expect(mockGet).toHaveBeenCalledWith('/auth/csrf');
		expect(await screen.findByText(/Mật khẩu đã được cập nhật/)).toBeInTheDocument();
	});
});
