export type HbxMusicSubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "expired";

export type HbxMusicAccessState =
  | "trial_active"
  | "trial_expired"
  | "subscription_active"
  | "subscription_inactive";

export type HbxMusicDiscoveryLevel = "safe" | "balanced" | "adventurous";
export type HbxMusicSourceType = "mock" | "uploaded" | "future_provider";
export type HbxMusicBillingProviderName = "mock" | "mercadopago" | "apple" | "web";
export type HbxMusicRecommendationCategory =
  | "updates"
  | "continue_listening"
  | "discovery"
  | "national_top"
  | "global_top";

export type HbxMusicUser = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  trialStartAt: string;
  trialEndAt: string;
  subscriptionStatus: HbxMusicSubscriptionStatus;
  billingProvider: HbxMusicBillingProviderName;
  premiumAccess: boolean;
  preferredGenres: string[];
  preferredArtists: string[];
  discoveryLevel: HbxMusicDiscoveryLevel;
};

export type HbxMusicTrack = {
  id: string;
  title: string;
  artist: string;
  genre: string;
  country: string;
  coverGradient: [string, string];
  audioUrl: string;
  duration: number;
  tags: string[];
  sourceType: HbxMusicSourceType;
};

export type HbxMusicPlaylist = {
  id: string;
  userId: string;
  name: string;
  description: string;
  coverGradient: [string, string];
  trackIds: string[];
};

export type HbxMusicPlayHistory = {
  id: string;
  userId: string;
  trackId: string;
  playCount: number;
  lastPlayedAt: string;
  liked: boolean;
  skipped: boolean;
  totalListenSeconds: number;
};

export type HbxMusicRecommendation = {
  id: string;
  userId: string;
  trackId: string;
  score: number;
  reason: string;
  category: HbxMusicRecommendationCategory;
  createdAt: string;
  status: "ready" | "saved";
};

export type HbxMusicSubscription = {
  id: string;
  userId: string;
  planId: string;
  provider: HbxMusicBillingProviderName;
  status: HbxMusicSubscriptionStatus;
  trialStartAt: string;
  trialEndAt: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  planLabel: string;
  planPriceCents: number;
};

export type HbxMusicSnapshot = {
  user: HbxMusicUser;
  subscription: HbxMusicSubscription;
  accessState: HbxMusicAccessState;
  tracks: HbxMusicTrack[];
  playlists: HbxMusicPlaylist[];
  history: HbxMusicPlayHistory[];
  recommendations: HbxMusicRecommendation[];
  todayUpdates: HbxMusicRecommendation[];
  continueListening: HbxMusicTrack[];
  discoveries: HbxMusicRecommendation[];
  topNational: HbxMusicTrack[];
  topGlobal: HbxMusicTrack[];
  currentTrack: HbxMusicTrack | null;
};

export type HbxMusicScreenKey =
  | "home"
  | "updates"
  | "library"
  | "explore"
  | "player"
  | "profile"
  | "paywall"
  | "onboarding";
