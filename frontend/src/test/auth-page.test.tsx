import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '@/contexts/app-context';
import AuthPage from '@/pages/auth';

const { mockGet, mockPost } = vi.hoisted(() => ({
	mockGet: vi.fn(),
	mockPost: vi.fn(),
}));

vi.mock('@/apis', () => ({
	default: { get: mockGet, post: mockPost },
	unwrapApiResponse: (response: { data: { data: unknown } }) => response.data.data,
}));

function RouteProbe() {
	const location = useLocation();
	return <output>{location.pathname}</output>;
}

function renderAuth(initialMode: 'login' | 'register' = 'login') {
	return render(
		<AppProvider>
			<MemoryRouter initialEntries={[initialMode === 'register' ? '/register' : '/login']}>
				<AuthPage initialMode={initialMode} />
				<RouteProbe />
			</MemoryRouter>
		</AppProvider>,
	);
}

describe('AuthPage', () => {
	afterEach(() => cleanup());

	beforeEach(() => {
		mockGet.mockReset().mockResolvedValue({});
		mockPost.mockReset();
	});

	it('submits credentials and enters the authenticated workspace', async () => {
		mockPost.mockResolvedValue({
			data: {
				data: {
					user: { id: 'user-1', email: 'student@example.test', role: 'student' },
					profile: { id: 'profile-1', displayName: null, curriculumId: null },
				},
			},
		});
		renderAuth();

		fireEvent.change(screen.getByPlaceholderText('ten@email.edu.vn'), {
			target: { value: 'student@example.test' },
		});
		fireEvent.change(screen.getByPlaceholderText('Tối thiểu 8 ký tự'), {
			target: { value: 'correct-horse' },
		});
		fireEvent.click(screen.getByRole('button', { name: /Đăng nhập/ }));

		await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/auth/login', {
			email: 'student@example.test',
			password: 'correct-horse',
		}));
		expect(mockGet).toHaveBeenCalledWith('/auth/csrf');
		await waitFor(() => expect(screen.getByText('/student')).toBeInTheDocument());
	});

	it('shows API errors and keeps the entered email', async () => {
		mockPost.mockRejectedValue({
			response: { data: { message: 'Email hoặc mật khẩu không chính xác.' } },
		});
		renderAuth();

		const emailInput = screen.getByPlaceholderText('ten@email.edu.vn');
		fireEvent.change(emailInput, { target: { value: 'student@example.test' } });
		fireEvent.change(screen.getByPlaceholderText('Tối thiểu 8 ký tự'), {
			target: { value: 'wrong-pass' },
		});
		fireEvent.click(screen.getByRole('button', { name: /Đăng nhập/ }));

		await waitFor(() => expect(mockPost).toHaveBeenCalled());
		expect(emailInput).toHaveValue('student@example.test');
		expect(await screen.findByText('Email hoặc mật khẩu không chính xác.')).toBeInTheDocument();
	});

	it('registers a student through the public registration endpoint', async () => {
		mockPost.mockResolvedValue({
			data: {
				data: {
					user: { id: 'user-2', email: 'new@example.test', role: 'student' },
					profile: { id: 'profile-2', displayName: null, curriculumId: null },
				},
			},
		});
		renderAuth('register');

		fireEvent.change(screen.getByPlaceholderText('ten@email.edu.vn'), {
			target: { value: 'new@example.test' },
		});
		fireEvent.change(screen.getByPlaceholderText('Tối thiểu 8 ký tự'), {
			target: { value: 'new-password' },
		});
		fireEvent.click(screen.getByRole('button', { name: /Tạo tài khoản/ }));

		await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/auth/register', {
			email: 'new@example.test',
			password: 'new-password',
		}));
		await waitFor(() => expect(screen.getByText('/student')).toBeInTheDocument());
	});
});
