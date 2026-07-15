export type RadarChannel =
  | "whatsapp"
  | "telefone"
  | "email"
  | "instagram"
  | "facebook"
  | "site";

/**
 * Contrato sanitizado de disponibilidade de canais.
 *
 * Ele informa somente se o Radar encontrou o canal. Os valores que permitem
 * contato (telefone, e-mail e URLs) continuam em campos separados e podem
 * permanecer mascarados até o lead ser puxado.
 */
export type ChannelPresence = Readonly<Record<RadarChannel, boolean>>;

export const RADAR_CHANNEL_ORDER: readonly RadarChannel[] = [
  "whatsapp",
  "telefone",
  "email",
  "instagram",
  "facebook",
  "site",
];

export type RadarChannelPresenceSource = {
  channelPresence?: Partial<ChannelPresence> | null;
  hasWhatsapp?: boolean;
  hasPhone?: boolean;
  hasEmail?: boolean;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  website?: string | null;
};

function presenceOrFallback(
  explicit: Partial<ChannelPresence> | null | undefined,
  channel: RadarChannel,
  fallback: boolean,
): boolean {
  const value = explicit?.[channel];
  return typeof value === "boolean" ? value : fallback;
}

export function resolveRadarChannelPresence(source: RadarChannelPresenceSource): ChannelPresence {
  const explicit = source.channelPresence;
  return {
    whatsapp: presenceOrFallback(explicit, "whatsapp", source.hasWhatsapp === true),
    telefone: presenceOrFallback(explicit, "telefone", source.hasPhone === true),
    email: presenceOrFallback(explicit, "email", source.hasEmail === true),
    instagram: presenceOrFallback(explicit, "instagram", Boolean(source.instagramUrl)),
    facebook: presenceOrFallback(explicit, "facebook", Boolean(source.facebookUrl)),
    site: presenceOrFallback(explicit, "site", Boolean(source.website)),
  };
}
