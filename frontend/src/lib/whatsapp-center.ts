// Tipos e helpers do centro de conexão WhatsApp — porta enxuta do arquivo
// homônimo do front antigo (somente o que o fluxo de conexão usa).
// Contrato do backend: /companies/me/whatsapp-modal/* (status, start, qr,
// disconnect, restart, bootstrap).

export type WhatsAppModalPayload = {
  success: boolean;
  status: "offline" | "starting" | "waiting_qr" | "connected" | "reconnecting" | "disconnected" | "error";
  message: string;
  errorCode?: string | null;
  redirectTo?: string | null;
  data: {
    companyId: number;
    companyName: string;
    companySlug: string | null;
    tenantKey: string;
    provider: "external_modal";
    enabled: boolean;
    configured: boolean;
    available: boolean;
    providerHealth: "disabled" | "misconfigured" | "healthy" | "unavailable" | "unknown";
    missingConfigKeys: string[];
    phone: string | null;
    connectedAt: string | null;
    updatedAt: string | null;
    lastError: string | null;
    qrCodeDataUrl: string | null;
    rawStatus: string | null;
  };
};

export type WhatsAppPairingCodePayload = {
  success: boolean;
  sessionId: string;
  status: "waiting_code" | "code_generated" | "connected" | "expired" | "error" | "disconnected";
  code: string | null;
  expiresInSeconds: number;
  providerSupported: boolean;
  message: string;
  errorCode?: string | null;
  nextAllowedAt?: string | null;
};

export type WhatsAppBootstrapPayload = {
  success: boolean;
  connected: boolean;
  bootstrapOk: boolean;
  syncedContacts: number;
  syncedConversations: number;
  engine: string | null;
  message: string;
  error?: string | null;
};

// Diagnóstico de sessão do inbox (GET /inbox/whatsapp-session): diz qual número
// está conectado agora e quanto sobrou do número anterior — base para decidir
// se reaproveita (merge) ou começa limpo (discard) o histórico.
export type WhatsAppSessionDiagnostics = {
  providerWarning: { code: string; message: string } | null;
  whatsappSession: {
    accessible: boolean;
    reason: string;
    mode: "current" | "meta" | "none";
    currentSessionId: string | null;
    currentSession: {
      id: string;
      provider: string;
      phoneNormalized: string | null;
      displayPhone: string | null;
      connectedAt: string | null;
    } | null;
  };
  whatsappSessionCleanup: {
    required: boolean;
    currentSessionId: string | null;
    oldSessionCount: number;
    oldConversationCount: number;
    oldMessageCount: number;
    latestOldSession: {
      id: string;
      phoneNormalized: string | null;
      displayPhone: string | null;
      status: string | null;
      connectedAt: string | null;
      disconnectedAt: string | null;
      createdAt: string | null;
    } | null;
  };
};

export type WhatsAppSessionCleanupResult = {
  success: boolean;
  mode: "keep" | "merge" | "discard" | string;
  merged: number;
  deletedConversations: number;
  deletedMessages: number;
  deletedSessions?: number;
  message: string;
};

export function whatsappModalStatusLabel(value?: string | null) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "starting") return "Iniciando";
  if (normalized === "waiting_qr") return "Aguardando QR";
  if (normalized === "connected") return "Conectado";
  if (normalized === "reconnecting") return "Reconectando";
  if (normalized === "disconnected") return "Desconectado";
  if (normalized === "error") return "Erro";
  return "Offline";
}

// Rótulo curto para o pill do inbox:
//   Conectado → sessão viva
//   Reconectando → motor indisponível mas sessão era ativa (grace)
//   Caiu (reescaneie) → sessão encerrada / erro / não iniciado
export function whatsappPillLabel(status?: string | null): string {
  const s = String(status || "").trim().toLowerCase();
  if (s === "connected") return "Conectado";
  if (s === "reconnecting") return "Reconectando";
  if (s === "disconnected" || s === "error" || s === "offline") return "Caiu (reescaneie)";
  if (s === "starting" || s === "waiting_qr") return "Iniciando";
  return "Verificar";
}

// Variante de classe de tag conforme status: teal=ok, warn=transitório, red=caído
export function whatsappPillVariant(status?: string | null): string {
  const s = String(status || "").trim().toLowerCase();
  if (s === "connected") return " teal";
  if (s === "reconnecting" || s === "starting" || s === "waiting_qr") return " warn";
  return " red";
}

export function formatWhatsAppDateTime(value?: string | null) {
  const iso = String(value || "").trim();
  if (!iso) return "-";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("pt-BR");
}
