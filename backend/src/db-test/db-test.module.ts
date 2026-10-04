import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DbTestRecord } from './entities/db-test-record.entity';
import { DbTestController } from './db-test.controller';
import { DbTestService } from './db-test.service';

@Module({
	imports: [TypeOrmModule.forFeature([DbTestRecord])],
	controllers: [DbTestController],
	providers: [DbTestService],
})
export class DbTestModule { }
