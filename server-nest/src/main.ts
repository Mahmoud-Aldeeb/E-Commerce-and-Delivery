import {
  BadRequestException,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { serve } from 'inngest/express';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { PrismaService } from './prisma/prisma.service.js';
import { MailService } from './mail/mail.service.js';
import { inngest } from './inngest/inngest.client.js';
import { createInngestFunctions } from './inngest/inngest.functions.js';
import { applyRateLimits } from './common/rate-limit.js';

// Nested DTO errors keep their messages in `children`, so walk down to the first one
const firstMessage = (errors: ValidationError[]): string | undefined => {
  for (const error of errors) {
    if (error.constraints) return Object.values(error.constraints)[0];
    const nested = firstMessage(error.children ?? []);
    if (nested) return nested;
  }
  return undefined;
};

async function bootstrap() {
  // rawBody: true keeps the unparsed body on req.rawBody (needed by the Stripe webhook)
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  // Behind a hosting proxy the client IP comes from X-Forwarded-For.
  // Without this, the rate limiter would see ONE ip for every user.
  app.set('trust proxy', 1);

  // Lets Nest run onModuleDestroy (Prisma $disconnect) when the host stops the container
  app.enableShutdownHooks();

  // Inngest sends big payloads (event data + function state): raise the 100kb default
  app.useBodyParser('json', { limit: '10mb' });

  app.setGlobalPrefix('api', { exclude: ['/'] });

  // CORS_ORIGINS="https://my-shop.vercel.app,http://localhost:5173"
  // Not set -> every origin is allowed (convenient for local development only)
  const allowedOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  applyRateLimits(app);

  app.useGlobalFilters(new AllExceptionsFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: (errors) =>
        new BadRequestException(firstMessage(errors)),
    }),
  );

  // ===== Inngest =====
  // app.use is a raw Express mount, so it is not affected by the "api" global prefix
  const inngestFunctions = createInngestFunctions({
    prisma: app.get(PrismaService),
    mail: app.get(MailService),
    config: app.get(ConfigService),
  });
  app.use(
    '/api/inngest',
    serve({ client: inngest, functions: inngestFunctions }),
  );

  // ===== Swagger =====
  // It exposes the shape of the whole API: off in production unless ENABLE_SWAGGER=true
  const swaggerEnabled =
    process.env.NODE_ENV !== 'production' ||
    process.env.ENABLE_SWAGGER === 'true';

  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('E-commerce API')
      .setDescription('Backend API documentation')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);

    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: {
        persistAuthorization: false,
        // After a successful login, put the token into Swagger's Authorize automatically
        responseInterceptor: (res: any) => {
          if (
            (res.url.endsWith('/api/auth/login') ||
              res.url.endsWith('/api/delivery/login')) &&
            res.status === 200
          ) {
            const token = JSON.parse(res.text).token;
            (globalThis as any).ui.preauthorizeApiKey('bearer', token);
          }
          return res;
        },
      },
    });
  }

  await app.listen(process.env.PORT ?? 5050);
}
bootstrap();
