import { normalizeInternalRouteAlias } from "./route-aliases";

export type WhatsAppCenterPayload = {
  generatedAt: string;
  company: {
    id: number;
    name?: string | null;
    status?: string | null;
    selectedPlanKey?: string | null;
    contactPhone?: string | null;
    trialModuleSelection?: string | null;
    whatsappConnectionMode?: string | null;
    whatsappTemporaryStatus?: string | null;
  };
  center: {
    mode: "NONE" | "QR" | "OFFICIAL";
    status: "NOT_CONNECTED" | "QR" | "OFFICIAL" | "ATTENTION";
    statusLabel: string;
    statusHint: string;
    qrConnection: {
      selected: boolean;
      status: "NOT_CONNECTED" | "QR" | "ATTENTION";
      available: boolean;
      configured?: boolean;
      note: string;
      liveStatus: "idle" | "qr_ready" | "connected" | "stale" | "error";
      provider?: string | null;
      instanceKey?: string | null;
      pairingCode?: string | null;
      qrCodeDataUrl?: string | null;
      displayNumber?: string | null;
      connectedAt?: string | null;
      lastSyncAt?: string | null;
      errorMessage?: string | null;
      missingConfigKeys?: string[];
      setupHint?: string | null;
    };
    official: {
      selected: boolean;
      configured: boolean;
      connected: boolean;
      status?: string | null;
      displayNumber?: string | null;
      usingMasterToken: boolean;
      credentialLabel?: string | null;
      phoneNumberId?: string | null;
      wabaId?: string | null;
    };
    migration: {
      interestRequested: boolean;
      requestedAt?: string | null;
    };
  };
};

export type WhatsAppDiagnosticFocus = "status" | "qr" | "official";

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

export type WhatsAppLiveHealthStatus = "healthy" | "stale" | "reconnecting" | "disconnected" | "error";
export type WhatsAppLiveHealthRecommendedAction =
  | "none"
  | "refresh"
  | "restart"
  | "open_qr"
  | "disconnect_reconnect"
  | "check_provider";

export type WhatsAppLiveHealthPayload = {
  status: WhatsAppLiveHealthStatus;
  connected: boolean;
  liveConfirmed: boolean;
  storedStatus: string | null;
  providerStatus: string | null;
  providerReachable: boolean;
  lastCheckedAt: string;
  lastProviderSyncAt: string | null;
  lastInboundMessageAt: string | null;
  lastOutboundMessageAt: string | null;
  staleSeconds: number | null;
  reason: string;
  actionLabel: string;
  actionHref: string;
  actionFocus?: WhatsAppDiagnosticFocus;
  recommendedAction: WhatsAppLiveHealthRecommendedAction;
  providerHealth?: "disabled" | "misconfigured" | "healthy" | "unavailable" | "unknown";
  inboundStale?: boolean;
  inboundStaleSeconds?: number | null;
  ttlSeconds?: number;
  inboundStaleMinutes?: number;
};

export function formatWhatsAppDateTime(value?: string | null) {
  const iso = String(value || "").trim();
  if (!iso) return "-";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("pt-BR");
}

export function whatsappModeLabel(value?: string | null) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "QR" || normalized === "TEMPORARY") return "Conexao rapida por QR";
  if (normalized === "OFFICIAL") return "Meta oficial";
  return "Ainda nao definido";
}

export function whatsappTrialModuleLabel(value?: string | null) {
  return String(value || "").trim().toLowerCase() === "recovery" ? "Recovery" : "Vendas";
}

export function whatsappQrConnectionLiveLabel(value?: string | null) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "connected") return "Conectado por QR";
  if (normalized === "stale") return "Status salvo, sem confirmação";
  if (normalized === "qr_ready") return "QR aguardando leitura";
  if (normalized === "error") return "Atencao tecnica";
  return "Aguardando ativacao";
}

export function formatWhatsAppLiveHealthStatus(value?: string | null) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "healthy") return "QR vivo confirmado";
  if (normalized === "stale") return "Status salvo, sem confirmação";
  if (normalized === "reconnecting") return "Reconectando";
  if (normalized === "disconnected") return "Desconectado";
  if (normalized === "error") return "Provider indisponível";
  return "Em leitura";
}

export function whatsappModalStatusLabel(value?: string | null) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "starting") return "Iniciando";
  if (normalized === "waiting_qr") return "Aguardando QR";
  if (normalized === "connected") return "Conectado";
  if (normalized === "reconnecting") return "Aguardando reconexao";
  if (normalized === "disconnected") return "Desconectado";
  if (normalized === "error") return "Erro";
  return "Offline";
}

export function getWhatsAppModalPlanRedirect(payload?: WhatsAppModalPayload | null) {
  if (payload?.errorCode === "TRIAL_PHONE_ALREADY_USED") {
    return normalizeInternalRouteAlias(payload.redirectTo) || "/planos?intent=trial_phone_used";
  }
  return null;
}
