import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { createProxyMiddleware } from 'http-proxy-middleware';

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
  // Allow frontend (localhost:3001) and other origins during local development
  app.enableCors({ origin: true });
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
