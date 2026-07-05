import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import {
  AppException,
  ERROR_CATALOG,
  ErrorCode,
  codeForStatus,
} from './error-catalog';

const IS_PROD = process.env.NODE_ENV === 'production';

/**
 * Padrões técnicos que NUNCA podem virar mensagem de usuário — se a mensagem
 * lançada bater aqui, o filtro a esconde e usa a amigável do catálogo.
 */
const TECHNICAL_RE =
  /ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|prisma|invalid input|cannot read|is not a function|undefined|null\)|\bat\s+\w+\.|TypeError|SyntaxError|ReferenceError|select .* from|insert into|\bP\d{4}\b/i;

/**
 * Mensagens GENÉRICAS do framework (inglês cru) que não servem pro usuário —
 * caem na mensagem amigável do catálogo. Ex.: "Unauthorized", "Cannot GET /x".
 */
const FRAMEWORK_RE =
  /^(Unauthorized|Forbidden|Bad Request|Not Found|Conflict|Payment Required|Internal Server Error|Service Unavailable|Bad Gateway|Gateway Timeout)\.?$|^Cannot (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/i;

function looksTechnical(msg: string): boolean {
  return TECHNICAL_RE.test(msg) || FRAMEWORK_RE.test(msg.trim());
}

interface Resolved {
  status: number;
  code: ErrorCode;
  userMessage: string;
  action: string;
  technical: string;
}

/**
 * Filtro GLOBAL: captura toda exceção que sobe num handler HTTP e devolve um
 * envelope único e previsível para o front:
 *
 *   { statusCode, code, message, userMessage, action, traceId }
 *
 * - `message` === `userMessage` (compat: telas antigas que leem `message` já
 *   mostram a versão amigável).
 * - 4xx de negócio (PT-BR) são confiados; 5xx nunca vazam stack/SQL.
 * - `traceId` é a referência pro "falar com técnico".
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const traceId = randomUUID().slice(0, 8).toUpperCase();

    // Payload de negócio estruturado (4xx com `code` próprio: SESSION_ALREADY_ACTIVE
    // + forceAvailable, EMAIL_CONFIRMATION_REQUIRED, ...). O front decide o FLUXO por
    // esses campos (renderiza "forçar entrada", retoma cadastro), então o envelope
    // genérico NÃO pode achatá-los. Repassa o objeto como veio + traceId/compat.
    const passthrough = this.structuredBusinessBody(exception);
    if (passthrough) {
      this.logger.debug(
        `[${traceId}] ${req?.method ?? '?'} ${req?.originalUrl ?? req?.url ?? '?'} -> ${passthrough.statusCode} ${String(passthrough.code)} :: business-passthrough`,
      );
      if (!res.headersSent) {
        res.status(passthrough.statusCode as number).json({ ...passthrough, traceId });
      }
      return;
    }

    const r = this.resolve(exception);

    const line = `[${traceId}] ${req?.method ?? '?'} ${req?.originalUrl ?? req?.url ?? '?'} -> ${r.status} ${r.code} :: ${r.technical}`;
    if (r.status >= 500) {
      this.logger.error(line, exception instanceof Error ? exception.stack : undefined);
    } else {
      this.logger.debug(line);
    }

    if (res.headersSent) return; // stream/proxy já respondeu — não dá pra reescrever

    const body: Record<string, unknown> = {
      statusCode: r.status,
      error: r.code,
      code: r.code,
      message: r.userMessage,
      userMessage: r.userMessage,
      action: r.action,
      traceId,
    };
    if (!IS_PROD) body.detail = r.technical; // detalhe técnico só fora de produção

    res.status(r.status).json(body);
  }

  /**
   * 4xx lançado pelo backend com um `code` de negócio próprio (objeto no corpo da
   * HttpException). Carregam campos que o front USA pra decidir o fluxo
   * (forceAvailable, activeSession, next, resume, email...) — o envelope genérico
   * os apagaria. Repassa o objeto como veio, garantindo statusCode/error/userMessage
   * de compat. Retorna null p/ qualquer outra coisa (segue o caminho normalizado):
   * AppException (catálogo), validação do Nest (`{message:[]}` sem `code`), 5xx.
   */
  private structuredBusinessBody(
    exception: unknown,
  ): Record<string, unknown> | null {
    if (exception instanceof AppException) return null; // catálogo trata (case 1)
    if (!(exception instanceof HttpException)) return null;
    const status = exception.getStatus();
    if (status >= 500) return null;
    const raw = exception.getResponse();
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;
    if (typeof obj.code !== 'string') return null; // só payloads que declaram code de negócio
    const message = typeof obj.message === 'string' ? obj.message : '';
    if (message && looksTechnical(message)) return null; // nunca repassa mensagem técnica crua
    const { statusCode: _drop, ...rest } = obj;
    void _drop;
    return {
      ...rest, // code, message, forceAvailable, activeSession, next, resume, ...
      statusCode: status,
      error: obj.code,
      userMessage: message || String(obj.code),
    };
  }

  private resolve(exception: unknown): Resolved {
    // 1) Exceção já catalogada
    if (exception instanceof AppException) {
      const entry = ERROR_CATALOG[exception.code];
      return {
        status: entry.status,
        code: exception.code,
        userMessage: entry.userMessage,
        action: entry.action,
        technical: exception.detail || entry.userMessage,
      };
    }

    // 2) HttpException padrão do Nest
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const technical = this.extractMessage(exception.getResponse());
      const code = codeForStatus(status);
      const fallback = ERROR_CATALOG[code];
      // <500: a mensagem lançada pelo backend é PT-BR de negócio → confiar nela
      // (a menos que pareça técnica). >=500: nunca vaza, usa a amigável do catálogo.
      const userMessage =
        status < 500 && technical && !looksTechnical(technical)
          ? technical
          : fallback.userMessage;
      return { status, code, userMessage, action: fallback.action, technical: technical || code };
    }

    // 3) Erros conhecidos do Prisma
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.resolvePrisma(exception);
    }
    if (exception instanceof Prisma.PrismaClientValidationError) {
      return this.fromCode('INVALID_INPUT', 'PrismaClientValidationError');
    }
    if (
      exception instanceof Prisma.PrismaClientInitializationError ||
      exception instanceof Prisma.PrismaClientRustPanicError
    ) {
      return this.fromCode('DB_UNAVAILABLE', (exception as Error).message);
    }

    // 4) Qualquer outra coisa → interno, nunca vaza
    return this.fromCode(
      'INTERNAL_ERROR',
      exception instanceof Error ? exception.message : String(exception),
    );
  }

  private resolvePrisma(ex: Prisma.PrismaClientKnownRequestError): Resolved {
    const technical = `${ex.code}: ${ex.message.split('\n').pop()?.trim() || ex.code}`;
    switch (ex.code) {
      case 'P2002': // unique constraint
        return this.fromCode('DUPLICATE', technical);
      case 'P2025': // record not found
        return this.fromCode('NOT_FOUND', technical);
      case 'P2003': // foreign key constraint
        return this.fromCode('FK_CONSTRAINT', technical);
      case 'P2000':
      case 'P2006':
      case 'P2007':
      case 'P2011':
      case 'P2012':
        return this.fromCode('INVALID_INPUT', technical);
      case 'P1001': // can't reach database
      case 'P1002': // database timeout
      case 'P1008': // operation timed out
      case 'P1017': // server closed the connection
        return this.fromCode('DB_UNAVAILABLE', technical);
      default:
        return this.fromCode('INTERNAL_ERROR', technical);
    }
  }

  private fromCode(code: ErrorCode, technical: string): Resolved {
    const entry = ERROR_CATALOG[code];
    return {
      status: entry.status,
      code,
      userMessage: entry.userMessage,
      action: entry.action,
      technical,
    };
  }

  private extractMessage(response: unknown): string {
    if (typeof response === 'string') return response;
    if (response && typeof response === 'object') {
      const m = (response as { message?: unknown }).message;
      if (Array.isArray(m)) return String(m[0] ?? '');
      if (typeof m === 'string') return m;
      const e = (response as { error?: unknown }).error;
      if (typeof e === 'string') return e;
    }
    return '';
  }
}
