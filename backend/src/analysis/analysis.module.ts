import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalysisRun } from './analysis-run.entity';
import { ConversationMessage } from '../users/conversation-message.entity';
import { StudentConversation } from '../users/student-conversation.entity';
import { AnalysisController } from './analysis.controller';
import { AnalysisService } from './analysis.service';
import { RecommendationController } from './recommendation.controller';
import { RecommendationService } from './recommendation.service';
import { InternalToolController } from './internal-tool.controller';
import { InternalToolGuard } from './internal-tool.guard';

@Module({
	imports: [TypeOrmModule.forFeature([AnalysisRun, StudentConversation, ConversationMessage])],
	controllers: [AnalysisController, RecommendationController, InternalToolController],
	providers: [AnalysisService, RecommendationService, InternalToolGuard],
})
export class AnalysisModule { }