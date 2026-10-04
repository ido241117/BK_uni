import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class HealthService {
	constructor(@InjectDataSource() private readonly dataSource: DataSource) { }

	async check() {
		try {
			await this.dataSource.query('SELECT 1');
			return { status: 'ok', database: 'connected' };
		} catch {
			throw new ServiceUnavailableException('Database is unavailable');
		}
	}
}
