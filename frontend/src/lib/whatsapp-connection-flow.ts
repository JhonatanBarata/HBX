import { apiFetch } from "@/app/_lib/api";
import type { WhatsAppBootstrapPayload, WhatsAppModalPayload } from "@/lib/whatsapp-center";

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
