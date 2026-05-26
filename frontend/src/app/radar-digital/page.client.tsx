"use client";

import { type CSSProperties, type FocusEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import DashboardScaffold from "@/components/DashboardScaffold";
import HbxMobileDock from "@/components/mobile/HbxMobileDock";
import MobileLeadScoreGauge from "@/components/mobile/MobileLeadScoreGauge";
import {
  HbxStateCityPicker,
  HbxTargetTypeSelector,
  type HbxEngineValue,
  type HbxTargetTypeValue,
} from "@/components/prospecting-filters";
import { apiFetch, type ApiFetchError } from "@/app/_lib/api";
import { toMobileRoute } from "@/app/_lib/mobileRoutes";
import { startSmartPolling } from "@/app/_lib/polling";
import { useRequireModule } from "@/app/_lib/useRequireModule";
import { clearTopbarProgress, dispatchTopbarProgress } from "@/lib/topbar-progress";
import {
  clearStoredRadarFilters,
  clearStoredRadarRun,
  isRadarRunNotFoundError,
  isRadarRunNotFoundPayload,
  readStoredRadarFilters,
  readStoredRadarRun,
  saveStoredRadarFilters,
  saveStoredRadarRun,
} from "@/lib/radar-active-run";
import { commercialPlanByKey, type CommercialPlansPayload } from "@/lib/commercial-plans";
import { BRAZIL_CITIES_BY_STATE, BRAZIL_STATES } from "@/lib/brazil-locations";
import { HBX_SEGMENT_SUGGESTIONS } from "@/lib/hbx-segment-suggestions";
import styles from "./page.module.css";

type RadarLeadHistory = {
  id: string;
  eventType: string;
  note?: string | null;
  createdAt?: string | null;
};

type RadarLead = {
  id: string;
  name: string;
  phone?: string | null;
  phoneDigits?: string | null;
  ddd?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  segment?: string | null;
  website?: string | null;
  websiteStatus?: string | null;
  email?: string | null;
  emailStatus?: "confirmed" | "probable" | "missing" | "invalid" | "unverified" | string | null;
  emailSource?: string | null;
  emailConfidence?: number | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  socialStatus?: string | null;
  socialConfidence?: number | null;
  googleMapsUrl?: string | null;
  businessCategory?: string | null;
  openingHoursStatus?: string | null;
  recommendedChannel?: "whatsapp" | "email" | "call" | "review" | "discard" | string | null;
  painType?: string | null;
  painLabel?: string | null;
  painPitch?: string | null;
  enrichmentScore?: number | null;
  enrichmentConfidence?: number | null;
  enrichmentJson?: Record<string, unknown> | string | null;
  lastEnrichedAt?: string | null;
  enrichmentVersion?: string | null;
  opportunityScore?: number | null;
  opportunityReason?: string | null;
  rating?: number | null;
  reviews?: number | null;
  sourceUrl?: string | null;
  source?: string | null;
  sourceEngine?: string | null;
  sourceEngines?: string[];
  status?: string | null;
  companyStatus?: string | null;
  ownershipStatus?: "available" | "mine" | "in_attendance" | "negative" | string | null;
  ownerCompanyId?: number | null;
  claimedAt?: string | null;
  historySummary?: RadarLeadHistory[];
  lastSeenAt?: string | null;
  firstSeenAt?: string | null;
  whatsappStatus?: "confirmed" | "missing" | "unverified" | string | null;
  whatsappCheckStatus?: "confirmed" | "missing" | "unverified" | string | null;
  quality?: Record<string, unknown> | null;
  qualityV2?: Record<string, unknown> | null;
  visibilityTier?: "candidate" | "list_basic" | "enrichment_pending" | "lead_plus_qualified" | "review_backup" | "blocked" | string | null;
  billable?: boolean | null;
  debitEligible?: boolean | null;
  deliveryProduct?: "list" | "lead_plus" | string | null;
  evidenceJson?: Record<string, unknown> | string | null;
  rejectReasons?: string[] | null;
  qualityReason?: string | null;
  premiumLocked?: boolean | null;
  premiumFeatureStatus?: string | null;
  premiumTeaser?: boolean | null;
};

type RadarLeadsResponse = {
  items: RadarLead[];
  total: number;
  code?: string;
  message?: string;
  retryable?: boolean;
  meta?: {
    available?: boolean;
    message?: string;
    page?: number;
    limit?: number;
    availableFilters?: RadarAvailableFilters;
    enrichmentSummary?: RadarEnrichmentSummary;
  };
};

type RadarEnrichmentSummary = {
  cardsAnalyzed?: number;
  whatsappVerified?: number;
  emailConfirmedOrProbable?: number;
  noWebsite?: number;
  highPriority?: number;
  discardedOrBlocked?: number;
  readyToCall?: number;
};

type RadarQualitySummary = {
  found?: number;
  approved?: number;
  rejected?: number;
  discarded?: number;
  durationMs?: number | null;
  label?: string | null;
};

type RadarPullResponse = {
  items: RadarLead[];
  code?: string;
  message?: string;
  retryable?: boolean;
  meta?: {
    requestedQuantity?: number;
    deliveredCount?: number;
    rawFoundCount?: number;
    approvedCount?: number;
    rejectedCount?: number;
    replenish?: {
      ran?: boolean;
      fetchedCount?: number;
      errorMessage?: string;
    };
  };
};

type RadarSearchRunStatus =
  | "queued"
  | "running"
  | "sleeping"
  | "completed"
  | "partial_error"
  | "completed_insufficient_results"
  | "failed"
  | "canceled";

type RadarSearchRunResponse = RadarPullResponse & {
  id: string;
  runId: string;
  status: RadarSearchRunStatus;
  total?: number;
  targetQuantity: number;
  foundCount: number;
  errorMessage?: string | null;
  meta?: RadarPullResponse["meta"] & {
    databaseCount?: number;
    fetchedCount?: number;
    progress?: number;
    terminal?: boolean;
    status?: RadarSearchRunStatus;
    runId?: string;
    nextRetryAt?: string | null;
    attemptCount?: number;
    autoImport?: {
      ran?: boolean;
      importedCount?: number;
      processedCount?: number;
      pendingCount?: number | null;
      remaining?: number | null;
      blocked?: boolean;
      failures?: Array<{ reason?: string | null; count?: number | null }>;
    } | null;
    filters?: {
      state?: string | null;
      city?: string | null;
      segment?: string | null;
      radiusKm?: number | null;
      regionalCities?: Array<{ city?: string | null; state?: string | null; distanceKm?: number | null }>;
      selectedSegments?: string[];
      targetType?: HbxTargetTypeValue | string | null;
    };
    searchScope?: {
      currentCity?: string | null;
      currentState?: string | null;
      currentSegment?: string | null;
      cityIndex?: number | null;
      cityCount?: number | null;
      segmentIndex?: number | null;
      segmentCount?: number | null;
      queryIndex?: number | null;
      queryCount?: number | null;
      taskIndex?: number | null;
      taskCount?: number | null;
      radiusKm?: number | null;
      selectedSegments?: string[];
    } | null;
    qualitySummary?: RadarQualitySummary;
  };
};

type SalesProfileResponse = {
  effectiveProfile?: {
    whatDoYouSell?: string | null;
    offerCategory?: string | null;
    targetAudience?: string[] | null;
    targetSegments?: string[] | null;
    avoidSegments?: string[] | null;
    hardRejectSegments?: string[] | null;
    preferredChannels?: string[] | null;
    leadPreferences?: Record<string, unknown> | null;
    negativeRules?: Record<string, unknown> | null;
  } | null;
};

type RadarLeadDetailResponse = RadarLead | { item?: RadarLead | null; events?: RadarLeadHistory[] };
type RadarWhatsappCheckMode = "off" | "enrich" | "only_valid";

type ImportToVendasResponse = {
  ok: boolean;
  createdCount: number;
  updatedCount: number;
  distributedCount?: number;
  failedCount?: number;
  skippedWithoutWhatsapp?: number;
  message?: string;
};

type GerencialTeamUser = {
  id: number;
  name?: string | null;
  email?: string | null;
  username?: string | null;
  role?: string | null;
  isActive?: boolean;
  commissionPercent?: number | null;
  territoryCities?: RadarAutoDistributionTerritoryCity[];
};

type RadarAutoDistributionTerritoryCity = {
  city: string;
  state: string;
};

type RadarAutoDistributionTerritory = {
  userId: number;
  cities: RadarAutoDistributionTerritoryCity[];
};

type RadarAutoDistributionRule = {
  id?: string | null;
  status: "draft" | "active" | "paused";
  includeAdmin: boolean;
  adminTargetStock: number;
  targetStockPerSeller: number;
  adminDailyLimit?: number;
  dailyLimitPerSeller?: number;
  preferredState?: string | null;
  preferredCity?: string | null;
  segment?: string | null;
  categoryKey?: string | null;
  radiusKm?: number | null;
  targetMode?: string | null;
  territoryMode?: string | null;
  territories?: RadarAutoDistributionTerritory[];
  targetUserIds?: number[];
  targetUsers?: GerencialTeamUser[];
  updatedAt?: string | null;
};

type RadarAutoDistributionResponse = {
  ok?: boolean;
  message?: string;
  activeSellerCount?: number;
  rule?: RadarAutoDistributionRule | null;
};

type RadarAutoDistributionRunResponse = {
  ok?: boolean;
  message?: string;
  distributedCount?: number;
  failedCount?: number;
  shortageCount?: number;
  blockedByLimit?: boolean;
};

type RadarAutoDistributionDraft = {
  includeAdmin: boolean;
  adminTargetStock: number;
  targetStockPerSeller: number;
  adminDailyLimit: number;
  dailyLimitPerSeller: number;
  preferredState: string;
  preferredCity: string;
  segment: string;
  radiusKm: number;
  territories: RadarAutoDistributionTerritory[];
};

type RadarEnrichResponse = {
  ok?: boolean;
  message?: string;
  item?: RadarLead | null;
};

type VendasUsageSnapshot = {
  cards?: {
    remaining?: number;
    dailyRemaining?: number;
    dailySafetyLimit?: number;
    dailyUsed?: number;
    monthlyRemaining?: number;
    monthlyLimit?: number;
    userLimit?: number;
    userUsed?: number;
    perUserLimit?: number | null;
  };
  dailyResetAt?: string | null;
};

type VendasPendingSummaryResponse = {
  ok?: boolean;
  pendingCount?: number;
  message?: string | null;
};

type RadarFilterOption = {
  value: string;
  label: string;
  count: number;
};

type RadarAvailableFilters = {
  states?: RadarFilterOption[];
  citiesByState?: Record<string, RadarFilterOption[]>;
  segments?: RadarFilterOption[];
};

type FilterState = {
  state: string;
  city: string;
  segment: string;
  radiusKm: number;
  originLat: number | null;
  originLng: number | null;
  quantity: number;
  engine: HbxEngineValue;
  targetType: HbxTargetTypeValue;
  ddd: string;
  scoreRange: string;
  noWebsite: boolean;
  withWebsite: boolean;
  highOpportunity: boolean;
  minRating: string;
  minReviews: string;
  status: string;
};

type RadarChannel = "whatsapp" | "instagram" | "email" | "website" | "phone" | "facebook";

const PAGE_SIZE = 100;
const RADAR_PROGRESS_STEPS = ["lendo banco", "filtrando negativos", "selecionando melhores cards", "alimentando Vendas/Prospecção"];
const MOBILE_RADAR_SEARCH_NOTICE_DISMISSED_KEY = "hbx.radar.mobile.searchNoticeDismissed.v1";

const DEFAULT_FILTERS: FilterState = {
  state: "",
  city: "",
  segment: "",
  radiusKm: 50,
  originLat: null,
  originLng: null,
  quantity: 30,
  engine: "hbx",
  targetType: "pj",
  ddd: "",
  scoreRange: "",
  noWebsite: false,
  withWebsite: false,
  highOpportunity: false,
  minRating: "",
  minReviews: "",
  status: "",
};

function normalizeRadarTerritoryKey(city?: string | null, state?: string | null) {
  const normalizedCity = normalizeLocationLookup(city || "");
  const normalizedState = String(state || "").trim().toUpperCase();
  return normalizedCity && normalizedState ? `${normalizedCity}:${normalizedState}` : "";
}

function normalizeRadarAutoDistributionTerritories(value: unknown): RadarAutoDistributionTerritory[] {
  const source = Array.isArray(value) ? value : [];
  return source
    .map((item: any) => {
      const userId = Math.trunc(Number(item?.userId || 0));
      const cities = Array.from(
        new Map<string, RadarAutoDistributionTerritoryCity>(
          (Array.isArray(item?.cities) ? item.cities : [])
            .map((cityItem: any) => ({
              city: String(cityItem?.city || "").trim(),
              state: String(cityItem?.state || "").trim().toUpperCase(),
            }))
            .filter((cityItem: RadarAutoDistributionTerritoryCity) => cityItem.city && cityItem.state)
            .map((cityItem: RadarAutoDistributionTerritoryCity) => [normalizeRadarTerritoryKey(cityItem.city, cityItem.state), cityItem]),
        ).values(),
      ).slice(0, 20);
      return { userId, cities };
    })
    .filter((item: RadarAutoDistributionTerritory) => item.userId > 0 && item.cities.length > 0);
}

function buildRadarAutoDistributionDraft(
  rule: RadarAutoDistributionRule | null | undefined,
  filters: FilterState,
): RadarAutoDistributionDraft {
  return {
    includeAdmin: Boolean(rule?.includeAdmin),
    adminTargetStock: Math.max(0, Math.trunc(Number(rule?.adminTargetStock ?? filters.quantity ?? 30) || 0)),
    targetStockPerSeller: Math.max(1, Math.trunc(Number(rule?.targetStockPerSeller ?? 30) || 30)),
    adminDailyLimit: Math.max(0, Math.trunc(Number(rule?.adminDailyLimit ?? rule?.adminTargetStock ?? filters.quantity ?? 30) || 0)),
    dailyLimitPerSeller: Math.max(0, Math.trunc(Number(rule?.dailyLimitPerSeller ?? 20) || 20)),
    preferredState: String(rule?.preferredState ?? filters.state ?? "").trim().toUpperCase(),
    preferredCity: String(rule?.preferredCity ?? filters.city ?? "").trim(),
    segment: String(rule?.segment ?? filters.segment ?? "").trim(),
    radiusKm: Math.max(0, Math.trunc(Number(rule?.radiusKm ?? filters.radiusKm ?? DEFAULT_FILTERS.radiusKm) || 0)),
    territories: normalizeRadarAutoDistributionTerritories(rule?.territories),
  };
}

function radarAutoDistributionStatusLabel(status?: string | null) {
  if (status === "active") return "Ativa";
  if (status === "paused") return "Pausada";
  return "Rascunho";
}

const MAX_CARDS_PER_RADAR_SEARCH = 100;
const RADAR_VENDAS_STOCK_TARGET_MAX = 100;

const RADAR_RADIUS_OPTIONS = [0, 25, 50, 100] as const;

function radarRadiusLabel(value?: number | null) {
  const radius = Math.max(0, Number(value || 0));
  return radius > 0 ? `${radius} km` : "Cidade";
}

function normalizeLocationLookup(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function resolveBrazilStateUf(value?: string | null) {
  const raw = String(value || "").trim().replace(/^BR-/i, "").toUpperCase();
  if (BRAZIL_STATES.some((item) => item.uf === raw)) return raw;
  const normalized = normalizeLocationLookup(value);
  return BRAZIL_STATES.find((item) => normalizeLocationLookup(item.name) === normalized)?.uf || "";
}

async function reverseGeocodeCurrentPosition(position: GeolocationPosition) {
  const latitude = position.coords.latitude;
  const longitude = position.coords.longitude;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 9000);
  try {
    const url = new URL("https://api.bigdatacloud.net/data/reverse-geocode-client");
    url.searchParams.set("latitude", String(latitude));
    url.searchParams.set("longitude", String(longitude));
    url.searchParams.set("localityLanguage", "pt-BR");
    const response = await fetch(url.toString(), { signal: controller.signal });
    if (!response.ok) throw new Error("Localização indisponível.");
    const payload = await response.json() as {
      city?: string | null;
      locality?: string | null;
      principalSubdivision?: string | null;
      principalSubdivisionCode?: string | null;
    };
    const state = resolveBrazilStateUf(payload.principalSubdivisionCode || payload.principalSubdivision);
    const city = String(payload.city || payload.locality || "").trim();
    if (!state || !city) throw new Error("Não consegui identificar cidade e estado.");
    return { state, city, lat: latitude, lng: longitude };
  } finally {
    window.clearTimeout(timeout);
  }
}

function getCurrentBrowserPosition() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Seu navegador não liberou localização."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      maximumAge: 1000 * 60 * 15,
      timeout: 10000,
    });
  });
}

const RADAR_CHANNELS: Array<{ value: RadarChannel; label: string; icon: string; darkIcon: string }> = [
  { value: "whatsapp", label: "WhatsApp", icon: "/icons/hbx-channels/whatsapp.webp", darkIcon: "/icons/hbx-channels/whatsapp_dark.webp" },
  { value: "instagram", label: "Instagram", icon: "/icons/hbx-channels/instagram.webp", darkIcon: "/icons/hbx-channels/instagram_dark.webp" },
  { value: "email", label: "E-mail", icon: "/icons/hbx-channels/email.webp", darkIcon: "/icons/hbx-channels/email_dark.webp" },
  { value: "website", label: "Site", icon: "/icons/hbx-channels/site_globe.webp", darkIcon: "/icons/hbx-channels/site_globe_dark.webp" },
  { value: "phone", label: "Telefone", icon: "/icons/hbx-channels/telefone.webp", darkIcon: "/icons/hbx-channels/telefone_dark.webp" },
  { value: "facebook", label: "Facebook", icon: "/icons/hbx-channels/facebook.webp", darkIcon: "/icons/hbx-channels/facebook_dark.webp" },
];

function normalizeProfileLabels(value: unknown): string[] {
  return Array.isArray(value)
    ? Array.from(new Set(value.map((item) => String(item || "").trim()).filter(Boolean))).slice(0, 30)
    : [];
}

function normalizeProfileObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function buildRadarSalesProfilePayload(profile: SalesProfileResponse["effectiveProfile"]) {
  if (!profile) return {};
  const whatDoYouSell = String(profile.whatDoYouSell || "").trim();
  const offerCategory = String(profile.offerCategory || "").trim();
  const targetAudience = normalizeProfileLabels(profile.targetAudience);
  const targetSegments = normalizeProfileLabels(profile.targetSegments);
  const avoidSegments = normalizeProfileLabels(profile.avoidSegments);
  const hardReject = normalizeProfileLabels(profile.hardRejectSegments);
  const leadPreferences = normalizeProfileObject(profile.leadPreferences);
  const negativeRules = normalizeProfileObject(profile.negativeRules);
  return {
    ...(whatDoYouSell ? { whatDoYouSell } : {}),
    ...(offerCategory ? { offerCategory } : {}),
    ...(targetAudience.length ? { targetAudience: { labels: targetAudience } } : {}),
    ...(targetSegments.length ? { targetSegments: { labels: targetSegments } } : {}),
    ...(avoidSegments.length || hardReject.length ? { avoidSegments: { labels: avoidSegments, hardReject } } : {}),
    ...(leadPreferences ? { leadPreferences } : {}),
    ...(negativeRules ? { negativeRules } : {}),
  };
}

function normalizeStoredRadarFilterDraft(value: unknown): FilterState {
  const input = (value || {}) as Partial<FilterState>;
  const engine = input.engine === "google" ? "google" : "hbx";
  const targetType = ["pj", "pf", "agenda_pf", "both"].includes(String(input.targetType || ""))
    ? input.targetType as HbxTargetTypeValue
    : DEFAULT_FILTERS.targetType;
  return {
    ...DEFAULT_FILTERS,
    state: String(input.state || ""),
    city: String(input.city || ""),
    segment: String(input.segment || ""),
    radiusKm: RADAR_RADIUS_OPTIONS.includes(Number(input.radiusKm) as typeof RADAR_RADIUS_OPTIONS[number])
      ? Number(input.radiusKm)
      : DEFAULT_FILTERS.radiusKm,
    quantity: Math.max(1, Number(input.quantity || DEFAULT_FILTERS.quantity) || DEFAULT_FILTERS.quantity),
    originLat: typeof input.originLat === "number" ? input.originLat : null,
    originLng: typeof input.originLng === "number" ? input.originLng : null,
    engine,
    targetType,
    ddd: "",
    scoreRange: String(input.scoreRange || "").replace(/\D/g, "").slice(0, 3),
    noWebsite: false,
    withWebsite: false,
    highOpportunity: false,
    minRating: "",
    minReviews: "",
    status: String(input.status || ""),
  };
}

function HeroPremiumCrown({ active }: { active: boolean }) {
  return (
    <Link
      href={toMobileRoute("/planos?intent=lead")}
      className={styles.mobileHeroPremiumCrown}
      data-active={active ? "true" : "false"}
      aria-label={active ? "Ver plano HBX Lead" : "Fazer upgrade para HBX Lead"}
      title={active ? "Ver plano HBX Lead" : "Upgrade para HBX Lead"}
    >
      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
        <path d="M4.2 18.5h15.6l.7-9.9-4.6 3.5L12 4.7 8.1 12.1 3.5 8.6l.7 9.9Z" />
        <path d="M5.2 20.2h13.6" />
        <circle cx="12" cy="4.7" r="1.25" />
        <circle cx="3.5" cy="8.6" r="1.15" />
        <circle cx="20.5" cy="8.6" r="1.15" />
      </svg>
    </Link>
  );
}

function DailyQuotaSpeedometer({
  remaining,
  dailyLimit,
  spendLimit,
  compact,
  onClick,
}: {
  remaining: number;
  dailyLimit: number;
  spendLimit: number;
  compact?: boolean;
  onClick?: () => void;
}) {
  const safeLimit = Math.max(1, Math.trunc(Number(dailyLimit || remaining || spendLimit || 1)));
  const safeRemaining = Math.max(0, Math.trunc(Number(remaining || 0)));
  const spentToday = Math.max(0, safeLimit - safeRemaining);
  const content = (
    <>
      <b>{safeRemaining}</b>
      <div className={styles.dailyQuotaText}>
        <span>disponíveis</span>
        <strong>hoje</strong>
        <small>{spentToday}/{safeLimit} usados</small>
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={styles.dailyQuotaGauge}
        data-compact={compact ? "true" : "false"}
        onClick={onClick}
        aria-label={`${safeRemaining} cards disponíveis hoje`}
        title={`${safeRemaining} cards disponíveis hoje`}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={styles.dailyQuotaGauge}
      data-compact={compact ? "true" : "false"}
      aria-label={`${safeRemaining} cards disponíveis hoje`}
      title={`${safeRemaining} cards disponíveis hoje`}
    >
      {content}
    </div>
  );
}

function RadarQuantitySelector({
  value,
  max,
  currentStock,
  onChange,
  compact,
  disabled: disabledOverride = false,
}: {
  value: number;
  max: number;
  currentStock?: number | null;
  onChange: (value: number) => void;
  compact?: boolean;
  disabled?: boolean;
}) {
  const safeMax = Math.max(0, Math.trunc(Number(max || 0)));
  const safeValue = Math.max(safeMax > 0 ? 1 : 0, Math.min(safeMax || 0, Math.trunc(Number(value || 0))));
  const disabled = safeMax <= 0 || disabledOverride;
  const stockCount = currentStock == null ? null : Math.max(0, Math.trunc(Number(currentStock || 0)));
  const setValue = (next: number) => {
    if (disabled) return;
    onChange(Math.max(1, Math.min(safeMax, Math.trunc(Number(next || 1)))));
  };

  return (
    <div className={styles.radarQuantitySelector} data-compact={compact ? "true" : "false"} data-disabled={disabled ? "true" : "false"}>
      <div>
        <span>Radar descansa</span>
        <strong>{safeMax <= 0 ? "Sem meta" : stockCount == null ? `Meta ${safeValue}` : `${stockCount} de ${safeValue}`}</strong>
      </div>
      <div className={styles.radarQuantityControls}>
        <button type="button" onClick={() => setValue(safeValue - 5)} disabled={disabled || safeValue <= 1}>-</button>
        <input
          type="range"
          min="1"
          max={Math.max(1, safeMax)}
          step="1"
          value={Math.max(1, safeValue || 1)}
          disabled={disabled}
          onChange={(event) => setValue(Number(event.target.value))}
          aria-label="Meta de cards ativos no Vendas"
        />
        <button type="button" onClick={() => setValue(safeValue + 5)} disabled={disabled || safeValue >= safeMax}>+</button>
      </div>
    </div>
  );
}

type RadarSegmentGroup = {
  key: string;
  label: string;
  segments: string[];
};

const MAX_RADAR_SEGMENT_SELECTIONS = 5;
const RADAR_SEGMENT_GROUPS: RadarSegmentGroup[] = [
  {
    key: "saude",
    label: "Saúde e bem-estar",
    segments: [
      "academias",
      "clínicas médicas",
      "clínicas odontológicas",
      "clínicas veterinárias",
      "farmácias",
      "laboratórios",
      "quadras esportivas",
      "serviços médicos",
      "serviços odontológicos",
      "yoga e pilates",
    ],
  },
  {
    key: "alimentacao",
    label: "Alimentação",
    segments: [
      "açougues",
      "alimentos naturais",
      "bares",
      "buffets",
      "cafeterias",
      "casa de carnes",
      "confeitarias",
      "depósitos de bebidas",
      "docerias",
      "lanchonetes",
      "mercados",
      "panificadoras",
      "pizzarias",
      "restaurantes",
      "supermercados",
    ],
  },
  {
    key: "beleza",
    label: "Beleza",
    segments: [
      "barbearias",
      "clínicas de estética",
      "cosméticos",
      "perfumarias",
      "salões de beleza",
    ],
  },
  {
    key: "construcao",
    label: "Casa e construção",
    segments: [
      "aluguel de equipamentos",
      "construtoras",
      "elétricas",
      "energia solar",
      "engenharias",
      "escritórios de arquitetura",
      "ferragens",
      "instaladoras",
      "lojas de tintas",
      "madeireiras",
      "manutenção predial",
      "marcenarias",
      "materiais de construção",
      "marmorarias",
      "serralherias",
      "vidraçarias",
    ],
  },
  {
    key: "servicos",
    label: "Serviços locais",
    segments: [
      "alarmes e segurança",
      "chaveiros",
      "dedetizadoras",
      "funerárias",
      "lavanderias",
      "serviços de limpeza",
      "serviços terceirizados",
      "sistemas de segurança",
      "vigilância",
      "zeladoria",
    ],
  },
  {
    key: "automotivo",
    label: "Automotivo",
    segments: [
      "acessórios automotivos",
      "auto elétricas",
      "auto escolas",
      "auto peças",
      "borracharias",
      "centros automotivos",
      "concessionárias",
      "despachantes",
      "estacionamentos",
      "lava rápidos",
      "mecânicas",
      "oficinas mecânicas",
      "postos de combustível",
      "revendas de veículos",
      "vistorias veiculares",
    ],
  },
  {
    key: "educacao",
    label: "Educação",
    segments: [
      "colégios",
      "cursos profissionalizantes",
      "educação infantil",
      "escolas",
      "papelarias",
      "universidades",
      "xérox e copiadoras",
    ],
  },
  {
    key: "varejo",
    label: "Varejo",
    segments: [
      "bicicletarias",
      "bijuterias",
      "calçados",
      "comércio varejista",
      "e-commerce",
      "eletrodomésticos",
      "eletrônicas",
      "floriculturas",
      "joalherias",
      "lojas de brinquedos",
      "lojas de celulares",
      "lojas de colchões",
      "lojas de conveniência",
      "lojas de eletrônicos",
      "lojas de móveis",
      "lojas de roupas",
      "moda feminina",
      "moda masculina",
      "ótica",
      "pet shops",
      "uniformes",
    ],
  },
  {
    key: "negocios",
    label: "Negócios",
    segments: [
      "advocacias",
      "contabilidades",
      "consultorias empresariais",
      "corretoras de seguros",
      "coworkings",
      "escritórios administrativos",
      "financeiras",
      "imobiliárias",
      "lotéricas",
      "serviços contábeis",
      "serviços jurídicos",
    ],
  },
  {
    key: "digital",
    label: "Digital",
    segments: [
      "agências de marketing",
      "estúdios de fotografia",
      "gráficas",
      "informática",
      "lojas de celulares",
      "lojas de eletrônicos",
      "provedores de internet",
      "serviços gráficos",
      "telecomunicações",
      "web design",
    ],
  },
  {
    key: "turismo_eventos",
    label: "Turismo e eventos",
    segments: [
      "agências de turismo",
      "casas de festas",
      "eventos",
      "hospedagens",
      "hotéis",
      "motéis",
      "turismo",
    ],
  },
  {
    key: "agro",
    label: "Agro e campo",
    segments: [
      "agronegócios",
      "agropecuárias",
      "casas de ração",
      "implementos agrícolas",
      "nutrição animal",
      "produtos agrícolas",
    ],
  },
  {
    key: "logistica",
    label: "Atacado e logística",
    segments: [
      "atacadistas",
      "depósitos de bebidas",
      "distribuidoras",
      "fornecedoras industriais",
      "transportadoras",
    ],
  },
  {
    key: "industria",
    label: "Indústria",
    segments: [
      "caldeiraria",
      "cerâmicas",
      "componentes elétricos",
      "embalagens",
      "ferramentaria",
      "indústrias de plásticos",
      "indústrias alimentícias",
      "indústrias metalúrgicas",
      "máquinas industriais",
      "metalúrgicas",
      "químicas",
      "usinagem",
    ],
  },
];

function normalizeSegmentLabel(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function splitRadarSegments(value?: string | null) {
  return uniqueStrings(String(value || "").split(",").map(normalizeSegmentLabel));
}

function joinRadarSegments(values: string[]) {
  return uniqueStrings(values).slice(0, MAX_RADAR_SEGMENT_SELECTIONS).join(", ");
}

function buildRadarCategorySegmentValue(group: RadarSegmentGroup) {
  return uniqueStrings(group.segments).join(", ");
}

function resolveRadarCategory(value?: string | null) {
  const raw = normalizeSegmentLabel(String(value || ""));
  if (!raw) return null;
  const normalized = raw.toLowerCase();
  const direct = RADAR_SEGMENT_GROUPS.find((group) => group.label.toLowerCase() === normalized);
  if (direct) return direct;
  const selected = new Set(splitRadarSegments(raw).map((item) => item.toLowerCase()));
  return RADAR_SEGMENT_GROUPS.find((group) =>
    group.segments.length > 0 && group.segments.every((segment) => selected.has(segment.toLowerCase())),
  ) || null;
}

function isRadarCategoryValue(value: string) {
  return Boolean(resolveRadarCategory(value));
}

function radarSegmentSummary(value?: string | null) {
  const raw = normalizeSegmentLabel(String(value || ""));
  if (!raw) return "";
  const category = resolveRadarCategory(raw);
  if (category) return category.label;
  const segments = splitRadarSegments(raw);
  if (segments.length <= 1) return segments[0] || raw;
  return `${segments[0]} +${segments.length - 1}`;
}

function mergeRadarOptions(primary: string[], secondary: string[]) {
  return uniqueStrings([...primary, ...secondary]).filter(Boolean);
}

function inferRadarSegmentCategory(value?: string | null) {
  const raw = normalizeSegmentLabel(String(value || ""));
  if (!raw) return RADAR_SEGMENT_GROUPS[0]?.key || "";
  const category = resolveRadarCategory(raw);
  if (category) return category.key;
  const selected = splitRadarSegments(raw).map((item) => item.toLowerCase());
  return RADAR_SEGMENT_GROUPS.find((group) =>
    group.segments.some((segment) => selected.includes(segment.toLowerCase())),
  )?.key || RADAR_SEGMENT_GROUPS[0]?.key || "";
}

function buildSegmentGroups(availableSegments: string[]) {
  const known = new Set(
    RADAR_SEGMENT_GROUPS.flatMap((group) => [group.label, ...group.segments]).map((item) => item.toLowerCase()),
  );
  const extras = uniqueStrings(availableSegments)
    .filter((segment) => !known.has(segment.toLowerCase()))
    .slice(0, 24);
  return extras.length
    ? [...RADAR_SEGMENT_GROUPS, { key: "sugestoes", label: "Sugestões", segments: extras }]
    : RADAR_SEGMENT_GROUPS;
}

function formatPhone(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return value || "Telefone não informado";
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function statusLabel(value?: string | null) {
  const status = String(value || "clean").toLowerCase();
  if (status === "clean" || status === "new") return "Novo";
  if (status === "reserved") return "Reservado";
  if (status === "approved") return "Aprovado";
  if (status === "delivered") return "Recebido";
  if (status === "sent_to_vendas" || status === "imported_to_vendas") return "Em Vendas";
  if (status === "in_attendance" || status === "em_atendimento") return "Em atendimento";
  if (status === "converted" || status === "won") return "Convertido";
  if (status === "contacted") return "Contato feito";
  if (status === "no_answer") return "Não atendeu";
  if (status === "no_whatsapp" || status === "invalid_whatsapp") return "Contato inválido";
  if (status === "denied" || status === "negative") return "Negativo";
  if (status === "blocked") return "Bloqueado";
  if (status === "opt_out" || status === "optout") return "Opt-out";
  if (status === "complaint") return "Reclamação";
  if (status === "hidden" || status === "discarded") return "Descartado";
  return value || "Novo";
}

function radarCardStatus(lead: RadarLead) {
  const status = String(lead.companyStatus || lead.status || "").toLowerCase();
  if (["negative", "denied", "opt_out", "optout", "complaint", "discarded", "hidden", "no_answer"].includes(status)) return "negativo";
  if (status === "blocked" || lead.visibilityTier === "blocked") return "bloqueado";
  if (String(lead.visibilityTier || "").includes("review")) return "revisar";
  return "aprovado";
}

function ownershipBadge(lead: RadarLead) {
  const status = String(lead.ownershipStatus || "").toLowerCase();
  const leadStatus = String(lead.companyStatus || lead.status || "").toLowerCase();
  if (status === "negative" || ["negative", "denied", "blocked", "opt_out", "optout", "complaint", "discarded", "hidden"].includes(leadStatus)) {
    return { label: "Negativo", tone: "negative" };
  }
  if (status === "in_attendance" || ["sent_to_vendas", "imported_to_vendas", "in_attendance"].includes(leadStatus)) {
    return { label: "Em atendimento", tone: "attendance" };
  }
  if (status === "mine" || lead.ownerCompanyId) {
    return { label: "Na minha carteira", tone: "mine" };
  }
  return { label: "Disponível", tone: "available" };
}

function emailLabel(value?: string | null) {
  const status = String(value || "").toLowerCase();
  if (status === "confirmed") return "E-mail confirmado";
  if (status === "probable") return "E-mail provável";
  if (status === "invalid") return "E-mail inválido";
  if (status === "unverified") return "E-mail sem validar";
  return "E-mail ausente";
}

function channelLabel(value?: string | null) {
  const channel = String(value || "").toLowerCase();
  if (channel === "whatsapp") return "WhatsApp";
  if (channel === "email") return "E-mail";
  if (channel === "call") return "Ligação";
  if (channel === "instagram") return "Instagram";
  if (channel === "facebook") return "Facebook";
  if (channel === "website") return "Site";
  if (channel === "phone") return "Telefone";
  if (channel === "discard") return "Não chamar";
  return "Revisar";
}

function leadBackendScore(lead: RadarLead) {
  const evidence = typeof lead.evidenceJson === "string"
    ? (() => { try { return JSON.parse(lead.evidenceJson) as Record<string, unknown>; } catch { return {}; } })()
    : lead.evidenceJson || {};
  return Math.max(0, Math.min(100, Math.trunc(Number(evidence.finalScore || lead.enrichmentScore || lead.opportunityScore || 0))));
}

function leadExplanation(lead: RadarLead) {
  if (lead.qualityReason) return lead.qualityReason;
  const evidence = typeof lead.evidenceJson === "string"
    ? (() => { try { return JSON.parse(lead.evidenceJson) as Record<string, unknown>; } catch { return {}; } })()
    : lead.evidenceJson || {};
  const reasons = Array.isArray(evidence.reasons) ? evidence.reasons.map(String).filter(Boolean) : [];
  if (reasons.length) return reasons.slice(0, 2).join(" ");
  return compactLeadReason(lead);
}

function websiteTrustBadge(lead: RadarLead) {
  const status = String(lead.websiteStatus || "").toLowerCase();
  if (status === "none") return { label: "Sem site", tone: "warning" };
  if (status === "weak" || status === "social_only") return { label: "Site fraco", tone: "warning" };
  if (status === "present") return { label: "Site encontrado", tone: "success" };
  return { label: "Site não verificado", tone: "neutral" };
}

function compactLeadReason(lead: RadarLead) {
  if (lead.recommendedChannel === "discard") return "Não chamar: card protegido por negativo, bloqueio ou descarte.";
  if (lead.opportunityReason) return lead.opportunityReason;
  if (lead.painType === "sem_site") return "Boa oportunidade: presença digital fraca e contato acionável.";
  if (lead.recommendedChannel === "whatsapp") return "Boa oportunidade: contato acionável pelo WhatsApp.";
  if (lead.recommendedChannel === "email") return "Boa oportunidade: caminho por e-mail para abordagem inicial.";
  return "Boa oportunidade: revisar sinais e escolher o melhor canal.";
}

function uniqueStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const label = String(value || "").replace(/\s+/g, " ").trim();
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    result.push(label);
  }
  return result;
}

function uniqueByLabel<T extends { label: string }>(items: T[]) {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = String(item.label || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function buildSmartChips(lead: RadarLead, max = 3) {
  const website = websiteTrustBadge(lead);
  const score = Number(lead.enrichmentScore || lead.opportunityScore || 0);
  const socialStatus = String(lead.socialStatus || "").toLowerCase();
  const socialFound = Boolean(lead.instagramUrl || lead.facebookUrl || socialStatus === "found");
  const socialPending = socialStatus === "pending" || socialStatus === "searching";
  return uniqueByLabel([
    score >= 70 ? { label: "Alta oportunidade", tone: "success" } : null,
    lead.painLabel ? { label: lead.painLabel, tone: website.tone } : null,
    { label: website.label, tone: website.tone },
    socialPending ? { label: "Enriquecendo contatos", tone: "warning" } : null,
    socialFound ? { label: "Rede social", tone: "success" } : null,
    Number(lead.rating || 0) >= 4.2 ? { label: "Boa avaliação", tone: "success" } : null,
  ].filter(Boolean) as Array<{ label: string; tone: string }>).slice(0, max);
}

function opportunityLabel(score?: number | null) {
  const safeScore = Math.max(0, Math.min(100, Math.trunc(Number(score || 0))));
  if (safeScore >= 70) return "Alta oportunidade";
  if (safeScore >= 45) return "Atenção";
  return "Baixa oportunidade";
}

function topbarProgressPercentFrom(value: number) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function radarLeadMergeKey(item: RadarLead) {
  return String(item.id || item.phoneDigits || item.phone || `${item.name}:${item.city}`).trim().toLowerCase();
}

function mergeRadarLead(existing: RadarLead, incoming: RadarLead) {
  return {
    ...existing,
    ...incoming,
    historySummary: incoming.historySummary ?? existing.historySummary,
    sourceEngines: incoming.sourceEngines ?? existing.sourceEngines,
  };
}

function mergeRadarLeads(items: RadarLead[]) {
  const indexByKey = new Map<string, number>();
  const merged: RadarLead[] = [];
  for (const item of items) {
    const key = radarLeadMergeKey(item);
    if (!key) continue;
    const existingIndex = indexByKey.get(key);
    if (existingIndex == null) {
      indexByKey.set(key, merged.length);
      merged.push(item);
      continue;
    }
    merged[existingIndex] = mergeRadarLead(merged[existingIndex], item);
  }
  return merged;
}

function radarLeadSignature(item: RadarLead) {
  return JSON.stringify({
    id: item.id,
    name: item.name,
    phone: item.phone,
    phoneDigits: item.phoneDigits,
    city: item.city,
    state: item.state,
    segment: item.segment,
    website: item.website,
    websiteStatus: item.websiteStatus,
    instagramUrl: item.instagramUrl,
    facebookUrl: item.facebookUrl,
    socialStatus: item.socialStatus,
    socialConfidence: item.socialConfidence,
    email: item.email,
    emailStatus: item.emailStatus,
    recommendedChannel: item.recommendedChannel,
    painType: item.painType,
    painLabel: item.painLabel,
    painPitch: item.painPitch,
    enrichmentScore: item.enrichmentScore,
    enrichmentConfidence: item.enrichmentConfidence,
    enrichmentVersion: item.enrichmentVersion,
    lastEnrichedAt: item.lastEnrichedAt,
    premiumFeatureStatus: item.premiumFeatureStatus,
    premiumLocked: item.premiumLocked,
    premiumTeaser: item.premiumTeaser,
    visibilityTier: item.visibilityTier,
    deliveryProduct: item.deliveryProduct,
    qualityReason: item.qualityReason,
    whatsappStatus: item.whatsappStatus,
    whatsappCheckStatus: item.whatsappCheckStatus,
    opportunityScore: item.opportunityScore,
    opportunityReason: item.opportunityReason,
    status: item.status,
    companyStatus: item.companyStatus,
    ownershipStatus: item.ownershipStatus,
  });
}

function radarLeadListEqual(left: RadarLead[], right: RadarLead[]) {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  return left.every((item, index) => radarLeadSignature(item) === radarLeadSignature(right[index]));
}

function isRadarSocialLookupPending(item: RadarLead) {
  const status = String(item.socialStatus || "").toLowerCase();
  return status === "pending" || status === "searching";
}

function radarRunPayloadEqual(left: RadarSearchRunResponse | null, right: RadarSearchRunResponse | null) {
  if (left === right) return true;
  if (!left || !right) return false;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function isMobileRadarViewport() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 820px)").matches;
}

function eventLabel(value?: string | null) {
  const type = String(value || "").toLowerCase();
  if (type === "found") return "Encontrado";
  if (type === "imported_to_vendas") return "Enviado para Vendas";
  if (type === "contacted") return "Contato feito";
  if (type === "denied" || type === "negative") return "Negativo";
  if (type === "blocked") return "Bloqueado";
  if (type === "opt_out") return "Opt-out";
  if (type === "hidden" || type === "discarded") return "Descartado";
  if (type === "no_answer") return "Não atendeu";
  return value || "Atualização";
}

function buildLeadQuery(filters: FilterState, page: number) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(PAGE_SIZE),
  });
  if (filters.state) params.set("state", filters.state);
  if (filters.city) params.set("city", filters.city);
  if (Number(filters.radiusKm || 0) > 0) params.set("radiusKm", String(Math.max(0, Math.trunc(Number(filters.radiusKm || 0)))));
  if (typeof filters.originLat === "number") params.set("originLat", String(filters.originLat));
  if (typeof filters.originLng === "number") params.set("originLng", String(filters.originLng));
  if (filters.segment.trim()) params.set("segment", filters.segment.trim());
  if (filters.targetType && filters.targetType !== "both") params.set("targetType", filters.targetType);
  if (filters.engine) params.set("engine", filters.engine);
  if (filters.scoreRange) params.set("scoreRange", filters.scoreRange);
  if (filters.status) params.set("status", filters.status);
  return params.toString();
}

function compactRadarMessage(message: string | null) {
  const text = String(message || "").trim();
  if (!text) return "";
  if (/buscando o restante em segundo plano/i.test(text)) {
    return text.replace(/Buscando o restante em segundo plano\.?/i, "Radar trabalhando para completar a pesquisa.");
  }
  if (/request entity too large|payload too large|413/i.test(text)) {
    return "O pacote de cards ficou grande demais. Atualize a tela e use o fluxo automático do Radar.";
  }
  if (text.toLowerCase().includes("cidade e segmento")) {
    return "Escolha cidade e segmento para buscar cards. Para histórico, clique em Pesquisar sem filtros.";
  }
  if (/nenhum|sem cards|no results|insufficient/i.test(text)) {
    return "Não achei cards suficientes para esse filtro. Tente segmento mais amplo ou cidade próxima.";
  }
  return text;
}

function radarFriendlyError(error: unknown) {
  const apiError = error as ApiFetchError;
  if (isRadarRunNotFoundError(error)) {
    return "Busca anterior encerrada. Radar pronto para uma nova pesquisa.";
  }
  if (apiError?.code === "MODULE_ACCESS_DENIED" || apiError?.status === 403) {
    return "Acesso ao Radar Digital indisponível para este usuário. Verifique a liberação do módulo.";
  }
  if (apiError?.code === "NO_ENGINE_AVAILABLE") {
    return "A busca entrou na fila. Tente novamente em instantes.";
  }
  if (apiError?.code === "RADAR_STOCK_EMPTY") {
    return "Não achei cards suficientes para esse filtro. Tente segmento mais amplo ou cidade próxima.";
  }
  if (apiError?.code === "RADAR_NO_RESULTS") {
    return "Não achei cards suficientes para esse filtro. Tente segmento mais amplo ou cidade próxima.";
  }
  if (apiError?.status && apiError.status >= 500) {
    return "Radar temporariamente indisponível. Tente novamente em instantes.";
  }
  const message = error instanceof Error ? error.message : "";
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return "Conexão instável com o Radar. Tente atualizar em instantes.";
  }
  if (/tempo esgotado|timeout/i.test(message)) {
    return "A busca demorou mais que o esperado. Tente novamente em instantes.";
  }
  if (/internal server error|forbidden|unauthorized/i.test(message)) {
    return "Radar temporariamente indisponível. Tente novamente em instantes.";
  }
  return message || "Não foi possível concluir a operação agora.";
}

function radarDigits(value?: string | null) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length > 11) digits = digits.slice(2);
  return digits;
}

function radarLikelyMobile(value?: string | null) {
  const digits = radarDigits(value);
  return digits.length === 11 && digits[2] === "9";
}

function buildRadarLeadChannelAssets(lead: RadarLead): RadarChannel[] {
  const whatsappStatus = String(lead.whatsappCheckStatus || lead.whatsappStatus || "").trim().toLowerCase();
  const recommendedChannel = String(lead.recommendedChannel || "").trim().toLowerCase();
  return ([
    lead.phone || lead.phoneDigits ? "phone" : null,
    (["confirmed", "available", "valid", "exists"].includes(whatsappStatus) || recommendedChannel === "whatsapp" || radarLikelyMobile(lead.phoneDigits || lead.phone)) ? "whatsapp" : null,
    lead.instagramUrl ? "instagram" : null,
    lead.facebookUrl ? "facebook" : null,
    lead.email ? "email" : null,
    lead.website ? "website" : null,
  ].filter(Boolean) as RadarChannel[]);
}

function RadarLeadChannelIcons({ lead }: { lead: RadarLead }) {
  const channels = buildRadarLeadChannelAssets(lead);
  if (!channels.length) return null;
  return (
    <div className={styles.radarLeadChannelRow} aria-label="Canais encontrados">
      {channels.map((channel) => {
        const asset = RADAR_CHANNELS.find((item) => item.value === channel);
        if (!asset) return null;
        return (
          <span key={channel} className={styles.radarLeadChannelIcon} data-channel={channel} title={asset.label}>
            <img src={asset.icon} alt="" aria-hidden="true" data-theme="light" />
            <img src={asset.darkIcon} alt="" aria-hidden="true" data-theme="dark" />
            <span>{asset.label}</span>
          </span>
        );
      })}
    </div>
  );
}

function leadPremiumState(lead: RadarLead, loading: boolean) {
  const status = String(lead.premiumFeatureStatus || lead.visibilityTier || lead.deliveryProduct || "").toLowerCase();
  const hasEnrichment = Boolean(
    lead.lastEnrichedAt ||
    lead.enrichmentVersion ||
    lead.instagramUrl ||
    lead.facebookUrl ||
    status.includes("ready") ||
    status.includes("enriched") ||
    status.includes("delivered"),
  );

  if (loading) return { state: "loading", label: "Enriquecendo", caption: "Pesquisando sinais" };
  if (lead.premiumLocked || status.includes("locked") || status.includes("blocked")) {
    return { state: "locked", label: "Premium", caption: "Bloqueado" };
  }
  if (hasEnrichment) return { state: "ready", label: "Enriquecido", caption: "Sinais prontos" };
  if (lead.premiumTeaser || status.includes("pending") || status.includes("teaser")) {
    return { state: "pending", label: "Premium", caption: "Aguardando" };
  }
  return { state: "idle", label: "Premium", caption: "Enriquecer" };
}

function PremiumCrownGlyph() {
  return (
    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
      <path d="M4.2 18.5h15.6l.7-9.9-4.6 3.5L12 4.7 8.1 12.1 3.5 8.6l.7 9.9Z" />
      <path d="M5.2 20.2h13.6" />
      <circle cx="12" cy="4.7" r="1.25" />
      <circle cx="3.5" cy="8.6" r="1.15" />
      <circle cx="20.5" cy="8.6" r="1.15" />
    </svg>
  );
}

function LeadPremiumCrown({ lead, loading }: { lead: RadarLead; loading: boolean }) {
  const state = leadPremiumState(lead, loading);
  return (
    <div
      className={styles.leadPremiumCrown}
      data-state={state.state}
      aria-busy={loading ? "true" : "false"}
      title={`${state.label}: ${state.caption}`}
    >
      <span className={styles.leadPremiumCrownIcon}>
        <PremiumCrownGlyph />
      </span>
      <span className={styles.leadPremiumCrownText}>
        <b>{state.label}</b>
        <small>{state.caption}</small>
      </span>
    </div>
  );
}

function normalizeDetailLead(payload: RadarLeadDetailResponse): RadarLead | null {
  if (payload && "item" in payload) return payload.item || null;
  return payload as RadarLead;
}

function leadMatchesSearch(lead: RadarLead, search: string) {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    lead.id,
    lead.name,
    lead.phone,
    lead.phoneDigits,
    lead.ddd,
    lead.city,
    lead.state,
    lead.segment,
    lead.website,
    lead.status,
    lead.companyStatus,
  ].filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(needle);
}

function hasHistoryFilters(filters: FilterState, generalSearch: string) {
  return Boolean(
    generalSearch.trim()
    || filters.state.trim()
    || filters.city.trim()
    || filters.segment.trim()
    || Number(filters.radiusKm || 0) !== Number(DEFAULT_FILTERS.radiusKm || 0)
    || filters.scoreRange
    || filters.targetType !== DEFAULT_FILTERS.targetType,
  );
}

function canPullWithFilters(filters: FilterState) {
  return Boolean(filters.city.trim() && filters.segment.trim());
}

function hasPartialRadarSearch(filters: FilterState) {
  const hasCity = Boolean(filters.city.trim());
  const hasSegment = Boolean(filters.segment.trim());
  return hasCity !== hasSegment;
}

function normalizedRadarFilterText(value?: string | null) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function radarRunMatchesVisibleFilters(run: RadarSearchRunResponse | null, filters: FilterState) {
  const runFilters = run?.meta?.filters;
  if (!runFilters) return true;
  const sameText = (left?: string | null, right?: string | null) =>
    normalizedRadarFilterText(left) === normalizedRadarFilterText(right);
  if (filters.state && runFilters.state && !sameText(filters.state, runFilters.state)) return false;
  if (filters.city && runFilters.city && !sameText(filters.city, runFilters.city)) return false;
  if (filters.segment && runFilters.segment && !sameText(filters.segment, runFilters.segment)) return false;
  if (Number(filters.radiusKm || 0) !== Number(runFilters.radiusKm ?? filters.radiusKm ?? 0)) return false;
  return true;
}

function radarFiltersHaveSameSearchMeaning(left: FilterState, right: FilterState) {
  const sameText = (a?: string | null, b?: string | null) =>
    normalizedRadarFilterText(a) === normalizedRadarFilterText(b);
  return (
    sameText(left.state, right.state) &&
    sameText(left.city, right.city) &&
    sameText(left.segment, right.segment) &&
    Number(left.radiusKm || 0) === Number(right.radiusKm || 0) &&
    String(left.targetType || "pj") === String(right.targetType || "pj")
  );
}

function isTerminalRadarRun(status?: string | null) {
  return ["completed", "partial_error", "completed_insufficient_results", "failed", "canceled"].includes(String(status || ""));
}

function mobileRadarEngineLabel(value: string) {
  return value === "google" ? "Google" : "HBX";
}

type MobilePickerOption = {
  value: string;
  label?: string;
};

function MobilePickerButton({
  label,
  value,
  placeholder,
  disabled,
  helper,
  onClick,
}: {
  label: string;
  value?: string | null;
  placeholder: string;
  disabled?: boolean;
  helper?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.mobilePickerButton}
      disabled={disabled}
      onClick={onClick}
    >
      <span>{label}</span>
      <strong>{value || placeholder}</strong>
      {helper ? <small>{helper}</small> : null}
      <b aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m16 16 4.2 4.2" />
        </svg>
      </b>
    </button>
  );
}

function RadarRadiusSelector({
  value,
  onChange,
  compact = false,
  disabled = false,
}: {
  value: number;
  onChange: (value: number) => void;
  compact?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className={compact ? styles.mobileRadiusSelector : styles.radiusSelector} role="radiogroup" aria-label="Alcance regional">
      <span>Alcance</span>
      <div>
        {RADAR_RADIUS_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            data-active={Number(value || 0) === option ? "true" : "false"}
            disabled={disabled}
            onClick={() => onChange(option)}
          >
            {radarRadiusLabel(option)}
          </button>
        ))}
      </div>
      <small>{Number(value || 0) > 0 ? "Busca cidades da região sem pesar a fila." : "Busca só a cidade selecionada."}</small>
    </div>
  );
}

function MobileFilterSheet({
  title,
  value,
  options,
  placeholder = "Pesquisar",
  allowCustom = false,
  onSelect,
  onClose,
}: {
  title: string;
  value: string;
  options: MobilePickerOption[];
  placeholder?: string;
  allowCustom?: boolean;
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!searchOpen) return;
    inputRef.current?.focus();
  }, [searchOpen]);

  const filteredOptions = useMemo(() => {
    const normalized = normalizeLocationLookup(query);
    const base = uniqueByLabel(
      options.map((option) => ({
        ...option,
        label: option.label || option.value,
      })),
    );
    if (!normalized) return base;
    return base
      .filter((option) => normalizeLocationLookup(`${option.label || ""} ${option.value}`).includes(normalized));
  }, [options, query]);

  const customValue = query.trim();

  return (
    <div className={styles.mobilePickerPanel} role="presentation" onClick={onClose}>
      <section
        className={styles.mobilePickerSheet}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.mobilePickerHeader}>
          <strong>{title}</strong>
          <div className={styles.mobilePickerActions}>
            <button type="button" aria-label="Pesquisar" onClick={() => setSearchOpen(true)}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="m16 16 4.2 4.2" />
              </svg>
            </button>
            <button type="button" onClick={onClose}>Fechar</button>
          </div>
        </div>
        {searchOpen ? (
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder}
          />
        ) : null}
        <div className={styles.mobilePickerList}>
          <button
            type="button"
            data-active={!value ? "true" : "false"}
            onClick={() => {
              onSelect("");
              onClose();
            }}
          >
            Limpar seleção
          </button>
          {allowCustom && customValue && !filteredOptions.some((option) => option.value.toLowerCase() === customValue.toLowerCase()) ? (
            <button
              type="button"
              onClick={() => {
                onSelect(customValue);
                onClose();
              }}
            >
              Usar {`"${customValue}"`}
            </button>
          ) : null}
          {filteredOptions.map((option) => (
            <button
              type="button"
              key={option.value}
              data-active={option.value === value ? "true" : "false"}
              onClick={() => {
                onSelect(option.value);
                onClose();
              }}
            >
              {option.label || option.value}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function RadarSegmentFunnel({
  value,
  availableSegments,
  onChange,
  disabled = false,
}: {
  value: string;
  availableSegments: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const groups = useMemo(() => buildSegmentGroups(availableSegments), [availableSegments]);
  const [activeGroupKey, setActiveGroupKey] = useState(() => inferRadarSegmentCategory(value));
  const [query, setQuery] = useState("");
  const resolvedActiveGroupKey = groups.some((group) => group.key === activeGroupKey) ? activeGroupKey : groups[0]?.key || "";
  const activeGroup = groups.find((group) => group.key === resolvedActiveGroupKey) || groups[0];
  const isCategory = isRadarCategoryValue(value);
  const selectedSegments = splitRadarSegments(value);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleSegments = uniqueStrings(activeGroup?.segments || [])
    .filter((segment) => !normalizedQuery || segment.toLowerCase().includes(normalizedQuery));
  const canAddMore = selectedSegments.length < MAX_RADAR_SEGMENT_SELECTIONS;
  const canSelectSegment = isCategory || canAddMore;

  function toggleSegment(segment: string) {
    const normalized = normalizeSegmentLabel(segment);
    if (!normalized) return;
    if (isCategory) {
      onChange(normalized);
      return;
    }
    const exists = selectedSegments.some((item) => item.toLowerCase() === normalized.toLowerCase());
    if (exists) {
      onChange(joinRadarSegments(selectedSegments.filter((item) => item.toLowerCase() !== normalized.toLowerCase())));
      return;
    }
    if (!canAddMore) return;
    onChange(joinRadarSegments([...selectedSegments, normalized]));
  }

  function useCategory() {
    if (!activeGroup) return;
    onChange(buildRadarCategorySegmentValue(activeGroup));
  }

  return (
    <div className={styles.segmentFunnel}>
      <div className={styles.segmentFunnelHeader}>
        <div>
          <span>Segmento</span>
          <strong>{radarSegmentSummary(value) || "Escolha uma categoria"}</strong>
        </div>
        <small>{isCategory ? "Categoria inteira" : `${selectedSegments.length}/${MAX_RADAR_SEGMENT_SELECTIONS} selecionados`}</small>
      </div>
      <div className={styles.segmentCategoryTabs} role="tablist" aria-label="Categorias de segmento">
        {groups.map((group) => (
          <button
            type="button"
            key={group.key}
            data-active={group.key === resolvedActiveGroupKey ? "true" : "false"}
            onClick={() => {
              setActiveGroupKey(group.key);
              setQuery("");
            }}
          >
            {group.label}
          </button>
        ))}
      </div>
      <div className={styles.segmentFunnelSearch}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Buscar em ${activeGroup?.label || "segmentos"}`}
          disabled={disabled}
        />
        {query.trim() ? (
          <button
            type="button"
            disabled={disabled || !canSelectSegment}
            onClick={() => {
              toggleSegment(query);
              setQuery("");
            }}
          >
            Usar
          </button>
        ) : (
          <button type="button" onClick={useCategory} disabled={disabled}>
            Usar categoria
          </button>
        )}
      </div>
      <div className={styles.segmentOptions}>
        {visibleSegments.map((segment) => {
          const active = selectedSegments.some((item) => item.toLowerCase() === segment.toLowerCase());
          return (
            <button
              type="button"
              key={segment}
              data-active={active ? "true" : "false"}
              disabled={disabled || (!active && !canSelectSegment)}
              onClick={() => toggleSegment(segment)}
            >
              {segment}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MobileSegmentSheet({
  value,
  availableSegments,
  onApply,
  onClose,
}: {
  value: string;
  availableSegments: string[];
  onApply: (value: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const groups = useMemo(() => buildSegmentGroups(availableSegments), [availableSegments]);
  const [activeGroupKey, setActiveGroupKey] = useState(() => inferRadarSegmentCategory(value));
  const [segmentStep, setSegmentStep] = useState<"categories" | "segments">("categories");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [draftValue, setDraftValue] = useState(value);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resolvedActiveGroupKey = groups.some((group) => group.key === activeGroupKey) ? activeGroupKey : groups[0]?.key || "";
  const activeGroup = groups.find((group) => group.key === resolvedActiveGroupKey) || groups[0];
  const isCategory = isRadarCategoryValue(draftValue);
  const selectedSegments = splitRadarSegments(draftValue);
  const canAddMore = selectedSegments.length < MAX_RADAR_SEGMENT_SELECTIONS;
  const canSelectSegment = isCategory || canAddMore;
  const normalizedQuery = normalizeLocationLookup(query);
  const searchableSegments = normalizedQuery
    ? uniqueStrings(groups.flatMap((group) => group.segments))
    : uniqueStrings(activeGroup?.segments || []);
  const visibleSegments = searchableSegments
    .filter((segment) => !normalizedQuery || normalizeLocationLookup(segment).includes(normalizedQuery));
  const canUseTypedSegment = Boolean(query.trim()) && visibleSegments.length === 0;

  useEffect(() => {
    setDraftValue(value);
    setActiveGroupKey(inferRadarSegmentCategory(value));
    setApplyError(null);
  }, [value]);

  useEffect(() => {
    if (!searchOpen || segmentStep !== "segments") return;
    inputRef.current?.focus();
  }, [searchOpen, segmentStep]);

  function toggleSegment(segment: string) {
    const normalized = normalizeSegmentLabel(segment);
    if (!normalized) return;
    if (isCategory) {
      setDraftValue(normalized);
      setApplyError(null);
      return;
    }
    const exists = selectedSegments.some((item) => item.toLowerCase() === normalized.toLowerCase());
    if (exists) {
      setDraftValue(joinRadarSegments(selectedSegments.filter((item) => item.toLowerCase() !== normalized.toLowerCase())));
      return;
    }
    if (!canAddMore) return;
    setDraftValue(joinRadarSegments([...selectedSegments, normalized]));
    setApplyError(null);
  }

  async function applySelection() {
    setApplying(true);
    setApplyError(null);
    try {
      await onApply(normalizeSegmentLabel(draftValue));
      setApplying(false);
      onClose();
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : "Não consegui salvar os segmentos.");
      setApplying(false);
    }
  }

  function openSegmentGroup(groupKey: string) {
    setActiveGroupKey(groupKey);
    setSegmentStep("segments");
    setQuery("");
    setSearchOpen(false);
  }

  function backToCategories() {
    setSegmentStep("categories");
    setQuery("");
    setSearchOpen(false);
  }

  function openSearch() {
    setSegmentStep("segments");
    setSearchOpen(true);
  }

  function useTypedSegment() {
    const normalized = normalizeSegmentLabel(query);
    if (!normalized) return;
    setDraftValue(normalized);
    setApplyError(null);
    setQuery("");
  }

  return (
    <div className={styles.mobilePickerPanel} role="presentation" onClick={onClose}>
      <section
        className={`${styles.mobilePickerSheet} ${styles.mobileSegmentSheet}`}
        role="dialog"
        aria-modal="true"
        aria-label="Segmento"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.mobilePickerHeader}>
          <div>
            {segmentStep === "segments" ? (
              <button type="button" className={styles.mobileSegmentBack} onClick={backToCategories}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M15 18 9 12l6-6" />
                </svg>
                Categorias
              </button>
            ) : null}
            <strong>{segmentStep === "categories" ? "Segmentos" : activeGroup?.label || "Segmento"}</strong>
            <small>
              {isCategory
                ? `${radarSegmentSummary(draftValue)} inteiro`
                : `${selectedSegments.length}/${MAX_RADAR_SEGMENT_SELECTIONS} selecionados`}
            </small>
          </div>
          <div className={styles.mobilePickerActions}>
            <button type="button" aria-label="Pesquisar" onClick={() => searchOpen ? setSearchOpen(false) : openSearch()}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="m16 16 4.2 4.2" />
              </svg>
            </button>
            <button type="button" onClick={onClose}>Fechar</button>
          </div>
        </div>
        {segmentStep === "segments" && searchOpen ? (
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              if (canUseTypedSegment) {
                useTypedSegment();
                return;
              }
              if (visibleSegments[0]) toggleSegment(visibleSegments[0]);
            }}
            placeholder="Buscar ou digitar segmento"
          />
        ) : null}
        {segmentStep === "categories" ? (
          <div className={styles.mobileSegmentCategoryGrid}>
            {groups.map((group) => {
              const selectedInGroup = selectedSegments.filter((segment) =>
                group.segments.some((item) => item.toLowerCase() === segment.toLowerCase()),
              ).length;
              const categoryActive = resolveRadarCategory(draftValue)?.key === group.key;
              return (
                <button
                  type="button"
                  key={group.key}
                  data-active={group.key === resolvedActiveGroupKey || categoryActive ? "true" : "false"}
                  onClick={() => openSegmentGroup(group.key)}
                >
                  <span>{group.label}</span>
                  <small>
                    {categoryActive
                      ? "categoria"
                      : selectedInGroup
                        ? `${selectedInGroup} selecionados`
                        : `${group.segments.length} opções`}
                  </small>
                </button>
              );
            })}
          </div>
        ) : (
          <>
            <div className={styles.mobileSegmentToolbar}>
              <button type="button" onClick={() => setDraftValue("")}>
                Limpar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!activeGroup) return;
                  setDraftValue(buildRadarCategorySegmentValue(activeGroup));
                  setApplyError(null);
                }}
              >
                Usar categoria
              </button>
            </div>
            {canUseTypedSegment ? (
              <div className={styles.mobileSegmentCustom}>
                <span>{query.trim()}</span>
                <button
                  type="button"
                  onClick={useTypedSegment}
                >
                  Buscar
                </button>
              </div>
            ) : null}
            <div className={styles.mobileSegmentOptions}>
              {visibleSegments.map((segment) => {
                const active = selectedSegments.some((item) => item.toLowerCase() === segment.toLowerCase());
                return (
                  <button
                    type="button"
                    key={segment}
                    data-active={active ? "true" : "false"}
                    disabled={!active && !canSelectSegment}
                    onClick={() => toggleSegment(segment)}
                  >
                    {segment}
                  </button>
                );
              })}
            </div>
          </>
        )}
        {applyError ? <div className={styles.mobileSegmentApplyError}>{applyError}</div> : null}
        <div className={styles.mobileSegmentApplyBar}>
          {segmentStep === "categories" ? (
            <button
              type="button"
              onClick={() => {
                setDraftValue("");
                setApplyError(null);
              }}
              disabled={applying || !draftValue}
            >
              Limpar
            </button>
          ) : (
            <button type="button" onClick={backToCategories} disabled={applying}>
              Categorias
            </button>
          )}
          <button type="button" data-primary="true" onClick={() => void applySelection()} disabled={applying}>
            {applying ? "Salvando" : "Aplicar"}
          </button>
        </div>
        {segmentStep === "segments" ? (
          <button type="button" className={styles.mobileSegmentCancel} onClick={onClose} disabled={applying}>
            Cancelar
          </button>
        ) : null}
      </section>
    </div>
  );
}

function MobileEngineToggle({
  value,
  onChange,
  className,
  disabled = false,
}: {
  value: HbxEngineValue;
  onChange: (value: HbxEngineValue) => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <div className={`${styles.engineToggle} ${className || ""}`} role="group" aria-label="Fonte de busca">
      {[
        { value: "hbx" as HbxEngineValue, label: "HBX" },
        { value: "google" as HbxEngineValue, label: "Google" },
      ].map((option) => (
        <button
          type="button"
          key={option.value}
          data-active={value === option.value ? "true" : "false"}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          <span aria-hidden="true" />
          {option.label}
        </button>
      ))}
    </div>
  );
}

function readMobileRadarSearchNoticeDismissed() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(MOBILE_RADAR_SEARCH_NOTICE_DISMISSED_KEY) === "true";
}

function RadarMotionBackground({ active }: { active: boolean }) {
  const blips = [
    { left: 21, top: 32, delay: "0s" },
    { left: 74, top: 28, delay: "0.5s" },
    { left: 67, top: 70, delay: "1s" },
    { left: 32, top: 76, delay: "1.5s" },
    { left: 59, top: 44, delay: "2s" },
  ];

  return (
    <div className={styles.radarMotionBackdrop} data-active={active ? "true" : "false"} aria-hidden="true">
      <div className={styles.radarMotionAura} />
      <div className={styles.radarMotionDisc}>
        <span className={styles.radarMotionCircle} data-ring="outer" />
        <span className={styles.radarMotionCircle} data-ring="one" />
        <span className={styles.radarMotionCircle} data-ring="two" />
        <span className={styles.radarMotionCircle} data-ring="three" />
        <span className={styles.radarMotionCircle} data-ring="four" />
        <span className={styles.radarMotionAxis} data-axis="vertical" />
        <span className={styles.radarMotionAxis} data-axis="horizontal" />
        <span className={styles.radarMotionSweep}>
          <span className={styles.radarMotionTrail} />
          <span className={styles.radarMotionCore} />
        </span>
        <span className={styles.radarMotionRing} />
        <span className={styles.radarMotionRingReverse} />
        {blips.map((blip) => (
          <span
            key={`${blip.left}:${blip.top}`}
            className={styles.radarMotionBlip}
            style={{ left: `${blip.left}%`, top: `${blip.top}%`, animationDelay: blip.delay }}
          >
            <i />
          </span>
        ))}
      </div>
      <span className={styles.radarMotionGlow} />
    </div>
  );
}

export default function RadarDigitalClientPage({ mobileRoute = false }: { mobileRoute?: boolean } = {}) {
  const hasToken = useRequireModule("webscraping");
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [generalSearch, setGeneralSearch] = useState("");
  const [appliedGeneralSearch, setAppliedGeneralSearch] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [items, setItems] = useState<RadarLead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [radarCanceling, setRadarCanceling] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);
  const [telonProgress, setTelonProgress] = useState(8);
  const [radarVisualCount, setRadarVisualCount] = useState(0);
  const [activeRun, setActiveRun] = useState<RadarSearchRunResponse | null>(null);
  const [terminalRunSnapshot, setTerminalRunSnapshot] = useState<RadarSearchRunResponse | null>(null);
  const [commercialPlans, setCommercialPlans] = useState<CommercialPlansPayload | null>(null);
  const [vendasUsage, setVendasUsage] = useState<VendasUsageSnapshot | null>(null);
  const [vendasPendingCount, setVendasPendingCount] = useState<number | null>(null);
  const [teamUsers, setTeamUsers] = useState<GerencialTeamUser[]>([]);
  const [distributionUserIds, setDistributionUserIds] = useState<number[]>([]);
  const [autoDistributionOpen, setAutoDistributionOpen] = useState(false);
  const [autoDistributionLoading, setAutoDistributionLoading] = useState(false);
  const [autoDistributionSaving, setAutoDistributionSaving] = useState(false);
  const [autoDistributionRule, setAutoDistributionRule] = useState<RadarAutoDistributionRule | null>(null);
  const [autoDistributionDraft, setAutoDistributionDraft] = useState<RadarAutoDistributionDraft>(() =>
    buildRadarAutoDistributionDraft(null, DEFAULT_FILTERS),
  );
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mobileAutoImportPending, setMobileAutoImportPending] = useState(false);
  const [mobileSearchNoticeOpen, setMobileSearchNoticeOpen] = useState(false);
  const [mobileSearchNoticeDismissed, setMobileSearchNoticeDismissed] = useState(readMobileRadarSearchNoticeDismissed);
  const [mobileQuotaPopupOpen, setMobileQuotaPopupOpen] = useState(false);
  const [mobilePicker, setMobilePicker] = useState<"state" | "city" | "segment" | null>(null);
  const [radarStockPauseUnlocked, setRadarStockPauseUnlocked] = useState(false);
  const [locating, setLocating] = useState(false);
  const [availableFilters, setAvailableFilters] = useState<RadarAvailableFilters>({
    states: [],
    citiesByState: {},
    segments: [],
  });
  const [radarFilterDraftReady, setRadarFilterDraftReady] = useState(false);
  const [enrichmentSummary, setEnrichmentSummary] = useState<RadarEnrichmentSummary | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const pendingFreshRunRef = useRef(false);
  const mobileSearchNoticeRef = useRef<HTMLElement | null>(null);
  const filterEditingRef = useRef(false);
  const filterEditingReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backendSegmentHydrationAttemptedRef = useRef(false);
  const isMobileRadarSurface = useCallback(
    () => mobileRoute || isMobileRadarViewport(),
    [mobileRoute],
  );

  const searchMatchedItems = useMemo(
    () => items.filter((item) => leadMatchesSearch(item, appliedGeneralSearch)),
    [appliedGeneralSearch, items],
  );
  const visibleItems = useMemo(
    () => searchMatchedItems,
    [searchMatchedItems],
  );
  const activeSellerUsers = useMemo(
    () =>
      teamUsers.filter((user) => {
        const role = String(user.role || "").toUpperCase();
        return user.isActive !== false && (role === "USER" || role === "ADMIN");
      }),
    [teamUsers],
  );
  const selectedDistributionUsers = useMemo(
    () => activeSellerUsers.filter((user) => distributionUserIds.includes(user.id)),
    [activeSellerUsers, distributionUserIds],
  );
  const autoDistributionTerritoryModeActive = useMemo(
    () => autoDistributionDraft.territories.some((territory) => territory.cities.length > 0),
    [autoDistributionDraft.territories],
  );
  const autoDistributionSelectedCityKey = useMemo(
    () => normalizeRadarTerritoryKey(autoDistributionDraft.preferredCity, autoDistributionDraft.preferredState),
    [autoDistributionDraft.preferredCity, autoDistributionDraft.preferredState],
  );
  const autoDistributionEligibleSellerUsers = useMemo(() => {
    if (!autoDistributionTerritoryModeActive || !autoDistributionSelectedCityKey) return activeSellerUsers;
    const territoryByUserId = new Map(autoDistributionDraft.territories.map((territory) => [territory.userId, territory]));
    return activeSellerUsers.filter((user) =>
      (territoryByUserId.get(user.id)?.cities || []).some(
        (city) => normalizeRadarTerritoryKey(city.city, city.state) === autoDistributionSelectedCityKey,
      ),
    );
  }, [activeSellerUsers, autoDistributionDraft.territories, autoDistributionSelectedCityKey, autoDistributionTerritoryModeActive]);
  const distributionEnabled = selectedDistributionUsers.length > 0;
  const distributionLabel = distributionEnabled
    ? selectedDistributionUsers.length === 1
      ? `Distribuir para ${selectedDistributionUsers[0].name || selectedDistributionUsers[0].username || selectedDistributionUsers[0].email || "vendedor"}`
      : `Distribuir em rodízio para ${selectedDistributionUsers.length} vendedores`
    : "Enviar para meu Vendas";
  const highOpportunityCount = useMemo(
    () => visibleItems.filter((item) => Number(item.opportunityScore || 0) >= 70).length,
    [visibleItems],
  );
  const socialLookupPendingCount = useMemo(
    () => visibleItems.filter(isRadarSocialLookupPending).length,
    [visibleItems],
  );
  const visibleEnrichmentSummary = useMemo<RadarEnrichmentSummary>(() => ({
    cardsAnalyzed: enrichmentSummary?.cardsAnalyzed ?? visibleItems.length,
    whatsappVerified: enrichmentSummary?.whatsappVerified ?? visibleItems.filter((item) => String(item.whatsappStatus || item.whatsappCheckStatus || "").toLowerCase() === "confirmed").length,
    emailConfirmedOrProbable: enrichmentSummary?.emailConfirmedOrProbable ?? visibleItems.filter((item) => ["confirmed", "probable"].includes(String(item.emailStatus || "").toLowerCase())).length,
    noWebsite: enrichmentSummary?.noWebsite ?? visibleItems.filter((item) => String(item.websiteStatus || "").toLowerCase() === "none").length,
    highPriority: enrichmentSummary?.highPriority ?? visibleItems.filter((item) => Number(item.enrichmentScore || item.opportunityScore || 0) >= 70).length,
    readyToCall: enrichmentSummary?.readyToCall ?? visibleItems.filter((item) => ["whatsapp", "email", "call"].includes(String(item.recommendedChannel || "").toLowerCase())).length,
    discardedOrBlocked: enrichmentSummary?.discardedOrBlocked ?? visibleItems.filter((item) => ownershipBadge(item).tone === "negative").length,
  }), [enrichmentSummary, visibleItems]);
  const hasLeadCapabilities = Boolean(
    commercialPlans?.current?.entitlements?.radar_premium ||
    commercialPlans?.current?.entitlements?.ai_sales_scripts ||
    commercialPlans?.current?.entitlements?.bot_ia,
  );
  const mobileHeroPremiumActive = Boolean(hasLeadCapabilities || commercialPlans?.current?.premiumAccess);
  const isHbxList = !hasLeadCapabilities && (
    commercialPlans?.current?.planKey === "hbx_lite" ||
    commercialPlans?.current?.selectedPlanKey === "hbx_lite"
  );
  const showSmartLeadCards = !isHbxList;
  const currentPlanKey = commercialPlans?.current?.selectedPlanKey || commercialPlans?.current?.planKey || null;
  const currentPlan = currentPlanKey ? commercialPlanByKey(commercialPlans, currentPlanKey) : null;
  const planCardsPerSearch = Math.max(0, Math.trunc(Number(currentPlan?.quotas?.cardsPerSearch || 0)));
  const dailyLimit = Math.max(0, Math.trunc(Number(vendasUsage?.cards?.dailySafetyLimit || currentPlan?.quotas?.dailyCardSafetyLimit || 0)));
  const dailyRemaining = Math.max(0, Math.trunc(Number(vendasUsage?.cards?.dailyRemaining ?? dailyLimit ?? 0)));
  const monthlyRemaining = Math.max(0, Math.trunc(Number(vendasUsage?.cards?.remaining ?? vendasUsage?.cards?.monthlyRemaining ?? 999999)));
  const perUserRemaining = vendasUsage?.cards?.perUserLimit != null
    ? Math.max(0, Math.trunc(Number(vendasUsage.cards.userLimit || 0) - Number(vendasUsage.cards.userUsed || 0)))
    : monthlyRemaining;
  const quotaRemaining = Math.min(
    ...[dailyRemaining, monthlyRemaining, perUserRemaining].filter((value) => Number.isFinite(value)),
  );
  const fallbackSearchLimit = planCardsPerSearch || (isHbxList ? 50 : MAX_CARDS_PER_RADAR_SEARCH);
  const perSearchLimit = Math.max(1, Math.min(MAX_CARDS_PER_RADAR_SEARCH, fallbackSearchLimit));
  const availableSpendLimit = Number.isFinite(quotaRemaining) ? quotaRemaining : fallbackSearchLimit;
  const searchSpendLimit = Math.max(0, Math.min(perSearchLimit, availableSpendLimit));
  const radarQuantityLimit = Math.max(0, searchSpendLimit);
  const selectedVendasStockTarget = Math.max(
    1,
    Math.min(RADAR_VENDAS_STOCK_TARGET_MAX, Math.trunc(Number(filters.quantity || DEFAULT_FILTERS.quantity) || DEFAULT_FILTERS.quantity)),
  );
  const currentVendasStock = Math.max(0, Math.trunc(Number(vendasPendingCount ?? 0)));
  const radarVendasStockMissing = Math.max(0, selectedVendasStockTarget - currentVendasStock);
  const effectiveFilters = useMemo(
    () => ({
      ...filters,
      quantity: selectedVendasStockTarget,
    }),
    [filters, selectedVendasStockTarget],
  );
  const activeRunTarget = Math.max(1, Number(activeRun?.targetQuantity || activeRun?.meta?.requestedQuantity || effectiveFilters.quantity || 1));
  const activeRunDelivered = Math.max(visibleItems.length, Number(activeRun?.meta?.deliveredCount || activeRun?.foundCount || 0));
  const activeRunProgress = activeRun
    ? Math.max(4, Math.min(100, Number(activeRun.meta?.progress || Math.round((activeRunDelivered / activeRunTarget) * 100))))
    : 0;
  const queryRadarLeadId = String(searchParams.get("radarLeadId") || "").trim();

  function setFilterEditing(active: boolean) {
    if (filterEditingReleaseTimerRef.current) {
      clearTimeout(filterEditingReleaseTimerRef.current);
      filterEditingReleaseTimerRef.current = null;
    }
    if (active) {
      filterEditingRef.current = true;
      return;
    }
    filterEditingReleaseTimerRef.current = setTimeout(() => {
      filterEditingRef.current = false;
      filterEditingReleaseTimerRef.current = null;
    }, 700);
  }

  function handleFilterFormBlur(event: FocusEvent<HTMLElement>) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setFilterEditing(false);
  }

  const refreshVendasPendingCount = useCallback(async () => {
    const payload = await apiFetch<VendasPendingSummaryResponse>("/vendas/pending-summary", {
      requireAuth: true,
      timeoutMs: 12000,
    });
    const nextCount = Math.max(0, Math.trunc(Number(payload?.pendingCount || 0)));
    setVendasPendingCount(nextCount);
    return nextCount;
  }, []);

  useEffect(() => {
    return () => {
      if (filterEditingReleaseTimerRef.current) clearTimeout(filterEditingReleaseTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const stored = readStoredRadarFilters();
    if (stored?.filters) {
      const nextFilters = normalizeStoredRadarFilterDraft(stored.filters);
      const isStaleEngine = Date.now() - Number(stored.updatedAt || 0) > 1000 * 60 * 60 * 18;
      if (isStaleEngine) nextFilters.engine = "hbx";
      setFilters(nextFilters);
      setAppliedFilters(nextFilters);
      setGeneralSearch(String(stored.generalSearch || ""));
      setAppliedGeneralSearch(String(stored.generalSearch || ""));
    }
    setRadarFilterDraftReady(true);
  }, []);

  useEffect(() => {
    if (!radarFilterDraftReady) return;
    saveStoredRadarFilters({
      filters,
      generalSearch,
    });
  }, [filters, generalSearch, radarFilterDraftReady]);

  useEffect(() => {
    if (hasToken !== true || !radarFilterDraftReady) return;
    if (backendSegmentHydrationAttemptedRef.current) return;
    backendSegmentHydrationAttemptedRef.current = true;
    if (filters.segment.trim()) return;
    let cancelled = false;
    apiFetch<SalesProfileResponse>("/vendas/sales-profile", {
      requireAuth: true,
      timeoutMs: 12000,
    })
      .then((payload) => {
        if (cancelled) return;
        const savedSegments = joinRadarSegments(normalizeProfileLabels(payload?.effectiveProfile?.targetSegments));
        if (!savedSegments) return;
        setFilters((current) => current.segment.trim() ? current : { ...current, segment: savedSegments });
        setAppliedFilters((current) => current.segment.trim() ? current : { ...current, segment: savedSegments });
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [filters.segment, hasToken, radarFilterDraftReady]);

  useEffect(() => {
    if (hasToken !== true) return;
    let cancelled = false;
    apiFetch<CommercialPlansPayload>("/commercial-plans/me", { requireAuth: true })
      .then((payload) => {
        if (!cancelled) setCommercialPlans(payload);
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [hasToken]);

  useEffect(() => {
    if (hasToken !== true) return;
    let cancelled = false;
    apiFetch<VendasUsageSnapshot>("/vendas/usage", {
      requireAuth: true,
      timeoutMs: 12000,
    })
      .then((usagePayload) => {
        if (cancelled) return;
        setVendasUsage(usagePayload);
      })
      .catch(() => {
        if (!cancelled) {
          setVendasUsage(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [hasToken]);

  useEffect(() => {
    if (hasToken !== true) return;
    let cancelled = false;
    apiFetch<GerencialTeamUser[]>("/users/company", {
      requireAuth: true,
      timeoutMs: 12000,
    })
      .then((payload) => {
        if (cancelled) return;
        setTeamUsers(Array.isArray(payload) ? payload : []);
      })
      .catch(() => {
        if (!cancelled) setTeamUsers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [hasToken]);

  async function loadRadarAutoDistributionRule(options?: { openAfterLoad?: boolean }) {
    setAutoDistributionLoading(true);
    setError(null);
    try {
      const payload = await apiFetch<RadarAutoDistributionResponse>("/webscraping/radar/auto-distribution", {
        requireAuth: true,
        timeoutMs: 12000,
      });
      const rule = payload.rule || null;
      setAutoDistributionRule(rule);
      setAutoDistributionDraft(buildRadarAutoDistributionDraft(rule, filters));
      if (options?.openAfterLoad) setAutoDistributionOpen(true);
    } catch (ruleError) {
      setError(radarFriendlyError(ruleError) || "Não consegui carregar a distribuição automática.");
    } finally {
      setAutoDistributionLoading(false);
    }
  }

  function openAutoDistributionModal() {
    setAutoDistributionDraft(buildRadarAutoDistributionDraft(autoDistributionRule, filters));
    setAutoDistributionOpen(true);
    if (!autoDistributionRule) {
      void loadRadarAutoDistributionRule();
    }
  }

  function addAutoDistributionTerritoryCity(userId: number) {
    const city = autoDistributionDraft.preferredCity.trim();
    const state = autoDistributionDraft.preferredState.trim().toUpperCase();
    if (!userId || !city || !state) {
      setError("Escolha estado e cidade antes de fixar território para o vendedor.");
      return;
    }
    setAutoDistributionDraft((current) => {
      const key = normalizeRadarTerritoryKey(city, state);
      const territories = normalizeRadarAutoDistributionTerritories(current.territories);
      const existing = territories.find((territory) => territory.userId === userId);
      const nextCity = { city, state };
      if (existing) {
        const cityMap = new Map(existing.cities.map((item) => [normalizeRadarTerritoryKey(item.city, item.state), item]));
        cityMap.set(key, nextCity);
        return {
          ...current,
          territories: territories.map((territory) =>
            territory.userId === userId ? { ...territory, cities: Array.from(cityMap.values()).slice(0, 20) } : territory,
          ),
        };
      }
      return {
        ...current,
        territories: [...territories, { userId, cities: [nextCity] }],
      };
    });
  }

  function removeAutoDistributionTerritoryCity(userId: number, city: RadarAutoDistributionTerritoryCity) {
    setAutoDistributionDraft((current) => ({
      ...current,
      territories: normalizeRadarAutoDistributionTerritories(current.territories)
        .map((territory) => {
          if (territory.userId !== userId) return territory;
          const removeKey = normalizeRadarTerritoryKey(city.city, city.state);
          return {
            ...territory,
            cities: territory.cities.filter((item) => normalizeRadarTerritoryKey(item.city, item.state) !== removeKey),
          };
        })
        .filter((territory) => territory.cities.length > 0),
    }));
  }

  function clearAutoDistributionTerritory(userId: number) {
    setAutoDistributionDraft((current) => ({
      ...current,
      territories: normalizeRadarAutoDistributionTerritories(current.territories).filter((territory) => territory.userId !== userId),
    }));
  }

  async function saveAutoDistributionRule() {
    if (!autoDistributionDraft.preferredState || !autoDistributionDraft.preferredCity) {
      setError("Escolha estado e cidade para ativar a distribuição automática.");
      return;
    }
    if (!autoDistributionDraft.segment.trim()) {
      setError("Escolha uma categoria ou segmento para ativar a distribuição automática.");
      return;
    }
    if (!autoDistributionDraft.includeAdmin && autoDistributionEligibleSellerUsers.length === 0) {
      setError(autoDistributionTerritoryModeActive
        ? "Nenhum vendedor cobre a cidade escolhida. Adicione essa cidade ao território de pelo menos um vendedor ou permita que o Admin receba."
        : "Cadastre pelo menos um vendedor ativo ou permita que o Admin receba leads.");
      return;
    }
    setAutoDistributionSaving(true);
    setError(null);
    try {
      const payload = await apiFetch<RadarAutoDistributionResponse>("/webscraping/radar/auto-distribution", {
        method: "PUT",
        requireAuth: true,
        timeoutMs: 15000,
        body: JSON.stringify({
          status: "active",
          includeAdmin: autoDistributionDraft.includeAdmin,
          adminTargetStock: autoDistributionDraft.includeAdmin ? autoDistributionDraft.adminTargetStock : 0,
          adminDailyLimit: autoDistributionDraft.includeAdmin ? autoDistributionDraft.adminDailyLimit : 0,
          targetStockPerSeller: autoDistributionDraft.targetStockPerSeller,
          dailyLimitPerSeller: autoDistributionDraft.dailyLimitPerSeller,
          preferredState: autoDistributionDraft.preferredState,
          preferredCity: autoDistributionDraft.preferredCity,
          segment: autoDistributionDraft.segment,
          categoryKey: inferRadarSegmentCategory(autoDistributionDraft.segment),
          radiusKm: autoDistributionDraft.radiusKm,
          userIds: [],
          territories: normalizeRadarAutoDistributionTerritories(autoDistributionDraft.territories),
        }),
      });
      const rule = payload.rule || null;
      setAutoDistributionRule(rule);
      setAutoDistributionDraft(buildRadarAutoDistributionDraft(rule, filters));
      let activationMessage = payload.message || "Distribuição automática ativada.";
      try {
        const runPayload = await apiFetch<RadarAutoDistributionRunResponse>("/webscraping/radar/auto-distribution/run", {
          method: "POST",
          requireAuth: true,
          timeoutMs: 60000,
          body: JSON.stringify({ limit: 80 }),
        });
        activationMessage = runPayload.message || activationMessage;
      } catch (runError) {
        activationMessage = `${activationMessage} ${radarFriendlyError(runError) || "O robô tentará novamente em instantes."}`;
      }
      setAutoDistributionOpen(false);
      setFeedback(activationMessage);
    } catch (saveError) {
      setError(radarFriendlyError(saveError) || "Não consegui salvar a distribuição automática.");
    } finally {
      setAutoDistributionSaving(false);
    }
  }

  useEffect(() => {
    if (!distributionUserIds.length) return;
    const activeIds = new Set(activeSellerUsers.map((user) => user.id));
    setDistributionUserIds((current) => current.filter((id) => activeIds.has(id)));
  }, [activeSellerUsers, distributionUserIds.length]);

  useEffect(() => {
    if (hasToken !== true) return;
    let cancelled = false;
    refreshVendasPendingCount()
      .catch(() => {
        if (!cancelled) setVendasPendingCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [hasToken, refreshVendasPendingCount]);

  useEffect(() => {
    if (filters.quantity >= 1 && filters.quantity <= RADAR_VENDAS_STOCK_TARGET_MAX) return;
    setFilters((current) => ({
      ...current,
      quantity: Math.max(1, Math.min(RADAR_VENDAS_STOCK_TARGET_MAX, Number(current.quantity || DEFAULT_FILTERS.quantity) || DEFAULT_FILTERS.quantity)),
    }));
  }, [filters.quantity]);

  useEffect(() => {
    const nextState = String(searchParams.get("state") || "").trim();
    const nextCity = String(searchParams.get("city") || "").trim();
    const nextSegment = String(searchParams.get("segment") || "").trim();
    if (!nextState && !nextCity && !nextSegment) return;
    setFilters((current) => ({
      ...current,
      state: nextState || current.state,
      city: nextCity || current.city,
      originLat: nextState || nextCity ? null : current.originLat,
      originLng: nextState || nextCity ? null : current.originLng,
      segment: nextSegment || current.segment,
    }));
  }, [searchParams]);

  useEffect(() => {
    if (hasToken !== true || !queryRadarLeadId) return;
    let cancelled = false;
    async function loadLinkedLead() {
      setLoading(true);
      setError(null);
      try {
        const payload = await apiFetch<RadarLeadDetailResponse>(`/webscraping/radar/leads/${encodeURIComponent(queryRadarLeadId)}`, {
          requireAuth: true,
          timeoutMs: 15000,
        });
        if (cancelled) return;
        const lead = normalizeDetailLead(payload);
        setItems(lead ? [lead] : []);
        setTotal(lead ? 1 : 0);
        setPage(1);
        setHasSearched(true);
        setFeedback("Card aberto automaticamente. Revise antes de enviar para Vendas.");
      } catch {
        if (!cancelled) setError("Não foi possível abrir este card do Radar.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadLinkedLead();
    return () => {
      cancelled = true;
    };
  }, [hasToken, queryRadarLeadId]);

  const loadCards = useCallback(async (nextPage = 1, append = false, filtersOverride?: FilterState) => {
    const queryFilters = filtersOverride || appliedFilters;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const query = buildLeadQuery(queryFilters, nextPage);
      const payload = await apiFetch<RadarLeadsResponse>(`/webscraping/radar/leads?${query}`, {
        requireAuth: true,
        timeoutMs: 15000,
      });
      setItems((current) => {
        const next = append ? mergeRadarLeads([...current, ...(payload.items || [])]) : payload.items || [];
        return radarLeadListEqual(current, next) ? current : next;
      });
      setTotal(Number(payload.total || 0));
      setAvailableFilters(payload.meta?.availableFilters || { states: [], citiesByState: {}, segments: [] });
      setEnrichmentSummary(payload.meta?.enrichmentSummary || null);
      setPage(nextPage);
    } catch (err) {
      setError(radarFriendlyError(err));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [appliedFilters]);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 5200);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    if (!mobileSearchNoticeOpen) return;
    const timer = window.setTimeout(() => {
      mobileSearchNoticeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [mobileSearchNoticeOpen]);

  const telonBusy = hasToken === null || loading || loadingMore || searching || bulkSending || Boolean(actionId);

  useEffect(() => {
    if (!telonBusy) {
      setTelonProgress(8);
      setRadarVisualCount(0);
      return undefined;
    }

    setTelonProgress((current) => (current > 8 && current < 96 ? current : 8));
    if (isMobileRadarSurface()) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setTelonProgress((current) => {
        if (current >= 96) return 96;
        const distance = 96 - current;
        return Math.min(96, Math.round((current + Math.max(1.4, distance * 0.16)) * 10) / 10);
      });
    }, 360);

    return () => window.clearInterval(timer);
  }, [isMobileRadarSurface, telonBusy]);

  useEffect(() => {
    if (!bulkSending) {
      setRadarVisualCount(0);
      return undefined;
    }
    const target = Math.max(1, Math.min(effectiveFilters.quantity, Math.max(1, visibleItems.length)));
    setRadarVisualCount(1);
    const timer = window.setInterval(() => {
      setRadarVisualCount((current) => Math.min(target, current + 1));
    }, 180);
    return () => window.clearInterval(timer);
  }, [bulkSending, effectiveFilters.quantity, visibleItems.length]);

  useEffect(() => {
    const metrics = [
      { label: "Cards", value: visibleItems.length.toLocaleString("pt-BR") },
      { label: "High", value: highOpportunityCount.toLocaleString("pt-BR") },
      { label: "Total", value: total.toLocaleString("pt-BR") },
    ];
    const errorMessage = compactRadarMessage(error);
    const activeStepIndex = Math.min(RADAR_PROGRESS_STEPS.length - 1, Math.floor(topbarProgressPercentFrom(telonProgress) / 25));
    const realCardFeed = visibleItems.slice(-4).map((item) => ({
      id: `radar:${item.id}`,
      title: item.name || "Card Radar",
      meta: [item.segment, item.city].filter(Boolean).join(" • ") || "Radar Digital",
      score: item.opportunityScore ?? undefined,
    }));

    if (errorMessage) {
      dispatchTopbarProgress({
        source: "radar",
        phase: "warning",
        title: "Radar precisa de ajuste",
        status: errorMessage,
        progress: 100,
        metrics,
      });
      return;
    }

    if (feedback && !activeRun) {
      dispatchTopbarProgress({
        source: "radar",
        phase: "success",
        title: "Radar atualizado",
        status: feedback,
        progress: 100,
        metrics,
      });
      return;
    }

    if (searching) {
      dispatchTopbarProgress({
        source: "radar",
        phase: "loading",
        title: "Radar pesquisando agora",
        status: socialLookupPendingCount > 0
          ? "Chegando cards e enriquecendo contatos."
          : canPullWithFilters(effectiveFilters)
          ? "Buscando contatos, filtrando negativos e preparando cards elegíveis."
          : "Listando histórico salvo do Radar.",
        progress: Math.max(18, telonProgress),
        steps: RADAR_PROGRESS_STEPS,
        activeStepIndex,
        cardFeed: realCardFeed,
        metrics: [
          { label: "Entregues", value: String(visibleItems.length) },
          { label: "Fonte", value: filters.engine === "google" ? "Google" : "HBX" },
          { label: "Tipo", value: effectiveFilters.targetType.toUpperCase() },
        ],
      });
      return;
    }

    if (bulkSending) {
      dispatchTopbarProgress({
        source: "radar",
        phase: "loading",
        title: "Enviando seleção para Vendas",
        status: "Alimentando Vendas/Prospecção com cards elegíveis da tela.",
        progress: Math.max(18, telonProgress),
        steps: RADAR_PROGRESS_STEPS,
        activeStepIndex: 3,
        cardFeed: visibleItems.slice(0, Math.max(1, radarVisualCount)).slice(-4).map((item) => ({
          id: `vendas:${item.id}`,
          title: item.name || "Card Radar",
          meta: [item.segment, item.city].filter(Boolean).join(" • ") || "Radar Digital",
          score: item.opportunityScore ?? undefined,
        })),
        metrics: [
          { label: "Selecionados", value: String(Math.min(visibleItems.length, effectiveFilters.quantity)) },
          { label: "High", value: highOpportunityCount.toLocaleString("pt-BR") },
          { label: "Destino", value: "Vendas" },
        ],
      });
      return;
    }

    if (loadingMore) {
      dispatchTopbarProgress({
        source: "radar",
        phase: "loading",
        title: "Carregando mais Radar",
        status: "Buscando o próximo lote de 100 cards.",
        progress: Math.max(18, telonProgress),
        metrics,
      });
      return;
    }

    if (loading || hasToken === null) {
      dispatchTopbarProgress({
        source: "radar",
        phase: "loading",
        title: "Carregando Radar Digital",
        status: "Preparando painel do Radar.",
        progress: Math.max(14, telonProgress),
        metrics,
      });
      return;
    }

    if (actionId) {
      dispatchTopbarProgress({
        source: "radar",
        phase: "loading",
        title: "Atualizando card do Radar",
        status: "Aplicando ação no card selecionado.",
        progress: Math.max(22, telonProgress),
        metrics,
      });
      return;
    }

    clearTopbarProgress("radar");
  }, [
    actionId,
    activeRun,
    bulkSending,
    effectiveFilters,
    error,
    feedback,
    filters.city,
    filters.engine,
    filters.segment,
    hasToken,
    highOpportunityCount,
    loading,
    loadingMore,
    radarVisualCount,
    searching,
    socialLookupPendingCount,
    telonProgress,
    total,
    visibleItems,
  ]);

  useEffect(() => () => clearTopbarProgress("radar"), []);

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
    setGeneralSearch("");
    setAppliedGeneralSearch("");
    setHasSearched(false);
    setItems([]);
    setTotal(0);
    setPage(1);
    setActiveRun(null);
    setTerminalRunSnapshot(null);
    activeRunIdRef.current = null;
    pendingFreshRunRef.current = false;
    setSearching(false);
    setFeedback(null);
    setError(null);
    clearStoredRadarRun();
    clearStoredRadarFilters();
  }

  async function handleCurrentLocation() {
    if (locating) return;
    setLocating(true);
    setError(null);
    try {
      const position = await getCurrentBrowserPosition();
      const location = await reverseGeocodeCurrentPosition(position);
      setFilters((current) => ({
        ...current,
        state: location.state,
        city: location.city,
        originLat: location.lat,
        originLng: location.lng,
      }));
    } catch (locationError) {
      setError(locationError instanceof Error ? locationError.message : "Não consegui usar sua localização agora.");
    } finally {
      setLocating(false);
    }
  }

  const applyRadarRunPayload = useCallback((payload: RadarSearchRunResponse) => {
    if (isRadarRunNotFoundPayload(payload)) {
      activeRunIdRef.current = null;
      clearStoredRadarRun();
      setActiveRun(null);
      setTerminalRunSnapshot(null);
      setSearching(false);
      setFeedback(compactRadarMessage(payload.message || "Busca anterior encerrada. Radar pronto para uma nova pesquisa."));
      return;
    }
    const runId = String(payload.runId || payload.id || "");
    if (!runId || !payload.status) {
      activeRunIdRef.current = null;
      clearStoredRadarRun();
      setActiveRun(null);
      setTerminalRunSnapshot(null);
      setSearching(false);
      setFeedback(payload.message || "A busca foi recebida, mas o Radar não retornou progresso detalhado agora.");
      return;
    }
    if (activeRunIdRef.current && runId && activeRunIdRef.current !== runId) return;

    const nextItems = payload.items || [];
    const terminal = Boolean(payload.meta?.terminal) || isTerminalRadarRun(payload.status);
    const shouldReplaceCurrentItems = pendingFreshRunRef.current && (nextItems.length > 0 || terminal);
    const payloadFilters = payload.meta?.filters;
    if (payloadFilters) {
      if (!filterEditingRef.current) {
        setFilters((current) => {
          const next: FilterState = {
            ...current,
            state: payloadFilters.state || current.state,
            city: payloadFilters.city || current.city,
            segment: payloadFilters.segment || current.segment,
            radiusKm: Number(payloadFilters.radiusKm ?? current.radiusKm ?? DEFAULT_FILTERS.radiusKm),
            targetType: (payloadFilters.targetType === "pf" || payloadFilters.targetType === "both" ? payloadFilters.targetType : "pj") as HbxTargetTypeValue,
          };
          return JSON.stringify(current) === JSON.stringify(next) ? current : next;
        });
      }
      setAppliedFilters((current) => {
        const next: FilterState = {
          ...current,
          state: payloadFilters.state || current.state,
          city: payloadFilters.city || current.city,
          segment: payloadFilters.segment || current.segment,
          radiusKm: Number(payloadFilters.radiusKm ?? current.radiusKm ?? DEFAULT_FILTERS.radiusKm),
          targetType: (payloadFilters.targetType === "pf" || payloadFilters.targetType === "both" ? payloadFilters.targetType : "pj") as HbxTargetTypeValue,
        };
        return JSON.stringify(current) === JSON.stringify(next) ? current : next;
      });
    }
    const nextLimit = Math.max(1, Number(payload.targetQuantity || payload.meta?.requestedQuantity || nextItems.length || 1));
    setItems((current) => {
      const merged = (shouldReplaceCurrentItems ? nextItems : mergeRadarLeads([...current, ...nextItems])).slice(0, nextLimit);
      return radarLeadListEqual(current, merged) ? current : merged;
    });
    if (shouldReplaceCurrentItems) pendingFreshRunRef.current = false;
    const nextTotal = Number(payload.targetQuantity || payload.meta?.requestedQuantity || payload.total || nextItems.length || 0);
    setTotal((current) => current === nextTotal ? current : nextTotal);
    setPage((current) => current === 1 ? current : 1);
    setHasSearched(true);
    const nextProgress = Math.max(12, Math.min(100, Number(payload.meta?.progress || 0) || 12));
    setTelonProgress((current) => current === nextProgress ? current : nextProgress);
    saveStoredRadarRun({
      runId,
      status: payload.status,
      city: payloadFilters?.city || null,
      state: payloadFilters?.state || null,
      segment: payloadFilters?.segment || null,
      radiusKm: Number(payloadFilters?.radiusKm ?? 0) || 0,
      regionalCities: payloadFilters?.regionalCities || null,
      selectedSegments: payloadFilters?.selectedSegments || payload.meta?.searchScope?.selectedSegments || null,
      targetQuantity: Number(payload.targetQuantity || payload.meta?.requestedQuantity || 0) || null,
      deliveredCount: Number(payload.meta?.deliveredCount || nextItems.length || 0) || 0,
    });

    if (terminal) {
      activeRunIdRef.current = null;
      setActiveRun((current) => current === null ? current : null);
      setTerminalRunSnapshot(payload.status === "canceled" ? null : payload);
      setSearching(false);
      setMobileAutoImportPending(false);
      if (payload.status === "canceled") {
        clearStoredRadarRun(runId);
      }
      const nextFeedback = compactRadarMessage(payload.message || `${nextItems.length} card(s) entregues.`);
      setFeedback((current) => current === nextFeedback ? current : nextFeedback);
      void refreshVendasPendingCount().catch(() => null);
      return;
    }

    setActiveRun((current) => radarRunPayloadEqual(current, payload) ? current : payload);
    setTerminalRunSnapshot(null);
    setSearching(true);
    const nextFeedback = compactRadarMessage(payload.message || "Busca em andamento. Os cards aparecem conforme o Radar aprova novos contatos.");
    setFeedback((current) => current === nextFeedback ? current : nextFeedback);
  }, [refreshVendasPendingCount]);

  useEffect(() => {
    if (hasToken !== true || queryRadarLeadId || !radarFilterDraftReady) return;
    let cancelled = false;

    async function hydrateRadarRun() {
      const stored = readStoredRadarRun();
      if (stored?.runId) {
        activeRunIdRef.current = stored.runId;
        setHasSearched(true);
        setSearching(!isTerminalRadarRun(stored.status));
        try {
          const payload = await apiFetch<RadarSearchRunResponse>(`/webscraping/radar/search-runs/${encodeURIComponent(stored.runId)}`, {
            requireAuth: true,
            timeoutMs: 15000,
          });
          if (!cancelled && radarRunMatchesVisibleFilters(payload, filters)) {
            applyRadarRunPayload(payload);
          } else if (!cancelled) {
            clearStoredRadarRun(stored.runId);
            activeRunIdRef.current = null;
            setSearching(false);
          }
          return;
        } catch (error) {
          if (cancelled) return;
          activeRunIdRef.current = null;
          clearStoredRadarRun(stored.runId);
          setSearching(false);
          if (!isRadarRunNotFoundError(error)) {
            setError(radarFriendlyError(error));
          }
        }
      }

      try {
        const payload = await apiFetch<RadarSearchRunResponse | null>("/webscraping/radar/search-runs/latest", {
          requireAuth: true,
          timeoutMs: 15000,
        });
        if (cancelled || !payload?.runId) return;
        if (!radarRunMatchesVisibleFilters(payload, filters)) return;
        activeRunIdRef.current = payload.runId || payload.id || null;
        setHasSearched(true);
        setSearching(!isTerminalRadarRun(payload.status));
        applyRadarRunPayload(payload);
      } catch {
        if (!cancelled) {
          activeRunIdRef.current = null;
          setSearching(false);
        }
      }
    }

    void hydrateRadarRun();
    return () => {
      cancelled = true;
    };
  }, [applyRadarRunPayload, filters, hasToken, queryRadarLeadId, radarFilterDraftReady]);

  useEffect(() => {
    const runId = activeRun?.runId || activeRun?.id;
    if (!runId) return undefined;
    const intervalMs = isMobileRadarSurface() ? 6500 : 2200;
    return startSmartPolling(async () => {
      try {
        const payload = await apiFetch<RadarSearchRunResponse>(`/webscraping/radar/search-runs/${encodeURIComponent(runId)}`, {
          requireAuth: true,
          timeoutMs: 15000,
        });
        setError(null);
        applyRadarRunPayload(payload);
      } catch (pollError) {
        if (isRadarRunNotFoundError(pollError)) {
          activeRunIdRef.current = null;
          clearStoredRadarRun(runId);
          setActiveRun(null);
          setTerminalRunSnapshot(null);
          setSearching(false);
          setFeedback("Busca anterior encerrada. Radar pronto para uma nova pesquisa.");
          return;
        }
        setError(radarFriendlyError(pollError));
        setSearching(Boolean(activeRunIdRef.current || runId));
      }
    }, {
      intervalMs,
      immediate: false,
      pauseWhenHidden: true,
    });
  }, [activeRun?.id, activeRun?.runId, applyRadarRunPayload, isMobileRadarSurface]);

  async function cancelActiveRadarRun(): Promise<boolean> {
    const runId = activeRun?.runId || activeRun?.id || activeRunIdRef.current;
    if (!runId || radarCanceling) return false;
    setRadarCanceling(true);
    setError(null);
    setFeedback("Cancelando pesquisa atual...");
    try {
      const payload = await apiFetch<RadarSearchRunResponse>(`/webscraping/radar/search-runs/${encodeURIComponent(runId)}/cancel`, {
        method: "POST",
        requireAuth: true,
        timeoutMs: 15000,
      });
      void payload;
      activeRunIdRef.current = null;
      setActiveRun(null);
      setTerminalRunSnapshot(null);
      setSearching(false);
      setMobileAutoImportPending(false);
      pendingFreshRunRef.current = false;
      setItems([]);
      setTotal(0);
      setPage(1);
      setHasSearched(false);
      setRadarStockPauseUnlocked(true);
      clearStoredRadarRun(runId);
      setFeedback("Pesquisa cancelada. Motor liberado.");
      return true;
    } catch (cancelError) {
      setError(radarFriendlyError(cancelError));
      return false;
    } finally {
      setRadarCanceling(false);
    }
  }

  async function runRadarSearch(
    whatsappCheckMode: RadarWhatsappCheckMode = "off",
    options?: { quantityOverride?: number },
  ) {
    setError(null);
    setFeedback(null);
    setActiveRun(null);
    setTerminalRunSnapshot(null);
    activeRunIdRef.current = null;
    const nextTargetFilters = {
      ...effectiveFilters,
      targetType: isMobileRadarSurface() ? "pj" : effectiveFilters.targetType,
      quantity: Math.max(1, Math.min(RADAR_VENDAS_STOCK_TARGET_MAX, Number(options?.quantityOverride || effectiveFilters.quantity || 1))),
    };
    const nextGeneralSearch = generalSearch.trim();
    const latestVendasStock = await refreshVendasPendingCount().catch(() => vendasPendingCount ?? 0);
    const missingForTarget = Math.max(0, nextTargetFilters.quantity - Math.max(0, Math.trunc(Number(latestVendasStock || 0))));
    if (radarQuantityLimit <= 0) {
      setMobileAutoImportPending(false);
      clearStoredRadarRun();
      pendingFreshRunRef.current = false;
      setError("Limite diário de cards atingido. O contador reinicia após 00:00.");
      return;
    }
    const nextSearchQuantity = Math.max(1, Math.min(radarQuantityLimit, missingForTarget > 0 ? missingForTarget : nextTargetFilters.quantity));
    const nextSearchFilters = {
      ...nextTargetFilters,
      quantity: nextSearchQuantity,
    };
    const searchChanged = !radarFiltersHaveSameSearchMeaning(appliedFilters, nextTargetFilters);
    setRadarStockPauseUnlocked(false);
    setSearching(true);
    setTelonProgress(12);
    setHasSearched(true);
    if (hasPartialRadarSearch(nextTargetFilters)) {
      setSearching(false);
      setHasSearched(false);
      setError("Preencha cidade e segmento para pesquisar novos cards. Para ver histórico salvo, limpe esses campos.");
      return;
    }
    setAppliedFilters(nextTargetFilters);
    setAppliedGeneralSearch(nextGeneralSearch);

    try {
      if (!canPullWithFilters(nextTargetFilters)) {
        setSearching(false);
        setHasSearched(false);
        setItems([]);
        setTotal(0);
        setPage(1);
        setActiveRun(null);
        setTerminalRunSnapshot(null);
        activeRunIdRef.current = null;
        pendingFreshRunRef.current = false;
        setTelonProgress(0);
        setFeedback(null);
        setError("Para buscar novos cards, escolha cidade e segmento. Para ver histórico salvo, use Ver histórico.");
        return;
      }

      pendingFreshRunRef.current = true;
      setPage(1);
      clearStoredRadarRun();
      if (searchChanged) {
        setItems([]);
        setTotal(0);
        setTerminalRunSnapshot(null);
      }

      const targetType = nextSearchFilters.targetType === "both" ? "pj" : nextSearchFilters.targetType;
      const salesProfilePayload = await apiFetch<SalesProfileResponse>("/vendas/sales-profile", { requireAuth: true })
        .then((response) => buildRadarSalesProfilePayload(response?.effectiveProfile || null))
        .catch(() => ({}));
      const payload = await apiFetch<RadarSearchRunResponse>("/webscraping/radar/search-runs", {
        method: "POST",
        requireAuth: true,
        timeoutMs: 20000,
        body: JSON.stringify({
          ...salesProfilePayload,
          ...nextSearchFilters,
          targetType,
          quantity: nextSearchQuantity,
          minimumStock: Math.max(1, Math.ceil(nextTargetFilters.quantity * 0.5)),
          desiredStock: nextTargetFilters.quantity,
          freshness: "live",
          whatsappCheckMode,
          qualityMode: "list",
        }),
      });
      activeRunIdRef.current = payload.runId || payload.id || null;
      applyRadarRunPayload(payload);
    } catch (searchError) {
      activeRunIdRef.current = null;
      setActiveRun(null);
      pendingFreshRunRef.current = false;
      setError(radarFriendlyError(searchError));
    } finally {
      if (!activeRunIdRef.current) setSearching(false);
    }
  }

  async function runLeadAction(
    lead: RadarLead,
    action: "send" | "hide" | "negative" | "csx" | "enrich",
  ) {
    if (action === "csx") {
      setFeedback("Registro CSX pendente de integração. O card não foi alterado.");
      return;
    }

    setActionId(`${lead.id}:${action}`);
    setError(null);
    try {
      if (action === "enrich") {
        const payload = await apiFetch<RadarEnrichResponse>(`/webscraping/radar/leads/${lead.id}/enrich`, {
          method: "POST",
          requireAuth: true,
          timeoutMs: 18000,
        });
        if (payload.item) {
          setItems((current) => current.map((item) => item.id === lead.id ? { ...item, ...payload.item } : item));
        }
        setFeedback(payload.message || "Card enriquecido");
      }

      if (action === "send") {
        if (distributionEnabled) {
          await apiFetch<ImportToVendasResponse>("/webscraping/radar/leads/distribute-to-vendedores", {
            method: "POST",
            requireAuth: true,
            timeoutMs: 30000,
            body: JSON.stringify({
              leadIds: [lead.id],
              userIds: selectedDistributionUsers.map((user) => user.id),
            }),
          });
        } else {
          await apiFetch(`/webscraping/radar/leads/${lead.id}/send-to-vendas`, {
            method: "POST",
            requireAuth: true,
            timeoutMs: 15000,
          });
        }
        setItems((current) => current.map((item) => item.id === lead.id ? { ...item, status: "sent_to_vendas", companyStatus: "imported_to_vendas", ownershipStatus: "in_attendance" } : item));
        setFeedback(distributionEnabled ? "Card distribuído para Vendas do vendedor." : "Card enviado para Vendas.");
      }

      if (action === "hide") {
        await apiFetch(`/webscraping/radar/leads/${lead.id}/event`, {
          method: "POST",
          requireAuth: true,
          timeoutMs: 15000,
          body: JSON.stringify({ eventType: "hidden", note: "Ocultado no Radar Digital." }),
        });
        setItems((current) => current.map((item) => item.id === lead.id ? { ...item, status: "discarded", companyStatus: "discarded", ownershipStatus: "negative" } : item));
        setFeedback("Card marcado como descartado.");
      }

      if (action === "negative") {
        await apiFetch(`/webscraping/radar/${lead.id}/negative`, {
          method: "POST",
          requireAuth: true,
          timeoutMs: 15000,
          body: JSON.stringify({ status: "negative", reason: "sem_interesse", privateNotes: "Marcado no Radar Digital." }),
        });
        setItems((current) => current.map((item) => item.id === lead.id ? { ...item, status: "negative", companyStatus: "negative", ownershipStatus: "negative" } : item));
        setFeedback("Card marcado como negativo.");
      }
    } catch {
      setError(action === "enrich" ? "Não foi possível enriquecer agora" : "Não foi possível concluir esta ação agora.");
    } finally {
      setActionId(null);
    }
  }

  function toggleDistributionUser(userId: number) {
    setDistributionUserIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );
  }

  function buildVendasLeadPayload(lead: RadarLead) {
    return {
      sourceHistoryId: `radar:${lead.id}`,
      name: lead.name,
      phone: lead.phone || lead.phoneDigits || "",
      phoneDigits: lead.phoneDigits || lead.phone || "",
      email: lead.email || undefined,
      emailStatus: lead.emailStatus || undefined,
      emailSource: lead.emailSource || undefined,
      emailConfidence: lead.emailConfidence ?? undefined,
      address: lead.address || undefined,
      website: lead.website || undefined,
      websiteStatus: lead.websiteStatus || undefined,
      city: lead.city || undefined,
      state: lead.state || undefined,
      segment: lead.segment || undefined,
      rating: lead.rating ?? undefined,
      reviews: lead.reviews ?? undefined,
      instagramUrl: lead.instagramUrl || undefined,
      facebookUrl: lead.facebookUrl || undefined,
      socialStatus: lead.socialStatus || undefined,
      googleMapsUrl: lead.googleMapsUrl || undefined,
      businessCategory: lead.businessCategory || undefined,
      openingHoursStatus: lead.openingHoursStatus || undefined,
      recommendedChannel: lead.recommendedChannel || undefined,
      painType: lead.painType || undefined,
      painLabel: lead.painLabel || undefined,
      painPitch: lead.painPitch || undefined,
      enrichmentScore: lead.enrichmentScore ?? undefined,
      enrichmentConfidence: lead.enrichmentConfidence ?? undefined,
      opportunityScore: lead.opportunityScore ?? undefined,
      opportunityReason: lead.opportunityReason || undefined,
      source: lead.source || undefined,
      sourceEngine: lead.sourceEngine || undefined,
      sourceUrl: lead.sourceUrl || undefined,
      enrichmentJson: lead.enrichmentJson || undefined,
      quality: lead.quality || undefined,
      qualityV2: lead.qualityV2 || undefined,
      visibilityTier: lead.visibilityTier || undefined,
      billable: lead.billable ?? undefined,
      debitEligible: lead.debitEligible ?? undefined,
      deliveryProduct: lead.deliveryProduct || undefined,
      qualityReason: lead.qualityReason || undefined,
      shortNote: lead.opportunityReason || undefined,
      scriptText: lead.painPitch || lead.opportunityReason || undefined,
    };
  }

  const sendFilteredToVendas = useCallback(async (options?: { debitOnImport?: boolean }) => {
    if (!visibleItems.length) {
      setFeedback(null);
      setError("Pesquise primeiro. Depois o Radar envia os aprovados para Vendas.");
      return;
    }

    setBulkSending(true);
    setError(null);
    setFeedback(null);
    setTelonProgress(12);
    try {
      const deliverableItems = visibleItems.slice(0, effectiveFilters.quantity);
      const leads = deliverableItems.map((lead) => {
        const payload = buildVendasLeadPayload(lead);
        return {
          sourceHistoryId: payload.sourceHistoryId,
          name: payload.name,
          phone: payload.phone,
          phoneDigits: payload.phoneDigits,
          email: payload.email,
          address: payload.address,
          website: payload.website,
          city: payload.city,
          state: payload.state,
          segment: payload.segment,
          rating: payload.rating,
          reviews: payload.reviews,
          instagramUrl: payload.instagramUrl,
          facebookUrl: payload.facebookUrl,
          googleMapsUrl: payload.googleMapsUrl,
          businessCategory: payload.businessCategory,
          recommendedChannel: payload.recommendedChannel,
          opportunityScore: payload.opportunityScore,
          opportunityReason: payload.opportunityReason,
          source: payload.source,
          sourceEngine: payload.sourceEngine,
          visibilityTier: payload.visibilityTier,
          billable: payload.billable,
          debitEligible: payload.debitEligible,
          deliveryProduct: payload.deliveryProduct,
          qualityReason: payload.qualityReason,
          shortNote: payload.shortNote,
          scriptText: payload.scriptText,
        };
      });
      if (!leads.length) {
        setFeedback("0 cards disponíveis para enviar.");
        return;
      }
      const leadIds = deliverableItems.map((lead) => lead.id);
      const imported = distributionEnabled
        ? await apiFetch<ImportToVendasResponse>("/webscraping/radar/leads/distribute-to-vendedores", {
            method: "POST",
            requireAuth: true,
            timeoutMs: 45000,
            body: JSON.stringify({
              leadIds,
              userIds: selectedDistributionUsers.map((user) => user.id),
            }),
          })
        : await apiFetch<ImportToVendasResponse>("/vendas/import/webscraping", {
            method: "POST",
            requireAuth: true,
            timeoutMs: 30000,
            body: JSON.stringify({ sourceHistoryId: "radar-digital:bulk", leads, debitOnImport: options?.debitOnImport !== false }),
          });
      if (!distributionEnabled) {
        await apiFetch("/webscraping/radar/leads/mark-sent-to-vendas", {
          method: "POST",
          requireAuth: true,
          timeoutMs: 15000,
          body: JSON.stringify({ leadIds }),
        }).catch(() => null);
      }
      setItems((current) => current.map((item) => deliverableItems.some((selected) => selected.id === item.id) ? { ...item, status: "sent_to_vendas", companyStatus: "imported_to_vendas", ownershipStatus: "in_attendance" } : item));
      apiFetch<VendasUsageSnapshot>("/vendas/usage", {
        requireAuth: true,
        timeoutMs: 12000,
      }).then(setVendasUsage).catch(() => null);
      void refreshVendasPendingCount().catch(() => null);
      setFeedback(
        imported.message ||
          (distributionEnabled
            ? `${leads.length} card(s) distribuídos entre vendedores.`
            : `${leads.length} lead(s) herdados para Vendas.`),
      );
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : "Não foi possível herdar leads para Vendas agora.");
    } finally {
      setBulkSending(false);
    }
  }, [distributionEnabled, effectiveFilters.quantity, refreshVendasPendingCount, selectedDistributionUsers, visibleItems]);

  if (hasToken === null || loading && items.length === 0 && hasSearched) {
    return (
      <main className="app-shell" aria-hidden="true" />
    );
  }

  if (!hasToken) return null;

  const hasMore = !activeRun && hasSearched && items.length < total;
  const availableSegments = availableFilters.segments || [];
  const availableSegmentValues = (availableSegments.length ? availableSegments.map((item) => item.value) : HBX_SEGMENT_SUGGESTIONS).filter(Boolean);
  const mobileStateOptions = mergeRadarOptions(
    BRAZIL_STATES.map((item) => item.uf),
    availableFilters.states?.map((item) => item.value) || [],
  );
  const mobileCityOptions = filters.state
    ? mergeRadarOptions(
        BRAZIL_CITIES_BY_STATE[filters.state] || [],
        availableFilters.citiesByState?.[filters.state]?.map((item) => item.value) || [],
      )
    : [];
  const dailyQuotaBlocked = vendasUsage ? dailyRemaining <= 0 || radarQuantityLimit <= 0 : false;
  const mobileVendasBlocked = dailyQuotaBlocked;
  const radarPausedByStock = vendasPendingCount != null && radarVendasStockMissing <= 0 && !radarStockPauseUnlocked;
  const currentRadarRunStatus = String(activeRun?.status || terminalRunSnapshot?.status || "").trim().toLowerCase();
  const radarPausedByRun = currentRadarRunStatus === "paused";
  const radarSleepingByRun = currentRadarRunStatus === "sleeping";
  const radarPausedLocked = radarPausedByStock || radarPausedByRun || radarSleepingByRun;
  const canCancelRadarRun = Boolean(activeRun || activeRunIdRef.current) && (searching || Boolean(activeRun) || radarCanceling || radarPausedByRun);
  const mobileRadarProcessing = searching || Boolean(activeRun) || bulkSending || mobileAutoImportPending || radarCanceling;
  const radarFiltersLocked = searching || Boolean(activeRun) || Boolean(activeRunIdRef.current) || mobileAutoImportPending || radarCanceling || radarPausedLocked;
  const mobileCanResendToVendas = Boolean(visibleItems.length && hasSearched && !mobileRadarProcessing && !radarFiltersLocked);
  const mobileDockCanSearch = !mobileVendasBlocked && !searching && !activeRun && !bulkSending && !radarFiltersLocked;
  const mobileDockPrimaryIcon: "stop" | "pause" | "play" = radarPausedLocked ? "stop" : canCancelRadarRun ? "stop" : "play";
  const mobileDockPrimaryTone: "default" | "danger" | "warning" = radarPausedLocked ? "warning" : canCancelRadarRun ? "danger" : "default";
  const mobileDockPrimaryLabel = radarPausedLocked
      ? "Parar e editar"
    : canCancelRadarRun
      ? radarCanceling ? "Cancelando pesquisa atual" : "Cancelar pesquisa atual"
      : "Ativar Radar";
  const rawRadarMomentRun = activeRun || terminalRunSnapshot;
  const radarMomentRun = activeRun || (radarRunMatchesVisibleFilters(rawRadarMomentRun, filters) ? rawRadarMomentRun : null);
  const radarMomentIsActive = Boolean(radarMomentRun && activeRun && radarMomentRun === activeRun);
  const radarMomentIsLive = radarMomentIsActive || searching || radarCanceling || mobileAutoImportPending;
  const radarMomentDelivered = radarMomentIsActive
    ? activeRunDelivered
    : Math.max(visibleItems.length, Number(radarMomentRun?.meta?.deliveredCount || radarMomentRun?.foundCount || 0));
  const radarMomentTarget = radarMomentIsActive
    ? activeRunTarget
    : Math.max(1, Number(radarMomentRun?.targetQuantity || radarMomentRun?.meta?.requestedQuantity || effectiveFilters.quantity || 1));
  const radarMomentQuality = radarMomentRun?.meta?.qualitySummary;
  const radarMomentDiscarded = Math.max(
    0,
    Number(radarMomentQuality?.discarded ?? radarMomentQuality?.rejected ?? radarMomentRun?.meta?.rejectedCount ?? 0),
  );
  const radarMomentLocated = Math.max(
    radarMomentDelivered,
    Number(radarMomentRun?.meta?.rawFoundCount ?? radarMomentQuality?.found ?? 0),
    radarMomentDelivered + radarMomentDiscarded,
  );
  const radarMomentApprovedLine = `${Math.min(radarMomentDelivered, radarMomentTarget).toLocaleString("pt-BR")} de até ${radarMomentTarget.toLocaleString("pt-BR")} cards aprovados para o Vendas`;
  const radarMomentProgress = radarMomentIsActive
    ? activeRunProgress
    : Math.max(0, Math.min(100, Number(radarMomentRun?.meta?.progress || Math.round((radarMomentDelivered / radarMomentTarget) * 100) || 0)));
  const activeRunStatus = String(radarMomentRun?.status || "");
  const activeRunSleeping = activeRunStatus === "sleeping";
  const activeRunPartial = activeRunStatus === "completed_insufficient_results" || activeRunStatus === "partial_error";
  const activeRunFailed = activeRunStatus === "failed";
  const activeRunRemaining = Math.max(0, radarMomentTarget - radarMomentDelivered);
  const radarMomentState = activeRunFailed
      ? "warning"
      : activeRunPartial
        ? "partial"
      : radarMomentIsLive
        ? activeRunDelivered > 0
          ? "receiving"
          : "searching"
        : hasSearched && visibleItems.length > 0
          ? "received"
          : "ready";
  const radarMomentTitle =
    radarMomentState === "warning"
      ? "Radar precisa de ajuste"
    : activeRunSleeping
      ? "Radar em espera"
    : radarMomentState === "partial"
        ? `Radar entregou ${radarMomentDelivered.toLocaleString("pt-BR")} card(s)`
        : radarMomentState === "receiving"
          ? "Radar buscando agora"
            : radarMomentState === "searching"
              ? "Radar buscando agora"
              : radarMomentState === "received"
                ? "Radar abasteceu Vendas"
                : "Pronto para abastecer Vendas";
  const radarMotionActive = !radarCanceling && !activeRunSleeping && (radarMomentState === "searching" || radarMomentState === "receiving");
  const radarMomentDescription =
    radarMomentState === "warning"
      ? radarMomentRun?.errorMessage || radarMomentRun?.message || "Revise os filtros e rode uma nova busca."
      : activeRunSleeping
        ? radarMomentRun?.errorMessage || "A mesma pesquisa será retomada automaticamente."
      : radarMomentState === "partial"
        ? activeRunRemaining > 0
          ? `Localizado ${radarMomentLocated.toLocaleString("pt-BR")}, filtrado ${radarMomentApprovedLine}. Amplie cidade ou segmento para completar.`
          : `Localizado ${radarMomentLocated.toLocaleString("pt-BR")}, filtrado ${radarMomentApprovedLine}.`
        : radarMomentState === "receiving"
          ? `Localizado ${radarMomentLocated.toLocaleString("pt-BR")}, filtrado ${radarMomentApprovedLine}.`
          : radarMomentState === "searching"
            ? "Consultando banco, filtrando negativos e validando contatos públicos."
            : radarMomentState === "received"
              ? "Os aprovados já foram enviados automaticamente para Vendas."
              : "Escolha cidade, segmento e alcance para buscar cards elegíveis.";
  const radarMomentBadge =
    activeRunSleeping
      ? "Retoma automaticamente"
      : radarMomentState === "searching"
      ? `${radarMomentProgress}% em andamento`
      : radarMomentState === "receiving" || radarMomentState === "partial"
        ? `${Math.min(radarMomentDelivered, radarMomentTarget).toLocaleString("pt-BR")} de ${radarMomentTarget.toLocaleString("pt-BR")} cards`
        : radarMomentState === "warning"
          ? "Atenção"
          : mobileRadarProcessing
            ? "Enviando cards aprovados para Vendas"
            : vendasPendingCount == null
              ? `Meta ${effectiveFilters.quantity} cards no Vendas`
              : radarVendasStockMissing > 0
                ? `Faltam ${radarVendasStockMissing.toLocaleString("pt-BR")} para o Radar descansar`
                : `${currentVendasStock.toLocaleString("pt-BR")} de ${effectiveFilters.quantity.toLocaleString("pt-BR")} no Vendas`;
  const runFilters = radarMomentRun?.meta?.filters;
  const scopeSegment = radarSegmentSummary(filters.segment || runFilters?.segment || "") || "";
  const scopeCity = filters.city || runFilters?.city || "";
  const scopeState = filters.state || runFilters?.state || "";
  const scopePlace = scopeCity ? `${scopeCity}${scopeState ? `/${scopeState}` : ""}` : "";
  const searchScopeLine = [scopeSegment, scopePlace, radarRadiusLabel(filters.radiusKm ?? runFilters?.radiusKm)].filter(Boolean).join(" · ");
  const autoImportFailureLine = (radarMomentRun?.meta?.autoImport?.failures || [])
    .map((failure) => `${failure.count || 0} ${String(failure.reason || "falha").replace(/_/g, " ")}`)
    .filter(Boolean)
    .join(" · ");
  const preparingDelivery = hasSearched && !visibleItems.length && radarMomentDelivered > 0;

  function startMobileRadarSearch() {
    if (radarPausedLocked) {
      void stopRadarForEditing();
      return;
    }
    if (canCancelRadarRun) {
      void cancelActiveRadarRun();
      return;
    }
    if (!mobileDockCanSearch) return;
    if (canPullWithFilters(effectiveFilters)) {
      if (!mobileSearchNoticeDismissed) setMobileSearchNoticeOpen(true);
      setMobileAutoImportPending(true);
    }
    void runRadarSearch("off");
  }

  async function stopRadarForEditing() {
    if (radarCanceling) return;
    if (canCancelRadarRun || activeRun || activeRunIdRef.current) {
      const canceled = await cancelActiveRadarRun();
      if (!canceled) return;
    }
    setRadarStockPauseUnlocked(true);
    setMobileAutoImportPending(false);
    setSearching(false);
    setError(null);
    setFeedback("Radar parado para edição. Ajuste cidade, segmento, alcance ou quantidade.");
  }

  function dismissMobileSearchNotice(permanent = false) {
    setMobileSearchNoticeOpen(false);
    if (!permanent) return;
    setMobileSearchNoticeDismissed(true);
    try {
      window.localStorage.setItem(MOBILE_RADAR_SEARCH_NOTICE_DISMISSED_KEY, "true");
    } catch {
      // localStorage is best-effort for this mobile hint.
    }
  }

  function handleMobileDockPrimary() {
    if (radarPausedLocked) {
      void stopRadarForEditing();
      return;
    }
    if (canCancelRadarRun) {
      void cancelActiveRadarRun();
      return;
    }
    if (radarFiltersLocked) return;
    if (activeRunPartial || activeRunFailed) {
      setMobilePicker(filters.state ? "segment" : "state");
      return;
    }
    if (mobileDockCanSearch && canPullWithFilters(effectiveFilters)) {
      startMobileRadarSearch();
      return;
    }
    setMobilePicker(filters.state ? "city" : "state");
  }

  async function applyMobileSegments(value: string) {
    const normalized = normalizeSegmentLabel(value);
    const nextSegments = splitRadarSegments(normalized);
    setFilters((current) => ({ ...current, segment: normalized }));
    setError(null);

    try {
      await apiFetch<SalesProfileResponse>("/vendas/sales-profile", {
        method: "PATCH",
        requireAuth: true,
        timeoutMs: 12000,
        body: JSON.stringify({
          targetSegments: { labels: nextSegments },
        }),
      });
      setFeedback(normalized ? "Segmentos aplicados e salvos." : "Segmentos limpos e salvos.");
    } catch (segmentError) {
      throw new Error(
        segmentError instanceof Error
          ? `Filtro aplicado, mas não salvou no backend: ${segmentError.message}`
          : "Filtro aplicado, mas não salvou no backend.",
      );
    }
  }

  function renderAutoDistributionModal() {
    if (!autoDistributionOpen) return null;
    const sellerCount = autoDistributionEligibleSellerUsers.length;
    const targetCount = sellerCount + (autoDistributionDraft.includeAdmin ? 1 : 0);
    const summaryPlace = autoDistributionDraft.preferredCity
      ? `${autoDistributionDraft.preferredCity}/${autoDistributionDraft.preferredState || "-"}`
      : "Cidade pendente";
    const summarySegment = radarSegmentSummary(autoDistributionDraft.segment) || "Categoria pendente";
    const activeStatus = radarAutoDistributionStatusLabel(autoDistributionRule?.status);

    return (
      <div className={styles.autoDistributionOverlay} role="presentation" onClick={() => setAutoDistributionOpen(false)}>
        <section
          className={styles.autoDistributionSheet}
          role="dialog"
          aria-modal="true"
          aria-label="Distribuição automática"
          onClick={(event) => event.stopPropagation()}
        >
          <header className={styles.autoDistributionHeader}>
            <div>
              <span>Distribuição automática</span>
              <strong>Alimentar vendedores no piloto</strong>
              <small>Status atual: {activeStatus}</small>
            </div>
            <button type="button" onClick={() => setAutoDistributionOpen(false)}>
              Fechar
            </button>
          </header>

          {autoDistributionLoading ? (
            <div className={styles.autoDistributionEmpty}>Carregando configuração...</div>
          ) : (
            <>
              <div className={styles.autoDistributionSection}>
                <div className={styles.autoDistributionQuestion}>
                  <span>1</span>
                  <div>
                    <strong>Deseja receber leads também?</strong>
                    <p>Se não, os cards vão somente para os vendedores ativos. Se sim, o Admin entra no rodízio com estoque próprio.</p>
                  </div>
                </div>
                <div className={styles.autoDistributionChoiceGrid}>
                  <button
                    type="button"
                    data-active={!autoDistributionDraft.includeAdmin ? "true" : "false"}
                    onClick={() => setAutoDistributionDraft((current) => ({ ...current, includeAdmin: false, adminTargetStock: 0, adminDailyLimit: 0 }))}
                  >
                    <strong>Não</strong>
                    <span>Só vendedores recebem</span>
                  </button>
                  <button
                    type="button"
                    data-active={autoDistributionDraft.includeAdmin ? "true" : "false"}
                    onClick={() =>
                      setAutoDistributionDraft((current) => ({
                        ...current,
                        includeAdmin: true,
                        adminTargetStock: current.adminTargetStock || 30,
                        adminDailyLimit: current.adminDailyLimit || current.adminTargetStock || 30,
                      }))
                    }
                  >
                    <strong>Sim</strong>
                    <span>Admin também recebe</span>
                  </button>
                </div>
                {autoDistributionDraft.includeAdmin ? (
                  <div className={styles.autoDistributionFieldGrid}>
                    <label className={styles.autoDistributionField}>
                      <span>Estoque alvo do Admin</span>
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={autoDistributionDraft.adminTargetStock || 0}
                        onChange={(event) =>
                          setAutoDistributionDraft((current) => ({
                            ...current,
                            adminTargetStock: Math.max(1, Math.min(500, Math.trunc(Number(event.target.value || 0) || 1))),
                          }))
                        }
                      />
                    </label>
                    <label className={styles.autoDistributionField}>
                      <span>Limite diário do Admin</span>
                      <input
                        type="number"
                        min={0}
                        max={500}
                        value={autoDistributionDraft.adminDailyLimit || 0}
                        onChange={(event) =>
                          setAutoDistributionDraft((current) => ({
                            ...current,
                            adminDailyLimit: Math.max(0, Math.min(500, Math.trunc(Number(event.target.value || 0) || 0))),
                          }))
                        }
                      />
                    </label>
                  </div>
                ) : null}
              </div>

              <div className={styles.autoDistributionSection}>
                <div className={styles.autoDistributionQuestion}>
                  <span>2</span>
                  <div>
                    <strong>Preferência do Radar</strong>
                    <p>Use a mesma cidade, categoria e alcance do Radar para abastecer a equipe.</p>
                  </div>
                </div>
                <div className={styles.autoDistributionLocation}>
                  <HbxStateCityPicker
                    state={autoDistributionDraft.preferredState}
                    city={autoDistributionDraft.preferredCity}
                    onStateChange={(value) =>
                      setAutoDistributionDraft((current) => ({
                        ...current,
                        preferredState: value,
                        preferredCity: "",
                      }))
                    }
                    onCityChange={(value) =>
                      setAutoDistributionDraft((current) => ({
                        ...current,
                        preferredCity: value,
                      }))
                    }
                    helperText=""
                    availableStates={availableFilters.states}
                    availableCitiesByState={availableFilters.citiesByState}
                  />
                </div>
                <RadarSegmentFunnel
                  value={autoDistributionDraft.segment}
                  availableSegments={availableSegmentValues}
                  onChange={(value) => setAutoDistributionDraft((current) => ({ ...current, segment: value }))}
                />
                <RadarRadiusSelector
                  value={autoDistributionDraft.radiusKm}
                  onChange={(radiusKm) => setAutoDistributionDraft((current) => ({ ...current, radiusKm }))}
                />
              </div>

              <div className={styles.autoDistributionSection}>
                <div className={styles.autoDistributionQuestion}>
                    <span>3</span>
                  <div>
                    <strong>Rodízio dos vendedores</strong>
                    <p>Todos os vendedores ativos entram na reposição. O estoque é alvo; o limite diário é real, não acumulativo.</p>
                  </div>
                </div>
                <div className={styles.autoDistributionFieldGrid}>
                  <label className={styles.autoDistributionField}>
                    <span>Estoque alvo por vendedor</span>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={autoDistributionDraft.targetStockPerSeller}
                      onChange={(event) =>
                        setAutoDistributionDraft((current) => ({
                          ...current,
                          targetStockPerSeller: Math.max(1, Math.min(500, Math.trunc(Number(event.target.value || 0) || 1))),
                        }))
                      }
                    />
                  </label>
                  <label className={styles.autoDistributionField}>
                    <span>Limite diário por vendedor</span>
                    <input
                      type="number"
                      min={0}
                      max={500}
                      value={autoDistributionDraft.dailyLimitPerSeller}
                      onChange={(event) =>
                        setAutoDistributionDraft((current) => ({
                          ...current,
                          dailyLimitPerSeller: Math.max(0, Math.min(500, Math.trunc(Number(event.target.value || 0) || 0))),
                        }))
                      }
                    />
                  </label>
                </div>
                <div className={styles.autoDistributionSellerList}>
                  {activeSellerUsers.length ? activeSellerUsers.map((user) => {
                    const territory = autoDistributionDraft.territories.find((item) => item.userId === user.id);
                    const cities = territory?.cities || [];
                    const coversSelectedCity = !autoDistributionTerritoryModeActive || cities.some(
                      (city) => normalizeRadarTerritoryKey(city.city, city.state) === autoDistributionSelectedCityKey,
                    );
                    return (
                      <article key={user.id} className={styles.autoDistributionSellerTerritory} data-eligible={coversSelectedCity ? "true" : "false"}>
                        <div>
                          <strong>{user.name || user.username || user.email || `Vendedor ${user.id}`}</strong>
                          <span>
                            {autoDistributionTerritoryModeActive
                              ? coversSelectedCity
                                ? "Recebe nesta cidade"
                                : "Não cobre esta cidade"
                              : "Território aberto"}
                          </span>
                        </div>
                        <div className={styles.autoDistributionTerritoryChips}>
                          {cities.length ? cities.map((city) => (
                            <button
                              key={`${user.id}-${city.city}-${city.state}`}
                              type="button"
                              onClick={() => removeAutoDistributionTerritoryCity(user.id, city)}
                              title="Remover cidade do território"
                            >
                              {city.city}/{city.state}
                            </button>
                          )) : <em>Sem cidade fixa</em>}
                        </div>
                        <div className={styles.autoDistributionTerritoryActions}>
                          <button type="button" onClick={() => addAutoDistributionTerritoryCity(user.id)}>
                            Usar cidade acima
                          </button>
                          <button type="button" onClick={() => clearAutoDistributionTerritory(user.id)}>
                            Limpar
                          </button>
                        </div>
                      </article>
                    );
                  }) : <em>Nenhum vendedor ativo cadastrado.</em>}
                </div>
              </div>

              <div className={styles.autoDistributionSummary}>
                <div>
                  <span>Resumo</span>
                  <strong>{targetCount} receptor(es)</strong>
                </div>
                <p>
                  O Radar vai usar {summarySegment} em {summaryPlace}, alcance {radarRadiusLabel(autoDistributionDraft.radiusKm)}.
                  Os cards serão debitados do plano da empresa/Admin, com limite diário de {autoDistributionDraft.dailyLimitPerSeller} por vendedor e sem acumular sobra.
                  {autoDistributionTerritoryModeActive ? ` Território ativo: ${sellerCount} vendedor(es) cobrem essa cidade.` : " Território aberto: todos os vendedores ativos entram."}
                </p>
              </div>

              <footer className={styles.autoDistributionFooter}>
                <button type="button" data-variant="secondary" onClick={() => setAutoDistributionOpen(false)}>
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void saveAutoDistributionRule()}
                  disabled={autoDistributionSaving}
                >
                  {autoDistributionSaving ? "Ativando..." : "Ativar e alimentar agora"}
                </button>
              </footer>
            </>
          )}
        </section>
      </div>
    );
  }

  return (
    <DashboardScaffold
      title="Radar Digital"
      description="Pesquisa de clientes e envio para Vendas."
      hideHeader
      showDashboardShortcut={false}
    >
      <section className={styles.shell} data-mobile-route={mobileRoute ? "true" : "false"}>
        {renderAutoDistributionModal()}
        <div className={`${styles.mobileRadar} hbx-mobile-page`}>
          <section className={`${styles.mobileRadarHero} hbx-mobile-hero`} data-state={radarMomentState}>
            <RadarMotionBackground active={radarMotionActive} />
            <HeroPremiumCrown active={mobileHeroPremiumActive} />
            <DailyQuotaSpeedometer
              compact
              remaining={dailyRemaining}
              dailyLimit={dailyLimit || dailyRemaining || radarQuantityLimit}
              spendLimit={radarQuantityLimit}
              onClick={() => setMobileQuotaPopupOpen((current) => !current)}
            />
            <div className={styles.mobileRadarHeroCopy}>
              <span>Radar Digital</span>
              <strong>{radarMomentTitle}</strong>
              <p>{radarMomentDescription}</p>
              <small>{searchScopeLine || radarMomentBadge}</small>
            </div>
          </section>

          <div className={styles.mobileRadarHeroStats}>
            <div className={styles.mobileRadarHeroStat}>
              <span>Cidade</span>
              <strong>{filters.city || "Definir"}</strong>
            </div>
            <div className={styles.mobileRadarHeroStat}>
              <span>Segmento</span>
              <strong>{radarSegmentSummary(filters.segment) || "Definir"}</strong>
            </div>
            <div className={styles.mobileRadarHeroStat}>
              <span>Alcance</span>
              <strong>{radarRadiusLabel(filters.radiusKm)}</strong>
            </div>
            <div className={styles.mobileRadarHeroStat}>
              <span>Fonte atual</span>
              <strong>{mobileRadarEngineLabel(filters.engine)}</strong>
            </div>
          </div>

          <form
            className={`${styles.mobileRadarForm} hbx-mobile-card`}
            data-locked={radarFiltersLocked ? "true" : "false"}
            onFocus={() => setFilterEditing(true)}
            onBlur={handleFilterFormBlur}
            onSubmit={(event) => {
              event.preventDefault();
              startMobileRadarSearch();
            }}
          >
            <button
              type="button"
              className={styles.mobileGpsButton}
              data-loading={locating ? "true" : "false"}
              onClick={() => void handleCurrentLocation()}
              disabled={radarFiltersLocked}
              aria-label="Usar minha localização"
              title="Usar minha localização"
            >
              <span aria-hidden="true" />
              Localização
            </button>

            <div className={styles.mobileRadarLocationRow}>
              <MobilePickerButton
                label="Estado"
                value={filters.state}
                placeholder="UF"
                disabled={radarFiltersLocked}
                onClick={() => setMobilePicker("state")}
              />

              <MobilePickerButton
                label="Cidade"
                value={filters.city}
                placeholder={filters.state ? "Selecionar cidade" : "Escolha o estado"}
                disabled={radarFiltersLocked || !filters.state}
                onClick={() => setMobilePicker("city")}
              />
            </div>

            <MobilePickerButton
              label="Segmento"
              value={radarSegmentSummary(filters.segment)}
              placeholder="Ex.: Clínica, academia, estética"
              helper={isRadarCategoryValue(filters.segment) ? "Categoria inteira selecionada." : "Escolha até 5 segmentos."}
              disabled={radarFiltersLocked}
              onClick={() => setMobilePicker("segment")}
            />

            <RadarRadiusSelector
              compact
              value={filters.radiusKm}
              disabled={radarFiltersLocked}
              onChange={(radiusKm) => setFilters((current) => ({ ...current, radiusKm }))}
            />

            <RadarQuantitySelector
              compact
              value={filters.quantity}
              max={RADAR_VENDAS_STOCK_TARGET_MAX}
              currentStock={vendasPendingCount}
              disabled={radarFiltersLocked}
              onChange={(quantity) => setFilters((current) => ({ ...current, quantity }))}
            />

            <button
              type="button"
              className={styles.mobileAutoDistributionButton}
              onClick={openAutoDistributionModal}
              disabled={radarFiltersLocked}
            >
              <span>Distribuição automática</span>
              <strong>{radarAutoDistributionStatusLabel(autoDistributionRule?.status)}</strong>
            </button>

            {radarFiltersLocked ? (
              <div className={styles.mobileRadarLockedNotice} role="status">
                <strong>{radarPausedLocked ? radarSleepingByRun ? "Radar em espera" : "Radar pausado" : "Radar trabalhando"}</strong>
                <span>{radarPausedLocked ? "Filtros bloqueados enquanto o Radar não estiver parado." : "Filtros bloqueados enquanto a pesquisa roda. Aperte STOP para ajustar."}</span>
                {radarPausedLocked ? (
                  <button type="button" onClick={() => void stopRadarForEditing()} disabled={radarCanceling}>
                    {radarCanceling ? "Parando..." : "Parar e editar"}
                  </button>
                ) : null}
              </div>
            ) : null}

            {mobileVendasBlocked ? (
              <div className={`${styles.mobileRadarNotice} hbx-mobile-notice`}>
                Limite diário de cards atingido. O contador reinicia após 00:00.
              </div>
            ) : null}
            {error ? <div className={`${styles.mobileRadarNotice} hbx-mobile-notice`} data-tone="error">{compactRadarMessage(error)}</div> : null}
            {feedback && !mobileRadarProcessing ? <div className={`${styles.mobileRadarNotice} hbx-mobile-notice`} data-tone="ok">{feedback}</div> : null}

            <div className={`${styles.mobileRadarActionRow} hbx-mobile-action-bar`}>
              <button
                type={radarPausedLocked || canCancelRadarRun || activeRunPartial || activeRunFailed || mobileCanResendToVendas ? "button" : "submit"}
                className={`${styles.mobileRadarSubmit} hbx-mobile-primary-button`}
                data-tone={radarPausedLocked ? "warning" : canCancelRadarRun ? "danger" : undefined}
                disabled={radarCanceling ? true : radarPausedLocked ? false : mobileVendasBlocked || searching || bulkSending || radarFiltersLocked}
                title={radarPausedLocked ? "Pare o Radar para alterar filtros ou reenviar para Vendas." : undefined}
                onClick={(event) => {
                  if (radarPausedLocked) {
                    event.preventDefault();
                    void stopRadarForEditing();
                    return;
                  }
                  if (canCancelRadarRun) {
                    event.preventDefault();
                    void cancelActiveRadarRun();
                    return;
                  }
                  if (activeRunPartial || activeRunFailed) {
                    event.preventDefault();
                    setMobilePicker(filters.state ? "segment" : "state");
                    return;
                  }
                  if (mobileCanResendToVendas) {
                    event.preventDefault();
                    void sendFilteredToVendas();
                  }
                }}
              >
                {radarCanceling
                  ? "Cancelando..."
                  : radarPausedLocked
                    ? "Parar e editar"
                  : canCancelRadarRun
                    ? "STOP"
                  : activeRunPartial || activeRunFailed
                    ? "Ajustar busca"
                  : bulkSending
                  ? "Enviando..."
                  : visibleItems.length && hasSearched && !mobileRadarProcessing
                    ? "Reenviar para Vendas"
                    : "Buscar"}
              </button>
              <button type="button" className={`${styles.mobileRadarClear} hbx-mobile-secondary-button`} onClick={clearFilters} disabled={radarFiltersLocked}>
                Limpar filtros
              </button>
            </div>
          </form>

          {mobileQuotaPopupOpen ? (
            <div className={styles.mobilePickerPanel} role="presentation" onClick={() => setMobileQuotaPopupOpen(false)}>
              <section
                className={`${styles.mobilePickerSheet} ${styles.mobileQuotaSheet}`}
                role="dialog"
                aria-modal="true"
                aria-label="Pesquisas disponíveis"
                onClick={(event) => event.stopPropagation()}
              >
                <div className={styles.mobilePickerHeader}>
                  <div>
                    <strong>Pesquisas disponíveis</strong>
                    <small>Limite diário do Radar</small>
                  </div>
                  <div className={styles.mobilePickerActions}>
                    <button type="button" onClick={() => setMobileQuotaPopupOpen(false)}>Fechar</button>
                  </div>
                </div>
                <div className={styles.mobileQuotaSummary}>
                  <b>{dailyRemaining}</b>
                  <span>disponíveis hoje</span>
                  <small>{Math.max(0, (dailyLimit || dailyRemaining || radarQuantityLimit) - dailyRemaining)}/{dailyLimit || dailyRemaining || radarQuantityLimit} usados</small>
                </div>
              </section>
            </div>
          ) : null}

          {!radarFiltersLocked && mobilePicker === "state" ? (
            <MobileFilterSheet
              title="Estado"
              value={filters.state}
              options={mobileStateOptions.map((state) => ({ value: state }))}
              placeholder="Buscar estado"
              onSelect={(value) => setFilters((current) => ({ ...current, state: value, city: "", originLat: null, originLng: null }))}
              onClose={() => setMobilePicker(null)}
            />
          ) : null}
          {!radarFiltersLocked && mobilePicker === "city" ? (
            <MobileFilterSheet
              title="Cidade"
              value={filters.city}
              options={mobileCityOptions.map((city) => ({ value: city }))}
              placeholder="Buscar cidade"
              onSelect={(value) => setFilters((current) => ({ ...current, city: value, originLat: null, originLng: null }))}
              onClose={() => setMobilePicker(null)}
            />
          ) : null}
          {!radarFiltersLocked && mobilePicker === "segment" ? (
            <MobileSegmentSheet
              value={filters.segment}
              availableSegments={availableSegmentValues}
              onApply={applyMobileSegments}
              onClose={() => setMobilePicker(null)}
            />
          ) : null}
          {mobileSearchNoticeOpen ? (
            <section
              ref={mobileSearchNoticeRef}
              className={`${styles.mobileRadarSearchNotice} hbx-mobile-notice`}
              onClick={() => dismissMobileSearchNotice(false)}
            >
              <div>
                <strong>Radar alimentando Vendas</strong>
                <span>Você pode continuar navegando. Os cards aprovados aparecem em Vendas para você chamar, retornar e acompanhar.</span>
              </div>
              <label onClick={(event) => event.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={mobileSearchNoticeDismissed}
                  onChange={(event) => dismissMobileSearchNotice(event.target.checked)}
                />
                Não exibir novamente
              </label>
            </section>
          ) : null}

          {hasSearched || preparingDelivery || mobileRadarProcessing ? (
            <section className={`${styles.mobileRadarResults} hbx-mobile-card`} aria-live="polite">
              {preparingDelivery ? (
                <div className={`${styles.mobileRadarState} hbx-mobile-empty`}>
                  <strong>Preparando entrega</strong>
                  <span>{autoImportFailureLine || "O Radar encontrou empresas e está enviando para Vendas."}</span>
                </div>
              ) : mobileRadarProcessing ? (
                <div className={`${styles.mobileRadarState} hbx-mobile-empty`}>
                  <strong>Radar buscando agora</strong>
                  <span>Os filtros ficam travados enquanto o Radar trabalha. Aperte STOP para parar e ajustar a busca.</span>
                </div>
              ) : !loading && !visibleItems.length ? (
                <div className={`${styles.mobileRadarState} hbx-mobile-empty`}>
                  <strong>Não achei empresas suficientes</strong>
                  <span>Tente segmento mais amplo ou cidade próxima.</span>
                </div>
              ) : (
                <div className={`${styles.mobileRadarState} hbx-mobile-empty`}>
                  <strong>Vendas abastecido</strong>
                  <span>Os contatos aprovados foram enviados automaticamente para o Vendas.</span>
                </div>
              )}
            </section>
          ) : null}

          <HbxMobileDock
            primaryLabel={mobileDockPrimaryLabel}
            primaryTone={mobileDockPrimaryTone}
            primaryIcon={mobileDockPrimaryIcon}
            onPrimaryAction={handleMobileDockPrimary}
          />
        </div>

        <header className={styles.header} data-state={radarMomentState}>
          <div>
            <span>HBX</span>
            <h1>{radarMomentTitle}</h1>
            <p>{radarMomentDescription}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (radarPausedLocked) {
                void stopRadarForEditing();
                return;
              }
              if (radarFiltersLocked) return;
              if (activeRunPartial || activeRunFailed) {
                setFilterEditing(true);
                if (typeof document !== "undefined") {
                  document.querySelector(`.${styles.filters}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                }
                return;
              }
              void sendFilteredToVendas();
            }}
            data-tone={radarPausedLocked ? "warning" : undefined}
            disabled={(radarFiltersLocked && !radarPausedLocked) || (!radarPausedLocked && !activeRunPartial && !activeRunFailed && (bulkSending || !visibleItems.length))}
            title={radarFiltersLocked ? "Pare o Radar para alterar filtros ou enviar para Vendas." : !visibleItems.length && !activeRunPartial && !activeRunFailed ? "Pesquise primeiro para escolher o que vai para Vendas." : undefined}
          >
            {radarPausedLocked ? "Parar e editar" : activeRunPartial || activeRunFailed ? "Ajustar busca" : bulkSending ? "Enviando..." : distributionEnabled ? "Distribuir cards" : "Enviar para Vendas"}
          </button>
        </header>

        <form
          className={styles.filters}
          onFocus={() => setFilterEditing(true)}
          onBlur={handleFilterFormBlur}
          onSubmit={(event) => {
            event.preventDefault();
            void runRadarSearch();
          }}
        >
          <div className={styles.filtersTitle}>
            <div>
              <span>Pesquisa</span>
              <strong>Filtros de Pesquisa</strong>
            </div>
            <small>{hasHistoryFilters(filters, generalSearch) ? "Filtros prontos para consulta." : "Pesquisar vazio abre todo o histórico salvo."}</small>
          </div>

          <div className={styles.filterLocation}>
            <HbxStateCityPicker
              state={filters.state}
              city={filters.city}
              onStateChange={(value) => setFilters((current) => ({ ...current, state: value, city: "", originLat: null, originLng: null }))}
              onCityChange={(value) => setFilters((current) => ({ ...current, city: value, originLat: null, originLng: null }))}
              disabled={radarFiltersLocked}
              helperText=""
            />
            <button
              type="button"
              className={styles.radarGpsButton}
              data-loading={locating ? "true" : "false"}
              onClick={() => void handleCurrentLocation()}
              disabled={radarFiltersLocked}
              aria-label="Usar minha localização"
              title="Usar minha localização"
            >
              <span aria-hidden="true" />
            </button>
          </div>
          <div className={styles.filterSegment}>
            <RadarSegmentFunnel
              value={filters.segment}
              availableSegments={availableSegmentValues}
              disabled={radarFiltersLocked}
              onChange={(value) => setFilters((current) => ({ ...current, segment: value }))}
            />
          </div>
          <div className={styles.filterRadius}>
            <RadarRadiusSelector
              value={filters.radiusKm}
              disabled={radarFiltersLocked}
              onChange={(radiusKm) => setFilters((current) => ({ ...current, radiusKm }))}
            />
          </div>
          <div className={styles.filterTarget}>
            <HbxTargetTypeSelector
              value={filters.targetType}
              onChange={(value) => setFilters((current) => ({ ...current, targetType: value }))}
              allowedTypes={["pj", "pf"]}
              disabled={radarFiltersLocked}
            />
          </div>
          <div className={styles.filterEngine}>
            <MobileEngineToggle
              value={filters.engine}
              onChange={(value) => setFilters((current) => ({ ...current, engine: value }))}
              disabled={radarFiltersLocked}
            />
          </div>
          <div className={styles.filterAdvanced}>
            <DailyQuotaSpeedometer
              remaining={dailyRemaining}
              dailyLimit={dailyLimit || dailyRemaining || radarQuantityLimit}
              spendLimit={radarQuantityLimit}
            />
            <RadarQuantitySelector
              value={filters.quantity}
              max={RADAR_VENDAS_STOCK_TARGET_MAX}
              currentStock={vendasPendingCount}
              disabled={radarFiltersLocked}
              onChange={(quantity) => setFilters((current) => ({ ...current, quantity }))}
            />
          </div>
          {activeSellerUsers.length ? (
            <div className={styles.filterDistribution}>
              <div className={styles.distributionHeader}>
                <div>
                  <span>Distribuição</span>
                  <strong>{distributionLabel}</strong>
                </div>
                <button
                  type="button"
                  data-variant="secondary"
                  className={styles.distributionAutoButton}
                  onClick={openAutoDistributionModal}
                  disabled={radarFiltersLocked}
                >
                  Automática
                </button>
                <button
                  type="button"
                  data-variant="secondary"
                  onClick={() => setDistributionUserIds([])}
                  disabled={!distributionUserIds.length || radarFiltersLocked}
                >
                  Usar Admin
                </button>
              </div>
              <div className={styles.distributionUsers}>
                {activeSellerUsers.map((user) => {
                  const selected = distributionUserIds.includes(user.id);
                  const label = user.name || user.username || user.email || `Vendedor ${user.id}`;
                  const roleLabel = String(user.role || "").toUpperCase() === "ADMIN" ? "Admin vendedor" : "Vendedor";
                  return (
                    <button
                      key={user.id}
                      type="button"
                      data-active={selected ? "true" : "false"}
                      onClick={() => toggleDistributionUser(user.id)}
                      disabled={radarFiltersLocked}
                    >
                      <b>{label}</b>
                      <span>{roleLabel} · {Number(user.commissionPercent || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% comissão</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          <div className={styles.filterActions}>
            <button type="button" data-variant="secondary" onClick={clearFilters} disabled={radarFiltersLocked}>Limpar filtros</button>
            <button type="submit" disabled={radarFiltersLocked || dailyQuotaBlocked}>
              {radarFiltersLocked ? (radarPausedLocked ? "Radar pausado" : "Radar trabalhando") : "Pesquisar"}
            </button>
          </div>
        </form>

        {activeRun ? (
          <section className={styles.runProgress} aria-live="polite">
            <div className={styles.runProgressHeader}>
              <div>
                <span>Pesquisa em andamento</span>
                <strong>{activeRunDelivered.toLocaleString("pt-BR")} de até {activeRunTarget.toLocaleString("pt-BR")} cards</strong>
              </div>
              <small>{socialLookupPendingCount > 0 ? "Enriquecendo contatos" : activeRun.status === "queued" ? "Na fila HBX" : "Verificando disponibilidade real"}</small>
            </div>
            <div className={styles.runProgressTrack} aria-hidden="true">
              <span style={{ ["--progress" as string]: `${activeRunProgress}%` }} />
            </div>
            {searchScopeLine ? <p>{searchScopeLine}</p> : null}
            <p>{socialLookupPendingCount > 0 ? "Chegando cards. As redes sociais aparecem no próprio card quando o enriquecimento termina." : activeRun.message || "O Radar já entregou o que encontrou no banco e continua buscando novos cards válidos."}</p>
          </section>
        ) : null}

        {error ? <div className={styles.notice} data-tone="error">{compactRadarMessage(error)}</div> : null}
        {feedback && !activeRun ? <div className={styles.notice} data-tone="ok">{feedback}</div> : null}

        <section className={styles.results}>
          <div className={styles.resultsHeader}>
            <div>
              <span>Resultados</span>
              <strong>{hasSearched ? "Cards da pesquisa" : "Aguardando pesquisa"}</strong>
            </div>
            {hasSearched ? (
              <small>
                {activeRun
                  ? `Mostrando ${visibleItems.length.toLocaleString("pt-BR")} de até ${activeRunTarget.toLocaleString("pt-BR")} solicitados.`
                  : `Mostrando ${visibleItems.length.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")} resultados — ${PAGE_SIZE} por página.`}
              </small>
            ) : null}
          </div>
          {hasSearched && visibleEnrichmentSummary ? (
            <div className={styles.enrichmentSummary}>
              <span><b>{Number(visibleEnrichmentSummary.cardsAnalyzed || 0).toLocaleString("pt-BR")}</b> analisados</span>
              <span><b>{Number(visibleEnrichmentSummary.whatsappVerified || 0).toLocaleString("pt-BR")}</b> WhatsApp verificado</span>
              <span><b>{Number(visibleEnrichmentSummary.emailConfirmedOrProbable || 0).toLocaleString("pt-BR")}</b> e-mail pronto</span>
              <span><b>{Number(visibleEnrichmentSummary.noWebsite || 0).toLocaleString("pt-BR")}</b> sem site</span>
              <span><b>{Number(visibleEnrichmentSummary.highPriority || 0).toLocaleString("pt-BR")}</b> alta prioridade</span>
            </div>
          ) : null}

          {!hasSearched ? (
            <div className={styles.emptyState}>
              <span aria-hidden="true">RD</span>
              <strong>Nenhum card exibido ainda</strong>
              <p>Use os filtros acima e clique em Pesquisar. Se pesquisar sem filtrar nada, o sistema abre todo o histórico.</p>
            </div>
          ) : preparingDelivery ? (
            <div className={styles.emptyState}>
              <span aria-hidden="true">...</span>
              <strong>Preparando entrega dos cards</strong>
              <p>{autoImportFailureLine || "O Radar encontrou cards e está materializando/importando a entrega para Vendas."}</p>
            </div>
          ) : activeRun && visibleItems.length === 0 ? (
            <div className={styles.emptyState}>
              <span aria-hidden="true">...</span>
              <strong>Preparando os primeiros cards</strong>
              <p>O Radar consultou o banco e está validando contatos públicos para este filtro.</p>
            </div>
          ) : !loading && visibleItems.length === 0 ? (
            <div className={styles.emptyState}>
              <span aria-hidden="true">0</span>
              <strong>Nenhum resultado encontrado</strong>
              <p>A busca foi concluída sem cards para os filtros aplicados.</p>
            </div>
          ) : (
            <div className={styles.grid}>
              {visibleItems.map((lead, index) => {
                const score = leadBackendScore(lead);
                const isHigh = score >= 70;
                const origin = [lead.sourceEngine, lead.source, ...(lead.sourceEngines || [])].filter(Boolean)[0] || "Banco HBX";
                const status = lead.companyStatus || lead.status;
                const ownerBadge = ownershipBadge(lead);
                const chips = buildSmartChips(lead);
                const enrichActionId = `${lead.id}:enrich`;
                const isEnriching = actionId === enrichActionId;
                return (
                  <article
                    key={lead.id}
                    className={styles.card}
                    data-high={isHigh ? "true" : "false"}
                    aria-busy={isEnriching ? "true" : "false"}
                    style={{ ["--radar-card-index" as string]: Math.min(index, 8) } as CSSProperties}
                  >
                    <div className={styles.cardHeader}>
                      <div>
                        <div className={styles.cardBadges}>
                          <span>{lead.segment || "Segmento aberto"}</span>
                          <em data-tone={ownerBadge.tone}>{ownerBadge.label}</em>
                        </div>
                        <strong>{lead.name || "Empresa sem nome"}</strong>
                      </div>
                      <div className={styles.cardHeaderAside}>
                        <LeadPremiumCrown lead={lead} loading={isEnriching} />
                        <div className={styles.score} style={{ ["--score" as string]: `${score}%` }}>
                          <b>{score}</b>
                          <small>{opportunityLabel(score)}</small>
                        </div>
                      </div>
                    </div>

                    <div className={styles.metaGrid}>
                      <span><b>Telefone</b>{formatPhone(lead.phone || lead.phoneDigits)}</span>
                      <span><b>Cidade/UF</b>{[lead.city, lead.state].filter(Boolean).join(" / ") || "Não informado"}</span>
                      <span><b>Origem</b>{origin}</span>
                      <span><b>Status</b>{radarCardStatus(lead)} · {statusLabel(status)}</span>
                    </div>
                    <RadarLeadChannelIcons lead={lead} />

                    {showSmartLeadCards ? (
                      <div className={styles.smartBlock}>
                        <div className={styles.smartChips}>
                          {chips.map((chip) => <span key={chip.label} data-tone={chip.tone}>{chip.label}</span>)}
                        </div>
                        <p className={styles.reason} title={leadExplanation(lead)}><b>Por que apareceu</b>{leadExplanation(lead)}</p>
                        <div className={styles.smartDetails}>
                          <span><b>Canal recomendado</b>{channelLabel(lead.recommendedChannel)}</span>
                          <span><b>E-mail</b>{lead.email || emailLabel(lead.emailStatus)}</span>
                          <span><b>Dor provável</b>{lead.painLabel || lead.painType || "Revisar"}</span>
                        </div>
                        {lead.painPitch ? <small className={styles.smartPitch}>{lead.painPitch}</small> : null}
                      </div>
                    ) : (
                      <>
                        <p className={styles.reason} title={leadExplanation(lead)}><b>Por que apareceu</b>{leadExplanation(lead)}</p>
                        <div className={styles.listUpsell}>Lead inteligente disponível no HBX Lead</div>
                      </>
                    )}

                    <div className={styles.history}>
                      {(lead.historySummary || []).length ? (
                        (lead.historySummary || []).slice(0, 2).map((event) => (
                          <span key={event.id || `${lead.id}:${event.eventType}:${event.createdAt}`}>
                            {eventLabel(event.eventType)}
                            {event.createdAt ? <small>{formatDate(event.createdAt)}</small> : null}
                          </span>
                        ))
                      ) : (
                        <span>Recebido <small>{formatDate(lead.lastSeenAt || lead.firstSeenAt)}</small></span>
                      )}
                    </div>

                    <div className={styles.actions}>
                      <button type="button" onClick={() => void runLeadAction(lead, "send")} disabled={Boolean(actionId)}>
                        Enviar para Vendas
                      </button>
                      {showSmartLeadCards ? (
                        <button
                          type="button"
                          onClick={() => void runLeadAction(lead, "enrich")}
                          disabled={Boolean(actionId)}
                          data-loading={isEnriching ? "true" : "false"}
                        >
                          {isEnriching ? "Enriquecendo" : "Enriquecer"}
                        </button>
                      ) : null}
                      <button type="button" onClick={() => void runLeadAction(lead, "csx")} disabled={Boolean(actionId)}>
                        CSX pendente
                      </button>
                      <button type="button" onClick={() => void runLeadAction(lead, "hide")} disabled={Boolean(actionId)}>
                        Descartar
                      </button>
                      <button type="button" data-danger="true" onClick={() => void runLeadAction(lead, "negative")} disabled={Boolean(actionId)}>
                        Negativo
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {hasMore ? (
            <div className={styles.loadMore}>
              <button type="button" onClick={() => void loadCards(page + 1, true)} disabled={loadingMore}>
                {loadingMore ? "Carregando..." : "Carregar mais 100"}
              </button>
            </div>
          ) : null}
        </section>

      </section>
    </DashboardScaffold>
  );
}
