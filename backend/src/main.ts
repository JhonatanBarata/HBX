import 'reflect-metadata';
import 'dotenv/config';
import type { Server } from 'http';
import type { Socket } from 'net';
import type { Request, Response } from 'express';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { assertIntegrationSecretKeyConfigured } from './integrations/integration-secrets.service';
import { resolveWebscrapingTarget } from './modules/webscraping-runtime.util';

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

/**
 * Controla quais origens Firebase Hosting passam no CORS.
 *
 * Modo RESTRITO (preferencial): se CORS_ALLOWED_FIREBASE_ORIGINS estiver preenchido,
 * aceita SOMENTE as origens exatas listadas nessa variável (ex.:
 * "https://guinchorioclarosp.web.app,https://madeireira-78732.web.app").
 *
 * Modo FALLBACK (retrocompatível): se a variável não estiver configurada,
 * mantém o comportamento anterior (qualquer *.web.app / *.firebaseapp.com),
 * evitando quebrar clientes em produção antes de o env ser preenchido.
 *
 * Para fechar de verdade: sete CORS_ALLOWED_FIREBASE_ORIGINS no backend .env da VPS
 * com as origens exatas de cada cliente.
 */
const _allowedFirebaseOrigins: Set<string> | null = (() => {
  const raw = String(process.env.CORS_ALLOWED_FIREBASE_ORIGINS || '').trim();
  if (!raw) return null; // fallback mode
  const origins = raw
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);
  return origins.length ? new Set(origins) : null;
})();

const _firebaseOriginFallbackRegex = /^https:\/\/[a-z0-9-]+\.(web\.app|firebaseapp\.com)$/i;

function isAllowedFirebaseOrigin(origin: string): boolean {
  if (_allowedFirebaseOrigins !== null) {
    // Modo restrito: apenas origens explicitamente permitidas
    return _allowedFirebaseOrigins.has(origin);
  }
  // Modo fallback: comportamento original (qualquer *.web.app / *.firebaseapp.com)
  return _firebaseOriginFallbackRegex.test(origin);
}

function isWebscrapingProxyPath(url: string | undefined) {
  const pathname = String(url || '').split('?', 1)[0] || '';

  const nativeApiPrefixes = [
    '/webscraping/runtime',
    '/webscraping/search',
    '/webscraping/web-search',
    '/webscraping/history',
    '/webscraping/radar',
    '/webscraping/export',
    '/hbx/webscraping/runtime',
    '/hbx/webscraping/search',
    '/hbx/webscraping/web-search',
    '/hbx/webscraping/history',
    '/hbx/webscraping/radar',
    '/hbx/webscraping/export',
  ];

  if (nativeApiPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return false;
  }

  return pathname === '/webscraping'
    || pathname.startsWith('/webscraping/')
    || pathname === '/hbx/webscraping'
    || pathname.startsWith('/hbx/webscraping/');
}

function rewriteWebscrapingPath(path: string) {
  const rewritten = path.replace(/^\/hbx\/webscraping(?=\/|$)/, '').replace(/^\/webscraping(?=\/|$)/, '');
  return rewritten || '/';
}

function warnIfIntegrationSecretKeyMissing() {
  try {
    assertIntegrationSecretKeyConfigured({ allowMissingInTest: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'INTEGRATION_SECRET_KEY ausente.';
    // eslint-disable-next-line no-console
    console.warn(`[integrations] ${message} O backend continua subindo, mas operacoes de conexao AUVO/TagPlus ficam indisponiveis ate a variavel ser configurada.`);
  }
}

function assertJwtSecretStrength() {
  const JWT_PLACEHOLDER = 'change-me-to-a-strong-secret';
  const jwtSecret = String(process.env.JWT_SECRET || '').trim();
  const isWeak = !jwtSecret || jwtSecret.length < 32 || jwtSecret === JWT_PLACEHOLDER;
  if (!isWeak) return;

  if (process.env.NODE_ENV === 'production') {
    // eslint-disable-next-line no-console
    console.error(
      '[security] JWT_SECRET ausente/fraco/placeholder — abortando boot em producao por seguranca. ' +
      'Configure uma chave aleatoria de pelo menos 32 caracteres na variavel JWT_SECRET.',
    );
    process.exit(1);
  } else {
    // eslint-disable-next-line no-console
    console.warn(
      '[security] AVISO: JWT_SECRET ausente, fraco ou usando placeholder. ' +
      'Tokens JWT serao frageis neste ambiente. Configure JWT_SECRET com pelo menos 32 caracteres antes de subir em producao.',
    );
  }
}

async function bootstrap() {
  assertJwtSecretStrength();
  warnIfIntegrationSecretKeyMissing();
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const allowedOrigins = buildAllowedOrigins();
  app.use((req: Request, res: Response, next: () => void) => {
    const origin = normalizeOrigin(req.headers.origin as string | undefined);
    if (
      origin &&
      (
        !allowedOrigins.length ||
        allowedOrigins.includes(origin) ||
        isAllowedFirebaseOrigin(origin)
      )
    ) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type,Authorization,x-master-route,Accept,Cache-Control,Pragma',
      );
    }
    next();
  });
  const webscrapingTarget = resolveWebscrapingTarget();
  const webscrapingProxy = createProxyMiddleware({
    target: webscrapingTarget.target,
    changeOrigin: true,
    xfwd: true,
    ws: true,
    proxyTimeout: 15000,
    timeout: 15000,
    pathRewrite: rewriteWebscrapingPath,
    on: {
      proxyReqWs: (proxyReq, req) => {
        proxyReq.setHeader('Connection', 'Upgrade');
        proxyReq.setHeader('Upgrade', 'websocket');
        proxyReq.setHeader('X-Forwarded-Prefix', '/hbx/webscraping');
        if (req.headers.origin) {
          proxyReq.setHeader('Origin', webscrapingTarget.target);
        }
      },
      error: (error, _req, res) => {
        const response = res as Response;
        const isTimeout = error instanceof Error && error.name === 'Error' && /timeout/i.test(error.message);
        if (response.headersSent) return;
        response.status(503).json({
          code: isTimeout ? 'upstream_timeout' : 'upstream_unreachable',
          status: 'offline',
          message: isTimeout
            ? 'O servico webscraping nao respondeu dentro do tempo limite do proxy.'
            : 'O proxy nao conseguiu alcancar o servico webscraping configurado.',
        });
      },
    },
  });

  // Conditional middleware: only proxy if it's not a native API route
  const webscrapingConditionalProxy = (req: Request, res: Response, next: () => void) => {
    if (webscrapingTarget.configError) {
      res.status(503).json({
        code: webscrapingTarget.configError.code,
        message: webscrapingTarget.configError.message,
        status: 'offline',
      });
      return;
    }

    // Check if this is a native API route - if so, skip proxy and let NestJS handle it
    if (!isWebscrapingProxyPath(req.path)) {
      next();
      return;
    }

    // Otherwise, proxy to the legacy service
    webscrapingProxy(req, res, next);
  };

  app.use('/webscraping', webscrapingConditionalProxy);
  app.use('/hbx/webscraping', webscrapingConditionalProxy);
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const normalizedOrigin = normalizeOrigin(origin);
      if (
        !allowedOrigins.length ||
        allowedOrigins.includes(normalizedOrigin) ||
        isAllowedFirebaseOrigin(normalizedOrigin)
      ) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${normalizedOrigin} is not allowed by CORS`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-master-route',
      'Accept',
      'Cache-Control',
      'Pragma',
    ],
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
  const httpServer = app.getHttpServer() as Server;
  httpServer.on('upgrade', (req, socket, head) => {
    if (!isWebscrapingProxyPath(req.url)) return;
    webscrapingProxy.upgrade(req, socket as Socket, head);
  });
  // eslint-disable-next-line no-console
  console.log(`NestJS fresh app listening on port ${port}`);
}

bootstrap();
