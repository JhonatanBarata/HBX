"use client";

// Tradutor ÚNICO de erros do front. Recebe QUALQUER coisa lançada (ApiError do
// backend, falha de rede, DOMException de navegador, crash de render) e devolve
// uma forma amigável e previsível pro popup. Espelha o catálogo do backend
// (backend/src/common/errors/error-catalog.ts) para os casos que NASCEM aqui.

import type { ApiError } from "./api";

export type ErrorAction =
  | "retry"
  | "login"
  | "fix_input"
  | "contact_support"
  | "pay"
  | "wait"
  | "go_back";

export interface FriendlyError {
  title: string;
  message: string; // a mensagem amigável que aparece no popup
  code: string; // ex.: NETWORK_DOWN, NOT_FOUND, MIC_BUSY
  action: ErrorAction;
  traceId?: string; // referência pro "falar com técnico"
  severity: "warn" | "error";
}

const ACTION_LABEL: Record<ErrorAction, string> = {
  retry: "Tentar de novo",
  login: "Entrar de novo",
  fix_input: "Entendi",
  contact_support: "Falar com o técnico",
  pay: "Regularizar",
  wait: "Tentar de novo",
  go_back: "Voltar",
};

export function actionLabel(a: ErrorAction): string {
  return ACTION_LABEL[a] ?? "Entendi";
}

const TITLE: Record<string, string> = {
  NETWORK_DOWN: "Sem conexão com o sistema",
  TIMEOUT: "O servidor demorou",
  AUTH_SESSION_EXPIRED: "Sessão expirada",
  PAYMENT_REQUIRED: "Pagamento pendente",
  FORBIDDEN: "Sem permissão",
  NOT_FOUND: "Não encontrado",
  INTERNAL_ERROR: "Algo deu errado",
  SERVICE_UNAVAILABLE: "Sistema ocupado",
  MIC_NOT_ALLOWED: "Microfone bloqueado",
  MIC_NOT_FOUND: "Microfone não encontrado",
  MIC_BUSY: "Microfone ocupado",
};

function titleFor(code: string, severity: "warn" | "error"): string {
  return TITLE[code] ?? (severity === "error" ? "Ops, algo deu errado" : "Atenção");
}

// Mensagens cruas/técnicas que NUNCA devem aparecer pro usuário.
function looksRaw(msg: string): boolean {
  return /failed to fetch|networkerror|load failed|ECONNREFUSED|prisma|TypeError|undefined|cannot read|\bat\s+\w+\.|<html|^\s*</i.test(
    msg,
  );
}

// Rede de segurança por classe de status HTTP — espelha o backend.
function statusFallback(status: number): Omit<FriendlyError, "title" | "traceId"> {
  if (status === 401)
    return { code: "AUTH_SESSION_EXPIRED", message: "Sua sessão expirou. Entre novamente.", action: "login", severity: "warn" };
  if (status === 402)
    return { code: "PAYMENT_REQUIRED", message: "Pagamento pendente. Regularize para continuar usando.", action: "pay", severity: "warn" };
  if (status === 403)
    return { code: "FORBIDDEN", message: "Você não tem permissão para isso. Fale com o administrador.", action: "contact_support", severity: "warn" };
  if (status === 404)
    return { code: "NOT_FOUND", message: "Esse item não existe mais — pode ter sido removido.", action: "go_back", severity: "warn" };
  if (status === 409)
    return { code: "CONFLICT", message: "Essa ação conflita com o estado atual. Recarregue e tente de novo.", action: "retry", severity: "warn" };
  if (status === 413)
    return { code: "FILE_TOO_LARGE", message: "Arquivo muito grande. Envie um menor.", action: "fix_input", severity: "warn" };
  if (status === 400 || status === 422)
    return { code: "INVALID_INPUT", message: "Há um campo preenchido incorretamente. Revise e tente de novo.", action: "fix_input", severity: "warn" };
  if (status === 429)
    return { code: "SERVICE_UNAVAILABLE", message: "Muitas tentativas em pouco tempo. Aguarde um instante.", action: "wait", severity: "warn" };
  if (status === 502 || status === 503)
    return { code: "SERVICE_UNAVAILABLE", message: "Sistema sobrecarregado no momento. Tente em instantes.", action: "wait", severity: "warn" };
  if (status === 504)
    return { code: "TIMEOUT", message: "O servidor demorou a responder. Tente de novo.", action: "retry", severity: "warn" };
  if (status >= 500)
    return { code: "INTERNAL_ERROR", message: "Algo deu errado do nosso lado. Nosso técnico já foi avisado.", action: "contact_support", severity: "error" };
  return { code: "UNKNOWN", message: "Algo não saiu como esperado. Tente de novo.", action: "retry", severity: "warn" };
}

// Erros de navegador no microfone (getUserMedia rejeita com DOMException).
function mediaErrorMessage(name: string): FriendlyError | null {
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return { title: TITLE.MIC_NOT_ALLOWED, message: "Permita o acesso ao microfone no cadeado do navegador e tente de novo.", code: "MIC_NOT_ALLOWED", action: "fix_input", severity: "warn" };
    case "NotFoundError":
    case "OverconstrainedError":
      return { title: TITLE.MIC_NOT_FOUND, message: "Nenhum microfone disponível. Conecte um e tente de novo.", code: "MIC_NOT_FOUND", action: "fix_input", severity: "warn" };
    case "NotReadableError":
    case "AbortError":
      return { title: TITLE.MIC_BUSY, message: "Outro programa está usando o microfone. Feche-o e tente de novo.", code: "MIC_BUSY", action: "fix_input", severity: "warn" };
    default:
      return null;
  }
}

export function toFriendlyError(err: unknown): FriendlyError {
  // 1) Erro de navegador (microfone/mídia) — DOMException
  if (typeof DOMException !== "undefined" && err instanceof DOMException) {
    const mic = mediaErrorMessage(err.name);
    if (mic) return mic;
  }

  const e = err as Partial<ApiError> & { payload?: unknown; name?: string; message?: string };

  // 2) ApiError com envelope do backend (caminho preferencial)
  if (e && typeof e === "object" && typeof e.status === "number") {
    const p = (e.payload ?? {}) as { userMessage?: string; code?: string; action?: ErrorAction; traceId?: string; message?: string };
    const fb = statusFallback(e.status);
    const code = p.code || fb.code;
    const fromPayload = p.userMessage || (typeof p.message === "string" && !looksRaw(p.message) ? p.message : "");
    const message = fromPayload || fb.message;
    const action = (p.action as ErrorAction) || fb.action;
    return { title: titleFor(code, fb.severity), message, code, action, traceId: p.traceId, severity: fb.severity };
  }

  // 3) Falha de rede (fetch estourou antes de qualquer resposta)
  if (e instanceof TypeError || (typeof e?.message === "string" && /failed to fetch|networkerror|load failed/i.test(e.message))) {
    return { title: TITLE.NETWORK_DOWN, message: "Não foi possível falar com o sistema. Verifique sua internet — se persistir, o técnico já foi avisado.", code: "NETWORK_DOWN", action: "retry", severity: "error" };
  }

  // 4) Abort / timeout
  if (e?.name === "AbortError") {
    return { title: TITLE.TIMEOUT, message: "O servidor demorou a responder. Tente de novo.", code: "TIMEOUT", action: "retry", severity: "warn" };
  }

  // 5) Qualquer outra coisa — nunca mostra mensagem crua
  const msg = typeof e?.message === "string" ? e.message : "";
  return {
    title: "Ops, algo deu errado",
    message: !msg || looksRaw(msg) ? "Algo não saiu como esperado. Tente de novo." : msg,
    code: "UNKNOWN",
    action: "retry",
    severity: "error",
  };
}
