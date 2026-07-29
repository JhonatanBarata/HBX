import {
  RADAR_CHANNEL_ORDER,
  resolveRadarChannelPresence,
  type RadarChannel,
} from "@/lib/radar-channel-presence";

export type VendasChannelLead = {
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  emails?: string[] | null;
  phones?: string[] | null;
  phonesWhatsapp?: Record<string, boolean> | null;
  ownerInstagram?: string | null;
  ownerFacebook?: string | null;
  leadIntelligence?: {
    whatsappStatus?: string | null;
    emailStatus?: string | null;
    websiteStatus?: string | null;
    instagramUrl?: string | null;
    facebookUrl?: string | null;
  } | null;
};

export function vendasCanais(lead: VendasChannelLead): RadarChannel[] {
  const intelligence = lead.leadIntelligence;
  const temWhatsApp = intelligence?.whatsappStatus === "confirmed"
    || Object.values(lead.phonesWhatsapp || {}).some(Boolean);
  const presence = resolveRadarChannelPresence({
    hasWhatsapp: temWhatsApp,
    hasPhone: Boolean(lead.phone) || (lead.phones?.length ?? 0) > 0,
    hasEmail: Boolean(lead.email) || (lead.emails?.length ?? 0) > 0 || intelligence?.emailStatus === "confirmed",
    instagramUrl: intelligence?.instagramUrl || lead.ownerInstagram || null,
    facebookUrl: intelligence?.facebookUrl || lead.ownerFacebook || null,
    website: lead.website || (intelligence?.websiteStatus === "confirmed" ? "sim" : null),
  });

  return RADAR_CHANNEL_ORDER.filter((canal) => presence[canal]);
}
