"use client";

// Editor de POLÍTICA DE ACESSO por usuário (Configurações → Equipe → Gerenciar
// → aba "Acessos"). Restauração da tela do /gerencial antigo (TeamPolicyModal),
// reconstruída contra o kit/tokens do ESQUELETO. Backend intacto:
//   GET   /team/policy/:userId   → política efetiva + catálogo + presets
//   PATCH /team/policy/:userId   → grava acessos, módulos, comissão, herança,
//        limites, radar e visibilidade (Admin + módulo gerencial; auditado).
// Nada de cor/borda/sombra inline (Lei 4): visual mora em screens.css (.tp-*).

import React, { useCallback, useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/lib/api";

type Seller = { id: number; name?: string | null; username?: string | null; email?: string | null; role?: string | null; isActive?: boolean };

type LimitMode = "inherit" | "limited" | "unlimited" | "blocked";
type TeamPolicyLimit = { mode: LimitMode; value: number | null; used?: number | null; remaining?: number | null; source: string };
type LimitKey = "enrichmentDaily" | "cardDeliveryDaily" | "activeCards" | "monthlyCards" | "vendasPullQuantity";

type PolicyModule = { key: string; name?: string | null; allowed: boolean; accessible?: boolean };
type AccessGroup = { key: string; label: string; description: string };
type AccessItem = { key: string; group: string; label: string; description: string; riskLevel: "low" | "medium" | "high" | "critical"; backendEnforced: boolean };
type AccessPreset = { key: string; label: string; description: string; access: Record<string, boolean>; limits?: Partial<Record<LimitKey, { mode: LimitMode; value: number | null }>> };

type TeamPolicy = {
  subject: { id: number; role: string; isSystemMaster: boolean; name: string | null; email: string | null; username: string | null };
  modules: PolicyModule[];
  accessCatalog?: AccessItem[];
  accessGroups?: AccessGroup[];
  accessPresets?: AccessPreset[];
  access?: Record<string, boolean>;
  effectiveAccessMap?: Record<string, boolean>;
  missingBackendEnforcement?: Array<{ key: string }>;
  compensation: { commissionPercent: number; commissionDueBusinessDays: number };
  sellerNetwork: {
    isSellerNetwork: boolean;
    canRecruitSellers: boolean;
    sellerReferralCommissionPercent: number;
    referredByUserId: number | null;
    referredByCommissionPercentSnapshot: number;
  };
  limits: Record<LimitKey, TeamPolicyLimit>;
  radar: {
    allowedSegments: string[];
    blockedSegments: string[];
    allowedCities: Array<{ city: string; state: string | null }>;
    allowedStates: string[];
    requiresLocation: boolean;
    requiredChannels: { whatsapp: boolean; instagram: boolean; facebook: boolean; email: boolean; website: boolean };
  };
  visibility: {
    sellerCanViewOwnPolicy: boolean;
    sellerCanViewCommission: boolean;
    sellerCanViewSellerNetwork: boolean;
    sellerCanViewLimits: boolean;
    masterCanUseUnlimited: boolean;
  };
};

type LimitDraft = Record<LimitKey, { mode: LimitMode; value: string }>;
type ChannelKey = keyof TeamPolicy["radar"]["requiredChannels"];
type SellerVisKey = "sellerCanViewOwnPolicy" | "sellerCanViewCommission" | "sellerCanViewSellerNetwork" | "sellerCanViewLimits";

const LIMIT_LABELS: Array<[LimitKey, string]> = [
  ["enrichmentDaily", "Enriquecimentos/dia"],
  ["cardDeliveryDaily", "Cards/Vendas por dia"],
  ["activeCards", "Cards ativos"],
  ["monthlyCards", "Cards por mês"],
  ["vendasPullQuantity", "Puxar para Vendas"],
];

const CHANNEL_LABELS: Array<[ChannelKey, string]> = [
  ["whatsapp", "WhatsApp"],
  ["instagram", "Instagram"],
  ["facebook", "Facebook"],
  ["email", "E-mail"],
  ["website", "Site"],
];

const SELLER_VIS_LABELS: Array<[SellerVisKey, string]> = [
  ["sellerCanViewOwnPolicy", "Ver a própria política"],
  ["sellerCanViewCommission", "Ver a própria comissão"],
  ["sellerCanViewSellerNetwork", "Ver indicações/rede"],
  ["sellerCanViewLimits", "Ver os próprios limites"],
];

const EMPTY_LIMIT_DRAFT: LimitDraft = {
  enrichmentDaily: { mode: "inherit", value: "" },
  cardDeliveryDaily: { mode: "inherit", value: "" },
  activeCards: { mode: "inherit", value: "" },
  monthlyCards: { mode: "inherit", value: "" },
  vendasPullQuantity: { mode: "inherit", value: "" },
};

function lbl(s?: Seller | null) {
  if (!s) return "Vendedor";
  return s.name || s.username || s.email || `Usuário #${s.id}`;
}

function moduleLabel(key: string, name?: string | null) {
  const k = String(key || "").trim().toLowerCase();
  if (k === "webscraping") return "Radar";
  if (k === "cadastro") return "Clientes";
  return name || key;
}

function parsePercent(value: string, fallback = 0) {
  const v = value.trim().replace(",", ".");
  if (!v) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, Math.round(n * 100) / 100));
}

function parseInteger(value: string, min: number, max: number, fallback: number | null = null) {
  const v = value.trim().replace(",", ".");
  if (!v) return fallback;
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n) || n < min || n > max) return fallback;
  return n;
}

function splitTextList(value: string, max = 100) {
  return value.split(/[\n,;]+/g).map((s) => s.trim()).filter(Boolean).slice(0, max);
}

function citiesToText(cities: TeamPolicy["radar"]["allowedCities"]) {
  return cities.map((c) => `${c.city}${c.state ? `/${c.state}` : ""}`).join("\n");
}

function parseCities(value: string) {
  return value
    .split(/\n+/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const i = line.lastIndexOf("/");
      if (i > 0) return { city: line.slice(0, i).trim() || line, state: line.slice(i + 1).trim().toUpperCase().slice(0, 2) || null };
      return { city: line, state: null as string | null };
    })
    .filter((c) => c.city)
    .slice(0, 250);
}

function numberDraft(value?: number | null) {
  return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function formatLimit(limit?: TeamPolicyLimit | null) {
  if (!limit) return "—";
  if (limit.mode === "unlimited") return "Ilimitado";
  if (limit.mode === "blocked") return "Bloqueado";
  if (limit.mode === "inherit") return `Herda${limit.value != null ? ` (${limit.value})` : ""}`;
  return String(limit.value ?? 0);
}

function buildLimitDraft(policy: TeamPolicy): LimitDraft {
  return (Object.keys(EMPTY_LIMIT_DRAFT) as LimitKey[]).reduce<LimitDraft>((acc, key) => {
    const l = policy.limits[key];
    acc[key] = { mode: l.mode, value: l.value == null ? "" : String(l.value) };
    return acc;
  }, { ...EMPTY_LIMIT_DRAFT });
}

export function TeamPolicyEditor({ userId, sellers, isSelf }: {
  userId: number;
  sellers: Seller[];
  isSelf?: boolean;
}) {
  const [policy, setPolicy] = useState<TeamPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [moduleDraft, setModuleDraft] = useState<Record<string, boolean>>({});
  const [accessDraft, setAccessDraft] = useState<Record<string, boolean>>({});
  const [presetKey, setPresetKey] = useState("");
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
  const [requiredChannels, setRequiredChannels] = useState<TeamPolicy["radar"]["requiredChannels"]>({ whatsapp: false, instagram: false, facebook: false, email: false, website: false });
  const [visibility, setVisibility] = useState<Record<SellerVisKey, boolean>>({ sellerCanViewOwnPolicy: true, sellerCanViewCommission: true, sellerCanViewSellerNetwork: true, sellerCanViewLimits: true });

  const hydrate = useCallback((p: TeamPolicy) => {
    const moduleMap: Record<string, boolean> = {};
    p.modules.forEach((m) => { moduleMap[m.key] = Boolean(m.allowed); });
    setModuleDraft(moduleMap);
    setAccessDraft({ ...(p.effectiveAccessMap || p.access || {}) });
    setPresetKey("");
    setCommissionPercent(numberDraft(p.compensation.commissionPercent));
    setCommissionDueBusinessDays(String(p.compensation.commissionDueBusinessDays || 3));
    setCanRecruitSellers(Boolean(p.sellerNetwork.canRecruitSellers));
    setSellerReferralCommissionPercent(numberDraft(p.sellerNetwork.sellerReferralCommissionPercent));
    setReferredByUserId(p.sellerNetwork.referredByUserId ? String(p.sellerNetwork.referredByUserId) : "");
    setReferredByCommissionPercentSnapshot(numberDraft(p.sellerNetwork.referredByCommissionPercentSnapshot));
    setLimits(buildLimitDraft(p));
    setAllowedSegments(p.radar.allowedSegments.join("\n"));
    setBlockedSegments(p.radar.blockedSegments.join("\n"));
    setAllowedCities(citiesToText(p.radar.allowedCities));
    setAllowedStates(p.radar.allowedStates.join("\n"));
    setRequiresLocation(Boolean(p.radar.requiresLocation));
    setRequiredChannels({ ...p.radar.requiredChannels });
    setVisibility({
      sellerCanViewOwnPolicy: Boolean(p.visibility.sellerCanViewOwnPolicy),
      sellerCanViewCommission: Boolean(p.visibility.sellerCanViewCommission),
      sellerCanViewSellerNetwork: Boolean(p.visibility.sellerCanViewSellerNetwork),
      sellerCanViewLimits: Boolean(p.visibility.sellerCanViewLimits),
    });
  }, []);

  useEffect(() => {
    let alive = true;
    apiFetch<TeamPolicy>(`/team/policy/${userId}`)
      .then((p) => { if (!alive) return; setPolicy(p); hydrate(p); })
      .catch((err: unknown) => { if (alive) setLoadErr(err instanceof Error ? err.message : "Não foi possível carregar a política."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [userId, hydrate]);

  const readOnly = Boolean(policy?.subject.isSystemMaster);
  const targetIsSeller = String(policy?.subject.role || "").toUpperCase() === "USER";
  const canUseUnlimited = Boolean(policy?.visibility.masterCanUseUnlimited);
  const referrerOptions = useMemo(
    () => sellers.filter((s) => s.id !== userId && String(s.role || "").toUpperCase() === "USER" && s.isActive !== false),
    [sellers, userId],
  );

  const patch = useMemo(() => {
    if (!policy) return null;
    const limitPatch: Record<string, { mode: LimitMode; value: number | null | "unlimited" }> = {};
    for (const key of Object.keys(limits) as LimitKey[]) {
      const l = limits[key];
      if (l.mode === "limited") {
        const v = parseInteger(l.value, 0, 500);
        limitPatch[key] = v === null ? { mode: "inherit", value: null } : { mode: "limited", value: v };
      } else if (l.mode === "unlimited") {
        limitPatch[key] = { mode: "unlimited", value: "unlimited" };
      } else if (l.mode === "blocked") {
        limitPatch[key] = { mode: "blocked", value: 0 };
      } else {
        limitPatch[key] = { mode: "inherit", value: null };
      }
    }
    return {
      modules: Object.entries(moduleDraft).map(([key, allowed]) => ({ key, allowed })),
      access: accessDraft,
      ...(presetKey ? { accessPresetKey: presetKey } : {}),
      compensation: {
        commissionPercent: parsePercent(commissionPercent, policy.compensation.commissionPercent),
        commissionDueBusinessDays: parseInteger(commissionDueBusinessDays, 0, 30, policy.compensation.commissionDueBusinessDays) ?? 3,
      },
      sellerNetwork: {
        canRecruitSellers,
        sellerReferralCommissionPercent: parsePercent(sellerReferralCommissionPercent),
        referredByUserId: referredByUserId ? Number(referredByUserId) : null,
        referredByCommissionPercentSnapshot: parsePercent(referredByCommissionPercentSnapshot),
      },
      limits: limitPatch,
      radar: {
        allowedSegments: splitTextList(allowedSegments),
        blockedSegments: splitTextList(blockedSegments),
        allowedCities: parseCities(allowedCities),
        allowedStates: splitTextList(allowedStates).map((s) => s.toUpperCase().slice(0, 2)),
        requiresLocation,
        requiredChannels,
      },
      visibility,
    };
  }, [policy, limits, moduleDraft, accessDraft, presetKey, commissionPercent, commissionDueBusinessDays, canRecruitSellers, sellerReferralCommissionPercent, referredByUserId, referredByCommissionPercentSnapshot, allowedSegments, blockedSegments, allowedCities, allowedStates, requiresLocation, requiredChannels, visibility]);

  function aplicarPreset(key: string) {
    const preset = (policy?.accessPresets || []).find((p) => p.key === key);
    if (!preset) { setPresetKey(""); return; }
    setPresetKey(preset.key);
    setAccessDraft({ ...preset.access });
    if (preset.limits) {
      setLimits((cur) => {
        const next = { ...cur };
        for (const [k, l] of Object.entries(preset.limits || {})) {
          if (!l || !(k in next)) continue;
          next[k as LimitKey] = { mode: l.mode, value: l.value == null ? "" : String(l.value) };
        }
        return next;
      });
    }
  }

  async function salvar() {
    if (!policy || readOnly || saving || !patch) return;
    setSaving(true);
    setMsg(null);
    try {
      const after = await apiFetch<TeamPolicy>(`/team/policy/${userId}`, { method: "PATCH", body: JSON.stringify(patch) });
      setPolicy(after);
      hydrate(after);
      setMsg("✓ Política salva.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Não foi possível salvar a política.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="tp-load">Carregando política de acesso…</div>;
  if (loadErr || !policy) return <div className="tp-msg bad">{loadErr || "Política indisponível."}</div>;

  const groups = policy.accessGroups || [];
  const catalog = policy.accessCatalog || [];
  const presets = policy.accessPresets || [];
  const missing = new Set((policy.missingBackendEnforcement || []).map((m) => m.key));
  const dis = readOnly || saving;

  return (
    <div className="tp">
      {readOnly && <div className="tp-msg bad">Política do MASTER não é editada por aqui.</div>}
      {isSelf && !readOnly && <div className="tp-desc">Você está editando o próprio acesso — cuidado para não se bloquear.</div>}
      {msg && <div className={"tp-msg " + (msg.startsWith("✓") ? "ok" : "bad")}>{msg}</div>}

      {/* Módulos */}
      <section className="tp-sec">
        <h4>Módulos</h4>
        <p className="tp-desc">Entrada geral nos módulos da empresa. Cinza/desligado = fora do plano da empresa.</p>
        <div className="tp-mods">
          {policy.modules.map((m) => {
            const on = Boolean(moduleDraft[m.key]);
            const blocked = m.accessible === false;
            return (
              <button key={m.key} type="button" className={"tp-chip" + (on ? " on" : "")} disabled={dis || blocked}
                title={blocked ? "Módulo fora do plano da empresa" : "Alternar módulo"}
                onClick={() => setModuleDraft((d) => ({ ...d, [m.key]: !on }))}>
                {moduleLabel(m.key, m.name)} <span className="st">{on ? "ON" : "OFF"}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Acessos */}
      {catalog.length > 0 && (
        <section className="tp-sec">
          <h4>Acessos</h4>
          <div className="tp-field">
            <span className="lbl">Aplicar preset</span>
            <select className="field-dark" value={presetKey} disabled={dis} onChange={(e) => aplicarPreset(e.target.value)}>
              <option value="">Personalizado</option>
              {presets.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </div>
          <div className="tp-groups">
            {groups.map((g) => {
              const items = catalog.filter((it) => it.group === g.key);
              if (!items.length) return null;
              return (
                <div key={g.key} className="tp-group">
                  <h5>{g.label}</h5>
                  {g.description && <p className="tp-gdesc">{g.description}</p>}
                  {items.map((it, idx) => {
                    const on = Boolean(accessDraft[it.key]);
                    const semTrava = missing.has(it.key);
                    return (
                      <label key={it.key} className={"tp-acc" + (idx === 0 ? " row1" : "")}>
                        <span className="lab">
                          <b>{it.label}</b>
                          <small>{it.description}</small>
                          {(it.riskLevel === "high" || it.riskLevel === "critical") && (
                            <span className={"tag " + (it.riskLevel === "critical" ? "red" : "warn")} style={{ marginTop: 3 }}>
                              {it.riskLevel === "critical" ? "Crítico" : "Sensível"}
                            </span>
                          )}
                          {semTrava && <span className="flag">Sem trava no backend</span>}
                        </span>
                        <input type="checkbox" checked={on} disabled={dis}
                          onChange={() => { setAccessDraft((c) => ({ ...c, [it.key]: !on })); setPresetKey(""); }} />
                      </label>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Comissão + Herança */}
      <section className="tp-sec">
        <h4>Comissão e indicações</h4>
        <div className="tp-grid2">
          <div className="tp-field">
            <label>Comissão direta (%)</label>
            <input className="field-dark" inputMode="decimal" value={commissionPercent} disabled={dis}
              onChange={(e) => setCommissionPercent(e.target.value)} />
          </div>
          <div className="tp-field">
            <label>Liberação D+ (dias úteis)</label>
            <input className="field-dark" type="number" min={0} max={30} value={commissionDueBusinessDays} disabled={dis}
              onChange={(e) => setCommissionDueBusinessDays(e.target.value)} />
          </div>
        </div>
        {targetIsSeller && (
          <React.Fragment>
            <label className="tp-toggle">
              <span>Pode indicar novos vendedores<small>Libera o vendedor a cadastrar/indicar outros.</small></span>
              <input type="checkbox" checked={canRecruitSellers} disabled={dis} onChange={(e) => setCanRecruitSellers(e.target.checked)} />
            </label>
            <div className="tp-grid2">
              <div className="tp-field">
                <label>Comissão de herança que ELE paga (%)</label>
                <input className="field-dark" inputMode="decimal" value={sellerReferralCommissionPercent} disabled={dis}
                  onChange={(e) => setSellerReferralCommissionPercent(e.target.value)} />
              </div>
              <div className="tp-field">
                <label>Indicado por</label>
                <select className="field-dark" value={referredByUserId} disabled={dis} onChange={(e) => setReferredByUserId(e.target.value)}>
                  <option value="">Direto (sem indicador)</option>
                  {referrerOptions.map((s) => <option key={s.id} value={String(s.id)}>{lbl(s)}</option>)}
                </select>
              </div>
            </div>
            <div className="tp-field">
              <label>Herança recebida do indicador (%)</label>
              <input className="field-dark" inputMode="decimal" value={referredByCommissionPercentSnapshot} disabled={dis}
                onChange={(e) => setReferredByCommissionPercentSnapshot(e.target.value)} />
            </div>
          </React.Fragment>
        )}
      </section>

      {/* Limites */}
      <section className="tp-sec">
        <h4>Limites operacionais</h4>
        <p className="tp-desc">“Herdar” usa o teto do plano. {canUseUnlimited ? "Ilimitado disponível (Master)." : "Ilimitado é exclusivo do Master."}</p>
        {LIMIT_LABELS.map(([key, label]) => {
          const draft = limits[key];
          return (
            <div key={key} className="tp-lim">
              <div className="nm"><b>{label}</b><small>Atual: {formatLimit(policy.limits[key])}</small></div>
              <select className="field-dark" value={draft.mode} disabled={dis}
                onChange={(e) => setLimits((c) => ({ ...c, [key]: { ...c[key], mode: e.target.value as LimitMode } }))}>
                <option value="inherit">Herdar plano</option>
                <option value="limited">Limitar</option>
                <option value="blocked">Bloquear</option>
                {canUseUnlimited && <option value="unlimited">Ilimitado</option>}
              </select>
              <input className="field-dark" type="number" min={0} max={500} placeholder="—"
                value={draft.mode === "limited" ? draft.value : ""} disabled={dis || draft.mode !== "limited"}
                onChange={(e) => setLimits((c) => ({ ...c, [key]: { ...c[key], value: e.target.value } }))} />
            </div>
          );
        })}
      </section>

      {/* Radar */}
      <section className="tp-sec">
        <h4>Radar — território</h4>
        <p className="tp-desc">Um por linha (cidade aceita “Cidade/UF”). Vazio = sem restrição.</p>
        <div className="tp-grid2">
          <div className="tp-field">
            <label>Segmentos permitidos</label>
            <textarea className="field-dark" rows={4} value={allowedSegments} disabled={dis}
              style={{ minHeight: 84, padding: "8px 12px", resize: "vertical" }}
              onChange={(e) => setAllowedSegments(e.target.value)} />
          </div>
          <div className="tp-field">
            <label>Segmentos bloqueados</label>
            <textarea className="field-dark" rows={4} value={blockedSegments} disabled={dis}
              style={{ minHeight: 84, padding: "8px 12px", resize: "vertical" }}
              onChange={(e) => setBlockedSegments(e.target.value)} />
          </div>
          <div className="tp-field">
            <label>Cidades (Cidade/UF)</label>
            <textarea className="field-dark" rows={4} value={allowedCities} disabled={dis}
              style={{ minHeight: 84, padding: "8px 12px", resize: "vertical" }}
              onChange={(e) => setAllowedCities(e.target.value)} />
          </div>
          <div className="tp-field">
            <label>Estados (UF)</label>
            <textarea className="field-dark" rows={4} value={allowedStates} disabled={dis}
              style={{ minHeight: 84, padding: "8px 12px", resize: "vertical" }}
              onChange={(e) => setAllowedStates(e.target.value)} />
          </div>
        </div>
        <label className="tp-toggle">
          <span>Exigir localização<small>Vendedor só busca dentro do território definido.</small></span>
          <input type="checkbox" checked={requiresLocation} disabled={dis} onChange={(e) => setRequiresLocation(e.target.checked)} />
        </label>
        <span className="lbl" style={{ fontSize: "0.7rem", fontWeight: 700 }}>Canais obrigatórios no resultado</span>
        <div className="tp-grid2">
          {CHANNEL_LABELS.map(([key, label]) => (
            <label key={key} className="tp-toggle">
              <span>{label}</span>
              <input type="checkbox" checked={Boolean(requiredChannels[key])} disabled={dis}
                onChange={(e) => setRequiredChannels((c) => ({ ...c, [key]: e.target.checked }))} />
            </label>
          ))}
        </div>
      </section>

      {/* Visibilidade */}
      {targetIsSeller && (
        <section className="tp-sec">
          <h4>Visibilidade do vendedor</h4>
          <p className="tp-desc">O que o vendedor enxerga da própria política.</p>
          <div className="tp-grid2">
            {SELLER_VIS_LABELS.map(([key, label]) => (
              <label key={key} className="tp-toggle">
                <span>{label}</span>
                <input type="checkbox" checked={Boolean(visibility[key])} disabled={dis}
                  onChange={(e) => setVisibility((c) => ({ ...c, [key]: e.target.checked }))} />
              </label>
            ))}
          </div>
        </section>
      )}

      <div className="tp-foot">
        <span className="tp-desc grow">Salvar grava acessos, módulos, comissão, limites, radar e visibilidade — com auditoria.</span>
        <button className="btn-teal" onClick={salvar} disabled={dis || !patch} style={{ minHeight: 40 }}>
          {saving ? "Salvando…" : "Salvar política"}
        </button>
      </div>
    </div>
  );
}
