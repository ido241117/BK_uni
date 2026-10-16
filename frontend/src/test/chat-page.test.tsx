import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChatPage from '@/pages/chat';

const { studentApi } = vi.hoisted(() => ({
	studentApi: {
		listConversations: vi.fn(),
		conversation: vi.fn(),
		createConversation: vi.fn(),
		sendConversationTurn: vi.fn(),
		deleteConversation: vi.fn(),
	},
}));

vi.mock('@/apis', () => ({ studentApi }));

const conversation = {
	id: 'conversation-a',
	createdAt: '2026-10-16T10:00:00.000Z',
	updatedAt: '2026-10-16T10:00:00.000Z',
};

const userMessage = {
	id: 'message-user',
	role: 'user' as const,
	content: 'Gợi ý học kỳ tiếp theo.',
	status: null,
	recommendation: null,
	createdAt: '2026-10-16T10:00:00.000Z',
};

const assistantMessage = {
	id: 'message-assistant',
	role: 'assistant' as const,
	content: 'Dựa trên kết quả hệ thống, đây là gợi ý học kỳ.',
	status: 'completed' as const,
	recommendation: null,
	createdAt: '2026-10-16T10:00:03.000Z',
};

describe('ChatPage', () => {
	afterEach(() => cleanup());

	beforeEach(() => {
		studentApi.listConversations.mockReset().mockResolvedValue({
			items: [conversation],
			page: { limit: 20, offset: 0, total: 1 },
		});
		studentApi.conversation.mockReset().mockResolvedValue({
			...conversation,
			messages: [userMessage, assistantMessage],
		});
		studentApi.createConversation.mockReset().mockResolvedValue({
			...conversation,
			messages: [],
		});
		studentApi.sendConversationTurn.mockReset().mockResolvedValue({
			conversation: { ...conversation, updatedAt: '2026-10-16T10:01:00.000Z' },
			userMessage: { ...userMessage, id: 'message-user-new' },
			assistantMessage: { ...assistantMessage, id: 'message-assistant-new' },
		});
		studentApi.deleteConversation.mockReset().mockResolvedValue(undefined);
	});

	it('loads the conversation list and selected transcript', async () => {
		render(<ChatPage />);

		expect(await screen.findByText('Dựa trên kết quả hệ thống, đây là gợi ý học kỳ.')).toBeInTheDocument();
		expect(studentApi.listConversations).toHaveBeenCalledWith();
		expect(studentApi.conversation).toHaveBeenCalledWith('conversation-a');
	});

	it('sends a turn and renders the returned assistant answer', async () => {
		render(<ChatPage />);
		await screen.findByText('Dựa trên kết quả hệ thống, đây là gợi ý học kỳ.');
		const composer = screen.getByRole('textbox', { name: 'Câu hỏi' });
		fireEvent.change(composer, { target: { value: 'Môn nào nên học?' } });
		fireEvent.click(screen.getByRole('button', { name: 'Gửi câu hỏi' }));

		expect(await screen.findByText('Môn nào nên học?')).toBeInTheDocument();
		expect(await screen.findAllByText('Dựa trên kết quả hệ thống, đây là gợi ý học kỳ.')).toHaveLength(2);
		expect(studentApi.sendConversationTurn).toHaveBeenCalledWith(
			'conversation-a',
			'Môn nào nên học?',
		);
		await waitFor(() => expect(composer).toHaveValue(''));
	});

	it('shows clarification state from the transcript', async () => {
		studentApi.conversation.mockResolvedValue({
			...conversation,
			messages: [
				userMessage,
				{
					...assistantMessage,
					status: 'clarification',
					content: 'Bạn đang muốn hỏi kỳ học nào?',
				},
			],
		});
		render(<ChatPage />);

		expect(await screen.findByText('Bạn đang muốn hỏi kỳ học nào?')).toBeInTheDocument();
		expect(screen.getByText('Cần làm rõ')).toBeInTheDocument();
	});

	it('preserves the draft and shows a retryable error when sending fails', async () => {
		studentApi.sendConversationTurn.mockRejectedValue({
			isAxiosError: true,
			response: { status: 502, data: { code: 'AGENT_UNAVAILABLE' } },
		});
		render(<ChatPage />);
		await screen.findByText('Dựa trên kết quả hệ thống, đây là gợi ý học kỳ.');
		const composer = screen.getByRole('textbox', { name: 'Câu hỏi' });
		fireEvent.change(composer, { target: { value: 'Giữ câu hỏi này' } });
		fireEvent.click(screen.getByRole('button', { name: 'Gửi câu hỏi' }));

		expect(await screen.findByText(/Trợ lý hiện chưa sẵn sàng/)).toBeInTheDocument();
		expect(composer).toHaveValue('Giữ câu hỏi này');
	});

	it('deletes a conversation after confirmation', async () => {
		render(<ChatPage />);
		await screen.findByText('Dựa trên kết quả hệ thống, đây là gợi ý học kỳ.');
		fireEvent.click(screen.getByRole('button', { name: 'Xóa hội thoại' }));
		fireEvent.click(await screen.findByRole('button', { name: 'Xóa' }));

		await waitFor(() => expect(studentApi.deleteConversation).toHaveBeenCalledWith('conversation-a'));
		expect(screen.queryByText('Dựa trên kết quả hệ thống, đây là gợi ý học kỳ.')).not.toBeInTheDocument();
	});
});