import {
	BadGatewayException,
	ConflictException,
	GatewayTimeoutException,
	HttpException,
	HttpStatus,
	Injectable,
	NotFoundException,
	ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPrivateKey, randomUUID, sign } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { ConversationMessage } from './conversation-message.entity';
import { ConversationListQueryDto } from './conversation.dto';
import { StudentConversation } from './student-conversation.entity';
import { StudentProfile } from './student-profile.entity';

type AgentStatus = 'completed' | 'clarification' | 'out_of_scope';
type AgentTurnResponse = {
	status: AgentStatus;
	answer: string;
	recommendation: Record<string, unknown> | null;
	toolCalled: boolean;
	correlationId: string;
};

type ConversationHistoryItem = { role: 'user' | 'assistant'; content: string };

@Injectable()
export class ConversationService {
	private readonly activeTurns = new Set<string>();
	private readonly turnTimestamps = new Map<string, number[]>();

	constructor(
		private readonly dataSource: DataSource,
		private readonly config: ConfigService,
	) { }

	private notFound() {
		return new NotFoundException({ code: 'NOT_FOUND' });
	}

	private async getProfile(userId: string) {
		const profile = await this.dataSource.getRepository(StudentProfile).findOne({
			where: { userId },
		});
		if (!profile) throw this.notFound();
		return profile;
	}

	private messageRepresentation(message: ConversationMessage) {
		return {
			id: message.id,
			role: message.role,
			content: message.content,
			status: message.status,
			recommendation: message.recommendation,
			createdAt: message.createdAt,
		};
	}

	private conversationRepresentation(conversation: StudentConversation) {
		return {
			id: conversation.id,
			createdAt: conversation.createdAt,
			updatedAt: conversation.updatedAt,
		};
	}

	async create(userId: string) {
		const profile = await this.getProfile(userId);
		const repository = this.dataSource.getRepository(StudentConversation);
		const conversation = await repository.save(repository.create({ profileId: profile.id }));
		return { ...this.conversationRepresentation(conversation), messages: [] };
	}

	async list(userId: string, query: ConversationListQueryDto) {
		const profile = await this.getProfile(userId);
		const [items, total] = await this.dataSource
			.getRepository(StudentConversation)
			.findAndCount({
				where: { profileId: profile.id },
				order: { updatedAt: 'DESC', id: 'DESC' },
				take: query.limit,
				skip: query.offset,
			});
		return {
			items: items.map((item) => this.conversationRepresentation(item)),
			page: { limit: query.limit, offset: query.offset, total },
		};
	}

	async detail(userId: string, conversationId: string) {
		const profile = await this.getProfile(userId);
		const conversation = await this.dataSource
			.getRepository(StudentConversation)
			.findOne({ where: { id: conversationId, profileId: profile.id } });
		if (!conversation) throw this.notFound();
		const messages = await this.dataSource.getRepository(ConversationMessage).find({
			where: { conversationId },
			order: { sequence: 'ASC' },
		});
		return {
			...this.conversationRepresentation(conversation),
			messages: messages.map((message) => this.messageRepresentation(message)),
		};
	}

	async delete(userId: string, conversationId: string) {
		const profile = await this.getProfile(userId);
		if (this.activeTurns.has(conversationId)) {
			throw new ConflictException({ code: 'CONVERSATION_BUSY' });
		}
		const repository = this.dataSource.getRepository(StudentConversation);
		const conversation = await repository.findOne({
			where: { id: conversationId, profileId: profile.id },
		});
		if (!conversation) throw this.notFound();
		await repository.remove(conversation);
	}

	private assertQuota(userId: string) {
		const now = Date.now();
		const recent = (this.turnTimestamps.get(userId) ?? []).filter(
			(timestamp) => now - timestamp < 60_000,
		);
		if (recent.length >= 10) {
			throw new HttpException(
				{ code: 'RATE_LIMIT_EXCEEDED' },
				HttpStatus.TOO_MANY_REQUESTS,
			);
		}
		recent.push(now);
		this.turnTimestamps.set(userId, recent);
	}

	private async saveUserTurn(
		manager: EntityManager,
		profileId: string,
		conversationId: string,
		content: string,
		turnId: string,
	) {
		const conversationRepository = manager.getRepository(StudentConversation);
		const conversation = await conversationRepository.findOne({
			where: { id: conversationId, profileId },
			lock: { mode: 'pessimistic_write' },
		});
		if (!conversation) throw this.notFound();
		const messageRepository = manager.getRepository(ConversationMessage);
		const lastMessage = await messageRepository.findOne({
			where: { conversationId },
			order: { sequence: 'DESC' },
		});
		if (lastMessage?.role === 'user') {
			throw new ConflictException({ code: 'CONVERSATION_BUSY' });
		}
		const sequence = (lastMessage?.sequence ?? 0) + 1;
		const userMessage = await messageRepository.save(
			messageRepository.create({
				conversationId,
				turnId,
				sequence,
				role: 'user',
				content,
				status: null,
				recommendation: null,
			}),
		);
		conversation.updatedAt = new Date();
		await conversationRepository.save(conversation);
		const previousMessages = await messageRepository.find({
			where: { conversationId },
			order: { sequence: 'DESC' },
			take: 13,
		});
		return {
			conversation,
			userMessage,
			history: this.fitHistory(previousMessages, content),
		};
	}

	private fitHistory(messages: ConversationMessage[], currentMessage: string) {
		const candidates: ConversationHistoryItem[] = messages
			.filter((message) => message.role === 'assistant' && message.status === 'failed'
				? false
				: message.content !== null)
			.map((message) => ({ role: message.role, content: message.content! }))
			.filter((message) => message.role === 'user' || message.role === 'assistant')
			.slice(0, -1);
		const chosen: ConversationHistoryItem[] = [];
		let size = Buffer.byteLength(JSON.stringify({ message: currentMessage }), 'utf8');
		for (const item of candidates) {
			const itemSize = Buffer.byteLength(JSON.stringify(item), 'utf8');
			if (chosen.length >= 12 || size + itemSize > 10 * 1024) break;
			chosen.push(item);
			size += itemSize;
		}
		return chosen.reverse();
	}

	private delegatedAssertion(
		userId: string,
		profileId: string,
		correlationId: string,
	) {
		const privateKeyValue = this.config.get<string>('AGENT_DELEGATION_PRIVATE_KEY');
		const syntheticUserIds = (this.config.get<string>('AGENT_SYNTHETIC_USER_IDS') ?? '')
			.split(',')
			.map((value) => value.trim())
			.filter(Boolean);
		if (!privateKeyValue || !syntheticUserIds.includes(userId)) {
			throw new ServiceUnavailableException({ code: 'SYNTHETIC_DATA_ONLY' });
		}
		const classification = 'synthetic';
		const privateKey = createPrivateKey(privateKeyValue.replaceAll('\\n', '\n'));
		const now = Math.floor(Date.now() / 1000);
		const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
		const header = encode({ alg: 'EdDSA', typ: 'JWT' });
		const payload = encode({
			iss: 'bk-nest',
			aud: 'bk-recommendation-tool',
			sub: userId,
			profile_id: profileId,
			scope: 'recommendation:read',
			correlation_id: correlationId,
			data_classification: classification,
			iat: now,
			exp: now + 60,
		});
		const content = `${header}.${payload}`;
		const signature = sign(null, Buffer.from(content), privateKey).toString('base64url');
		return `${content}.${signature}`;
	}

	private validateAgentResponse(value: unknown, correlationId: string): AgentTurnResponse {
		if (!value || typeof value !== 'object') throw new Error('agent response is invalid');
		const response = value as Partial<AgentTurnResponse>;
		if (
			!['completed', 'clarification', 'out_of_scope'].includes(response.status ?? '') ||
			typeof response.answer !== 'string' ||
			response.answer.length < 1 ||
			response.answer.length > 4000 ||
			typeof response.toolCalled !== 'boolean' ||
			response.correlationId !== correlationId ||
			(response.recommendation !== null &&
				(typeof response.recommendation !== 'object' ||
					Array.isArray(response.recommendation)))
		) {
			throw new Error('agent response is invalid');
		}
		if (response.status === 'completed' && !response.recommendation) {
			throw new Error('completed agent response must include recommendation');
		}
		return response as AgentTurnResponse;
	}

	private async callAgent(
		conversationId: string,
		message: string,
		history: ConversationHistoryItem[],
		userId: string,
		profileId: string,
		correlationId: string,
	): Promise<AgentTurnResponse> {
		const baseUrl = this.config.get<string>('AGENT_BASE_URL');
		const serviceToken = this.config.get<string>('AGENT_SERVICE_TOKEN');
		if (!baseUrl || !serviceToken) {
			throw new ServiceUnavailableException({ code: 'AGENT_UNAVAILABLE' });
		}
		const assertion = this.delegatedAssertion(userId, profileId, correlationId);
		let response: Response;
		try {
			response = await fetch(`${baseUrl.replace(/\/$/, '')}/internal/v1/turns`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${serviceToken}`,
					'Content-Type': 'application/json',
					'X-Delegated-Context': assertion,
					'X-Correlation-ID': correlationId,
					Accept: 'application/json',
				},
				body: JSON.stringify({ conversationId, message, history }),
				signal: AbortSignal.timeout(30_000),
			});
		} catch (error) {
			if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) {
				throw new GatewayTimeoutException({ code: 'AGENT_TIMEOUT' });
			}
			throw new BadGatewayException({ code: 'AGENT_UNAVAILABLE' });
		}
		if (!response.ok) {
			if (response.status === 504) throw new GatewayTimeoutException({ code: 'AGENT_TIMEOUT' });
			throw new BadGatewayException({ code: 'AGENT_UNAVAILABLE' });
		}
		try {
			const envelope = (await response.json()) as { data?: unknown };
			return this.validateAgentResponse(envelope.data, correlationId);
		} catch {
			throw new BadGatewayException({ code: 'AGENT_UNAVAILABLE' });
		}
	}

	private async saveAssistantMessage(
		manager: EntityManager,
		conversationId: string,
		turnId: string,
		sequence: number,
		response?: AgentTurnResponse,
	) {
		const messageRepository = manager.getRepository(ConversationMessage);
		const assistant = await messageRepository.save(
			messageRepository.create({
				conversationId,
				turnId,
				sequence,
				role: 'assistant',
				content: response?.answer ?? null,
				status: response?.status ?? 'failed',
				recommendation: response?.recommendation ?? null,
			}),
		);
		await manager.getRepository(StudentConversation).update(
			{ id: conversationId },
			{ updatedAt: new Date() },
		);
		return assistant;
	}

	async sendTurn(userId: string, conversationId: string, rawMessage: string) {
		const message = rawMessage.trim();
		if (!message || message.length > 4000) {
			throw new ConflictException({ code: 'VALIDATION_ERROR' });
		}
		const profile = await this.getProfile(userId);
		this.assertQuota(userId);
		if (this.activeTurns.has(conversationId)) {
			throw new ConflictException({ code: 'CONVERSATION_BUSY' });
		}
		this.activeTurns.add(conversationId);
		const turnId = randomUUID();
		const correlationId = randomUUID();
		try {
			const prepared = await this.dataSource.transaction(async (manager) =>
				this.saveUserTurn(manager, profile.id, conversationId, message, turnId),
			);
			try {
				const response = await this.callAgent(
					conversationId,
					message,
					prepared.history,
					userId,
					profile.id,
					correlationId,
				);
				const assistantMessage = await this.dataSource.transaction((manager) =>
					this.saveAssistantMessage(
						manager,
						conversationId,
						turnId,
						prepared.userMessage.sequence + 1,
						response,
					),
				);
				return {
					conversation: this.conversationRepresentation(prepared.conversation),
					userMessage: this.messageRepresentation(prepared.userMessage),
					assistantMessage: this.messageRepresentation(assistantMessage),
				};
			} catch (error) {
				await this.dataSource
					.transaction((manager) =>
						this.saveAssistantMessage(
							manager,
							conversationId,
							turnId,
							prepared.userMessage.sequence + 1,
						),
					)
					.catch(() => undefined);
				if (error instanceof GatewayTimeoutException || error instanceof BadGatewayException) {
					throw error;
				}
				throw new BadGatewayException({ code: 'AGENT_UNAVAILABLE' });
			}
		} finally {
			this.activeTurns.delete(conversationId);
		}
	}
}