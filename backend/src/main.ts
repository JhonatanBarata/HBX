import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { createProxyMiddleware } from 'http-proxy-middleware';

const DEFAULT_PRODUCTION_ORIGINS = [
  'https://www.hbxsystem.com.br',
  'https://hbxsystem.com.br',
];

function normalizeOrigin(value: string | null | undefined) {
  return String(value || '').trim().replace(/\/$/, '');
}

function buildAllowedOrigins() {
  const configured = String(process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => normalizeOrigin(value))
    .filter(Boolean);

  const frontendUrl = normalizeOrigin(process.env.FRONTEND_URL);
  if (frontendUrl) configured.push(frontendUrl);

  configured.push(...DEFAULT_PRODUCTION_ORIGINS, 'http://localhost:3001', 'http://127.0.0.1:3001');
  return Array.from(new Set(configured));
}

function isFirebaseHostingOrigin(origin: string) {
  return /^https:\/\/[a-z0-9-]+\.(web\.app|firebaseapp\.com)$/i.test(origin);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const webscrapingTarget = process.env.WEBSCRAPING_INTERNAL_URL || 'http://localhost:8501';
  app.use(
    '/webscraping',
    createProxyMiddleware({
      target: webscrapingTarget,
      changeOrigin: true,
      ws: true,
      pathRewrite: { '^/webscraping': '' },
    }),
  );
  const allowedOrigins = buildAllowedOrigins();
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const normalizedOrigin = normalizeOrigin(origin);
      if (
        !allowedOrigins.length ||
        allowedOrigins.includes(normalizedOrigin) ||
        isFirebaseHostingOrigin(normalizedOrigin)
      ) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${normalizedOrigin} is not allowed by CORS`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-master-route'],
    optionsSuccessStatus: 204,
    preflightContinue: false,
  });
  function translateConstraintMessage(msg: string) {
    if (!msg) return msg;
    // common patterns from class-validator messages
    const patterns: Array<[RegExp, string]> = [
      [/must be longer than or equal to (\d+) characters?/, 'deve ter no mínimo $1 caracteres'],
      [/must be shorter than or equal to (\d+) characters?/, 'deve ter no máximo $1 caracteres'],
      [/must be longer than (\d+) characters?/, 'deve ter mais de $1 caracteres'],
      [/must be shorter than (\d+) characters?/, 'deve ter menos de $1 caracteres'],
      [/should not be empty/, 'não pode ficar vazio'],
      [/must be a well formed email address|must be an email|email must be an email/, 'deve ser um e-mail válido'],
      [/must be an? (integer|number)/, 'deve ser um número inteiro'],
      [/must be a boolean value/, 'deve ser verdadeiro ou falso'],
      [/must be a UUID/, 'deve ser um UUID válido'],
      [/each value in .* must be a (.+)/, 'cada valor deve ser $1'],
      [/has invalid characters/, 'contém caracteres inválidos'],
      [/must match ".*"/, 'deve corresponder ao formato esperado'],
    ];
    for (const [re, repl] of patterns) {
      if (re.test(msg)) return msg.replace(re, repl);
    }
    return msg;
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (validationErrors: any[] = []) => {
        const messages = validationErrors.flatMap((err) => {
          const constraints = err?.constraints ? Object.values(err.constraints) : [];
          return constraints.map((m: string) => translateConstraintMessage(m));
        });
        return new BadRequestException({ message: messages.length === 1 ? messages[0] : messages });
      },
    }),
  );
  const port = Number(process.env.PORT || process.env.APP_PORT || 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`NestJS fresh app listening on port ${port}`);
}

bootstrap();
