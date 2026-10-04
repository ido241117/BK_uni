import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
	constructor(private readonly healthService: HealthService) { }

	@Get()
	@ApiOperation({ summary: 'Kiểm tra tình trạng service và kết nối database' })
	check() {
		return this.healthService.check();
	}
}
