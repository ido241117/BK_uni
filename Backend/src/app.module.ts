import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
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
    // TODO(dev): đang TẮT rate limit để import dữ liệu hàng loạt (bỏ ThrottlerGuard ở `providers` bên dưới,
    // nên cả giới hạn chung lẫn @Throttle của login/advisor/outline đều không có hiệu lực).
    // Trước khi deploy: đặt lại { ttl: 60000, limit: 120 } và thêm lại
    // `{ provide: APP_GUARD, useClass: ThrottlerGuard }` vào `providers`.
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100000 }]),
    AuthModule,
    CourseModule,
    CurriculumModule,
    StudentModule,
    AdvisorModule,
    OutlineModule,
  ],
  providers: [],
})
export class AppModule {}
