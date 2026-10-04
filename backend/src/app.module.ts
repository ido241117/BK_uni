import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CurriculumModule } from './curricula/curriculum.module';
import { DbTestModule } from './db-test/db-test.module';
import { HealthModule } from './health/health.module';
import { StudentProfileModule } from './users/student-profile.module';

@Module({
	imports: [
		ConfigModule.forRoot({ isGlobal: true }),
		TypeOrmModule.forRootAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: (config: ConfigService) => ({
				type: 'postgres' as const,
				host: config.get<string>('DB_HOST'),
				port: config.get<number>('DB_PORT'),
				username: config.get<string>('DB_USERNAME'),
				password: config.get<string>('DB_PASSWORD'),
				database: config.get<string>('DB_NAME'),
				autoLoadEntities: true,
				migrations: [join(__dirname, 'db/migrations/*{.ts,.js}')],
				migrationsRun: false,
				synchronize: false,
				logging: false,
			}),
		}),
		AuthModule,
		CurriculumModule,
		StudentProfileModule,
		DbTestModule,
		HealthModule,
	],
	controllers: [AppController],
	providers: [AppService],
})
export class AppModule { }
