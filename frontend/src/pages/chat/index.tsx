import {
	DeleteOutlined,
	MessageOutlined,
	PlusOutlined,
	SendOutlined,
} from '@ant-design/icons';
import { Alert, Button, Empty, Input, Popconfirm, Spin, Tag } from 'antd';
import { isAxiosError } from 'axios';
import { useEffect, useRef, useState } from 'react';
import { studentApi } from '@/apis';
import type {
	ConversationDetail,
	ConversationMessage,
	ConversationSummary,
	ConversationTurnResponse,
} from '@/types';
import './chat.css';

const { TextArea } = Input;

function formatDate(value: string) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return '';
	return new Intl.DateTimeFormat('vi-VN', {
		day: '2-digit',
		month: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
	}).format(date);
}

function errorMessage(error: unknown) {
	const code = isAxiosError(error)
		? (error.response?.data as { code?: string } | undefined)?.code
		: undefined;
	if (code === 'AGENT_TIMEOUT') return 'Trợ lý phản hồi quá thời gian. Nội dung vẫn được giữ để bạn thử lại.';
	if (code === 'AGENT_UNAVAILABLE') return 'Trợ lý hiện chưa sẵn sàng. Nội dung vẫn được giữ để bạn thử lại.';
	if (code === 'RATE_LIMIT_EXCEEDED') return 'Bạn gửi câu hỏi quá nhanh. Hãy thử lại sau ít phút.';
	if (code === 'CONVERSATION_BUSY') return 'Cuộc trò chuyện đang xử lý một lượt khác.';
	return 'Không thể tải hoặc gửi hội thoại lúc này.';
}

function sortConversations(items: ConversationSummary[]) {
	return [...items].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function MessageBody({ message }: { message: ConversationMessage }) {
	if (message.status === 'failed') {
		return <p className="chat-failed-copy">Lượt này chưa hoàn tất. Nội dung câu hỏi vẫn được lưu.</p>;
	}
	return (
		<>
			{message.content ? <p className="chat-message-copy">{message.content}</p> : null}
			{message.status === 'clarification' ? <Tag color="orange">Cần làm rõ</Tag> : null}
			{message.status === 'out_of_scope' ? <Tag>Ngoài phạm vi</Tag> : null}
			{message.recommendation ? (
				<section className="chat-recommendation" aria-label="Căn cứ gợi ý">
					<div className="chat-recommendation-heading">
						<strong>{message.recommendation.status === 'program_completed' ? 'Đã hoàn thành chương trình' : 'Gợi ý từ hệ thống học vụ'}</strong>
						<span>{message.recommendation.summary.recommendedCredits} tín chỉ</span>
					</div>
					{message.recommendation.recommendedCourses.length ? (
						<ul>
							{message.recommendation.recommendedCourses.map((item) => (
								<li key={item.course.id}>
									<span><b>{item.course.code}</b> · {item.course.name}</span>
									<strong>{item.credits} TC</strong>
								</li>
							))}
						</ul>
					) : <p className="chat-recommendation-empty">Không có học phần được đề xuất.</p>}
					{message.recommendation.warnings.noEligibleCandidates ? (
						<p className="chat-warning">Không có học phần đủ điều kiện để đề xuất.</p>
					) : null}
					{message.recommendation.warnings.effectiveTargetNotReached ? (
						<p className="chat-warning">Tải tín chỉ đề xuất chưa đạt mục tiêu hiệu lực.</p>
					) : null}
				</section>
			) : null}
		</>
	);
}

export default function ChatPage() {
	const [conversations, setConversations] = useState<ConversationSummary[]>([]);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [messages, setMessages] = useState<ConversationMessage[]>([]);
	const [draft, setDraft] = useState('');
	const [loadingList, setLoadingList] = useState(true);
	const [loadingConversation, setLoadingConversation] = useState(false);
	const [sending, setSending] = useState(false);
	const [error, setError] = useState('');
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const threadRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		let active = true;
		void studentApi.listConversations()
			.then(async (result) => {
				if (!active) return;
				const ordered = sortConversations(result.items);
				setConversations(ordered);
				if (ordered[0]) {
					setSelectedId(ordered[0].id);
					setLoadingConversation(true);
					try {
						const detail = await studentApi.conversation(ordered[0].id);
						if (active) setMessages(detail.messages);
					} catch (loadError) {
						if (active) setError(errorMessage(loadError));
					} finally {
						if (active) setLoadingConversation(false);
					}
				}
			})
			.catch((loadError: unknown) => {
				if (active) setError(errorMessage(loadError));
			})
			.finally(() => {
				if (active) setLoadingList(false);
			});
		return () => { active = false; };
	}, []);

	useEffect(() => {
		if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
	}, [messages, sending]);

	const selectConversation = async (conversationId: string) => {
		setSelectedId(conversationId);
		setLoadingConversation(true);
		setError('');
		try {
			const detail = await studentApi.conversation(conversationId);
			setMessages(detail.messages);
		} catch (loadError) {
			setError(errorMessage(loadError));
		} finally {
			setLoadingConversation(false);
		}
	};

	const createConversation = async () => {
		setError('');
		try {
			const conversation: ConversationDetail = await studentApi.createConversation();
			setConversations((current) => sortConversations([conversation, ...current]));
			setSelectedId(conversation.id);
			setMessages([]);
			setDraft('');
		} catch (createError) {
			setError(errorMessage(createError));
		}
	};

	const sendMessage = async () => {
		const content = draft.trim();
		if (!content || sending) return;
		if (content.length > 4000) {
			setError('Câu hỏi tối đa 4.000 ký tự.');
			return;
		}
		setSending(true);
		setError('');
		let conversationId = selectedId;
		try {
			if (!conversationId) {
				const created = await studentApi.createConversation();
				conversationId = created.id;
				setSelectedId(created.id);
				setConversations((current) => sortConversations([created, ...current]));
			}
			const result: ConversationTurnResponse = await studentApi.sendConversationTurn(
				conversationId,
				content,
			);
			setMessages((current) => [...current, result.userMessage, result.assistantMessage]);
			setConversations((current) => sortConversations([
				result.conversation,
				...current.filter((item) => item.id !== result.conversation.id),
			]));
			setDraft('');
		} catch (sendError) {
			setError(errorMessage(sendError));
			if (conversationId) {
				try {
					const detail = await studentApi.conversation(conversationId);
					setMessages(detail.messages);
				} catch {
					// Preserve the draft even when transcript refresh also fails.
				}
			}
		} finally {
			setSending(false);
		}
	};

	const deleteConversation = async (conversationId: string) => {
		setDeletingId(conversationId);
		setError('');
		try {
			await studentApi.deleteConversation(conversationId);
			const remaining = conversations.filter((item) => item.id !== conversationId);
			setConversations(remaining);
			if (selectedId === conversationId) {
				setSelectedId(null);
				setMessages([]);
				if (remaining[0]) await selectConversation(remaining[0].id);
			}
		} catch (deleteError) {
			setError(errorMessage(deleteError));
		} finally {
			setDeletingId(null);
		}
	};

	const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
			event.preventDefault();
			void sendMessage();
		}
	};

	return (
		<div className="chat-page">
			<div className="page-heading chat-page-heading">
				<div>
					<span className="eyebrow">TƯ VẤN HỌC TẬP</span>
					<h1>Trợ lý học vụ</h1>
					<p>Trao đổi về gợi ý học kỳ dựa trên tiến độ học tập.</p>
				</div>
				<Button icon={<PlusOutlined />} disabled={sending} onClick={() => void createConversation()}>
					Cuộc trò chuyện mới
				</Button>
			</div>
			{error ? <Alert className="chat-alert" type="error" showIcon message={error} /> : null}
			<div className="chat-workspace">
				<aside className="chat-sidebar" aria-label="Lịch sử hội thoại">
					<div className="chat-sidebar-heading">
						<span>HỘI THOẠI</span>
						<strong>{conversations.length}</strong>
					</div>
					{loadingList ? <div className="chat-sidebar-loading"><Spin size="small" /></div> : null}
					{!loadingList && conversations.length === 0 ? (
						<p className="chat-history-empty">Lịch sử sẽ hiển thị tại đây.</p>
					) : null}
					<ul className="chat-conversation-list">
						{conversations.map((conversation) => (
							<li key={conversation.id} className={conversation.id === selectedId ? 'is-selected' : ''}>
								<button
									type="button"
									className="chat-conversation-select"
									aria-label={`Mở hội thoại ${formatDate(conversation.updatedAt)}`}
									disabled={sending}
									onClick={() => void selectConversation(conversation.id)}
								>
									<span><MessageOutlined /> Cuộc trò chuyện</span>
									<time>{formatDate(conversation.updatedAt)}</time>
								</button>
								<Popconfirm
									title="Xóa cuộc trò chuyện này?"
									okText="Xóa"
									cancelText="Hủy"
									onConfirm={() => deleteConversation(conversation.id)}
								>
									<Button
										type="text"
										danger
										size="small"
										aria-label="Xóa hội thoại"
										icon={<DeleteOutlined />}
										loading={deletingId === conversation.id}
									/>
								</Popconfirm>
							</li>
						))}
					</ul>
				</aside>
				<section className="chat-thread" aria-label="Nội dung hội thoại">
					<div className="chat-thread-header">
						<div>
							<span className="eyebrow">BK UNI</span>
							<strong>{selectedId ? 'Tư vấn gợi ý học kỳ' : 'Cuộc trò chuyện mới'}</strong>
						</div>
						{sending ? <Tag color="processing">Đang xử lý</Tag> : null}
					</div>
					<div className="chat-thread-scroll" ref={threadRef} aria-live="polite">
						{loadingConversation ? <div className="chat-loading"><Spin /></div> : null}
						{!loadingConversation && messages.length === 0 ? (
							<Empty
								image={<MessageOutlined />}
								description={<span>Chưa có tin nhắn trong hội thoại này.</span>}
							/>
						) : null}
						<div className="chat-message-list">
							{messages.map((chatMessage) => (
								<article
									key={chatMessage.id}
									className={`chat-message ${chatMessage.role === 'user' ? 'from-user' : 'from-assistant'}`}
								>
									<div className="chat-message-meta">
										<strong>{chatMessage.role === 'user' ? 'Bạn' : 'Trợ lý học vụ'}</strong>
										<time>{formatDate(chatMessage.createdAt)}</time>
									</div>
									<div className="chat-message-content">
										<MessageBody message={chatMessage} />
									</div>
								</article>
							))}
							{sending ? <div className="chat-pending"><Spin size="small" /> Đang tổng hợp kết quả</div> : null}
						</div>
					</div>
					<div className="chat-composer">
						<TextArea
							aria-label="Câu hỏi"
							placeholder="Hỏi về gợi ý học kỳ..."
							value={draft}
							maxLength={4000}
							showCount
							autoSize={{ minRows: 1, maxRows: 4 }}
							disabled={sending}
							onChange={(event) => setDraft(event.target.value)}
							onKeyDown={handleComposerKeyDown}
						/>
						<Button
							type="primary"
							aria-label="Gửi câu hỏi"
							icon={<SendOutlined />}
							loading={sending}
							disabled={!draft.trim()}
							onClick={() => void sendMessage()}
						/>
					</div>
				</section>
			</div>
		</div>
	);
}