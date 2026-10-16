import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { StudentConversation } from './student-conversation.entity';

export type ConversationMessageRole = 'user' | 'assistant';
export type ConversationMessageStatus =
	| 'completed'
	| 'clarification'
	| 'out_of_scope'
	| 'failed';

@Entity({ name: 'conversation_messages' })
@Index('uq_conversation_messages_sequence', ['conversationId', 'sequence'], { unique: true })
@Index('uq_conversation_messages_turn_role', ['conversationId', 'turnId', 'role'], { unique: true })
export class ConversationMessage {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ name: 'conversation_id', type: 'uuid' })
	conversationId: string;

	@ManyToOne(() => StudentConversation, (conversation) => conversation.messages, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'conversation_id' })
	conversation: StudentConversation;

	@Column({ name: 'turn_id', type: 'uuid' })
	turnId: string;

	@Column({ type: 'integer' })
	sequence: number;

	@Column({ type: 'text' })
	role: ConversationMessageRole;

	@Column({ type: 'text', nullable: true })
	content: string | null;

	@Column({ type: 'text', nullable: true })
	status: ConversationMessageStatus | null;

	@Column({ type: 'jsonb', nullable: true })
	recommendation: Record<string, unknown> | null;

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt: Date;
}