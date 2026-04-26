import type { WhatsAppCenterPayload } from "@/lib/whatsapp-center";

export type ChannelProvider = "evolution" | "meta";

export type ProviderCapabilities = {
  provider: ChannelProvider;
  canUseTemplates: boolean;
  canUseOfficialButtons: boolean;
  canUseRecoveryTemplates: boolean;
  canUseAgendaBot: boolean;
};

export const EVOLUTION_PROVIDER_CAPABILITIES: ProviderCapabilities = {
  provider: "evolution",
  canUseTemplates: false,
  canUseOfficialButtons: false,
  canUseRecoveryTemplates: false,
  canUseAgendaBot: true,
};

export const META_PROVIDER_CAPABILITIES: ProviderCapabilities = {
  provider: "meta",
  canUseTemplates: true,
  canUseOfficialButtons: true,
  canUseRecoveryTemplates: true,
  canUseAgendaBot: true,
};

export function getProviderCapabilities(provider: ChannelProvider): ProviderCapabilities {
  return provider === "meta" ? META_PROVIDER_CAPABILITIES : EVOLUTION_PROVIDER_CAPABILITIES;
}

export function resolveProviderFromWhatsAppCenter(
  centerPayload: WhatsAppCenterPayload | null | undefined,
): ChannelProvider {
  return centerPayload?.center.mode === "OFFICIAL" ? "meta" : "evolution";
}

export function getProviderCapabilitiesFromWhatsAppCenter(
  centerPayload: WhatsAppCenterPayload | null | undefined,
): ProviderCapabilities {
  return getProviderCapabilities(resolveProviderFromWhatsAppCenter(centerPayload));
}

export function getProviderLabel(provider: ChannelProvider) {
  return provider === "meta" ? "Meta WhatsApp Oficial" : "Evolution WhatsApp";
}
