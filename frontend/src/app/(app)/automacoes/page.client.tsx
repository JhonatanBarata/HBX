"use client";

// Tela AUTOMAÇÕES (WORM-13) — a EMBALAGEM: o cliente não monta fluxo, ESCOLHE uma
// PERSONALIDADE de cadência (Conservador/Moderado/Agressivo). 3 abas:
//   - Cadências: 3 cards de persona + aplicar a uma lista de leads / pesquisa salva.
//   - Gatilhos (13b): "lead respondeu WhatsApp" → mover etapa / criar atividade / notificar.
//   - Rotinas (13c): "toda segunda puxa N leads da pesquisa Y pro vendedor Z" (WORM-15).
// Contratos reais (todos sob /cadencia, gate de módulo 'vendas'):
//   GET/POST/PATCH/DELETE /cadencia            · POST /cadencia/:id/aplicar
//   GET/POST/PATCH/DELETE /cadencia/gatilhos
//   GET/POST/PATCH/DELETE /cadencia/rotinas
// Regra de chip: o WhatsApp da cadência é ESPAÇADO e só dispara com o runner ligado
// pelo dono (flag OFF por default) — a tela mostra esse estado, nunca "força" envio.
// Sem R$ nesta tela (LEI DO VENDEDOR não é acionada). Visual 100% em classe central.

import React, { useCallback, useEffect, useMemo, useState } from "react";

import { I, ICONS, useCurrentUser } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";

type Passo = { dia: number; canal: "whats" | "email" | "atividade"; titulo?: string; corpo?: string; atividadeTipo?: string };
type Cadencia = {
  id: string; nome: string; persona: string; descricao: string | null;
  passos: Passo[]; passosCount: number; whatsSteps: number; ativa: boolean; isSeed: boolean; inscritos?: number;
};
type CadenciaResponse = { ok?: boolean; canManage?: boolean; runnerEnabled?: boolean; cadencias?: Cadencia[] } | null;

type AcaoGatilho = { tipo: string; status?: string; titulo?: string; atividadeTipo?: string; diasVencimento?: number; mensagem?: string };
type Gatilho = { id: string; nome: string; evento: string; acoes: AcaoGatilho[]; ativo: boolean; fireCount: number; lastFiredAt: string | null };
type GatilhoResponse = { ok?: boolean; canManage?: boolean; gatilhos?: Gatilho[] } | null;

type Rotina = {
  id: string; nome: string; savedSearchId: string; assignedSellerId: number | null; everyWeeks: number; weekdays: number[];
  maxLeads: number; startsAt: string | null; endsAt: string | null; visibleOnlyToOwner: boolean; ativa: boolean;
  lastRunAt: string | null; lastRunCount: number | null; lastRunStatus: string | null;
};
type RotinaResponse = { ok?: boolean; canManage?: boolean; runnerEnabled?: boolean; rotinas?: Rotina[] } | null;

type SavedSearch = { id: string; nome: string };

const CANAL_META: Record<string, { label: string; icon: keyof typeof ICONS }> = {
  whats: { label: "WhatsApp", icon: "msg" },
  email: { label: "E-mail", icon: "mail" },
  atividade: { label: "Atividade", icon: "check" },
};
const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];
const WEEKDAY_FULL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const STATUS_OPTS = ["novo", "contato", "retorno", "qualificado", "encerrado"];

function canalLabel(canal: string) {
  return CANAL_META[canal]?.label || canal;
}
function diaLabel(dia: number) {
  return dia === 0 ? "Dia 0" : `Dia ${dia}`;
}

type Tab = "cadencias" | "gatilhos" | "rotinas";

export function AutomacoesClient() {
  useCurrentUser();
  const [tab, setTab] = useState<Tab>("cadencias");

  return (
    <div className="work" style={{ flex: 1 }}>
      <div className="auto-tabs">
        <button className={"auto-tab" + (tab === "cadencias" ? " is-active" : "")} onClick={() => setTab("cadencias")}>Cadências</button>
        <button className={"auto-tab" + (tab === "gatilhos" ? " is-active" : "")} onClick={() => setTab("gatilhos")}>Gatilhos</button>
        <button className={"auto-tab" + (tab === "rotinas" ? " is-active" : "")} onClick={() => setTab("rotinas")}>Rotinas</button>
      </div>

      {tab === "cadencias" && <CadenciasTab />}
      {tab === "gatilhos" && <GatilhosTab />}
      {tab === "rotinas" && <RotinasTab />}
    </div>
  );
}

// ================================================================
// 13a — CADÊNCIAS (personas)
// ================================================================
function CadenciasTab() {
  const [data, setData] = useState<CadenciaResponse>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [aplicando, setAplicando] = useState<Cadencia | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiFetch<CadenciaResponse>("/cadencia");
      setData(res);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Não foi possível carregar.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const cadencias = data?.cadencias ?? [];
  const canManage = data?.canManage ?? false;
  const runnerEnabled = data?.runnerEnabled ?? false;

  async function toggleAtiva(c: Cadencia) {
    try {
      await apiFetch(`/cadencia/${encodeURIComponent(c.id)}`, { method: "PATCH", body: JSON.stringify({ ativa: !c.ativa }) });
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Falhou.");
    }
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span className="hint">Escolha uma personalidade de cadência e aplique a uma lista de leads.</span>
        {msg && <span className="link" style={{ marginLeft: "auto" }}>{msg}</span>}
      </div>

      {!runnerEnabled && (
        <div className="auto-flag-note">
          <I d={ICONS.clock} size={15} />
          O disparo automático está desligado. Os leads entram na cadência, mas nenhum passo dispara até o suporte ligar o motor.
        </div>
      )}

      {loadError && (
        <section className="panel">
          <div style={{ padding: 18, display: "grid", gap: 10, justifyItems: "start" }}>
            <strong>Não carregou</strong>
            <span className="hint">{loadError}</span>
            <button className="btn-ghost" onClick={() => void load()}>Tentar novamente</button>
          </div>
        </section>
      )}

      {!loadError && !loading && cadencias.length === 0 && (
        <section className="panel"><div style={{ padding: 24 }}><span className="hint">Nenhuma cadência ainda.</span></div></section>
      )}

      <div className="persona-grid">
        {cadencias.map((c) => (
          <div key={c.id} className={"persona-card" + (c.ativa ? "" : " is-inactive")}>
            <div className="persona-card__head">
              <span className="persona-card__badge"><I d={ICONS.automacao} size={18} /></span>
              <div style={{ minWidth: 0 }}>
                <div className="persona-card__title">{c.nome}</div>
                <div className="persona-card__persona">{c.persona}</div>
              </div>
            </div>
            {c.descricao && <p className="persona-card__desc">{c.descricao}</p>}

            <div className="persona-card__touches">
              {(["whats", "email", "atividade"] as const).map((canal) => {
                const n = c.passos.filter((p) => p.canal === canal).length;
                if (!n) return null;
                return (
                  <span key={canal} className={"touch-badge" + (canal === "whats" ? " is-whats" : "")}>
                    <I d={ICONS[CANAL_META[canal].icon]} size={12} /> {n} {canalLabel(canal)}
                  </span>
                );
              })}
            </div>

            <div className="step-list">
              {c.passos.map((p, idx) => (
                <div key={idx} className="step-row">
                  <span className="step-row__day">{diaLabel(p.dia)}</span>
                  <span className="step-row__icon"><I d={ICONS[CANAL_META[p.canal]?.icon || "check"]} size={15} /></span>
                  <span className="step-row__body">
                    <span className="step-row__label">{p.titulo || canalLabel(p.canal)}</span>
                    {p.corpo && <span className="step-row__text">{p.corpo}</span>}
                  </span>
                </div>
              ))}
            </div>

            <div className="persona-card__foot">
              <span className="persona-card__count">{c.inscritos ?? 0} inscrito{(c.inscritos ?? 0) === 1 ? "" : "s"}</span>
              {canManage && (
                <>
                  <button className="btn-ghost btn-xs" onClick={() => toggleAtiva(c)}>{c.ativa ? "Desativar" : "Ativar"}</button>
                  <button className="btn-teal btn-xs" onClick={() => { setAplicando(c); setMsg(null); }} disabled={!c.ativa}>
                    <I d={ICONS.send} size={12} /> Aplicar
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {aplicando && (
        <AplicarModal
          cadencia={aplicando}
          onClose={() => setAplicando(null)}
          onDone={(txt) => { setAplicando(null); setMsg(txt); void load(); }}
        />
      )}
    </>
  );
}

function AplicarModal({ cadencia, onClose, onDone }: { cadencia: Cadencia; onClose: () => void; onDone: (msg: string) => void }) {
  const [modo, setModo] = useState<"lista" | "pesquisa">("lista");
  const [leadIdsRaw, setLeadIdsRaw] = useState("");
  const [savedSearchId, setSavedSearchId] = useState("");
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<{ searches?: SavedSearch[] }>("/saved-search")
      .then((r) => setSearches(r?.searches ?? []))
      .catch(() => setSearches([]));
  }, []);

  async function aplicar() {
    setError(null);
    const body: Record<string, unknown> = {};
    if (modo === "lista") {
      const ids = leadIdsRaw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
      if (!ids.length) return setError("Cole ao menos um ID de card (lead).");
      body.leadIds = ids;
    } else {
      if (!savedSearchId) return setError("Escolha uma pesquisa salva.");
      body.savedSearchId = savedSearchId;
    }
    setBusy(true);
    try {
      const res = await apiFetch<{ inscritos?: number; jaInscritos?: number; total?: number }>(
        `/cadencia/${encodeURIComponent(cadencia.id)}/aplicar`,
        { method: "POST", body: JSON.stringify(body) },
      );
      onDone(`✓ ${res?.inscritos ?? 0} lead(s) inscrito(s)${res?.jaInscritos ? ` · ${res.jaInscritos} já estavam` : ""}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível aplicar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hbx-veil" onClick={() => !busy && onClose()}>
      <div className="hbx-modal" style={{ width: "min(460px, 92vw)", padding: 22 }} onClick={(e) => e.stopPropagation()}>
        <h3>
          Aplicar: {cadencia.nome}
          <button className="btn-ghost btn-xs" onClick={onClose} disabled={busy}>Fechar</button>
        </h3>
        <div className="auto-form" style={{ marginTop: 14 }}>
          <div className="auto-tabs">
            <button className={"auto-tab" + (modo === "lista" ? " is-active" : "")} onClick={() => setModo("lista")}>Lista de leads</button>
            <button className={"auto-tab" + (modo === "pesquisa" ? " is-active" : "")} onClick={() => setModo("pesquisa")}>Pesquisa salva</button>
          </div>

          {modo === "lista" ? (
            <div className="auto-form__row">
              <label className="field-label" htmlFor="apl-ids">IDs dos cards (um por linha ou separados por vírgula)</label>
              <textarea id="apl-ids" className="field-dark" rows={4} value={leadIdsRaw} onChange={(e) => setLeadIdsRaw(e.target.value)} placeholder="Cole os IDs dos cards do funil" />
            </div>
          ) : (
            <div className="auto-form__row">
              <label className="field-label" htmlFor="apl-search">Pesquisa salva (WORM-15)</label>
              <select id="apl-search" className="field-dark" value={savedSearchId} onChange={(e) => setSavedSearchId(e.target.value)}>
                <option value="">Selecione…</option>
                {searches.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
              <span className="hint">Inscreve os leads do funil que batem com o filtro (cidade/segmento) da pesquisa.</span>
            </div>
          )}

          {error && <span className="link">{error}</span>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancelar</button>
            <button className="btn-teal" onClick={aplicar} disabled={busy}>{busy ? "Aplicando…" : "Aplicar cadência"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ================================================================
// 13b — GATILHOS
// ================================================================
function GatilhosTab() {
  const [data, setData] = useState<GatilhoResponse>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<GatilhoResponse>("/cadencia/gatilhos");
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não carregou.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const gatilhos = data?.gatilhos ?? [];
  const canManage = data?.canManage ?? false;

  async function toggle(g: Gatilho) {
    await apiFetch(`/cadencia/gatilhos/${encodeURIComponent(g.id)}`, { method: "PATCH", body: JSON.stringify({ ativo: !g.ativo }) }).catch(() => null);
    await load();
  }
  async function remover(g: Gatilho) {
    await apiFetch(`/cadencia/gatilhos/${encodeURIComponent(g.id)}`, { method: "DELETE" }).catch(() => null);
    await load();
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span className="hint">Quando o lead responde no WhatsApp, dispara ações no funil — sem enviar mensagem automática.</span>
        {canManage && <button className="btn-teal" style={{ marginLeft: "auto" }} onClick={() => setNovo(true)}><I d={ICONS.plus} size={13} /> Novo gatilho</button>}
      </div>

      {error && <section className="panel"><div style={{ padding: 18 }}><span className="hint">{error}</span></div></section>}
      {!error && !loading && gatilhos.length === 0 && (
        <section className="panel"><div style={{ padding: 24 }}><span className="hint">Nenhum gatilho ainda.</span></div></section>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {gatilhos.map((g) => (
          <div key={g.id} className={"auto-item" + (g.ativo ? "" : " is-inactive")}>
            <span className="persona-card__badge"><I d={ICONS.msg} size={16} /></span>
            <div className="auto-item__main">
              <span className="auto-item__title">{g.nome}</span>
              <span className="auto-item__sub">
                {g.evento === "lead_respondeu_whatsapp" ? "Quando: lead respondeu WhatsApp" : "Quando: e-mail lido"}
                {" · "}{g.acoes.map((a) => acaoLabel(a)).join(" + ") || "sem ações"}
                {g.fireCount > 0 && ` · disparou ${g.fireCount}×`}
              </span>
            </div>
            {canManage && (
              <div className="auto-item__actions">
                <button className="btn-ghost btn-xs" onClick={() => toggle(g)}>{g.ativo ? "Desativar" : "Ativar"}</button>
                <button className="btn-ghost btn-xs danger" onClick={() => remover(g)}>Remover</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {novo && <NovoGatilhoModal onClose={() => setNovo(false)} onDone={() => { setNovo(false); void load(); }} />}
    </>
  );
}

function acaoLabel(a: AcaoGatilho): string {
  if (a.tipo === "mover_status") return `mover p/ ${a.status}`;
  if (a.tipo === "criar_atividade") return `criar atividade (${a.atividadeTipo || "ligacao"})`;
  if (a.tipo === "notificar_vendedor") return "notificar vendedor";
  return a.tipo;
}

function NovoGatilhoModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [nome, setNome] = useState("");
  const [moverStatus, setMoverStatus] = useState("");
  const [criarAtiv, setCriarAtiv] = useState(false);
  const [notificar, setNotificar] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function salvar() {
    setError(null);
    if (!nome.trim()) return setError("Dê um nome ao gatilho.");
    const acoes: AcaoGatilho[] = [];
    if (moverStatus) acoes.push({ tipo: "mover_status", status: moverStatus });
    if (criarAtiv) acoes.push({ tipo: "criar_atividade", titulo: "Retornar contato", atividadeTipo: "ligacao", diasVencimento: 1 });
    if (notificar) acoes.push({ tipo: "notificar_vendedor", titulo: "Lead respondeu" });
    if (!acoes.length) return setError("Escolha ao menos uma ação.");
    setBusy(true);
    try {
      await apiFetch("/cadencia/gatilhos", {
        method: "POST",
        body: JSON.stringify({ nome: nome.trim(), evento: "lead_respondeu_whatsapp", acoes }),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não salvou.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hbx-veil" onClick={() => !busy && onClose()}>
      <div className="hbx-modal" style={{ width: "min(460px, 92vw)", padding: 22 }} onClick={(e) => e.stopPropagation()}>
        <h3>
          Novo gatilho
          <button className="btn-ghost btn-xs" onClick={onClose} disabled={busy}>Fechar</button>
        </h3>
        <div className="auto-form" style={{ marginTop: 14 }}>
          <div className="auto-form__row">
            <label className="field-label" htmlFor="g-nome">Nome</label>
            <input id="g-nome" className="field-dark" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Respondeu no WhatsApp" />
          </div>
          <span className="hint">Quando o lead responder no WhatsApp:</span>
          <div className="auto-form__row">
            <label className="field-label" htmlFor="g-status">Mover para etapa</label>
            <select id="g-status" className="field-dark" value={moverStatus} onChange={(e) => setMoverStatus(e.target.value)}>
              <option value="">Não mover</option>
              {STATUS_OPTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <label className="field-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={criarAtiv} onChange={(e) => setCriarAtiv(e.target.checked)} /> Criar atividade de retorno (amanhã)
          </label>
          <label className="field-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={notificar} onChange={(e) => setNotificar(e.target.checked)} /> Notificar o vendedor
          </label>
          {error && <span className="link">{error}</span>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancelar</button>
            <button className="btn-teal" onClick={salvar} disabled={busy}>{busy ? "Salvando…" : "Criar gatilho"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ================================================================
// 13c — ROTINAS
// ================================================================
function RotinasTab() {
  const [data, setData] = useState<RotinaResponse>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<RotinaResponse>("/cadencia/rotinas");
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não carregou.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const rotinas = data?.rotinas ?? [];
  const canManage = data?.canManage ?? false;
  const runnerEnabled = data?.runnerEnabled ?? false;

  async function toggle(r: Rotina) {
    await apiFetch(`/cadencia/rotinas/${encodeURIComponent(r.id)}`, { method: "PATCH", body: JSON.stringify({ ativa: !r.ativa }) }).catch(() => null);
    await load();
  }
  async function remover(r: Rotina) {
    await apiFetch(`/cadencia/rotinas/${encodeURIComponent(r.id)}`, { method: "DELETE" }).catch(() => null);
    await load();
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span className="hint">Recorrência sobre uma pesquisa salva: puxa leads pro funil nos dias escolhidos.</span>
        {canManage && <button className="btn-teal" style={{ marginLeft: "auto" }} onClick={() => setNovo(true)}><I d={ICONS.plus} size={13} /> Nova rotina</button>}
      </div>

      {!runnerEnabled && (
        <div className="auto-flag-note"><I d={ICONS.clock} size={15} /> Rotinas só rodam quando o motor está ligado pelo suporte.</div>
      )}

      {error && <section className="panel"><div style={{ padding: 18 }}><span className="hint">{error}</span></div></section>}
      {!error && !loading && rotinas.length === 0 && (
        <section className="panel"><div style={{ padding: 24 }}><span className="hint">Nenhuma rotina ainda.</span></div></section>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {rotinas.map((r) => (
          <div key={r.id} className={"auto-item" + (r.ativa ? "" : " is-inactive")}>
            <span className="persona-card__badge"><I d={ICONS.clock} size={16} /></span>
            <div className="auto-item__main">
              <span className="auto-item__title">{r.nome}</span>
              <span className="auto-item__sub">
                {r.weekdays.map((d) => WEEKDAY_FULL[d]).join(", ") || "—"}
                {r.everyWeeks > 1 ? ` · a cada ${r.everyWeeks} semanas` : ""}
                {" · até "}{r.maxLeads} leads
                {r.lastRunAt ? ` · última: ${new Date(r.lastRunAt).toLocaleDateString("pt-BR")} (${r.lastRunCount ?? 0})` : " · nunca rodou"}
              </span>
            </div>
            {canManage && (
              <div className="auto-item__actions">
                <button className="btn-ghost btn-xs" onClick={() => toggle(r)}>{r.ativa ? "Desativar" : "Ativar"}</button>
                <button className="btn-ghost btn-xs danger" onClick={() => remover(r)}>Remover</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {novo && <NovaRotinaModal onClose={() => setNovo(false)} onDone={() => { setNovo(false); void load(); }} />}
    </>
  );
}

function NovaRotinaModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [nome, setNome] = useState("");
  const [savedSearchId, setSavedSearchId] = useState("");
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [weekdays, setWeekdays] = useState<number[]>([1]);
  const [everyWeeks, setEveryWeeks] = useState(1);
  const [maxLeads, setMaxLeads] = useState(50);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<{ searches?: SavedSearch[] }>("/saved-search")
      .then((r) => setSearches(r?.searches ?? []))
      .catch(() => setSearches([]));
  }, []);

  function toggleDay(d: number) {
    setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  }

  async function salvar() {
    setError(null);
    if (!nome.trim()) return setError("Dê um nome à rotina.");
    if (!savedSearchId) return setError("Escolha uma pesquisa salva.");
    if (!weekdays.length) return setError("Escolha ao menos um dia da semana.");
    setBusy(true);
    try {
      await apiFetch("/cadencia/rotinas", {
        method: "POST",
        body: JSON.stringify({ nome: nome.trim(), savedSearchId, weekdays, everyWeeks, maxLeads }),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não salvou.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hbx-veil" onClick={() => !busy && onClose()}>
      <div className="hbx-modal" style={{ width: "min(480px, 92vw)", padding: 22 }} onClick={(e) => e.stopPropagation()}>
        <h3>
          Nova rotina
          <button className="btn-ghost btn-xs" onClick={onClose} disabled={busy}>Fechar</button>
        </h3>
        <div className="auto-form" style={{ marginTop: 14 }}>
          <div className="auto-form__row">
            <label className="field-label" htmlFor="r-nome">Nome</label>
            <input id="r-nome" className="field-dark" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Carga automática segunda-feira" />
          </div>
          <div className="auto-form__row">
            <label className="field-label" htmlFor="r-search">Pesquisa salva (WORM-15)</label>
            <select id="r-search" className="field-dark" value={savedSearchId} onChange={(e) => setSavedSearchId(e.target.value)}>
              <option value="">Selecione…</option>
              {searches.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </div>
          <div className="auto-form__row">
            <span className="field-label">Dias da semana</span>
            <div className="auto-weekdays">
              {WEEKDAY_LABELS.map((lbl, d) => (
                <button key={d} type="button" className={"auto-weekday" + (weekdays.includes(d) ? " is-on" : "")} onClick={() => toggleDay(d)} title={WEEKDAY_FULL[d]}>{lbl}</button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div className="auto-form__row" style={{ flex: 1 }}>
              <label className="field-label" htmlFor="r-every">Repete a cada (semanas)</label>
              <input id="r-every" type="number" min={1} max={12} className="field-dark" value={everyWeeks} onChange={(e) => setEveryWeeks(Math.max(1, Number(e.target.value) || 1))} />
            </div>
            <div className="auto-form__row" style={{ flex: 1 }}>
              <label className="field-label" htmlFor="r-max">Máx. leads por execução</label>
              <input id="r-max" type="number" min={1} max={200} className="field-dark" value={maxLeads} onChange={(e) => setMaxLeads(Math.max(1, Number(e.target.value) || 1))} />
            </div>
          </div>
          {error && <span className="link">{error}</span>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancelar</button>
            <button className="btn-teal" onClick={salvar} disabled={busy}>{busy ? "Salvando…" : "Criar rotina"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
