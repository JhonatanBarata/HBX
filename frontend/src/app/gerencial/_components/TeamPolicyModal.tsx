"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
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

const EMPTY_LIMIT_DRAFT: LimitDraft = {
  enrichmentDaily: { mode: "inherit", value: "" },
  cardDeliveryDaily: { mode: "inherit", value: "" },
  activeCards: { mode: "inherit", value: "" },
  monthlyCards: { mode: "inherit", value: "" },
  vendasPullQuantity: { mode: "inherit", value: "" },
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

function citiesToText(cities: TeamPolicy["radar"]["allowedCities"]) {
  return cities.map((item) => `${item.city}${item.state ? `/${item.state}` : ""}`).join("\n");
}

function parseCities(value: string) {
  return value
    .split(/\n+/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [city, state] = line.split(/[/-]/).map((part) => part.trim()).filter(Boolean);
      return {
        city: city || line,
        state: state ? state.toUpperCase().slice(0, 2) : null,
      };
    })
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
  const [commissionPercent, setCommissionPercent] = useState("0");
  const [commissionDueBusinessDays, setCommissionDueBusinessDays] = useState("3");
  const [canRegisterHbxSellers, setCanRegisterHbxSellers] = useState(false);
  const [sellerReferralCommissionPercent, setSellerReferralCommissionPercent] = useState("0");
  const [referredByUserId, setReferredByUserId] = useState("");
  const [referredByCommissionPercentSnapshot, setReferredByCommissionPercentSnapshot] = useState("0");
  const [limits, setLimits] = useState<LimitDraft>(EMPTY_LIMIT_DRAFT);
  const [allowedSegments, setAllowedSegments] = useState("");
  const [blockedSegments, setBlockedSegments] = useState("");
  const [allowedCities, setAllowedCities] = useState("");
  const [allowedStates, setAllowedStates] = useState("");
  const [requiresLocation, setRequiresLocation] = useState(false);
  const [requiredChannels, setRequiredChannels] = useState<TeamPolicy["radar"]["requiredChannels"]>({
    whatsapp: false,
    instagram: false,
    facebook: false,
    email: false,
    website: false,
  });
  const [localError, setLocalError] = useState<string | null>(null);

  const open = Boolean(user);
  const role = normalizeRole(user?.role, user?.isSystemMaster);
  const readOnly = role === "USERMASTER" || Boolean(user?.isSystemMaster);
  const canUseUnlimited = Boolean(policy?.visibility.masterCanUseUnlimited);
  const referrerOptions = useMemo(
    () => hbxReferrers.filter((item) => item.id !== user?.id),
    [hbxReferrers, user?.id],
  );

  useEffect(() => {
    if (!policy) return;
    const timeoutId = window.setTimeout(() => {
      setModuleDraft(buildModuleDraft(policy, enabledModules));
      setCommissionPercent(numberDraft(policy.compensation.commissionPercent));
      setCommissionDueBusinessDays(String(policy.compensation.commissionDueBusinessDays || 3));
      setCanRegisterHbxSellers(Boolean(policy.hbxNetwork.canRegisterHbxSellers));
      setSellerReferralCommissionPercent(numberDraft(policy.hbxNetwork.sellerReferralCommissionPercent));
      setReferredByUserId(policy.hbxNetwork.referredByUserId ? String(policy.hbxNetwork.referredByUserId) : "");
      setReferredByCommissionPercentSnapshot(numberDraft(policy.hbxNetwork.referredByCommissionPercentSnapshot));
      setLimits(buildLimitDraft(policy));
      setAllowedSegments(policy.radar.allowedSegments.join("\n"));
      setBlockedSegments(policy.radar.blockedSegments.join("\n"));
      setAllowedCities(citiesToText(policy.radar.allowedCities));
      setAllowedStates(policy.radar.allowedStates.join("\n"));
      setRequiresLocation(Boolean(policy.radar.requiresLocation));
      setRequiredChannels(policy.radar.requiredChannels);
      setLocalError(null);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [enabledModules, policy]);

  const patch = useMemo<TeamPolicyPatch | null>(() => {
    if (!policy) return null;
    const parsedCommission = parsePercent(commissionPercent);
    const parsedReferral = parsePercent(sellerReferralCommissionPercent);
    const parsedSnapshot = parsePercent(referredByCommissionPercentSnapshot);
    const parsedDueDays = parseInteger(commissionDueBusinessDays, 0, 30);
    if (parsedCommission === null || parsedReferral === null || parsedSnapshot === null || parsedDueDays === null) {
      return null;
    }

    const limitPatch: NonNullable<TeamPolicyPatch["limits"]> = {};
    for (const key of Object.keys(limits) as LimitKey[]) {
      const limit = limits[key];
      if (limit.mode === "limited") {
        const parsedLimit = parseInteger(limit.value, 0, 500);
        if (parsedLimit === null) return null;
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
      compensation: {
        commissionPercent: parsedCommission,
        commissionDueBusinessDays: parsedDueDays,
      },
      hbxNetwork: {
        canRegisterHbxSellers,
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
    };
  }, [
    allowedCities,
    allowedSegments,
    allowedStates,
    blockedSegments,
    canRegisterHbxSellers,
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
  ]);

  if (!open || typeof document === "undefined") return null;

  const moduleRows = enabledModules.length
    ? enabledModules
    : (policy?.modules || []).map((moduleItem) => ({
        key: moduleItem.key,
        name: moduleItem.name || moduleItem.key,
        companyEnabled: Boolean(moduleItem.accessible ?? moduleItem.allowed),
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
            <button type="button" onClick={onClose} className="btn btn-secondary btn-sm" aria-label="Fechar política">
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
                  <h3 className="font-semibold">Herança/rede HBX</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="flex items-center gap-2 rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-3 text-sm">
                      <input
                        type="checkbox"
                        checked={canRegisterHbxSellers}
                        disabled={readOnly || saving || !policy.hbxNetwork.isHbxSellerNetwork}
                        onChange={(event) => setCanRegisterHbxSellers(event.target.checked)}
                      />
                      <span className="font-medium">Pode indicar vendedores HBX</span>
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium">Herança %</span>
                      <input
                        value={sellerReferralCommissionPercent}
                        disabled={readOnly || saving || !policy.hbxNetwork.isHbxSellerNetwork}
                        inputMode="decimal"
                        onChange={(event) => setSellerReferralCommissionPercent(event.target.value)}
                        className="field"
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium">Indicado por</span>
                      <select
                        value={referredByUserId}
                        disabled={readOnly || saving || !policy.hbxNetwork.isHbxSellerNetwork}
                        onChange={(event) => setReferredByUserId(event.target.value)}
                        className="field"
                      >
                        <option value="">Direto HBX</option>
                        {policy.hbxNetwork.referredByUser &&
                        !referrerOptions.some((item) => item.id === policy.hbxNetwork.referredByUser?.id) ? (
                          <option value={policy.hbxNetwork.referredByUser.id}>
                            {userLabel(policy.hbxNetwork.referredByUser)}
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
                        disabled={readOnly || saving || !policy.hbxNetwork.isHbxSellerNetwork}
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
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium">Permitidos</span>
                      <textarea
                        value={allowedSegments}
                        disabled={readOnly || saving}
                        onChange={(event) => setAllowedSegments(event.target.value)}
                        className="field min-h-28"
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium">Bloqueados</span>
                      <textarea
                        value={blockedSegments}
                        disabled={readOnly || saving}
                        onChange={(event) => setBlockedSegments(event.target.value)}
                        className="field min-h-28"
                      />
                    </label>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold">Cidades/localização</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium">Cidades</span>
                      <textarea
                        value={allowedCities}
                        disabled={readOnly || saving}
                        onChange={(event) => setAllowedCities(event.target.value)}
                        className="field min-h-28"
                      />
                    </label>
                    <div className="grid gap-3">
                      <label className="grid gap-1 text-sm">
                        <span className="font-medium">Estados</span>
                        <textarea
                          value={allowedStates}
                          disabled={readOnly || saving}
                          onChange={(event) => setAllowedStates(event.target.value)}
                          className="field min-h-16"
                        />
                      </label>
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
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {Object.entries(policy.visibility).map(([key, value]) => (
                      <div key={key} className="rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-3 text-sm">
                        <span className="block text-xs text-muted">{key}</span>
                        <strong>{value ? "Sim" : "Não"}</strong>
                      </div>
                    ))}
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
    </div>,
    document.body,
  );
}
