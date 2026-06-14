// Fluxo canônico de conexão WhatsApp (docs/Rules/WHATSAPP.md): modal QR /
// start / status / disconnect vive AQUI. Porta do arquivo homônimo do front
// antigo, adaptada ao client de API novo.

import { apiFetch } from "@/lib/api";
import type { WhatsAppBootstrapPayload, WhatsAppModalPayload, WhatsAppPairingCodePayload } from "@/lib/whatsapp-center";

export function buildWhatsAppBootstrapKey(payload: WhatsAppModalPayload) {
  return [
    payload.data.companyId,
    payload.data.tenantKey,
    payload.data.connectedAt || payload.data.phone || "connected",
  ].join(":");
}

export async function bootstrapWhatsAppAfterConnect(
  payload: WhatsAppModalPayload,
): Promise<WhatsAppBootstrapPayload | null> {
  if (payload.status !== "connected") return null;

  const bootstrap = await apiFetch<WhatsAppBootstrapPayload>("/companies/me/whatsapp-modal/bootstrap", {
    method: "POST",
  });
  if (!bootstrap.success || !bootstrap.connected || !bootstrap.bootstrapOk) {
    throw new Error(bootstrap.error || bootstrap.message || "Falha ao espelhar conversas e clientes.");
  }
  return bootstrap;
}

export function fetchWhatsAppModalStatus() {
  return apiFetch<WhatsAppModalPayload>("/companies/me/whatsapp-modal/status");
}

export function fetchWhatsAppModalQr() {
  return apiFetch<WhatsAppModalPayload>("/companies/me/whatsapp-modal/qr");
}

export function startWhatsAppModalSession() {
  return apiFetch<WhatsAppModalPayload>("/companies/me/whatsapp-modal/start", { method: "POST" });
}

export function disconnectWhatsAppModalSession() {
  return apiFetch<WhatsAppModalPayload>("/companies/me/whatsapp-modal/disconnect", { method: "POST" });
}

export function restartWhatsAppModalSession() {
  return apiFetch<WhatsAppModalPayload>("/companies/me/whatsapp-modal/restart", { method: "POST" });
}

// Conexão por código (sem QR / sem câmera): o backend cria a instância com o
// número e devolve o pairingCode do Webwhats/Baileys. sessionId = data.tenantKey.
export function requestWhatsAppPairingCode(sessionId: string, phoneNumber: string) {
  return apiFetch<WhatsAppPairingCodePayload>(
    `/whatsapp/sessions/${encodeURIComponent(sessionId)}/pairing-code`,
    { method: "POST", body: JSON.stringify({ phoneNumber }) },
  );
}
