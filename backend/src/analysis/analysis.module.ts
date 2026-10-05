import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalysisRun } from './analysis-run.entity';
import { AnalysisController } from './analysis.controller';
import { AnalysisService } from './analysis.service';
import { RecommendationController } from './recommendation.controller';
import { RecommendationService } from './recommendation.service';

@Module({
	imports: [TypeOrmModule.forFeature([AnalysisRun])],
	controllers: [AnalysisController, RecommendationController],
	providers: [AnalysisService, RecommendationService],
})
export class AnalysisModule { }