"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { apiFetch, clearApiCache } from "@/app/_lib/api";
import { fetchMobileOperationalDestination } from "@/app/_lib/mobileOperationalDestination";
import { useRequireAuth } from "@/app/_lib/useRequireAuth";
import { getCommercialPlanTitle, type CommercialPlansPayload } from "@/lib/commercial-plans";
import { saveStoredRadarRun } from "@/lib/radar-active-run";
import { BRAZIL_CITIES_BY_STATE, BRAZIL_STATES } from "@/lib/brazil-locations";
import { HBX_SEGMENT_SUGGESTIONS } from "@/lib/hbx-segment-suggestions";
import { useInterfaceTransition } from "@/components/InterfaceTransitionProvider";
import styles from "./page.module.css";

type PlanTier = "leads" | "premium";
type OnboardingProfile = {
  completed: boolean;
  name: string;
  currentPlan: PlanTier;
  sells: string;
  targetAudience: string[];
  avoid: string[];
  state: string;
  city: string;
  radiusKm: number;
  originLat?: number | null;
  originLng?: number | null;
  segment: string;
  radarReady: boolean;
};

type CurrentUser = {
  name?: string | null;
  username?: string | null;
  email?: string | null;
  company?: {
    selectedPlanKey?: string | null;
    premiumAccess?: boolean | null;
  } | null;
};

type SalesProfileResponse = {
  source?: "user" | "company" | "default" | string;
  effectiveProfile?: {
    whatDoYouSell?: string | null;
    offerCategory?: string | null;
    targetAudience?: string[] | null;
    targetSegments?: string[] | null;
    avoidSegments?: string[] | null;
    preferredCities?: string[] | null;
    preferredStates?: string[] | null;
    preferredChannels?: string[] | null;
  } | null;
};

type RadarSearchRunResponse = {
  message?: string | null;
  code?: string | null;
  id?: string | null;
  runId?: string | null;
  status?: string | null;
  targetQuantity?: number | null;
  foundCount?: number | null;
  meta?: {
    requestedQuantity?: number | null;
    deliveredCount?: number | null;
    filters?: {
      city?: string | null;
      state?: string | null;
      segment?: string | null;
    } | null;
  } | null;
};

type TutorialSurface = "mobile" | "desktop";

const LEGACY_TUTORIAL_COMPLETED_KEY = "hbx:onboarding:tutorial-completed:v1";
const TUTORIAL_COMPLETED_KEY = "hbx:onboarding:tutorial-completed:mobile:v1";
const MOBILE_PREFERRED_CALLER_NAME_KEY = "hbx.vendas.mobile.preferredCallerName.v1";
const LEGACY_ONBOARDING_PROFILE_KEY = "hbx:onboarding:profile:v1";
const ONBOARDING_PROFILE_KEYS: Record<TutorialSurface, string> = {
  mobile: "hbx:onboarding:profile:mobile:v1",
  desktop: "hbx:onboarding:profile:desktop:v1",
};

const STEPS = [
  "Boas-vindas",
  "Conta",
  "Perfil",
  "Radar Digital",
  "Vendas",
  "Sucesso",
] as const;

const ALL_AUDIENCES_OPTION = "Todos";
const NO_AVOID_OPTION = "Nada";

const AUDIENCE_CHIPS = [
  ALL_AUDIENCES_OPTION,
  "idosos",
  "famílias",
  "empresas pequenas",
  "comércios locais",
  "profissionais autônomos",
  "clínicas",
];

const AVOID_CHIPS = [
  NO_AVOID_OPTION,
  "empresa grande",
  "órgão público",
  "sem telefone",
  "sem WhatsApp",
  "diretório/lista genérica",
  "fora da cidade",
];

type RadarSegmentGroup = {
  key: string;
  label: string;
  segments: string[];
};

const MAX_RADAR_SEGMENT_SELECTIONS = 5;
const RADAR_SEGMENT_GROUPS: RadarSegmentGroup[] = [
  {
    key: "saude",
    label: "Saúde",
    segments: ["academias", "clínicas médicas", "clínicas odontológicas", "clínicas veterinárias", "farmácias", "laboratórios", "serviços médicos", "yoga e pilates"],
  },
  {
    key: "alimentacao",
    label: "Alimentação",
    segments: ["bares", "buffets", "cafeterias", "lanchonetes", "mercados", "panificadoras", "pizzarias", "restaurantes", "supermercados"],
  },
  {
    key: "beleza",
    label: "Beleza",
    segments: ["barbearias", "clínicas de estética", "cosméticos", "perfumarias", "salões de beleza"],
  },
  {
    key: "servicos",
    label: "Serviços",
    segments: ["alarmes e segurança", "chaveiros", "dedetizadoras", "lavanderias", "serviços de limpeza", "sistemas de segurança", "zeladoria"],
  },
  {
    key: "automotivo",
    label: "Automotivo",
    segments: ["auto elétricas", "auto escolas", "auto peças", "borracharias", "centros automotivos", "lava rápidos", "mecânicas", "oficinas mecânicas"],
  },
  {
    key: "varejo",
    label: "Varejo",
    segments: ["calçados", "comércio varejista", "e-commerce", "lojas de celulares", "lojas de eletrônicos", "lojas de roupas", "ótica", "pet shops"],
  },
  {
    key: "negocios",
    label: "Negócios",
    segments: ["advocacias", "contabilidades", "consultorias empresariais", "corretoras de seguros", "financeiras", "imobiliárias", "serviços jurídicos"],
  },
  {
    key: "digital",
    label: "Digital",
    segments: ["agências de marketing", "estúdios de fotografia", "gráficas", "informática", "provedores de internet", "telecomunicações", "web design"],
  },
];

const DEFAULT_PROFILE: OnboardingProfile = {
  completed: false,
  name: "",
  currentPlan: "leads",
  sells: "",
  targetAudience: [ALL_AUDIENCES_OPTION],
  avoid: [NO_AVOID_OPTION],
  state: "",
  city: "",
  radiusKm: 50,
  originLat: null,
  originLng: null,
  segment: "",
  radarReady: false,
};

const RADAR_RADIUS_OPTIONS = [0, 25, 50, 100] as const;

function radarRadiusLabel(value?: number | null) {
  const radius = Math.max(0, Number(value || 0));
  return radius > 0 ? `${radius} km` : "Cidade";
}

function normalizeText(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function uniqueValues(values: unknown, fallback: string[] = []) {
  const source = Array.isArray(values) ? values : fallback;
  const seen = new Set<string>();
  const result: string[] = [];
  source.forEach((item) => {
    const value = normalizeText(item);
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return;
    seen.add(key);
    result.push(value);
  });
  return result;
}

function normalizeSegmentLabel(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function splitRadarSegments(value?: string | null) {
  return uniqueValues(String(value || "").split(",").map(normalizeSegmentLabel));
}

function joinRadarSegments(values: string[]) {
  return uniqueValues(values).slice(0, MAX_RADAR_SEGMENT_SELECTIONS).join(", ");
}

function buildRadarCategorySegmentValue(group: RadarSegmentGroup) {
  return uniqueValues(group.segments).join(", ");
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
  const extras = uniqueValues(availableSegments)
    .filter((segment) => !known.has(segment.toLowerCase()))
    .slice(0, 20);
  return extras.length
    ? [...RADAR_SEGMENT_GROUPS, { key: "sugestoes", label: "Sugestões", segments: extras }]
    : RADAR_SEGMENT_GROUPS;
}

function onboardingProfileKey(surface: TutorialSurface) {
  return ONBOARDING_PROFILE_KEYS[surface];
}

function markMobileTutorialCompleted() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TUTORIAL_COMPLETED_KEY, "true");
  window.localStorage.setItem(LEGACY_TUTORIAL_COMPLETED_KEY, "true");
}

function clearMobileTutorialCompleted() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TUTORIAL_COMPLETED_KEY);
  window.localStorage.removeItem(LEGACY_TUTORIAL_COMPLETED_KEY);
}

function readStoredOnboardingProfile(surface: TutorialSurface = "mobile"): Partial<OnboardingProfile> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(onboardingProfileKey(surface))
      || (surface === "mobile" ? window.localStorage.getItem(LEGACY_ONBOARDING_PROFILE_KEY) : null);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<OnboardingProfile>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveOnboardingProfile(profile: OnboardingProfile, surface: TutorialSurface = "mobile") {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(onboardingProfileKey(surface), JSON.stringify(profile));
  if (surface === "mobile") {
    window.localStorage.setItem(LEGACY_ONBOARDING_PROFILE_KEY, JSON.stringify(profile));
    const name = normalizeText(profile.name);
    if (name) window.localStorage.setItem(MOBILE_PREFERRED_CALLER_NAME_KEY, name);
  }
}

function planTierFromPayload(plans: CommercialPlansPayload | null, user: CurrentUser | null): PlanTier {
  const key = String(plans?.current.selectedPlanKey || plans?.current.planKey || user?.company?.selectedPlanKey || "").trim();
  const entitlements = plans?.current.entitlements || ({} as CommercialPlansPayload["current"]["entitlements"]);
  if (
    plans?.current.premiumAccess ||
    user?.company?.premiumAccess ||
    key === "hbx_padrao" ||
    key === "hbx_melhor" ||
    entitlements.radar_premium ||
    entitlements.opportunity_score ||
    entitlements.ai_sales_scripts
  ) {
    return "premium";
  }
  return "leads";
}

function planLabel(tier: PlanTier, plans: CommercialPlansPayload | null) {
  const title = getCommercialPlanTitle(plans?.current.selectedPlanKey || plans?.current.planKey || null);
  if (title !== "Sem plano comercial") return title;
  return tier === "premium" ? "Premium" : "Leads";
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
  const raw = normalizeText(value).replace(/^BR-/i, "").toUpperCase();
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
    const city = normalizeText(payload.city || payload.locality);
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

function initials(name: string) {
  const value = normalizeText(name);
  if (!value) return "N";
  return value[0]?.toUpperCase() || "N";
}

function toggleChip(values: string[], value: string) {
  const normalized = normalizeText(value);
  if (!normalized) return values;
  return values.some((item) => item.toLowerCase() === normalized.toLowerCase())
    ? values.filter((item) => item.toLowerCase() !== normalized.toLowerCase())
    : [...values, normalized];
}

function normalizeAudienceSelection(values: unknown, fallback: string[] = [ALL_AUDIENCES_OPTION]) {
  const selected = uniqueValues(values, fallback);
  const withoutAll = selected.filter((item) => item.toLowerCase() !== ALL_AUDIENCES_OPTION.toLowerCase());
  return withoutAll.length ? withoutAll : [ALL_AUDIENCES_OPTION];
}

function normalizeAvoidSelection(values: unknown, fallback: string[] = [NO_AVOID_OPTION]) {
  const selected = uniqueValues(values, fallback);
  const withoutNone = selected.filter((item) => item.toLowerCase() !== NO_AVOID_OPTION.toLowerCase());
  return withoutNone.length ? withoutNone : [NO_AVOID_OPTION];
}

function toggleAudience(values: string[], value: string) {
  const normalized = normalizeText(value);
  if (normalized.toLowerCase() === ALL_AUDIENCES_OPTION.toLowerCase()) return [ALL_AUDIENCES_OPTION];
  const next = toggleChip(values.filter((item) => item.toLowerCase() !== ALL_AUDIENCES_OPTION.toLowerCase()), normalized);
  return next.length ? next : [ALL_AUDIENCES_OPTION];
}

function toggleAvoid(values: string[], value: string) {
  const normalized = normalizeText(value);
  if (normalized.toLowerCase() === NO_AVOID_OPTION.toLowerCase()) return [NO_AVOID_OPTION];
  const next = toggleChip(values.filter((item) => item.toLowerCase() !== NO_AVOID_OPTION.toLowerCase()), normalized);
  return next.length ? next : [NO_AVOID_OPTION];
}

function audiencePayload(values: string[]) {
  const selected = normalizeAudienceSelection(values);
  return selected.some((item) => item.toLowerCase() === ALL_AUDIENCES_OPTION.toLowerCase()) ? [] : selected;
}

function avoidPayload(values: string[]) {
  const selected = normalizeAvoidSelection(values);
  return selected.some((item) => item.toLowerCase() === NO_AVOID_OPTION.toLowerCase()) ? [] : selected;
}

function buildSalesProfilePayload(nextProfile: OnboardingProfile) {
  const sells = normalizeText(nextProfile.sells);
  const targetAudience = uniqueValues(nextProfile.targetAudience);
  const avoid = uniqueValues(nextProfile.avoid);
  const persistedTargetAudience = audiencePayload(targetAudience);
  const persistedAvoid = avoidPayload(avoid);
  const state = normalizeText(nextProfile.state).toUpperCase();
  const city = normalizeText(nextProfile.city);
  const segment = normalizeText(nextProfile.segment);

  return {
    normalized: {
      sells,
      targetAudience: normalizeAudienceSelection(targetAudience),
      avoid: normalizeAvoidSelection(avoid),
      state,
      city,
      segment,
    },
    body: {
      whatDoYouSell: sells,
      offerCategory: sells,
      targetAudience: { labels: persistedTargetAudience },
      targetSegments: { labels: segment ? [segment] : [] },
      preferredCities: city ? [city] : [],
      preferredStates: state ? [state] : [],
      avoidSegments: {
        labels: persistedAvoid,
        hardReject: persistedAvoid.filter((item) => /órgão|orgao|diretório|diretorio|lista|sem telefone|sem whatsapp|fora da cidade/i.test(item)),
      },
      preferredChannels: ["whatsapp"],
      leadPreferences: {
        preferSmallBusiness: true,
        preferNoWebsite: true,
        preferInstagram: false,
        preferWhatsapp: true,
        preferHighReviews: true,
        preferLocalBusiness: true,
      },
      negativeRules: {
        avoidPublicSector: persistedAvoid.some((item) => /órgão|orgao/i.test(item)),
        avoidLargeCompanies: persistedAvoid.some((item) => /grande/i.test(item)),
        avoidDirectories: persistedAvoid.some((item) => /diretório|diretorio|lista/i.test(item)),
        avoidNoPhone: persistedAvoid.some((item) => /sem telefone/i.test(item)),
        avoidNoWhatsapp: persistedAvoid.some((item) => /sem whatsapp/i.test(item)),
        avoidOutOfCity: persistedAvoid.some((item) => /fora da cidade/i.test(item)),
      },
      weeklyAutoUpdateEnabled: false,
    },
  };
}

type PickerKind = "state" | "city" | "segment";

type PickerOption = {
  value: string;
  label: string;
};

function PickerButton({
  label,
  value,
  placeholder,
  disabled,
  onClick,
}: {
  label: string;
  value: string;
  placeholder: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={styles.pickerButton} disabled={disabled} onClick={onClick}>
      <span>{label}</span>
      <strong>{value || placeholder}</strong>
      <b>⌄</b>
    </button>
  );
}

function RadiusSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className={styles.radiusSelector} role="radiogroup" aria-label="Alcance regional">
      <span>Alcance</span>
      <div>
        {RADAR_RADIUS_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            data-active={Number(value || 0) === option ? "true" : "false"}
            onClick={() => onChange(option)}
          >
            {radarRadiusLabel(option)}
          </button>
        ))}
      </div>
    </div>
  );
}

function PickerSheet({
  title,
  value,
  options,
  allowCustom,
  onSelect,
  onClose,
}: {
  title: string;
  value: string;
  options: PickerOption[];
  allowCustom?: boolean;
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = options
    .filter((option) => !normalizedQuery || option.label.toLowerCase().includes(normalizedQuery) || option.value.toLowerCase().includes(normalizedQuery))
    .slice(0, 90);
  const customValue = normalizeText(query);
  const canUseCustom = allowCustom && customValue && !filteredOptions.some((option) => option.value.toLowerCase() === customValue.toLowerCase());

  return (
    <div className={styles.pickerPanel} role="presentation" onClick={onClose}>
      <section className={styles.pickerSheet} role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <div className={styles.pickerHeader}>
          <strong>{title}</strong>
          <button type="button" onClick={onClose}>Fechar</button>
        </div>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar" autoFocus />
        <div className={styles.pickerList}>
          <button
            type="button"
            data-active={!value}
            onClick={() => {
              onSelect("");
              onClose();
            }}
          >
            Limpar seleção
          </button>
          {canUseCustom ? (
            <button
              type="button"
              onClick={() => {
                onSelect(customValue);
                onClose();
              }}
            >
              Usar &quot;{customValue}&quot;
            </button>
          ) : null}
          {filteredOptions.map((option) => (
            <button
              type="button"
              key={option.value}
              data-active={option.value === value}
              onClick={() => {
                onSelect(option.value);
                onClose();
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function SegmentPickerSheet({
  value,
  availableSegments,
  onChange,
  onClose,
}: {
  value: string;
  availableSegments: string[];
  onChange: (value: string) => void;
  onClose: () => void;
}) {
  const groups = useMemo(() => buildSegmentGroups(availableSegments), [availableSegments]);
  const [activeGroupKey, setActiveGroupKey] = useState(() => inferRadarSegmentCategory(value));
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resolvedActiveGroupKey = groups.some((group) => group.key === activeGroupKey) ? activeGroupKey : groups[0]?.key || "";
  const activeGroup = groups.find((group) => group.key === resolvedActiveGroupKey) || groups[0];
  const isCategory = isRadarCategoryValue(value);
  const selectedSegments = splitRadarSegments(value);
  const canAddMore = selectedSegments.length < MAX_RADAR_SEGMENT_SELECTIONS;
  const normalizedQuery = query.trim().toLowerCase();
  const visibleSegments = uniqueValues(activeGroup?.segments || [])
    .filter((segment) => !normalizedQuery || segment.toLowerCase().includes(normalizedQuery));

  useEffect(() => {
    if (!searchOpen) return;
    inputRef.current?.focus();
  }, [searchOpen]);

  function toggleSegment(segment: string) {
    const normalized = normalizeSegmentLabel(segment);
    if (!normalized) return;
    const exists = selectedSegments.some((item) => item.toLowerCase() === normalized.toLowerCase());
    if (exists) {
      onChange(joinRadarSegments(selectedSegments.filter((item) => item.toLowerCase() !== normalized.toLowerCase())));
      return;
    }
    if (!canAddMore) return;
    onChange(joinRadarSegments([...selectedSegments, normalized]));
  }

  return (
    <div className={styles.pickerPanel} role="presentation" onClick={onClose}>
      <section className={`${styles.pickerSheet} ${styles.segmentSheet}`} role="dialog" aria-modal="true" aria-label="Segmento" onClick={(event) => event.stopPropagation()}>
        <div className={styles.pickerHeader}>
          <div>
            <strong>Segmento</strong>
            <small>{isCategory ? `${radarSegmentSummary(value)} inteiro` : `${selectedSegments.length}/${MAX_RADAR_SEGMENT_SELECTIONS} selecionados`}</small>
          </div>
          <div className={styles.segmentSheetActions}>
            <button type="button" aria-label="Pesquisar" onClick={() => setSearchOpen(true)}>
              ⌕
            </button>
            <button type="button" onClick={onClose}>Fechar</button>
          </div>
        </div>
        {searchOpen ? (
          <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar ou digitar segmento" />
        ) : null}
        <div className={styles.segmentCategories}>
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
        <div className={styles.segmentToolbar}>
          <button type="button" onClick={() => onChange("")}>Limpar</button>
          <button
            type="button"
            onClick={() => {
              if (!activeGroup) return;
              onChange(buildRadarCategorySegmentValue(activeGroup));
              onClose();
            }}
          >
            Usar categoria
          </button>
          {query.trim() ? (
            <button
              type="button"
              disabled={!canAddMore}
              onClick={() => {
                toggleSegment(query);
                setQuery("");
              }}
            >
              Usar &quot;{query.trim()}&quot;
            </button>
          ) : null}
        </div>
        <div className={styles.segmentOptions}>
          {visibleSegments.map((segment) => {
            const active = selectedSegments.some((item) => item.toLowerCase() === segment.toLowerCase());
            return (
              <button type="button" key={segment} data-active={active ? "true" : "false"} disabled={!active && !canAddMore} onClick={() => toggleSegment(segment)}>
                {segment}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function PremiumMark({ large = false }: { large?: boolean }) {
  return (
    <span className={`${styles.premiumMark} ${large ? styles.premiumMarkLarge : ""}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M4.2 18.5h15.6l.7-9.9-4.6 3.5L12 4.7 8.1 12.1 3.5 8.6l.7 9.9Z" />
        <path d="M5.2 20.2h13.6" />
        <circle cx="12" cy="4.7" r="1.25" />
        <circle cx="3.5" cy="8.6" r="1.15" />
        <circle cx="20.5" cy="8.6" r="1.15" />
      </svg>
    </span>
  );
}

function ChannelIcon({ type }: { type: "whatsapp" | "facebook" | "instagram" | "site" | "phone" | "email" }) {
  const iconByType = {
    whatsapp: "/icons/hbx-channels/whatsapp.webp",
    facebook: "/icons/hbx-channels/facebook.webp",
    instagram: "/icons/hbx-channels/instagram.webp",
    site: "/icons/hbx-channels/site_globe.webp",
    phone: "/icons/hbx-channels/telefone.webp",
    email: "/icons/hbx-channels/email.webp",
  } satisfies Record<typeof type, string>;
  return (
    <span className={styles.channelIcon} data-channel={type} aria-hidden="true">
      <Image src={iconByType[type]} alt="" width={34} height={34} />
    </span>
  );
}

function PremiumChannelStrip() {
  return (
    <div className={styles.premiumChannelStrip} aria-label="Canais do HBX Lead">
      {(["whatsapp", "facebook", "instagram", "site", "phone", "email"] as const).map((channel) => (
        <ChannelIcon key={channel} type={channel} />
      ))}
    </div>
  );
}

function Field({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ChipGroup({
  title,
  values,
  selected,
  onToggle,
}: {
  title: string;
  values: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className={styles.chipSection}>
      <h3>{title}</h3>
      <div className={styles.chipGrid}>
        {values.map((item) => (
          <button
            key={item}
            type="button"
            className={styles.chip}
            data-active={selected.some((value) => value.toLowerCase() === item.toLowerCase())}
            onClick={() => onToggle(item)}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function TutorialClientPage() {
  const hasToken = useRequireAuth();
  const router = useRouter();
  const { replayGlobalTransition } = useInterfaceTransition();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const [profile, setProfile] = useState<OnboardingProfile>(DEFAULT_PROFILE);
  const [plans, setPlans] = useState<CommercialPlansPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileHydrated, setProfileHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [picker, setPicker] = useState<PickerKind | null>(null);
  const [locating, setLocating] = useState(false);
  const salesProfileAutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const salesProfileAutosaveKeyRef = useRef("");

  const currentStep = STEPS[step];
  const planTier = profile.currentPlan;
  const resolvedPlanLabel = planLabel(planTier, plans);

  useEffect(() => {
    if (hasToken !== true) return;
    let active = true;
    async function load() {
      setLoading(true);
      setProfileHydrated(false);
      const stored = readStoredOnboardingProfile();
      const [user, salesProfile, commercialPlans] = await Promise.all([
        apiFetch<CurrentUser>("/profile/current-user", { requireAuth: true }).catch(() => null),
        apiFetch<SalesProfileResponse>("/vendas/sales-profile", { requireAuth: true }).catch(() => null),
        apiFetch<CommercialPlansPayload>("/commercial-plans/me", { requireAuth: true }).catch(() => null),
      ]);
      if (!active) return;

      const effective = salesProfile?.effectiveProfile || {};
      const savedSource = String(salesProfile?.source || "").trim().toLowerCase();
      const effectiveSells = savedSource && savedSource !== "default"
        ? normalizeText(effective.whatDoYouSell || effective.offerCategory)
        : "";
      const nextPlan = planTierFromPayload(commercialPlans, user);
      const nextProfile: OnboardingProfile = {
        ...DEFAULT_PROFILE,
        ...stored,
        currentPlan: nextPlan,
        name: normalizeText(stored.name) || normalizeText(user?.name || user?.username || user?.email),
        sells: effectiveSells || normalizeText(stored.sells),
        targetAudience: normalizeAudienceSelection(stored.targetAudience, normalizeAudienceSelection(effective.targetAudience)),
        avoid: normalizeAvoidSelection(stored.avoid, normalizeAvoidSelection(effective.avoidSegments)),
        state: normalizeText(stored.state) || uniqueValues(effective.preferredStates, [])[0] || "",
        city: normalizeText(stored.city) || uniqueValues(effective.preferredCities, [])[0] || "",
        radiusKm: RADAR_RADIUS_OPTIONS.includes(Number(stored.radiusKm) as typeof RADAR_RADIUS_OPTIONS[number])
          ? Number(stored.radiusKm)
          : DEFAULT_PROFILE.radiusKm,
        originLat: typeof stored.originLat === "number" ? stored.originLat : null,
        originLng: typeof stored.originLng === "number" ? stored.originLng : null,
        segment: normalizeText(stored.segment) || uniqueValues(effective.targetSegments, [])[0] || "",
        radarReady: Boolean(stored.radarReady),
        completed: Boolean(stored.completed),
      };

      setPlans(commercialPlans);
      setProfile(nextProfile);
      saveOnboardingProfile(nextProfile);
      setProfileHydrated(true);
      setLoading(false);
    }
    void load();
    return () => {
      active = false;
    };
  }, [hasToken]);

  useEffect(() => {
    if (!profileHydrated) return;
    saveOnboardingProfile(profile);
  }, [profile, profileHydrated]);

  useEffect(() => {
    if (!profileHydrated) return;
    const { normalized, body } = buildSalesProfilePayload(profile);
    if (!normalized.sells) return;
    const autosaveKey = JSON.stringify(body);
    if (autosaveKey === salesProfileAutosaveKeyRef.current) return;
    if (salesProfileAutosaveTimerRef.current) clearTimeout(salesProfileAutosaveTimerRef.current);
    salesProfileAutosaveTimerRef.current = setTimeout(() => {
      salesProfileAutosaveTimerRef.current = null;
      salesProfileAutosaveKeyRef.current = autosaveKey;
      apiFetch<SalesProfileResponse>("/vendas/sales-profile", {
        method: "PATCH",
        requireAuth: true,
        headers: { "x-hbx-onboarding": "mobile" },
        body: JSON.stringify(body),
      })
        .then(() => clearApiCache("/vendas/sales-profile"))
        .catch(() => {
          salesProfileAutosaveKeyRef.current = "";
        });
    }, 700);
    return () => {
      if (salesProfileAutosaveTimerRef.current) {
        clearTimeout(salesProfileAutosaveTimerRef.current);
        salesProfileAutosaveTimerRef.current = null;
      }
    };
  }, [profile, profileHydrated]);

  function updateProfile(patch: Partial<OnboardingProfile>) {
    setProfile((current) => {
      const nextProfile = { ...current, ...patch };
      if (profileHydrated) saveOnboardingProfile(nextProfile);
      return nextProfile;
    });
    setError("");
  }

  const goToStep = useCallback((nextStep: number) => {
    setDirection(nextStep > step ? "next" : "prev");
    setStep(nextStep);
    window.setTimeout(replayGlobalTransition, 16);
  }, [replayGlobalTransition, step]);

  async function persistAccount() {
    const name = normalizeText(profile.name);
    if (!name || name.length < 2) {
      setError("Informe seu nome para avançar.");
      return false;
    }
    updateProfile({ name });
    await apiFetch<CurrentUser>("/profile/display-name", {
      method: "PATCH",
      requireAuth: true,
      body: JSON.stringify({ name }),
    });
    clearApiCache("/profile/current-user");
    return true;
  }

  async function persistSalesProfile(nextProfile = profile) {
    const { normalized, body } = buildSalesProfilePayload(nextProfile);
    const sells = normalized.sells;
    if (!sells) {
      setError("Informe o que você vende para avançar.");
      return false;
    }
    await apiFetch<SalesProfileResponse>("/vendas/sales-profile", {
      method: "PATCH",
      requireAuth: true,
      headers: { "x-hbx-onboarding": "mobile" },
      body: JSON.stringify(body),
    });
    clearApiCache("/vendas/sales-profile");
    salesProfileAutosaveKeyRef.current = JSON.stringify(body);
    updateProfile(normalized);
    return true;
  }

  async function prepareRadar(nextProfile = profile) {
    const state = normalizeText(nextProfile.state).toUpperCase();
    const city = normalizeText(nextProfile.city);
    const segment = normalizeText(nextProfile.segment);
    const radiusKm = RADAR_RADIUS_OPTIONS.includes(Number(nextProfile.radiusKm) as typeof RADAR_RADIUS_OPTIONS[number])
      ? Number(nextProfile.radiusKm)
      : DEFAULT_PROFILE.radiusKm;
    if (!state) {
      setError("Informe o estado para preparar o Radar.");
      return false;
    }
    if (!city) {
      setError("Informe a cidade para preparar o Radar.");
      return false;
    }
    if (!segment) {
      setError("Informe o segmento para preparar o Radar.");
      return false;
    }
    const persistedProfile = { ...nextProfile, state, city, segment, radiusKm, radarReady: true };
    await persistSalesProfile(persistedProfile);
    updateProfile({ state, city, segment, radiusKm, radarReady: true });
    return true;
  }

  async function startRealRadarRun() {
    const state = normalizeText(profile.state).toUpperCase();
    const city = normalizeText(profile.city);
    const segment = normalizeText(profile.segment);
    const radiusKm = RADAR_RADIUS_OPTIONS.includes(Number(profile.radiusKm) as typeof RADAR_RADIUS_OPTIONS[number])
      ? Number(profile.radiusKm)
      : DEFAULT_PROFILE.radiusKm;
    const firstSegment = splitRadarSegments(segment)[0] || segment;
    if (!state || !city || !segment) return false;
    const isLeadPlus = profile.currentPlan === "premium";
    const avoidNoWhatsapp = profile.avoid.some((item) => /sem whatsapp/i.test(item));
    const wantsWhatsapp = true;
    const whatsappCheckMode = isLeadPlus
      ? (wantsWhatsapp || avoidNoWhatsapp ? "only_valid" : "enrich")
      : "off";
    const { body: rawSalesProfilePayload } = buildSalesProfilePayload(profile);
    const { preferredCities: _preferredCities, preferredStates: _preferredStates, weeklyAutoUpdateEnabled: _weeklyAutoUpdateEnabled, ...salesProfilePayload } = rawSalesProfilePayload;
    const payload = await apiFetch<RadarSearchRunResponse>("/webscraping/radar/search-runs", {
      method: "POST",
      requireAuth: true,
      timeoutMs: 20000,
      body: JSON.stringify({
        ...salesProfilePayload,
        state,
        city,
        radiusKm,
        originLat: profile.originLat ?? undefined,
        originLng: profile.originLng ?? undefined,
        segment: firstSegment,
        targetType: "pj",
        engine: "hbx",
        quantity: 10,
        minimumStock: 10,
        desiredStock: 10,
        qualityMode: isLeadPlus ? "lead_plus" : "list",
        preferredChannels: ["whatsapp"],
        whatsappCheckMode,
      }),
    });
    const runId = normalizeText(payload.runId || payload.id);
    if (!runId) {
      throw new Error(normalizeText(payload.message) || "O Radar não retornou uma busca ativa para Vendas.");
    }
    if (runId) {
      saveStoredRadarRun({
        runId,
        status: payload.status || "queued",
        city: payload.meta?.filters?.city || city,
        state: payload.meta?.filters?.state || state,
        segment: payload.meta?.filters?.segment || firstSegment,
        targetQuantity: Number(payload.targetQuantity || payload.meta?.requestedQuantity || 10),
        deliveredCount: Number(payload.meta?.deliveredCount || payload.foundCount || 0),
      });
    }
    return true;
  }

  async function next() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (step === 1 && !(await persistAccount())) return;
      if (step === 2 && !(await persistSalesProfile())) return;
      if (step === 3 && !(await prepareRadar())) return;
      if (step < STEPS.length - 1) goToStep(step + 1);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Não foi possível salvar agora.");
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (!(await persistAccount())) return;
      if (!(await prepareRadar())) return;
      await startRealRadarRun();
      const completedProfile = {
        ...profile,
        name: normalizeText(profile.name),
        state: normalizeText(profile.state).toUpperCase(),
        city: normalizeText(profile.city),
        segment: normalizeText(profile.segment),
        completed: true,
        radarReady: true,
      };
      setProfile(completedProfile);
      saveOnboardingProfile(completedProfile);
      markMobileTutorialCompleted();
      router.push("/vendas");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Não foi possível iniciar o Radar agora.");
    } finally {
      setBusy(false);
    }
  }

  async function back() {
    if (busy) return;
    if (step <= 0) {
      await exitTutorial();
      return;
    }
    goToStep(step - 1);
  }

  async function exitTutorial() {
    if (busy) return;
    setBusy(true);
    try {
      router.push(await fetchMobileOperationalDestination());
    } finally {
      setBusy(false);
    }
  }

  function restartTutorial() {
    const nextProfile = { ...profile, completed: false };
    setProfile(nextProfile);
    saveOnboardingProfile(nextProfile);
    clearMobileTutorialCompleted();
    goToStep(0);
  }

  const stateOptions = useMemo<PickerOption[]>(() => (
    BRAZIL_STATES.map((item) => ({ value: item.uf, label: `${item.uf} - ${item.name}` }))
  ), []);
  const cityOptions = useMemo<PickerOption[]>(() => (
    (BRAZIL_CITIES_BY_STATE[profile.state] || []).map((city) => ({ value: city, label: city }))
  ), [profile.state]);
  const segmentOptions = useMemo<PickerOption[]>(() => (
    HBX_SEGMENT_SUGGESTIONS.map((segment) => ({ value: segment, label: segment }))
  ), []);

  const activePicker = picker === "state"
    ? { title: "Estado", value: profile.state, options: stateOptions, allowCustom: false }
    : picker === "city"
      ? { title: "Cidade", value: profile.city, options: cityOptions, allowCustom: false }
      : null;

  function selectPickerValue(value: string) {
    if (picker === "state") {
      const state = normalizeText(value).toUpperCase();
      updateProfile({ state, city: "" });
      return;
    }
    if (picker === "city") {
      updateProfile({ city: normalizeText(value) });
      return;
    }
    if (picker === "segment") {
      updateProfile({ segment: normalizeText(value) });
    }
  }

  async function handleCurrentLocation() {
    if (locating) return;
    setLocating(true);
    setError("");
    try {
      const position = await getCurrentBrowserPosition();
      const location = await reverseGeocodeCurrentPosition(position);
      updateProfile({ state: location.state, city: location.city, originLat: location.lat, originLng: location.lng });
    } catch (locationError) {
      setError(locationError instanceof Error ? locationError.message : "Não consegui usar sua localização agora.");
    } finally {
      setLocating(false);
    }
  }

  const stepContent = useMemo(() => {
    if (step === 0) {
      return (
        <>
          <section className={styles.heroCard}>
            <div className={styles.appIcon}>HBX</div>
            <h2>Primeiro acesso</h2>
            <div className={styles.introList}>
              {[
                ["01", "Conta rápida", "Nome e plano em segundos"],
                ["02", "Perfil de venda", "O que vender e para quem"],
                ["03", "Abrir Radar", "Buscar cards e começar"],
              ].map(([number, title, text]) => (
                <div className={styles.introItem} key={number}>
                  <span>{number}</span>
                  <div>
                    <strong>{title}</strong>
                    <small>{text}</small>
                  </div>
                  <b>›</b>
                </div>
              ))}
            </div>
            <p className={styles.lockHint}>Tudo fica salvo automaticamente.</p>
          </section>
        </>
      );
    }

    if (step === 1) {
      return (
        <>
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <h2>Conta</h2>
              <button type="button" className={styles.iconButton} aria-label="Fechar" onClick={() => void exitTutorial()}>×</button>
            </div>
            <div className={styles.avatar}>{initials(profile.name)}</div>
            <Field label="Como quer ser chamado" value={profile.name} placeholder="Seu nome" onChange={(name) => updateProfile({ name })} />
          </section>
          <section className={styles.planSection}>
            <div className={styles.planGrid}>
              <div className={styles.planCard} data-plan="list" data-active={planTier === "leads"}>
                <span className={styles.planIcon}>◎</span>
                <strong>HBX LIST</strong>
                <small>dados básicos</small>
                <p>telefone • cidade • segmento</p>
                <div className={styles.planFeatureGrid} aria-label="Recursos HBX List">
                  <span>☎ Telefone</span>
                  <span>⌖ Cidade</span>
                  <span>▦ Segmento</span>
                </div>
              </div>
              <div className={styles.planCard} data-plan="premium" data-active={planTier === "premium"}>
                <span className={styles.planIcon}><PremiumMark large /></span>
                <div className={styles.planCopy}>
                  <strong>HBX LEAD <PremiumMark /></strong>
                  <small>Acesse mais contatos e canais</small>
                  <p>score • motivo • mensagem</p>
                </div>
                <div className={styles.premiumMetricStrip} aria-label="Recursos HBX Lead">
                  <span>Score</span>
                  <span>Motivo</span>
                  <span>Msg</span>
                </div>
                <PremiumChannelStrip />
              </div>
            </div>
            <p className={styles.currentPlan}>Plano atual: <strong>{resolvedPlanLabel}</strong></p>
          </section>
        </>
      );
    }

    if (step === 2) {
      return (
        <section className={styles.card}>
          <span className={styles.badge}>Perfil ativo</span>
          <h2>{profile.sells || "Defina seu perfil"}</h2>
          <p>Isso ajuda o HBX a escolher melhores cards.</p>
          <div className={styles.innerPanel}>
            <Field label="O que você vende?" value={profile.sells} placeholder="Ex: software para clínicas" onChange={(sells) => updateProfile({ sells })} />
            <ChipGroup title="Para quem vender?" values={AUDIENCE_CHIPS} selected={profile.targetAudience} onToggle={(value) => updateProfile({ targetAudience: toggleAudience(profile.targetAudience, value) })} />
            <ChipGroup title="O que evitar?" values={AVOID_CHIPS} selected={profile.avoid} onToggle={(value) => updateProfile({ avoid: toggleAvoid(profile.avoid, value) })} />
          </div>
        </section>
      );
    }

    if (step === 3) {
      return (
        <section className={styles.radarCard}>
          <div className={styles.radarSteps}>
            <span><b>1</b> Estado</span>
            <span><b>2</b> Cidade</span>
            <span><b>3</b> Segmento</span>
          </div>
          <div className={styles.radarPickers}>
            <PickerButton label="Estado" value={profile.state} placeholder="UF" onClick={() => setPicker("state")} />
            <PickerButton label="Cidade" value={profile.city} placeholder="Cidade" disabled={!profile.state} onClick={() => setPicker("city")} />
            <PickerButton label="Segmento" value={radarSegmentSummary(profile.segment)} placeholder="Segmento" onClick={() => setPicker("segment")} />
          </div>
          <RadiusSelector value={profile.radiusKm} onChange={(radiusKm) => updateProfile({ radiusKm })} />
          <div className={styles.searchPreview}>
            Buscar cards em {radarRadiusLabel(profile.radiusKm)}
          </div>
          <div className={styles.radarStats}>
            <div><span>Encontrados</span><strong>25</strong></div>
            <div><span>Aprovados</span><strong>18</strong></div>
            <div><span>Tempo</span><strong>42s</strong></div>
          </div>
          <div className={styles.leadPreview}>
            <span className={styles.basicIcon}>▦</span>
            <div>
              <small>Card comum</small>
              <strong>Auto Peças Central</strong>
              <p>(19) 99999-9999 • {profile.city || "cidade"}/{profile.state || "UF"} • {profile.segment || "segmento"}</p>
            </div>
          </div>
          <div className={`${styles.leadPreview} ${styles.premiumPreview}`}>
            <span className={styles.premiumIcon}>＋</span>
            <div>
              <small>Premium <PremiumMark /></small>
              <strong>Clínica Horizonte</strong>
              <p>Score 82 • Motivo claro • Mensagem pronta</p>
            </div>
          </div>
          <p className={styles.legend}>Leads = card comum • Premium <PremiumMark /> = card enriquecido</p>
        </section>
      );
    }

    if (step === 4) {
      return (
        <section className={styles.salesCard}>
          <h2>Vendas</h2>
          <div className={styles.salesMetrics}>
            <div><span>Hoje</span><strong>2</strong></div>
            <div><span>Cards</span><strong>2</strong></div>
          </div>
          <div className={styles.salesLead}>
            <small>HBX LIST</small>
            <strong>Auto Peças Central</strong>
            <p>telefone • cidade • segmento • site básico</p>
            <b>›</b>
          </div>
          <div className={`${styles.salesLead} ${styles.salesLeadPremium}`}>
            <small>HBX LEAD <PremiumMark /></small>
            <strong>Clínica Horizonte</strong>
            <p>score • motivo • canal • mensagem</p>
            <b>›</b>
          </div>
          <div className={styles.salesActions}>
            <span>Chamar</span>
            <span>Retorno</span>
          </div>
          <p className={styles.infoBox}>Leads = dados básicos • Premium <PremiumMark /> = score, motivo e mensagem</p>
          <div className={styles.salesCallouts} aria-hidden="true">
            <span>Lead comum</span>
            <span>Premium com contexto</span>
            <span>Aja rápido</span>
          </div>
        </section>
      );
    }

    const summaryRows: Array<{ icon: string; label: string; value?: string; chips?: string[] }> = [
      { icon: "user", label: "Conta atual", value: resolvedPlanLabel },
      { icon: "user", label: "Nome", value: profile.name || "-" },
      { icon: "briefcase", label: "O que você vende", value: profile.sells || "-" },
      { icon: "group", label: "Para quem vender", chips: profile.targetAudience.length ? profile.targetAudience : ["-"] },
      { icon: "shield", label: "O que evitar", chips: profile.avoid.length ? profile.avoid : ["-"] },
      { icon: "pin", label: "Cidade", value: [profile.city, profile.state].filter(Boolean).join("/") || "-" },
      { icon: "radar", label: "Alcance", value: radarRadiusLabel(profile.radiusKm) },
      { icon: "target", label: "Segmento", value: profile.segment || "-" },
    ];

    return (
      <section className={styles.successCard}>
        <div className={styles.checkMark}>✓</div>
        <span className={styles.successBadge}>Configuração concluída</span>
        <h2>Suas configurações</h2>
        <div className={styles.summaryList}>
          {summaryRows.map(({ icon, label, value, chips }) => (
            <div className={styles.summaryRow} key={label}>
              <i data-icon={icon} aria-hidden="true" />
              <span>{label}</span>
              {chips ? (
                <div className={styles.summaryChips}>
                  {chips.map((chip) => <b key={chip}>{chip}</b>)}
                </div>
              ) : (
                <strong>{value}</strong>
              )}
            </div>
          ))}
        </div>
        <div className={styles.compareBox}>
          <div><strong>Leads</strong><span>telefone • cidade • segmento</span></div>
          <b>vs</b>
          <div><strong>Premium <PremiumMark /></strong><span>score • motivo • mensagem pronta</span></div>
        </div>
        <div className={styles.radarReadyBox}>
          <strong>Radar ativado e pronto para Vendas.</strong>
          <span>Ao seguir, Vendas já abre com o Radar funcionando no perfil definido.</span>
        </div>
      </section>
    );
  }, [planTier, profile, resolvedPlanLabel, router, step]);

  if (hasToken === null || loading) {
    return (
      <main className={styles.page}>
        <section className={styles.shell}>
          <div className={styles.brandPill}>HBX Mobile</div>
          <p className={styles.loadingText}>Carregando tutorial...</p>
        </section>
      </main>
    );
  }

  if (!hasToken) return null;

  return (
    <main className={styles.page} data-direction={direction}>
      <section className={styles.shell} data-step={step} aria-labelledby="tutorial-title">
        <div className={styles.brandPill}>HBX Mobile</div>
        {step === 3 ? (
          <button
            type="button"
            className={styles.gpsButton}
            data-loading={locating ? "true" : "false"}
            onClick={() => void handleCurrentLocation()}
            aria-label="Usar minha localização"
            title="Usar minha localização"
          >
            <span aria-hidden="true" />
          </button>
        ) : null}
        <div className={styles.progressWrap} aria-label={`Progresso ${step + 1} de ${STEPS.length}`}>
          <div className={styles.progressBars}>
            {STEPS.map((item, index) => (
              <span key={item} data-active={index <= step} />
            ))}
          </div>
        </div>

        <header className={styles.header}>
          <span>{currentStep}</span>
          <h1 id="tutorial-title">
            {step === 0 ? "Vamos deixar tudo pronto." : null}
            {step === 1 ? "Conta simples." : null}
            {step === 2 ? "HBX aprende seu alvo." : null}
            {step === 3 ? "Buscar, filtrar, aprovar." : null}
            {step === 4 ? "Trabalhe os cards." : null}
            {step === 5 ? "Tudo pronto." : null}
          </h1>
          <p>
            {step === 0 ? "Conta, Perfil, Radar e Vendas. Leva menos de 2 minutos." : null}
            {step === 2 ? "Defina o que vender, para quem e o que evitar." : null}
            {step === 3 ? "O Radar encontra cards e separa o que vale a pena." : null}
            {step === 4 ? "Chame, faça retorno e avance no funil." : null}
            {step === 5 ? "Suas configurações foram salvas e o Radar já ficou pronto para Vendas." : null}
          </p>
        </header>

        <div key={step} className={styles.stepBody} data-step={step} data-direction={direction}>
          {stepContent}
        </div>

        {error ? <p className={styles.errorMessage}>{error}</p> : null}

        <footer className={styles.actions}>
          {step === 5 ? (
            <>
              <button type="button" className={styles.secondaryButton} onClick={restartTutorial} disabled={busy}>
                <span>N</span>
                Reiniciar
              </button>
              <button type="button" className={styles.primaryButton} onClick={() => void finish()} disabled={busy}>
                {busy ? "Preparando..." : "Seguir para Vendas"}
                <b>›</b>
              </button>
            </>
          ) : (
            <>
              <button type="button" className={styles.secondaryButton} onClick={back} disabled={busy}>
                <span>N</span>
                Voltar
              </button>
              <button type="button" className={styles.primaryButton} onClick={() => void next()} disabled={busy}>
                {busy ? "Salvando..." : "Próximo"}
                <b>›</b>
              </button>
            </>
          )}
        </footer>
        {activePicker ? (
          <PickerSheet
            title={activePicker.title}
            value={activePicker.value}
            options={activePicker.options}
            allowCustom={activePicker.allowCustom}
            onSelect={selectPickerValue}
            onClose={() => setPicker(null)}
          />
        ) : null}
        {picker === "segment" ? (
          <SegmentPickerSheet
            value={profile.segment}
            availableSegments={segmentOptions.map((option) => option.value)}
            onChange={(segment) => updateProfile({ segment })}
            onClose={() => setPicker(null)}
          />
        ) : null}
      </section>
    </main>
  );
}
