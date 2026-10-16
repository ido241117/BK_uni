import {
	Column,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	OneToMany,
} from 'typeorm';
import { BaseEntityCustom } from '../common/entities/base-custom.entity';
import { ConversationMessage } from './conversation-message.entity';
import { StudentProfile } from './student-profile.entity';

@Entity({ name: 'student_conversations' })
@Index('idx_student_conversations_profile_updated', ['profileId', 'updatedAt'])
export class StudentConversation extends BaseEntityCustom {
	@Index('idx_student_conversations_profile')
	@Column({ name: 'profile_id', type: 'uuid' })
	profileId: string;

	@ManyToOne(() => StudentProfile, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'profile_id' })
	profile: StudentProfile;

	@OneToMany(() => ConversationMessage, (message) => message.conversation)
	messages: ConversationMessage[];
}