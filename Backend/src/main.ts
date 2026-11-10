import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { setupApp } from './app.setup';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const origins = config.getOrThrow<string>('CORS_ORIGINS').split(',').map((value) => value.trim());
  setupApp(app, origins);
  const swaggerConfig = new DocumentBuilder()
    .setTitle('BK Uni API')
    .setDescription('Tài liệu API BK Uni')
    .setVersion('1.0')
    .addCookieAuth('accessToken')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig));
  const port = config.getOrThrow<number>('PORT');
  await app.listen(port);
  Logger.log(`Server đang chạy tại http://localhost:${port}`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  Logger.error(error instanceof Error ? error.stack : String(error), 'Bootstrap');
  process.exitCode = 1;
});
