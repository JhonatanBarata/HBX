export const HBX_MUSIC_FIRESTORE_COLLECTIONS = {
  users: "hbxMusicUsers",
  subscriptions: "hbxMusicSubscriptions",
  tracks: "hbxMusicTracks",
  playlists: "hbxMusicPlaylists",
  playHistory: "hbxMusicPlayHistory",
  recommendations: "hbxMusicRecommendations",
  billingEvents: "hbxMusicBillingEvents",
} as const;

export const HBX_MUSIC_FIRESTORE_NOTES = {
  userDocument:
    "Guardar trialStartAt, trialEndAt, subscriptionStatus, preferredGenres, preferredArtists e premiumAccess.",
  subscriptionDocument:
    "Manter provider, status, periodos atuais, trial e idempotencia de webhooks futuros.",
  recommendationDocument:
    "Persistir score, reason, category, createdAt e status para cache e auditoria da home diaria.",
} as const;
