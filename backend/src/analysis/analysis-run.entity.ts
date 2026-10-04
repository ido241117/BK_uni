import { CreateDateColumn, Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'analysis_runs' })
export class AnalysisRun {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ name: 'profile_id', type: 'uuid' })
	profileId: string;

	@Column({ name: 'curriculum_id', type: 'uuid' })
	curriculumId: string;

	@Column({ name: 'input_snapshot', type: 'jsonb' })
	inputSnapshot: Record<string, unknown>;

	@Column({ name: 'result_snapshot', type: 'jsonb' })
	resultSnapshot: Record<string, unknown>;

	@Column({ name: 'ruleset_version', type: 'text' })
	rulesetVersion: string;

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt: Date;
}