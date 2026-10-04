import 'dotenv/config';
import { join } from 'path';
import { DataSource } from 'typeorm';

const dataSource = new DataSource({
	type: 'postgres',
	host: process.env.DB_HOST || 'localhost',
	port: Number(process.env.DB_PORT || 5432),
	username: process.env.DB_USERNAME,
	password: process.env.DB_PASSWORD,
	database: process.env.DB_NAME,
	entities: [join(__dirname, '**/*.entity{.ts,.js}')],
	migrations: [join(__dirname, 'db/migrations/*{.ts,.js}')],
	migrationsTableName: 'typeorm_migrations',
	synchronize: false,
	logging: false,
});

export default dataSource;
