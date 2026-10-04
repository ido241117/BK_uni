import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalysisRun } from './analysis-run.entity';
import { AnalysisController } from './analysis.controller';
import { AnalysisService } from './analysis.service';

@Module({
	imports: [TypeOrmModule.forFeature([AnalysisRun])],
	controllers: [AnalysisController],
	providers: [AnalysisService],
})
export class AnalysisModule { }