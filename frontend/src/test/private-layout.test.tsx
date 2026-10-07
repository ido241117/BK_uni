import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { AppProvider } from '@/contexts/app-context';
import PrivateLayout from '@/layouts/private';

const { apiClient } = vi.hoisted(() => ({
	apiClient: {
		get: vi.fn(),
		post: vi.fn(),
	},
}));

vi.mock('@/apis', () => ({
	default: apiClient,
	unwrapApiResponse: (response: { data: { data: unknown } }) => response.data.data,
}));

describe('PrivateLayout', () => {
	afterEach(() => cleanup());

	beforeEach(() => {
		apiClient.get.mockReset().mockImplementation(async (path: string) =>
			path === '/me'
				? { data: { data: { id: 'admin-a', email: 'admin@example.test', role: 'admin' } } }
				: {},
		);
		apiClient.post.mockReset().mockResolvedValue({});
	});

	it('navigates to login after logging out an admin', async () => {
		const router = createMemoryRouter([
			{
				path: '/',
				element: <PrivateLayout />,
				children: [
					{ path: 'admin', element: <div>Admin workspace</div> },
					{ path: 'student', element: <div>Student workspace</div> },
				],
			},
			{ path: '/login', element: <div>Login form</div> },
		], { initialEntries: ['/admin'] });
		render(
			<AppProvider>
				<RouterProvider router={router} />
			</AppProvider>,
		);

		fireEvent.click(await screen.findByRole('button', { name: /admin@example.test/ }));
		fireEvent.click(await screen.findByText('Đăng xuất'));

		expect(await screen.findByText('Login form')).toBeInTheDocument();
		expect(screen.queryByText('BK Uni · Đang xác thực phiên')).not.toBeInTheDocument();
	});
});