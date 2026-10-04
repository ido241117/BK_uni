import { Column, Entity } from 'typeorm';
import { BaseEntityCustom } from '../../common/entities/base-custom.entity';

@Entity({ name: 'db_test_records' })
export class DbTestRecord extends BaseEntityCustom {
	@Column({ type: 'varchar', length: 120 })
	title: string;

	@Column({ type: 'text', nullable: true })
	description: string | null;
}
