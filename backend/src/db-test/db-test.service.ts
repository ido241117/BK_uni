import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateDbTestRecordDto } from './dto/create-db-test-record.dto';
import { UpdateDbTestRecordDto } from './dto/update-db-test-record.dto';
import { DbTestRecord } from './entities/db-test-record.entity';

@Injectable()
export class DbTestService {
	constructor(
		@InjectRepository(DbTestRecord)
		private readonly records: Repository<DbTestRecord>,
	) { }

	findAll(): Promise<DbTestRecord[]> {
		return this.records.find({ order: { createdAt: 'DESC' } });
	}

	async findOne(id: string): Promise<DbTestRecord> {
		const record = await this.records.findOneBy({ id });
		if (!record)
			throw new NotFoundException('Không tìm thấy bản ghi kiểm tra.');
		return record;
	}

	create(dto: CreateDbTestRecordDto): Promise<DbTestRecord> {
		const record = this.records.create({
			title: dto.title.trim(),
			description: dto.description?.trim() || null,
		});
		return this.records.save(record);
	}

	async update(id: string, dto: UpdateDbTestRecordDto): Promise<DbTestRecord> {
		const record = await this.findOne(id);
		this.records.merge(record, {
			...dto,
			title: dto.title?.trim(),
			description:
				dto.description == null
					? dto.description
					: dto.description.trim() || null,
		});
		return this.records.save(record);
	}

	async remove(id: string): Promise<{ id: string; deleted: true }> {
		const record = await this.findOne(id);
		await this.records.remove(record);
		return { id, deleted: true };
	}
}
