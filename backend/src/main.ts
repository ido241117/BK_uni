import {
	BadRequestException,
	ValidationError,
	ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ApiResponseDto } from './common/dto/api-response.dto';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformResponseInterceptor } from './common/interceptors/transform-response.interceptor';
import { AppModule } from './app.module';

const flattenValidationErrors = (
	errors: ValidationError[],
	parentPath = '',
): string[] => {
	const messages: string[] = [];

	for (const error of errors) {
		const currentPath = parentPath
			? `${parentPath}.${error.property}`
			: error.property;

		if (error.constraints) {
			messages.push(
				...Object.values(error.constraints).map(
					(constraint) => `${currentPath}: ${constraint}`,
				),
			);
		}

		if (error.children?.length) {
			messages.push(...flattenValidationErrors(error.children, currentPath));
		}
	}

	return messages;
};

async function bootstrap() {
	const app = await NestFactory.create(AppModule);
	app.setGlobalPrefix('api/v1');

	const configService = app.get(ConfigService);
	const rawOrigins = configService.get<string>('CORS_ORIGINS', '');
	const isDevelopment =
		configService.get<string>('NODE_ENV', 'development') === 'development';
	const originList = rawOrigins
		.split(',')
		.map((origin) => origin.trim())
		.filter(Boolean);

	app.enableCors({
		origin: (
			origin: string | undefined,
			callback: (error: Error | null, allow?: boolean) => void,
		) => {
			const isLocalDevelopmentOrigin =
				isDevelopment &&
				!!origin &&
				/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
			if (!origin || originList.includes(origin) || isLocalDevelopmentOrigin) {
				callback(null, true);
				return;
			}
			callback(null, false);
		},
		credentials: true,
	});

	app.useGlobalPipes(
		new ValidationPipe({
			transform: true,
			whitelist: true,
			exceptionFactory: (errors: ValidationError[] = []) => {
				const validationErrors = flattenValidationErrors(errors);
				return new BadRequestException({
					message:
						validationErrors.length > 0
							? validationErrors
							: ['Dữ liệu gửi lên không hợp lệ.'],
					error: 'Yêu cầu không hợp lệ',
				});
			},
		}),
	);

	app.useGlobalInterceptors(new TransformResponseInterceptor());
	app.useGlobalFilters(new AllExceptionsFilter());

	const swaggerConfig = new DocumentBuilder()
		.setTitle(configService.get<string>('SWAGGER_TITLE', 'BK Uni API'))
		.setDescription(
			configService.get<string>(
				'SWAGGER_DESCRIPTION',
				'BK Uni backend API documentation',
			),
		)
		.setVersion(configService.get<string>('SWAGGER_VERSION', '1.0'))
		.addBearerAuth()
		.build();
	const document = SwaggerModule.createDocument(app, swaggerConfig, {
		extraModels: [ApiResponseDto],
	});
	const swaggerPath = 'docs';
	SwaggerModule.setup(swaggerPath, app, document, {
		swaggerOptions: { persistAuthorization: true },
	});

	const requestedPort = Number(configService.get<string>('PORT', '0'));
	await app.listen(requestedPort);
	const serverUrl = await app.getUrl();
	const port = new URL(serverUrl).port;
	const localUrl = `http://localhost:${port}`;
	console.log(`Server đang chạy tại ${localUrl}`);
	console.log(`Swagger docs available at ${localUrl}/${swaggerPath}`);
}

bootstrap().catch((error: unknown) => {
	console.error('Không thể khởi động ứng dụng', error);
	process.exit(1);
});
