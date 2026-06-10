"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BRAZIL_CITIES_BY_STATE, BRAZIL_STATES } from "@/lib/brazil-locations";
import { HBX_SEGMENT_SUGGESTIONS } from "@/lib/hbx-segment-suggestions";
import type {
  CompanyModule,
  TeamPolicy,
  TeamPolicyLimit,
  TeamPolicyLimitMode,
  TeamPolicyPatch,
  UserItem,
} from "./types";

type TeamPolicyModalProps = {
  user: UserItem | null;
  policy: TeamPolicy | null;
  enabledModules: CompanyModule[];
  hbxReferrers: UserItem[];
  loading?: boolean;
  saving?: boolean;
  onClose: () => void;
  onSave: (userId: number, patch: TeamPolicyPatch) => void | Promise<void>;
  onApplyBatch: (sourcePolicy: TeamPolicy, patch: TeamPolicyPatch) => void;
};

type LimitKey = keyof TeamPolicy["limits"];
type LimitDraft = Record<LimitKey, { mode: TeamPolicyLimitMode; value: string }>;
type SelectionPickerKey = "allowedSegments" | "blockedSegments" | "allowedCities" | "allowedStates";
type SelectionPickerOption = { value: string; label: string; meta?: string };
type SellerVisibilityKey = keyof NonNullable<TeamPolicyPatch["visibility"]>;
type SystemVisibilityKey = Exclude<keyof TeamPolicy["visibility"], SellerVisibilityKey>;

const LIMIT_LABELS: Record<LimitKey, string> = {
  enrichmentDaily: "Enriquecimentos por dia",
  cardDeliveryDaily: "Cards/Vendas por dia",
  activeCards: "Cards ativos",
  monthlyCards: "Cards por mês",
  vendasPullQuantity: "Puxar para Vendas",
};

const CHANNEL_LABELS: Array<[keyof TeamPolicy["radar"]["requiredChannels"], string]> = [
  ["whatsapp", "WhatsApp"],
  ["instagram", "Instagram"],
  ["facebook", "Facebook"],
  ["email", "E-mail"],
  ["website", "Site"],
];

const SELLER_VISIBILITY_LABELS: Array<[SellerVisibilityKey, string]> = [
  ["sellerCanViewOwnPolicy", "Ver própria política"],
  ["sellerCanViewCommission", "Ver comissão"],
  ["sellerCanViewSellerNetwork", "Ver indicações"],
  ["sellerCanViewLimits", "Ver limites"],
];

const SYSTEM_VISIBILITY_LABELS: Array<[SystemVisibilityKey, string]> = [
  ["adminCanEditLegacyFields", "Admin edita legado"],
  ["masterCanUseUnlimited", "Master usa ilimitado"],
];

const EMPTY_LIMIT_DRAFT: LimitDraft = {
  enrichmentDaily: { mode: "inherit", value: "" },
  cardDeliveryDaily: { mode: "inherit", value: "" },
  activeCards: { mode: "inherit", value: "" },
  monthlyCards: { mode: "inherit", value: "" },
  vendasPullQuantity: { mode: "inherit", value: "" },
};

const EMPTY_VISIBILITY_DRAFT: NonNullable<TeamPolicyPatch["visibility"]> = {
  sellerCanViewOwnPolicy: true,
  sellerCanViewCommission: true,
  sellerCanViewSellerNetwork: true,
  sellerCanViewLimits: true,
};

const MAX_SELECTION_PREVIEW = 5;
const MAX_PICKER_OPTIONS = 180;

const SEGMENT_OPTIONS: SelectionPickerOption[] = HBX_SEGMENT_SUGGESTIONS.map((segment) => ({
  value: segment,
  label: segment,
}));

const STATE_OPTIONS: SelectionPickerOption[] = BRAZIL_STATES.map((state) => ({
  value: state.uf,
  label: state.name,
  meta: state.uf,
}));

const CITY_OPTIONS: SelectionPickerOption[] = BRAZIL_STATES.flatMap((state) =>
  (BRAZIL_CITIES_BY_STATE[state.uf] || []).map((city) => ({
    value: `${city}/${state.uf}`,
    label: city,
    meta: state.uf,
  })),
);

const SELECTION_PICKER_CONFIG: Record<
  SelectionPickerKey,
  { title: string; label: string; placeholder: string; emptyLabel: string; customEntry?: boolean }
> = {
  allowedSegments: {
    title: "Selecionar segmentos permitidos",
    label: "Permitidos",
    placeholder: "Buscar ou adicionar segmento",
    emptyLabel: "Nenhum segmento permitido",
    customEntry: true,
  },
  blockedSegments: {
    title: "Selecionar segmentos bloqueados",
    label: "Bloqueados",
    placeholder: "Buscar ou adicionar segmento",
    emptyLabel: "Nenhum segmento bloqueado",
    customEntry: true,
  },
  allowedCities: {
    title: "Selecionar cidades",
    label: "Cidades",
    placeholder: "Buscar cidade ou UF",
    emptyLabel: "Nenhuma cidade selecionada",
  },
  allowedStates: {
    title: "Selecionar estados",
    label: "Estados",
    placeholder: "Buscar estado ou UF",
    emptyLabel: "Nenhum estado selecionado",
  },
};

function normalizeRole(role?: string | null, isSystemMaster?: boolean | null) {
  const normalized = String(role || "").toUpperCase();
  if (isSystemMaster || normalized === "USERMASTER") return "USERMASTER";
  return normalized === "ADMIN" ? "ADMIN" : "USER";
}

function userLabel(user?: Pick<UserItem, "id" | "name" | "username" | "email"> | null) {
  if (!user) return "Usuário";
  return user.name || user.username || user.email || `Usuário #${user.id}`;
}

function moduleLabel(module: Pick<CompanyModule, "key" | "name">) {
  const key = String(module.key || "").trim().toLowerCase();
  if (key === "webscraping") return "Radar";
  if (key === "cadastro") return "Clientes";
  return module.name || module.key;
}

function formatLimit(limit?: TeamPolicyLimit | null) {
  if (!limit) return "-";
  if (limit.mode === "unlimited") return "Ilimitado";
  if (limit.mode === "blocked") return "Bloqueado";
  if (limit.mode === "inherit") return "Herdar";
  return String(limit.value ?? 0);
}

function numberDraft(value?: number | null) {
  return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function parsePercent(value: string, fallback = 0) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return fallback;
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return null;
  return Math.min(100, Math.max(0, Math.round(numeric * 100) / 100));
}

function parseInteger(value: string, min: number, max: number) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const numeric = Math.trunc(Number(normalized));
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) return null;
  return numeric;
}

function splitTextList(value: string) {
  return value
    .split(/[\n,;]+/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 100);
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeListKey(value: string) {
  return normalizeSearch(value).replace(/\s+/g, " ");
}

function uniqueTextValues(values: string[], max = 100) {
  const seen = new Set<string>();
  const uniqueValues: string[] = [];
  values.forEach((value) => {
    const trimmed = value.trim();
    const key = normalizeListKey(trimmed);
    if (!trimmed || seen.has(key)) return;
    seen.add(key);
    uniqueValues.push(trimmed);
  });
  return uniqueValues.slice(0, max);
}

function listToText(values: string[], max = 100) {
  return uniqueTextValues(values, max).join("\n");
}

function formatSelectionSummary(value: string, emptyLabel: string) {
  const values = splitTextList(value);
  if (!values.length) return emptyLabel;
  return `${values.length} ${values.length === 1 ? "selecionado" : "selecionados"}`;
}

function citiesToText(cities: TeamPolicy["radar"]["allowedCities"]) {
  return cities.map((item) => `${item.city}${item.state ? `/${item.state}` : ""}`).join("\n");
}

function parseCityLine(line: string) {
  const slashIndex = line.lastIndexOf("/");
  if (slashIndex > 0) {
    const city = line.slice(0, slashIndex).trim();
    const state = line.slice(slashIndex + 1).trim().toUpperCase().slice(0, 2);
    return { city: city || line, state: state || null };
  }

  const dashMatch = line.match(/^(.+?)\s+-\s*([a-zA-Z]{2})$/);
  if (dashMatch) {
    return {
      city: dashMatch[1].trim(),
      state: dashMatch[2].trim().toUpperCase().slice(0, 2),
    };
  }

  return { city: line, state: null };
}

function parseCities(value: string) {
  return value
    .split(/\n+/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseCityLine)
    .filter((item) => item.city)
    .slice(0, 250);
}

function buildLimitDraft(policy: TeamPolicy | null): LimitDraft {
  if (!policy) return EMPTY_LIMIT_DRAFT;
  return (Object.keys(EMPTY_LIMIT_DRAFT) as LimitKey[]).reduce<LimitDraft>((accumulator, key) => {
    const limit = policy.limits[key];
    accumulator[key] = {
      mode: limit.mode,
      value: limit.value == null ? "" : String(limit.value),
    };
    return accumulator;
  }, { ...EMPTY_LIMIT_DRAFT });
}

function buildModuleDraft(policy: TeamPolicy | null, enabledModules: CompanyModule[]) {
  const draft: Record<string, boolean> = {};
  const policyModules = new Map((policy?.modules || []).map((moduleItem) => [moduleItem.key, moduleItem]));
  enabledModules.forEach((moduleItem) => {
    const policyModule = policyModules.get(moduleItem.key);
    draft[moduleItem.key] = policyModule ? Boolean(policyModule.allowed) : Boolean(moduleItem.companyEnabled);
  });
  (policy?.modules || []).forEach((moduleItem) => {
    if (!(moduleItem.key in draft)) draft[moduleItem.key] = Boolean(moduleItem.allowed);
  });
  return draft;
}

function buildAccessDraft(policy: TeamPolicy | null) {
  return { ...(policy?.effectiveAccessMap || policy?.access || {}) };
}

function buildVisibilityDraft(policy: TeamPolicy | null): NonNullable<TeamPolicyPatch["visibility"]> {
  if (!policy) return EMPTY_VISIBILITY_DRAFT;
  return {
    sellerCanViewOwnPolicy: Boolean(policy.visibility.sellerCanViewOwnPolicy),
    sellerCanViewCommission: Boolean(policy.visibility.sellerCanViewCommission),
    sellerCanViewSellerNetwork: Boolean(policy.visibility.sellerCanViewSellerNetwork),
    sellerCanViewLimits: Boolean(policy.visibility.sellerCanViewLimits),
  };
}

function referrerOptionLabel(user: UserItem) {
  return `${userLabel(user)}${user.email ? ` · ${user.email}` : ""}`;
}

export default function TeamPolicyModal({
  user,
  policy,
  enabledModules,
  hbxReferrers,
  loading = false,
  saving = false,
  onClose,
  onSave,
  onApplyBatch,
}: TeamPolicyModalProps) {
  const [moduleDraft, setModuleDraft] = useState<Record<string, boolean>>({});
  const [accessDraft, setAccessDraft] = useState<Record<string, boolean>>({});
  const [selectedAccessPresetKey, setSelectedAccessPresetKey] = useState("");
  const [commissionPercent, setCommissionPercent] = useState("0");
  const [commissionDueBusinessDays, setCommissionDueBusinessDays] = useState("3");
  const [canRecruitSellers, setCanRecruitSellers] = useState(false);
  const [sellerReferralCommissionPercent, setSellerReferralCommissionPercent] = useState("0");
  const [referredByUserId, setReferredByUserId] = useState("");
  const [referredByCommissionPercentSnapshot, setReferredByCommissionPercentSnapshot] = useState("0");
  const [limits, setLimits] = useState<LimitDraft>(EMPTY_LIMIT_DRAFT);
  const [allowedSegments, setAllowedSegments] = useState("");
  const [blockedSegments, setBlockedSegments] = useState("");
  const [allowedCities, setAllowedCities] = useState("");
  const [allowedStates, setAllowedStates] = useState("");
  const [requiresLocation, setRequiresLocation] = useState(false);
  const [visibilityDraft, setVisibilityDraft] = useState<NonNullable<TeamPolicyPatch["visibility"]>>(EMPTY_VISIBILITY_DRAFT);
  const [requiredChannels, setRequiredChannels] = useState<TeamPolicy["radar"]["requiredChannels"]>({
    whatsapp: false,
    instagram: false,
    facebook: false,
    email: false,
    website: false,
  });
  const [localError, setLocalError] = useState<string | null>(null);
  const [selectionPicker, setSelectionPicker] = useState<SelectionPickerKey | null>(null);
  const [selectionQuery, setSelectionQuery] = useState("");

  const open = Boolean(user);
  const hydratedPolicyUserIdRef = useRef<number | null>(null);
  const role = normalizeRole(user?.role, user?.isSystemMaster);
  const readOnly = role === "USERMASTER" || Boolean(user?.isSystemMaster);
  const canUseUnlimited = Boolean(policy?.visibility.masterCanUseUnlimited);
  const referrerOptions = useMemo(
    () => hbxReferrers.filter((item) => item.id !== user?.id),
    [hbxReferrers, user?.id],
  );

  useEffect(() => {
    if (!open) {
      hydratedPolicyUserIdRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!selectionPicker) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectionPicker(null);
        setSelectionQuery("");
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectionPicker]);

  useEffect(() => {
    if (!policy || loading) return;
    const policyUserId = Number(policy.subject.id || 0) || null;
    if (!policyUserId || hydratedPolicyUserIdRef.current === policyUserId) return;
    hydratedPolicyUserIdRef.current = policyUserId;
    const timeoutId = window.setTimeout(() => {
      setModuleDraft(buildModuleDraft(policy, enabledModules));
      setAccessDraft(buildAccessDraft(policy));
      setSelectedAccessPresetKey("");
      setCommissionPercent(numberDraft(policy.compensation.commissionPercent));
      setCommissionDueBusinessDays(String(policy.compensation.commissionDueBusinessDays || 3));
      setCanRecruitSellers(Boolean(policy.sellerNetwork.canRecruitSellers));
      setSellerReferralCommissionPercent(numberDraft(policy.sellerNetwork.sellerReferralCommissionPercent));
      setReferredByUserId(policy.sellerNetwork.referredByUserId ? String(policy.sellerNetwork.referredByUserId) : "");
      setReferredByCommissionPercentSnapshot(numberDraft(policy.sellerNetwork.referredByCommissionPercentSnapshot));
      setLimits(buildLimitDraft(policy));
      setAllowedSegments(policy.radar.allowedSegments.join("\n"));
      setBlockedSegments(policy.radar.blockedSegments.join("\n"));
      setAllowedCities(citiesToText(policy.radar.allowedCities));
      setAllowedStates(policy.radar.allowedStates.join("\n"));
      setRequiresLocation(Boolean(policy.radar.requiresLocation));
      setVisibilityDraft(buildVisibilityDraft(policy));
      setRequiredChannels(policy.radar.requiredChannels);
      setLocalError(null);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [enabledModules, loading, open, policy]);

  const patch = useMemo<TeamPolicyPatch | null>(() => {
    if (!policy) return null;
    // Campo numérico vazio/inválido NÃO pode anular o patch inteiro (isso
    // travava o "Salvar política" sem nenhum aviso): cai no valor vigente.
    const parsedCommission = parsePercent(commissionPercent) ?? parsePercent(numberDraft(policy.compensation.commissionPercent), 0) ?? 0;
    const parsedReferral = parsePercent(sellerReferralCommissionPercent) ?? 0;
    const parsedSnapshot = parsePercent(referredByCommissionPercentSnapshot) ?? 0;
    const parsedDueDays = parseInteger(commissionDueBusinessDays, 0, 30) ?? Math.min(30, Math.max(0, Math.trunc(Number(policy.compensation.commissionDueBusinessDays || 3) || 3)));

    const limitPatch: NonNullable<TeamPolicyPatch["limits"]> = {};
    for (const key of Object.keys(limits) as LimitKey[]) {
      const limit = limits[key];
      if (limit.mode === "limited") {
        const parsedLimit = parseInteger(limit.value, 0, 500);
        if (parsedLimit === null) {
          // valor em digitação/inválido: herda em vez de travar o salvar
          limitPatch[key] = { mode: "inherit", value: null };
          continue;
        }
        limitPatch[key] = { mode: "limited", value: parsedLimit };
      } else if (limit.mode === "unlimited") {
        limitPatch[key] = { mode: "unlimited", value: "unlimited" };
      } else if (limit.mode === "blocked") {
        limitPatch[key] = { mode: "blocked", value: 0 };
      } else {
        limitPatch[key] = { mode: "inherit", value: null };
      }
    }

    return {
      modules: Object.entries(moduleDraft).map(([key, allowed]) => ({ key, allowed })),
      access: accessDraft,
      ...(selectedAccessPresetKey ? { accessPresetKey: selectedAccessPresetKey } : {}),
      compensation: {
        commissionPercent: parsedCommission,
        commissionDueBusinessDays: parsedDueDays,
      },
      sellerNetwork: {
        canRecruitSellers,
        sellerReferralCommissionPercent: parsedReferral,
        referredByUserId: referredByUserId ? Number(referredByUserId) : null,
        referredByCommissionPercentSnapshot: parsedSnapshot,
      },
      limits: limitPatch,
      radar: {
        allowedSegments: splitTextList(allowedSegments),
        blockedSegments: splitTextList(blockedSegments),
        allowedCities: parseCities(allowedCities),
        allowedStates: splitTextList(allowedStates).map((item) => item.toUpperCase().slice(0, 2)),
        requiresLocation,
        requiredChannels,
      },
      visibility: visibilityDraft,
    };
  }, [
    allowedCities,
    allowedSegments,
    allowedStates,
    accessDraft,
    blockedSegments,
    canRecruitSellers,
    commissionDueBusinessDays,
    commissionPercent,
    limits,
    moduleDraft,
    policy,
    referredByCommissionPercentSnapshot,
    referredByUserId,
    requiredChannels,
    requiresLocation,
    sellerReferralCommissionPercent,
    selectedAccessPresetKey,
    visibilityDraft,
  ]);

  const selectedValues = useMemo(() => {
    if (!selectionPicker) return [];
    if (selectionPicker === "allowedSegments") return splitTextList(allowedSegments);
    if (selectionPicker === "blockedSegments") return splitTextList(blockedSegments);
    if (selectionPicker === "allowedCities") return splitTextList(allowedCities);
    return splitTextList(allowedStates).map((item) => item.toUpperCase().slice(0, 2));
  }, [allowedCities, allowedSegments, allowedStates, blockedSegments, selectionPicker]);

  const selectedValueSet = useMemo(() => new Set(selectedValues.map(normalizeListKey)), [selectedValues]);

  const pickerOptions = useMemo(() => {
    if (selectionPicker === "allowedSegments" || selectionPicker === "blockedSegments") return SEGMENT_OPTIONS;
    if (selectionPicker === "allowedCities") return CITY_OPTIONS;
    if (selectionPicker === "allowedStates") return STATE_OPTIONS;
    return [];
  }, [selectionPicker]);

  const visiblePickerOptions = useMemo(() => {
    const query = normalizeSearch(selectionQuery);
    const filteredOptions = query
      ? pickerOptions.filter((option) => normalizeSearch(`${option.label} ${option.meta || ""} ${option.value}`).includes(query))
      : pickerOptions;
    return filteredOptions.slice(0, selectionPicker === "allowedCities" ? MAX_PICKER_OPTIONS : 120);
  }, [pickerOptions, selectionPicker, selectionQuery]);

  const pickerConfig = selectionPicker ? SELECTION_PICKER_CONFIG[selectionPicker] : null;
  const customQuery = selectionQuery.trim();
  const canAddCustomSelection =
    Boolean(pickerConfig?.customEntry && customQuery) &&
    !selectedValueSet.has(normalizeListKey(customQuery)) &&
    !pickerOptions.some((option) => normalizeListKey(option.value) === normalizeListKey(customQuery));

  if (!open || typeof document === "undefined") return null;

  const moduleRows = enabledModules.length
    ? enabledModules
    : (policy?.modules || []).map((moduleItem) => ({
        key: moduleItem.key,
        name: moduleItem.name || moduleItem.key,
        companyEnabled: Boolean(moduleItem.accessible ?? moduleItem.allowed),
      }));
  const accessGroups = policy?.accessGroups || [];
  const accessCatalog = policy?.accessCatalog || [];
  const accessPresets = policy?.accessPresets || [];
  const missingAccessSet = new Set((policy?.missingBackendEnforcement || []).map((item) => item.key));
  const accessGroupsToRender = accessGroups.length
    ? accessGroups
    : Array.from(new Set(accessCatalog.map((item) => item.group))).map((group) => ({
        key: group,
        label: group,
        description: "",
      }));

  function handleSave() {
    if (!user || !policy || readOnly) return;
    if (!patch) {
      setLocalError("Revise percentuais, D+ e limites numéricos antes de salvar.");
      return;
    }
    setLocalError(null);
    void onSave(user.id, patch);
  }

  function handleBatch() {
    if (!policy || !patch) {
      setLocalError("Revise a política antes de aplicar em lote.");
      return;
    }
    setLocalError(null);
    onApplyBatch(policy, patch);
  }

  function applyAccessPreset(presetKey: string) {
    const preset = accessPresets.find((item) => item.key === presetKey);
    if (!preset) return;
    setSelectedAccessPresetKey(preset.key);
    setAccessDraft({ ...preset.access });
    if (preset.limits) {
      setLimits((current) => {
        const next = { ...current };
        for (const [key, limit] of Object.entries(preset.limits || {})) {
          if (!limit || !(key in next)) continue;
          next[key as LimitKey] = {
            mode: limit.mode,
            value: limit.value == null ? "" : String(limit.value),
          };
        }
        return next;
      });
    }
  }

  function openSelectionPicker(key: SelectionPickerKey) {
    setSelectionQuery("");
    setSelectionPicker(key);
  }

  function closeSelectionPicker() {
    setSelectionPicker(null);
    setSelectionQuery("");
  }

  function handleCloseModal() {
    closeSelectionPicker();
    onClose();
  }

  function currentSelectionValues(key: SelectionPickerKey) {
    if (key === "allowedSegments") return splitTextList(allowedSegments);
    if (key === "blockedSegments") return splitTextList(blockedSegments);
    if (key === "allowedCities") return splitTextList(allowedCities);
    return splitTextList(allowedStates).map((item) => item.toUpperCase().slice(0, 2));
  }

  function updateSelectionValues(key: SelectionPickerKey, values: string[]) {
    const max = key === "allowedCities" ? 250 : 100;
    const nextText = listToText(values, max);
    if (key === "allowedSegments") setAllowedSegments(nextText);
    if (key === "blockedSegments") setBlockedSegments(nextText);
    if (key === "allowedCities") setAllowedCities(nextText);
    if (key === "allowedStates") setAllowedStates(nextText);
  }

  function toggleSelectionValue(key: SelectionPickerKey, value: string) {
    const currentValues = currentSelectionValues(key);
    const valueKey = normalizeListKey(value);
    const exists = currentValues.some((item) => normalizeListKey(item) === valueKey);
    const nextValues = exists ? currentValues.filter((item) => normalizeListKey(item) !== valueKey) : [...currentValues, value];
    updateSelectionValues(key, nextValues);
  }

  function renderSelectionField(key: SelectionPickerKey, label: string, value: string, emptyLabel: string) {
    const values = splitTextList(value);
    const disabled = readOnly || saving;
    return (
      <div className="grid gap-1 text-sm">
        <span className="font-medium">{label}</span>
        <button
          type="button"
          disabled={disabled}
          aria-haspopup="dialog"
          onClick={() => openSelectionPicker(key)}
          className={`field flex min-h-28 flex-col items-start justify-between gap-3 text-left ${disabled ? "" : "cursor-pointer hover:border-[var(--primary)]"}`}
        >
          <span className="flex w-full items-center justify-between gap-2">
            <strong className="truncate text-sm font-semibold">{formatSelectionSummary(value, emptyLabel)}</strong>
            <span className="badge shrink-0">{values.length || "Livre"}</span>
          </span>
          {values.length ? (
            <span className="flex w-full flex-wrap gap-1.5">
              {values.slice(0, MAX_SELECTION_PREVIEW).map((item) => (
                <span key={item} className="max-w-full truncate rounded-full border border-[var(--line)] bg-[var(--surface-soft)] px-2 py-1 text-xs">
                  {item}
                </span>
              ))}
              {values.length > MAX_SELECTION_PREVIEW ? (
                <span className="rounded-full border border-[var(--line)] bg-[var(--surface-soft)] px-2 py-1 text-xs">
                  +{values.length - MAX_SELECTION_PREVIEW}
                </span>
              ) : null}
            </span>
          ) : (
            <span className="text-sm text-muted">Livre</span>
          )}
        </button>
      </div>
    );
  }

  function renderVisibilityToggle(key: SellerVisibilityKey, label: string) {
    const active = Boolean(visibilityDraft[key]);
    const disabled = readOnly || saving;
    return (
      <div className="rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-3 text-sm">
        <span className="block text-xs font-semibold text-muted">{label}</span>
        <div className="mt-2 grid grid-cols-2 gap-1">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setVisibilityDraft((current) => ({ ...current, [key]: true }))}
            className={`btn btn-sm ${active ? "btn-primary" : "btn-secondary"}`}
            aria-pressed={active}
          >
            Sim
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setVisibilityDraft((current) => ({ ...current, [key]: false }))}
            className={`btn btn-sm ${!active ? "btn-primary" : "btn-secondary"}`}
            aria-pressed={!active}
          >
            Não
          </button>
        </div>
      </div>
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/50 p-3 md:p-6" role="presentation">
      <section
        className="panel flex max-h-[calc(100dvh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-[20px]"
        role="dialog"
        aria-modal="true"
        aria-label="Política do vendedor"
      >
        <header className="flex flex-col gap-3 border-b border-[var(--line)] p-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <span className="badge badge-brand">Política da equipe</span>
            <h2 className="mt-2 truncate text-xl font-semibold">{userLabel(user)}</h2>
            <p className="mt-1 text-sm text-muted">
              {user?.email || user?.username || `Usuário #${user?.id}`} · {role === "USER" ? "Vendedor" : role}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {policy ? <span className="badge">Fonte: {policy.persistence.mode === "legacy_derived" ? "legado" : "persistida"}</span> : null}
            {readOnly ? <span className="badge badge-danger">MASTER protegido</span> : null}
            <button type="button" onClick={handleCloseModal} className="btn btn-secondary btn-sm" aria-label="Fechar política">
              Fechar
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-auto p-4 md:p-5">
          {loading || !policy ? (
            <div className="rounded-[12px] border border-[var(--line)] bg-[var(--surface-soft)] p-4 text-sm text-muted">
              Carregando política...
            </div>
          ) : (
            <div className="grid gap-4">
              {localError ? (
                <div className="rounded-[12px] border border-[var(--danger)] bg-[var(--surface-soft)] p-3 text-sm text-danger">
                  {localError}
                </div>
              ) : null}

              <section className="rounded-[12px] border border-[var(--line)] bg-[var(--surface-soft)] p-4">
                <div className="flex flex-col gap-1">
                  <h3 className="font-semibold">Módulos</h3>
                  <p className="text-sm text-muted">Acesso real ao menu e aos endpoints protegidos por módulo.</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {moduleRows.map((moduleItem) => {
                    const active = Boolean(moduleDraft[moduleItem.key]);
                    return (
                      <button
                        key={moduleItem.key}
                        type="button"
                        disabled={readOnly || saving || !moduleItem.companyEnabled}
                        onClick={() => setModuleDraft((draft) => ({ ...draft, [moduleItem.key]: !active }))}
                        className={`btn btn-sm ${active ? "btn-primary" : "btn-secondary"}`}
                        title={!moduleItem.companyEnabled ? "Módulo fora do plano da empresa" : "Alternar módulo"}
                      >
                        {moduleLabel(moduleItem)}: {active ? "ON" : "OFF"}
                      </button>
                    );
                  })}
                </div>
              </section>

              {accessCatalog.length ? (
                <section className="rounded-[12px] border border-[var(--line)] bg-[var(--surface-soft)] p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h3 className="font-semibold">Acessos</h3>
                      <p className="mt-1 text-sm text-muted">Escolhas operacionais do Gerencial para este usuário.</p>
                    </div>
                    {accessPresets.length ? (
                      <label className="grid min-w-[260px] gap-1 text-sm">
                        <span className="font-medium">Preset</span>
                        <select
                          value={selectedAccessPresetKey}
                          disabled={readOnly || saving}
                          onChange={(event) => applyAccessPreset(event.target.value)}
                          className="field"
                        >
                          <option value="">Personalizado</option>
                          {accessPresets.map((preset) => (
                            <option key={preset.key} value={preset.key}>
                              {preset.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </div>
                  <div className="mt-4 grid gap-4 xl:grid-cols-2">
                    {accessGroupsToRender.map((group) => {
                      const groupItems = accessCatalog.filter((item) => item.group === group.key);
                      if (!groupItems.length) return null;
                      return (
                        <div key={group.key} className="rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-3">
                          <div className="mb-3">
                            <h4 className="text-sm font-semibold">{group.label}</h4>
                            {group.description ? <p className="mt-1 text-xs text-muted">{group.description}</p> : null}
                          </div>
                          <div className="grid gap-2">
                            {groupItems.map((item) => {
                              const active = Boolean(accessDraft[item.key]);
                              const pendingBackend = missingAccessSet.has(item.key);
                              return (
                                <label
                                  key={item.key}
                                  className="flex items-start gap-3 rounded-[10px] border border-[var(--line)] bg-[var(--surface-soft)] p-3 text-sm"
                                >
                                  <input
                                    type="checkbox"
                                    checked={active}
                                    disabled={readOnly || saving}
                                    onChange={(event) =>
                                      setAccessDraft((current) => ({
                                        ...current,
                                        [item.key]: event.target.checked,
                                      }))
                                    }
                                    className="mt-1"
                                  />
                                  <span className="min-w-0 flex-1">
                                    <span className="flex flex-wrap items-center gap-2">
                                      <strong>{item.label}</strong>
                                      <span className={`badge ${item.riskLevel === "critical" ? "badge-danger" : ""}`}>
                                        {item.riskLevel === "critical" ? "Crítico" : item.riskLevel === "high" ? "Alto" : item.riskLevel === "medium" ? "Médio" : "Baixo"}
                                      </span>
                                      <span className="badge">{pendingBackend ? "Pendente backend" : "Backend"}</span>
                                    </span>
                                    <span className="mt-1 block text-xs text-muted">{item.description}</span>
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              <section className="grid gap-4 rounded-[12px] border border-[var(--line)] bg-[var(--surface-soft)] p-4 lg:grid-cols-2">
                <div>
                  <h3 className="font-semibold">Comissão</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium">Comissão %</span>
                      <input
                        value={commissionPercent}
                        disabled={readOnly || saving}
                        inputMode="decimal"
                        onChange={(event) => setCommissionPercent(event.target.value)}
                        className="field"
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium">D+ úteis</span>
                      <input
                        value={commissionDueBusinessDays}
                        disabled={readOnly || saving}
                        inputMode="numeric"
                        onChange={(event) => setCommissionDueBusinessDays(event.target.value)}
                        className="field"
                      />
                    </label>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold">Herança e indicações</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="flex items-center gap-2 rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-3 text-sm">
                      <input
                        type="checkbox"
                        checked={canRecruitSellers}
                        disabled={readOnly || saving || !policy.sellerNetwork.isSellerNetwork}
                        onChange={(event) => setCanRecruitSellers(event.target.checked)}
                      />
                      <span className="font-medium">Pode indicar vendedores</span>
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium">Herança %</span>
                      <input
                        value={sellerReferralCommissionPercent}
                        disabled={readOnly || saving || !policy.sellerNetwork.isSellerNetwork}
                        inputMode="decimal"
                        onChange={(event) => setSellerReferralCommissionPercent(event.target.value)}
                        className="field"
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium">Indicado por</span>
                      <select
                        value={referredByUserId}
                        disabled={readOnly || saving || !policy.sellerNetwork.isSellerNetwork}
                        onChange={(event) => setReferredByUserId(event.target.value)}
                        className="field"
                      >
                        <option value="">Direto</option>
                        {policy.sellerNetwork.referredByUser &&
                        !referrerOptions.some((item) => item.id === policy.sellerNetwork.referredByUser?.id) ? (
                          <option value={policy.sellerNetwork.referredByUser.id}>
                            {userLabel(policy.sellerNetwork.referredByUser)}
                          </option>
                        ) : null}
                        {referrerOptions.map((referrer) => (
                          <option key={referrer.id} value={referrer.id}>
                            {referrerOptionLabel(referrer)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium">Herança do indicador</span>
                      <input
                        value={referredByCommissionPercentSnapshot}
                        disabled={readOnly || saving || !policy.sellerNetwork.isSellerNetwork}
                        inputMode="decimal"
                        onChange={(event) => setReferredByCommissionPercentSnapshot(event.target.value)}
                        className="field"
                      />
                    </label>
                  </div>
                </div>
              </section>

              <section className="rounded-[12px] border border-[var(--line)] bg-[var(--surface-soft)] p-4">
                <h3 className="font-semibold">Enriquecimentos e Cards/Vendas</h3>
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {(Object.keys(LIMIT_LABELS) as LimitKey[]).map((key) => {
                    const sourceLimit = policy.limits[key];
                    const draft = limits[key];
                    const modeOptions: TeamPolicyLimitMode[] = canUseUnlimited
                      ? ["inherit", "limited", "unlimited", "blocked"]
                      : ["inherit", "limited", "blocked"];
                    return (
                      <div key={key} className="rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-3">
                        <div className="flex items-start justify-between gap-2">
                          <label className="grid flex-1 gap-1 text-sm">
                            <span className="font-medium">{LIMIT_LABELS[key]}</span>
                            <select
                              value={draft.mode}
                              disabled={readOnly || saving}
                              onChange={(event) => {
                                const mode = event.target.value as TeamPolicyLimitMode;
                                setLimits((current) => ({ ...current, [key]: { ...current[key], mode } }));
                              }}
                              className="field"
                            >
                              {modeOptions.map((mode) => (
                                <option key={mode} value={mode}>
                                  {mode === "inherit" ? "Herdar" : mode === "limited" ? "Limitar" : mode === "unlimited" ? "Ilimitado" : "Bloquear"}
                                </option>
                              ))}
                            </select>
                          </label>
                          <span className="badge">{formatLimit(sourceLimit)}</span>
                        </div>
                        <input
                          value={draft.value}
                          disabled={readOnly || saving || draft.mode !== "limited"}
                          inputMode="numeric"
                          onChange={(event) => setLimits((current) => ({ ...current, [key]: { ...current[key], value: event.target.value } }))}
                          className="field mt-2"
                          placeholder="Quantidade"
                        />
                        <p className="mt-2 text-xs text-muted">
                          Usado: {sourceLimit.used ?? "-"} · restante: {sourceLimit.remaining ?? "-"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="grid gap-4 rounded-[12px] border border-[var(--line)] bg-[var(--surface-soft)] p-4 xl:grid-cols-2">
                <div>
                  <h3 className="font-semibold">Segmentos</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {renderSelectionField("allowedSegments", "Permitidos", allowedSegments, "Nenhum segmento permitido")}
                    {renderSelectionField("blockedSegments", "Bloqueados", blockedSegments, "Nenhum segmento bloqueado")}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold">Cidades/localização</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {renderSelectionField("allowedCities", "Cidades", allowedCities, "Nenhuma cidade selecionada")}
                    <div className="grid gap-3">
                      {renderSelectionField("allowedStates", "Estados", allowedStates, "Nenhum estado selecionado")}
                      <label className="flex items-center gap-2 rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-3 text-sm">
                        <input
                          type="checkbox"
                          checked={requiresLocation}
                          disabled={readOnly || saving}
                          onChange={(event) => setRequiresLocation(event.target.checked)}
                        />
                        <span className="font-medium">Exigir localização do vendedor no Radar</span>
                      </label>
                    </div>
                  </div>
                </div>
              </section>

              <section className="grid gap-4 rounded-[12px] border border-[var(--line)] bg-[var(--surface-soft)] p-4 xl:grid-cols-2">
                <div>
                  <h3 className="font-semibold">Filtros forçados de Radar</h3>
                  <p className="mt-1 text-sm text-muted">Canais exigidos antes do card entrar em Vendas.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {CHANNEL_LABELS.map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2 rounded-[12px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={Boolean(requiredChannels[key])}
                          disabled={readOnly || saving}
                          onChange={(event) => setRequiredChannels((current) => ({ ...current, [key]: event.target.checked }))}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold">Visibilidade</h3>
                  <div className="mt-3 grid gap-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      {SELLER_VISIBILITY_LABELS.map(([key, label]) => (
                        <div key={key}>{renderVisibilityToggle(key, label)}</div>
                      ))}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {SYSTEM_VISIBILITY_LABELS.map(([key, label]) => (
                        <div key={key} className="rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-3 text-sm opacity-80">
                          <span className="block text-xs font-semibold text-muted">{label}</span>
                          <strong className="mt-1 block">{policy.visibility[key] ? "Sim" : "Não"}</strong>
                          <span className="mt-1 block text-xs text-muted">Sistema</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>

        <footer className="flex flex-col gap-2 border-t border-[var(--line)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-muted">
            {readOnly ? "USERMASTER não recebe aplicação por este fluxo." : "Salvar atualiza a política efetiva do usuário."}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={handleBatch} disabled={!policy || !patch || saving || loading || readOnly} className="btn btn-secondary btn-sm">
              Aplicar em lote
            </button>
            <button type="button" onClick={handleSave} disabled={!policy || !patch || saving || loading || readOnly} className="btn btn-primary btn-sm">
              {saving ? "Salvando..." : "Salvar política"}
            </button>
          </div>
        </footer>
      </section>

      {selectionPicker && pickerConfig ? (
        <div
          className="fixed inset-0 z-[110] grid place-items-center bg-black/45 p-3"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeSelectionPicker();
          }}
        >
          <section
            className="panel flex max-h-[min(760px,calc(100dvh-2rem))] w-full max-w-3xl flex-col overflow-hidden rounded-[18px]"
            role="dialog"
            aria-modal="true"
            aria-label={pickerConfig.title}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="flex flex-col gap-3 border-b border-[var(--line)] p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <span className="badge badge-brand">{pickerConfig.label}</span>
                <h3 className="mt-2 truncate text-lg font-semibold">{pickerConfig.title}</h3>
                <p className="mt-1 text-sm text-muted">
                  {selectedValues.length ? `${selectedValues.length} selecionados` : pickerConfig.emptyLabel}
                </p>
              </div>
              <button type="button" onClick={closeSelectionPicker} className="btn btn-secondary btn-sm">
                Fechar
              </button>
            </header>

            <div className="border-b border-[var(--line)] p-4">
              <input
                value={selectionQuery}
                autoFocus
                disabled={readOnly || saving}
                onChange={(event) => setSelectionQuery(event.target.value)}
                className="field"
                placeholder={pickerConfig.placeholder}
              />
              {selectedValues.length ? (
                <div className="mt-3 flex max-h-28 flex-wrap gap-2 overflow-auto">
                  {selectedValues.map((item) => (
                    <button
                      key={item}
                      type="button"
                      disabled={readOnly || saving}
                      onClick={() => toggleSelectionValue(selectionPicker, item)}
                      className="rounded-full border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-1.5 text-xs font-semibold"
                      aria-label={`Remover ${item}`}
                    >
                      {item} <span aria-hidden="true">x</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-4">
              {canAddCustomSelection ? (
                <button
                  type="button"
                  disabled={readOnly || saving}
                  onClick={() => {
                    toggleSelectionValue(selectionPicker, customQuery);
                    setSelectionQuery("");
                  }}
                  className="mb-3 flex w-full items-center justify-between gap-3 rounded-[12px] border border-[var(--primary)] bg-[var(--surface)] px-3 py-2 text-left text-sm font-semibold"
                >
                  <span className="truncate">Adicionar {customQuery}</span>
                  <span className="badge badge-brand">Novo</span>
                </button>
              ) : null}

              {visiblePickerOptions.length ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {visiblePickerOptions.map((option) => {
                    const active = selectedValueSet.has(normalizeListKey(option.value));
                    return (
                      <button
                        key={option.value}
                        type="button"
                        disabled={readOnly || saving}
                        onClick={() => toggleSelectionValue(selectionPicker, option.value)}
                        className={`flex min-h-12 items-center justify-between gap-3 rounded-[12px] border px-3 py-2 text-left text-sm transition ${
                          active
                            ? "border-[var(--primary)] bg-[var(--surface-soft)]"
                            : "border-[var(--line)] bg-[var(--surface)] hover:border-[var(--primary)]"
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{option.label}</span>
                          {option.meta ? <span className="block text-xs text-muted">{option.meta}</span> : null}
                        </span>
                        <span className={`badge shrink-0 ${active ? "badge-brand" : ""}`}>{active ? "ON" : "+"}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-[12px] border border-[var(--line)] bg-[var(--surface-soft)] p-4 text-sm text-muted">
                  Nenhum item encontrado.
                </div>
              )}
            </div>

            <footer className="flex flex-col gap-2 border-t border-[var(--line)] p-4 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs text-muted">
                {selectedValues.length ? `${selectedValues.length} selecionados` : "Sem seleção"}
              </span>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  disabled={!selectedValues.length || readOnly || saving}
                  onClick={() => updateSelectionValues(selectionPicker, [])}
                  className="btn btn-secondary btn-sm"
                >
                  Limpar
                </button>
                <button type="button" onClick={closeSelectionPicker} className="btn btn-primary btn-sm">
                  Concluir
                </button>
              </div>
            </footer>
          </section>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
