import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json } from 'express';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformResponseInterceptor } from './common/interceptors/transform-response.interceptor';
import { originMiddleware } from './common/middleware/origin.middleware';
import { OUTLINE_IMPORT_PATH } from './outline/outline.controller';

export function setupApp(app: INestApplication, origins: string[]): void {
  app.setGlobalPrefix('api');
  // Nhập đề cương: mỗi file bkuni.course-outlines (200 đề cương) khoảng 5 MB. Phải đăng ký trước parser chung;
  // parser chung tự bỏ qua request đã được parse. Route vẫn chỉ dành cho Admin.
  app.use(`/api/${OUTLINE_IMPORT_PATH}`, json({ limit: '25mb' }));
  // Tư vấn với AI gửi kèm ảnh chụp kết quả phân tích học tập, có thể vượt mức mặc định 100 KB.
  (app as NestExpressApplication).useBodyParser('json', { limit: '1mb' });
  app.enableCors({ origin: origins, credentials: true });
  app.use(originMiddleware(origins));
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  app.useGlobalInterceptors(new TransformResponseInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());
}
