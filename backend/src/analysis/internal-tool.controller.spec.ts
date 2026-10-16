import { InternalToolController } from './internal-tool.controller';
import { InternalToolRequest } from './internal-tool.guard';
import { RecommendationService } from './recommendation.service';

describe('InternalToolController', () => {
	it('uses only the user subject from verified delegated context', async () => {
		const recommendationService = {
			recommend: jest.fn().mockResolvedValue({ status: 'ready' }),
		};
		const controller = new InternalToolController(
			recommendationService as unknown as RecommendationService,
		);
		const request = {
			delegatedContext: {
				sub: '00000000-0000-4000-8000-000000000002',
				profile_id: '00000000-0000-4000-8000-000000000003',
				scope: 'recommendation:read',
				correlation_id: '00000000-0000-4000-8000-000000000001',
				data_classification: 'synthetic',
			},
		} as InternalToolRequest;

		await expect(controller.recommend(request)).resolves.toEqual({ status: 'ready' });
		expect(recommendationService.recommend).toHaveBeenCalledTimes(1);
		expect(recommendationService.recommend).toHaveBeenCalledWith(
			'00000000-0000-4000-8000-000000000002',
		);
	});
});