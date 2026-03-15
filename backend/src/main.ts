import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { createProxyMiddleware } from 'http-proxy-middleware';

function buildAllowedOrigins() {
  const configured = String(process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const frontendUrl = String(process.env.FRONTEND_URL || '').trim();
  if (frontendUrl) configured.push(frontendUrl);

  configured.push('http://localhost:3001', 'http://127.0.0.1:3001');
  return Array.from(new Set(configured));
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
      if (!allowedOrigins.length || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} is not allowed by CORS`), false);
    },
    credentials: true,
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
