"use client";

// Janela Créditos (CRÉDITOS S6) — painel MASTER da carteira pré-paga (1 crédito
// = 1 lead). Espelha o padrão de guias da JanelaSelfCheckout (organograma de
// planos): guias PACOTES · EXPIRAÇÃO · CONCEDER CRÉDITO. Consome os endpoints
// do S3-PARTE1 (backend/src/credits/credits-master.controller.ts):
//   GET/PUT  /credits/master/packs*            → catálogo de pacotes de recarga
//   PUT      /credits/master/config/expiry-default → prazo default global
//   POST     /credits/master/company/:id/grant → concessão manual a uma empresa
// Idempotência OBRIGATÓRIA na concessão (Fix II do S3-PARTE1): o backend
// REJEITA grant sem usageKey/sourceRef — geramos um UUID uma única vez na
// ABERTURA do form (não a cada clique) e mandamos como usageKey, travando o
// double-click sem impedir duas concessões legítimas em sessões diferentes.
// Lei 5 (design system): visual só via classe central (.sc-*, .kv, .tag, .tbl).

import React, { useCallback, useEffect, useState } from "react";

import type { ApiError } from "@/lib/api";
import { apiFetch } from "@/lib/api";
import { reportError } from "@/lib/error-bus";
import { useTabParam } from "@/lib/use-tab-param";

import type { MasterCompany } from "./page.client";

const GUIAS = ["Pacotes", "Expiração", "Conceder crédito"] as const;

type CreditPack = {
  key: string;
  title: string;
  status: "available" | "paused";
  credits: number;
  price: number;
  defaultExpiryDays: number;
  observation: string;
  badge: string | null;
  recommended: boolean;
};

type PackForm = {
  title: string;
  observation: string;
  status: "available" | "paused";
  credits: string;
  price: string;
  defaultExpiryDays: string;
};

const GRANT_TYPES: { value: "paid" | "courtesy_internal" | "promo"; label: string }[] = [
  { value: "courtesy_internal", label: "Cortesia interna" },
  { value: "paid", label: "Pago (fora do checkout)" },
  { value: "promo", label: "Promoção" },
];

function toForm(p: CreditPack | null): PackForm {
  return {
    title: p?.title || "",
    observation: p?.observation || "",
    status: p?.status === "paused" ? "paused" : "available",
    credits: p ? String(p.credits) : "",
    price: p ? String(p.price) : "",
    defaultExpiryDays: p ? String(p.defaultExpiryDays) : "",
  };
}

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Fallback defensivo (browsers antigos/contexto não-seguro) — ainda assim
  // estável por abertura do form, só não é RFC4122 estrito.
  return `grant-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function JanelaCreditos({ companies }: { companies: MasterCompany[] | null }) {
  const [guia, setGuia] = useTabParam<(typeof GUIAS)[number]>("guia", "Pacotes", GUIAS);

  // ── Pacotes ──────────────────────────────────────────────────────────────
  const [packs, setPacks] = useState<CreditPack[] | null>(null);
  const [packKey, setPackKey] = useState<string | null>(null);
  const [packForm, setPackForm] = useState<PackForm>(toForm(null));
  const [packBusy, setPackBusy] = useState(false);
  const [packMsg, setPackMsg] = useState<string | null>(null);
  // Lista vazia real (flag ligada, catálogo zerado) × erro de rede/500 do
  // endpoint contam histórias diferentes pro dono — não podem cair na mesma
  // dica de "confira a flag" (achado C6/CORRECOES.md).
  const [packsLoadError, setPacksLoadError] = useState<string | null>(null);

  const carregarPacks = useCallback(() => {
    apiFetch<{ packs?: CreditPack[] }>("/credits/master/packs")
      .then(res => {
        const list = Array.isArray(res?.packs) ? res.packs : [];
        setPacks(list);
        setPacksLoadError(null);
        setPackKey(prev => prev && list.some(p => p.key === prev) ? prev : (list[0]?.key || null));
      })
      .catch((err: unknown) => {
        setPacks([]);
        const status = (err as ApiError)?.status;
        const isFeatureFlag = status === 403 || status === 404;
        setPacksLoadError(isFeatureFlag
          ? null
          : ((err as ApiError)?.message || "Falha ao carregar os pacotes de crédito."));
      });
  }, []);

  useEffect(() => { carregarPacks(); }, [carregarPacks]);

  useEffect(() => {
    const atual = (packs || []).find(p => p.key === packKey) || null;
    setPackForm(toForm(atual));
  }, [packKey, packs]);

  async function salvarPack() {
    if (packBusy || !packKey) return;
    setPackBusy(true);
    setPackMsg(null);
    try {
      const body = {
        title: packForm.title.trim(),
        observation: packForm.observation,
        status: packForm.status,
        credits: Number(packForm.credits),
        price: Number(String(packForm.price).replace(",", ".")),
        defaultExpiryDays: Number(packForm.defaultExpiryDays),
      };
      const res = await apiFetch<{ pack?: CreditPack }>(`/credits/master/packs/${encodeURIComponent(packKey)}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      if (res?.pack) {
        setPacks(prev => (prev || []).map(p => p.key === res.pack!.key ? res.pack! : p));
      }
      setPackMsg("✓ Pacote salvo. Reflete na carteira de todas as empresas.");
    } catch (e) {
      reportError(e);
      setPackMsg(e instanceof Error ? e.message : "Falha ao salvar o pacote.");
    } finally {
      setPackBusy(false);
    }
  }

  // ── Expiração default global ────────────────────────────────────────────
  // O default global não tem GET próprio no S3-PARTE1 (só PUT) — o campo
  // nasce vazio e o master digita o prazo desejado; o placeholder "90" reflete
  // o default de código (credit-pack-catalog.ts DEFAULT_CREDIT_EXPIRY_DAYS).
  const [expiryDays, setExpiryDays] = useState("");
  const [expiryBusy, setExpiryBusy] = useState(false);
  const [expiryMsg, setExpiryMsg] = useState<string | null>(null);

  async function salvarExpiry() {
    if (expiryBusy) return;
    const n = Number(expiryDays);
    if (!Number.isFinite(n) || n <= 0) {
      setExpiryMsg("Informe um número de dias positivo.");
      return;
    }
    setExpiryBusy(true);
    setExpiryMsg(null);
    try {
      const res = await apiFetch<{ defaultExpiryDays?: number }>("/credits/master/config/expiry-default", {
        method: "PUT",
        body: JSON.stringify({ defaultExpiryDays: n }),
      });
      setExpiryMsg(`✓ Prazo default salvo: ${res?.defaultExpiryDays ?? n} dias. Vale para concessões manuais sem data explícita.`);
    } catch (e) {
      reportError(e);
      setExpiryMsg(e instanceof Error ? e.message : "Falha ao salvar o prazo default.");
    } finally {
      setExpiryBusy(false);
    }
  }

  // ── Conceder crédito a uma empresa ──────────────────────────────────────
  const [grantCompanyId, setGrantCompanyId] = useState("");
  const [grantAmount, setGrantAmount] = useState("");
  const [grantType, setGrantType] = useState<"paid" | "courtesy_internal" | "promo">("courtesy_internal");
  const [grantExpiresAt, setGrantExpiresAt] = useState("");
  const [grantBusy, setGrantBusy] = useState(false);
  const [grantMsg, setGrantMsg] = useState<string | null>(null);
  const [grantResult, setGrantResult] = useState<{ balanceAfter: number; expiresAt: string | null; alreadyProcessed: boolean } | null>(null);
  // Idempotência OBRIGATÓRIA (Fix II S3-PARTE1): 1 UUID por ABERTURA de
  // intenção de concessão, gerado uma vez e reusado em toda a vida deste form
  // — double-click/retry de rede reusam a MESMA chave (backend dedupa); ao
  // concluir e resetar o form, uma NOVA chave nasce pra próxima concessão.
  const [usageKey, setUsageKey] = useState<string>(() => newIdempotencyKey());

  function resetGrantForm() {
    setGrantCompanyId("");
    setGrantAmount("");
    setGrantType("courtesy_internal");
    setGrantExpiresAt("");
    setUsageKey(newIdempotencyKey());
  }

  async function conceder() {
    if (grantBusy) return;
    const companyId = Number(grantCompanyId);
    const amount = Number(grantAmount);
    if (!companyId) { setGrantMsg("Selecione a empresa."); return; }
    if (!Number.isInteger(amount) || amount <= 0) { setGrantMsg("Informe uma quantidade inteira positiva de créditos."); return; }

    setGrantBusy(true);
    setGrantMsg(null);
    setGrantResult(null);
    try {
      const body: Record<string, unknown> = { amount, grantType, usageKey };
      if (grantExpiresAt) body.expiresAt = new Date(`${grantExpiresAt}T00:00:00`).toISOString();
      const res = await apiFetch<{ ok?: boolean; balanceAfter?: number; expiresAt?: string | null; alreadyProcessed?: boolean }>(
        `/credits/master/company/${companyId}/grant`,
        { method: "POST", body: JSON.stringify(body) },
      );
      setGrantResult({
        balanceAfter: res?.balanceAfter ?? 0,
        expiresAt: res?.expiresAt ?? null,
        alreadyProcessed: Boolean(res?.alreadyProcessed),
      });
      setGrantMsg(res?.alreadyProcessed
        ? "✓ Concessão já havia sido processada antes (idempotência) — nada foi duplicado."
        : "✓ Créditos concedidos.");
      // Nova intenção a partir daqui — gera nova chave, mas preserva a
      // empresa selecionada pra facilitar uma 2ª concessão distinta.
      setUsageKey(newIdempotencyKey());
    } catch (e) {
      reportError(e);
      setGrantMsg(e instanceof Error ? e.message : "Falha ao conceder crédito.");
    } finally {
      setGrantBusy(false);
    }
  }

  const pausado = packForm.status === "paused";

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Créditos — carteira pré-paga</h2>
        {guia === "Pacotes" && (
          <div className="meta">
            <select className="field-dark" value={packKey || ""} onChange={e => setPackKey(e.target.value)} aria-label="Pacote">
              {(packs || []).map(p => <option key={p.key} value={p.key}>{p.title}</option>)}
            </select>
            <button className="btn-teal" disabled={packBusy || !packKey} onClick={salvarPack}>{packBusy ? "Salvando…" : "Salvar pacote"}</button>
          </div>
        )}
      </div>

      <div className="sc-intro">
        <span className="sc-note">
          1 crédito = 1 lead. Preços dos pacotes são os que a empresa vê ao recarregar (checkout ainda não existe — S3-PARTE2).
        </span>
      </div>

      <div className="tabs sc-tabs">
        {GUIAS.map(g => (
          <button key={g} className={"tab" + (guia === g ? " active" : "")} onClick={() => setGuia(g)}>
            {g}
          </button>
        ))}
      </div>

      <div className="sc-body">
        {guia === "Pacotes" && packs === null && <span className="sc-loading">Carregando…</span>}

        {guia === "Pacotes" && packs !== null && packs.length === 0 && (
          <span className="sc-note">
            {packsLoadError || "Nenhum pacote encontrado — confira se o recurso de créditos está habilitado."}
          </span>
        )}

        {guia === "Pacotes" && packs !== null && packs.length > 0 && (
          <React.Fragment>
            {packMsg && <div className={"sc-msg " + (packMsg.startsWith("✓") ? "is-ok" : "is-warn")}>{packMsg}</div>}
            <div className="sc-field">
              <label className="field-label">Nome do pacote</label>
              <input className="field-dark" maxLength={60} value={packForm.title}
                onChange={e => setPackForm(f => ({ ...f, title: e.target.value }))} placeholder="Nome exibido na carteira" />
            </div>
            <div className="sc-field">
              <label className="field-label">Observação</label>
              <textarea className="field-dark sc-textarea" rows={3} maxLength={400} value={packForm.observation}
                onChange={e => setPackForm(f => ({ ...f, observation: e.target.value }))}
                placeholder="Texto que acompanha o pacote" />
            </div>
            <div className="sc-field">
              <label className="field-label">Créditos no pacote</label>
              <input className="field-dark" inputMode="numeric" value={packForm.credits}
                onChange={e => setPackForm(f => ({ ...f, credits: e.target.value }))} placeholder="0" />
            </div>
            <div className="sc-field">
              <label className="field-label">Preço (R$)</label>
              <input className="field-dark" inputMode="decimal" value={packForm.price}
                onChange={e => setPackForm(f => ({ ...f, price: e.target.value }))} placeholder="0,00" />
            </div>
            <div className="sc-field">
              <label className="field-label">Validade do crédito (dias)</label>
              <input className="field-dark" inputMode="numeric" value={packForm.defaultExpiryDays}
                onChange={e => setPackForm(f => ({ ...f, defaultExpiryDays: e.target.value }))} placeholder="90" />
            </div>
            <div className="sc-field sc-field--sep">
              <label className="field-label">Disponibilidade</label>
              <label className="sc-check">
                <input type="checkbox" checked={pausado}
                  onChange={e => setPackForm(f => ({ ...f, status: e.target.checked ? "paused" : "available" }))} />
                Pausar este pacote
              </label>
              <span className={"sc-hint" + (pausado ? " is-warn" : "")}>
                {pausado ? "Pausado: some da vitrine de recarga da empresa." : "Ativo: aparece na vitrine de recarga."}
              </span>
            </div>
          </React.Fragment>
        )}

        {guia === "Expiração" && (
          <React.Fragment>
            <span className="sc-note">
              Prazo default GLOBAL de validade do crédito — usado nas concessões manuais quando nenhuma data é
              informada. Cada pacote também tem seu próprio prazo (aba Pacotes), que prevalece na compra do pacote.
            </span>
            {expiryMsg && <div className={"sc-msg " + (expiryMsg.startsWith("✓") ? "is-ok" : "is-warn")}>{expiryMsg}</div>}
            <div className="sc-field">
              <label className="field-label">Prazo default (dias)</label>
              <input className="field-dark" inputMode="numeric" value={expiryDays}
                onChange={e => setExpiryDays(e.target.value)} placeholder="90" />
            </div>
            <button className="btn-teal" disabled={expiryBusy} onClick={salvarExpiry}>
              {expiryBusy ? "Salvando…" : "Salvar prazo default"}
            </button>
          </React.Fragment>
        )}

        {guia === "Conceder crédito" && (
          <React.Fragment>
            <span className="sc-note">
              Concessão manual — "master libera créditos ao admin". Idempotente: reenviar a MESMA intenção (double-click)
              não duplica o lote.
            </span>
            {grantMsg && <div className={"sc-msg " + (grantMsg.startsWith("✓") ? "is-ok" : "is-warn")}>{grantMsg}</div>}
            <div className="sc-field">
              <label className="field-label">Empresa</label>
              <select className="field-dark" value={grantCompanyId} onChange={e => setGrantCompanyId(e.target.value)}>
                <option value="">Selecione…</option>
                {(companies || []).map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
              </select>
            </div>
            <div className="sc-field">
              <label className="field-label">Quantidade de créditos</label>
              <input className="field-dark" inputMode="numeric" value={grantAmount}
                onChange={e => setGrantAmount(e.target.value)} placeholder="0" />
            </div>
            <div className="sc-field">
              <label className="field-label">Tipo de concessão</label>
              <select className="field-dark" value={grantType} onChange={e => setGrantType(e.target.value as typeof grantType)}>
                {GRANT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="sc-field">
              <label className="field-label">Expiração (opcional)</label>
              <input className="field-dark" type="date" value={grantExpiresAt}
                onChange={e => setGrantExpiresAt(e.target.value)} />
              <span className="sc-hint">Vazio usa o prazo default global (aba Expiração).</span>
            </div>
            <button className="btn-teal" disabled={grantBusy || !grantCompanyId || !grantAmount} onClick={conceder}>
              {grantBusy ? "Concedendo…" : "Conceder crédito"}
            </button>

            {grantResult && (
              <div className="kv">
                <div className="row"><span className="k">Saldo após concessão</span><span className="v">{grantResult.balanceAfter}</span></div>
                <div className="row"><span className="k">Validade do lote</span><span className="v">{grantResult.expiresAt ? new Date(grantResult.expiresAt).toLocaleDateString("pt-BR") : "—"}</span></div>
                {grantResult.alreadyProcessed && (
                  <div className="row"><span className="k">Status</span><span className="v">já processada (idempotente)</span></div>
                )}
              </div>
            )}
            {grantResult && (
              <button className="btn-ghost" onClick={resetGrantForm}>Nova concessão</button>
            )}
          </React.Fragment>
        )}
      </div>
    </section>
  );
}
