import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationMessage } from './conversation-message.entity';
import { StudentConversation } from './student-conversation.entity';
import { StudentProfile } from './student-profile.entity';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';

@Module({
	imports: [TypeOrmModule.forFeature([ConversationMessage, StudentConversation, StudentProfile])],
	controllers: [ConversationController],
	providers: [ConversationService],
})
export class ConversationModule { }