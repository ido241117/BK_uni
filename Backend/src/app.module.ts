import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdvisorModule } from './advisor/advisor.module';
import { AuthModule } from './auth/auth.module';
import { CourseModule } from './course/course.module';
import { CurriculumModule } from './curriculum/curriculum.module';
import { OutlineModule } from './outline/outline.module';
import { StudentModule } from './student/student.module';
import { validateEnvironment } from './config/environment';
import { getDatabaseOptions } from './database/database-options';
import { entities } from './database/entities';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        ...getDatabaseOptions({
          DB_HOST: config.get('DB_HOST'),
          DB_PORT: config.get('DB_PORT'),
          DB_USERNAME: config.get('DB_USERNAME'),
          DB_PASSWORD: config.get('DB_PASSWORD'),
          DB_NAME: config.get('DB_NAME'),
          DB_SCHEMA: config.get('DB_SCHEMA'),
          DB_SSL_MODE: config.get('DB_SSL_MODE'),
        }),
        entities,
      }),
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    AuthModule,
    CourseModule,
    CurriculumModule,
    StudentModule,
    AdvisorModule,
    OutlineModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
