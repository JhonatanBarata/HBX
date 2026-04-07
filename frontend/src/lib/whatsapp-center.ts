export type WhatsAppCenterPayload = {
  generatedAt: string;
  company: {
    id: number;
    name?: string | null;
    onboardingStatus?: string | null;
    paymentStatus?: string | null;
    subscriptionStatus?: string | null;
    premiumAccess?: boolean;
    trialModuleSelection?: string | null;
    whatsappConnectionMode?: string | null;
    whatsappTemporaryStatus?: string | null;
  };
  center: {
    mode: "NONE" | "TEMPORARY" | "OFFICIAL";
    status: "NOT_CONNECTED" | "TEMPORARY" | "OFFICIAL" | "ATTENTION";
    statusLabel: string;
    statusHint: string;
    temporary: {
      selected: boolean;
      status: "NOT_CONNECTED" | "TEMPORARY" | "ATTENTION";
      available: boolean;
      configured?: boolean;
      note: string;
      liveStatus: "idle" | "qr_ready" | "connected" | "error";
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

export type WhatsAppDiagnosticFocus = "status" | "temporary" | "official";

export type WhatsAppModalPayload = {
  success: boolean;
  status: "offline" | "starting" | "waiting_qr" | "connected" | "disconnected" | "error";
  message: string;
  errorCode?: string | null;
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

export function formatWhatsAppDateTime(value?: string | null) {
  const iso = String(value || "").trim();
  if (!iso) return "-";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("pt-BR");
}

export function whatsappModeLabel(value?: string | null) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "TEMPORARY") return "Conexao rapida / temporaria";
  if (normalized === "OFFICIAL") return "Conexao oficial / Meta";
  return "Ainda nao definido";
}

export function whatsappTrialModuleLabel(value?: string | null) {
  return String(value || "").trim().toLowerCase() === "recovery" ? "Recovery" : "Vendas";
}

export function whatsappTemporaryLiveLabel(value?: string | null) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "connected") return "Conectado por QR";
  if (normalized === "qr_ready") return "QR aguardando leitura";
  if (normalized === "error") return "Atencao tecnica";
  return "Aguardando ativacao";
}

export function whatsappModalStatusLabel(value?: string | null) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "starting") return "Iniciando";
  if (normalized === "waiting_qr") return "Aguardando QR";
  if (normalized === "connected") return "Conectado";
  if (normalized === "disconnected") return "Desconectado";
  if (normalized === "error") return "Erro";
  return "Offline";
}
