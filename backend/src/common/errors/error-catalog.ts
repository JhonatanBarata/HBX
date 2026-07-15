import { HttpException } from '@nestjs/common';

/**
 * Catálogo CENTRAL de erros (Fonte única da verdade).
 *
 * Regra de ouro: TODO erro do sistema vira um `code` daqui e sai com uma
 * `userMessage` amigável — nunca "503 FUNCTION didn't answer". O filtro global
 * (all-exceptions.filter.ts) traduz qualquer exceção para uma destas entradas;
 * o popup único do front mostra `userMessage` + `traceId`.
 *
 * `action` diz o que o usuário pode fazer — o front usa pra rotular o botão do popup.
 */
export type ErrorAction =
  | 'retry' //            tentar de novo
  | 'login' //            refazer login
  | 'fix_input' //        corrigir o que digitou
  | 'contact_support' //  falar com o técnico/administrador
  | 'upgrade_plan' //     fazer upgrade do plano
  | 'pay' //              regularizar pagamento
  | 'wait' //             aguardar (serviço reiniciando)
  | 'go_back'; //         voltar (item sumiu)

export interface ErrorCatalogEntry {
  /** Status HTTP canônico quando este code é lançado diretamente. */
  status: number;
  /** Mensagem em PT-BR para o usuário final — a que aparece no popup. */
  userMessage: string;
  action: ErrorAction;
}

export const ERROR_CATALOG = {
  // ── Autenticação / sessão ──────────────────────────────────────────────
  AUTH_INVALID_CREDENTIALS: { status: 401, userMessage: 'Usuário ou senha incorretos.', action: 'fix_input' },
  AUTH_SESSION_EXPIRED: { status: 401, userMessage: 'Sua sessão expirou. Entre novamente.', action: 'login' },

  // ── Permissão / plano ──────────────────────────────────────────────────
  FORBIDDEN: { status: 403, userMessage: 'Você não tem permissão para isso. Fale com o administrador.', action: 'contact_support' },
  PLAN_FEATURE_LOCKED: { status: 403, userMessage: 'Esse recurso não está liberado no seu acesso.', action: 'upgrade_plan' },

  // ── Não encontrado ─────────────────────────────────────────────────────
  NOT_FOUND: { status: 404, userMessage: 'Esse item não existe mais — pode ter sido removido.', action: 'go_back' },

  // ── Conflito / regra de negócio ────────────────────────────────────────
  DUPLICATE: { status: 409, userMessage: 'Já existe um cadastro com esses dados.', action: 'fix_input' },
  CONFLICT: { status: 409, userMessage: 'Essa ação conflita com o estado atual. Recarregue e tente de novo.', action: 'retry' },
  PLAN_LIMIT_REACHED: { status: 409, userMessage: 'Você atingiu o limite do seu plano. Faça upgrade para continuar.', action: 'upgrade_plan' },
  FK_CONSTRAINT: { status: 409, userMessage: 'Esse item está ligado a outros registros e não pode ser removido agora.', action: 'go_back' },

  // ── Entrada inválida ───────────────────────────────────────────────────
  INVALID_INPUT: { status: 400, userMessage: 'Há um campo preenchido incorretamente. Revise e tente de novo.', action: 'fix_input' },
  FILE_TOO_LARGE: { status: 413, userMessage: 'Arquivo muito grande. Envie um menor.', action: 'fix_input' },

  // ── Pagamento ──────────────────────────────────────────────────────────
  PAYMENT_REQUIRED: { status: 402, userMessage: 'Pagamento pendente. Regularize para continuar usando.', action: 'pay' },
  PAYMENT_FAILED: { status: 402, userMessage: 'Não conseguimos processar o pagamento. Tente outro cartão.', action: 'retry' },

  // ── Serviços externos / motores ────────────────────────────────────────
  WHATSAPP_ENGINE_DOWN: { status: 503, userMessage: 'WhatsApp temporariamente indisponível. Reconectando…', action: 'wait' },
  RADAR_ENGINE_DOWN: { status: 503, userMessage: 'O Radar está reiniciando. Tente em instantes.', action: 'wait' },
  PAYMENT_GATEWAY_DOWN: { status: 503, userMessage: 'Pagamentos temporariamente indisponíveis. Tente em instantes.', action: 'wait' },
  SERVICE_UNAVAILABLE: { status: 503, userMessage: 'Sistema sobrecarregado no momento. Tente em instantes.', action: 'wait' },
  UPSTREAM_TIMEOUT: { status: 504, userMessage: 'O servidor demorou a responder. Tente de novo.', action: 'retry' },

  // ── Infra / interno ────────────────────────────────────────────────────
  DB_UNAVAILABLE: { status: 503, userMessage: 'Sistema sobrecarregado no momento. Tente em instantes.', action: 'wait' },
  INTERNAL_ERROR: { status: 500, userMessage: 'Algo deu errado do nosso lado. Nosso técnico já foi avisado.', action: 'contact_support' },
} as const satisfies Record<string, ErrorCatalogEntry>;

export type ErrorCode = keyof typeof ERROR_CATALOG;

/**
 * Rede de segurança por classe de status HTTP — garante que NENHUM erro
 * escapa sem mensagem humana, mesmo um que ninguém cadastrou.
 */
export const STATUS_FALLBACK: Record<number, ErrorCode> = {
  400: 'INVALID_INPUT',
  401: 'AUTH_SESSION_EXPIRED',
  402: 'PAYMENT_REQUIRED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'FILE_TOO_LARGE',
  429: 'SERVICE_UNAVAILABLE',
  500: 'INTERNAL_ERROR',
  502: 'SERVICE_UNAVAILABLE',
  503: 'SERVICE_UNAVAILABLE',
  504: 'UPSTREAM_TIMEOUT',
};

export function codeForStatus(status: number): ErrorCode {
  return STATUS_FALLBACK[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'INVALID_INPUT');
}

/**
 * Exceção já "amigável": o backend lança um code do catálogo e o filtro
 * entrega a mensagem certa sem adivinhação.
 *
 *   throw new AppException('PLAN_LIMIT_REACHED');
 *   throw new AppException('WHATSAPP_ENGINE_DOWN', { detail: 'ECONNREFUSED 172.18.0.1:8080' });
 */
export class AppException extends HttpException {
  readonly code: ErrorCode;
  readonly detail?: string;

  constructor(code: ErrorCode, opts?: { detail?: string; userMessage?: string }) {
    const entry = ERROR_CATALOG[code];
    super(
      { statusCode: entry.status, code, message: opts?.userMessage ?? entry.userMessage, error: code },
      entry.status,
    );
    this.code = code;
    this.detail = opts?.detail;
  }
}
