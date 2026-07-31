"use client";

// S16 (MOTOR-ÚNICO) — Seção "Reagir e abastecer" (?secao=regras) do /automacao.
// Reembalagem das DUAS últimas abas do /automacoes velho — endpoints e regras
// de negócio 100% INTOCADOS:
//   GET/POST/PATCH/DELETE /cadencia/gatilhos  (13b — QUANDO lead responde no
//     WhatsApp → ENTÃO mover etapa / criar atividade / notificar vendedor)
//   GET/POST/PATCH/DELETE /cadencia/rotinas   (13c — agenda semanal que puxa
//     leads de uma pesquisa salva pro funil)
// Sub-abas "Gatilhos"/"Rotinas" (GlassPill, mesma trilha que a raiz do
// /automacoes usava pras 3 abas — aqui só as 2 finais).
//
// ── Decisões/desvios documentados (S16.md pede: "qualquer desvio com
// justificativa") ──
//
// D1. `canManage` de cada sub-aba vem do PRÓPRIO endpoint
// (`GET /cadencia/gatilhos` → `canManage`, `GET /cadencia/rotinas` →
// `canManage` — `context.isAdmin || context.canViewCompanyCards`,
// cadencia-gatilho.service.ts:186 / cadencia-rotina.service.ts:133). É o MESMO
// padrão que a S15/secao-prospeccao.tsx (D2) já usa pro domínio cadência —
// fonte única e correta, sem reinventar com `isTenantAdmin` (esse helper só
// entrou na S14 porque o endpoint de Recovery não devolve `canManage`; aqui
// devolve, então usa-se ele).
//
// D2. Aviso do runner ("Rotinas só rodam quando o motor está ligado") deixa
// de ler `rot.runnerEnabled` (o /automacoes velho lia do PRÓPRIO
// `GET /cadencia/rotinas`) e passa a ler do bloco `motor` do
// `GET /automation/overview` (prop `motor`, igual à S15/secao-prospeccao) —
// exatamente o que o contrato desta sprint pede ("Aviso do runner ... lendo
// do overview"). Mesmo dado (a flag é global, não por-empresa-por-domínio),
// fonte trocada pra a central que a casca única já carrega uma vez só.
//
// D3. Rótulo do QUANDO de um gatilho sai do ternário inline do /automacoes
// velho (`g.evento === "lead_respondeu_whatsapp" ? ... : "E-mail é lido"`) e
// vira o mapa `EVENTO_LABEL` (extensível — S08-event-rules.md item 4 lista os
// candidatos futuros do EventRuleService: `etapa_mudou`, `atividade_vencida`,
// `email_lido`). Hoje só `lead_respondeu_whatsapp` é de fato emitido pelo
// backend (`email_lido` já é um valor VÁLIDO em `VALID_EVENTS`
// cadencia-gatilho.service.ts:23, mas nenhum produtor o emite ainda); os
// dois futuros (`etapa_mudou`/`atividade_vencida`) entram no mapa como
// rótulo pronto — quando o backend passar a gravá-los, a tela já sabe
// nomeá-los, zero tela pra tocar depois. Criação de gatilho continua só com
// `lead_respondeu_whatsapp` (mesmo comportamento do NovoGatilhoModal velho —
// os eventos futuros ainda não têm produtor real, então não ganham opção no
// formulário; isso seria inventar UI para o que o backend não entrega).
//
// REUSA (importa, não copia): `.auto-tabs.glass-pill-track`/`.auto-tab`
// (mesma trilha da raiz do /automacoes velho), `.auto-bar`/`.auto-grid`/
// `.auto-card`/`.auto-rule`/`.auto-connector`/`.auto-chip`/`.auto-state`/
// `.auto-card__meta`/`.auto-card__foot`/`.auto-add-card`/`.auto-empty`/
// `.auto-flag-note`/`.auto-skel`/`.rot-week`/`.rot-day`/`.rot-status`/
// `.auto-weekdays`/`.auto-weekday`/`.auto-form`/`.hbx-veil`/`.hbx-modal`/
// `.field-label`/`.field-dark` (screens.css/kit.css — zero classe nova nesta
// sprint, igual à S14). Zero import de `automacoes/page.client.tsx` (tela
// velha) — tipos e componentes reimplantados aqui, mesmo padrão de
// secao-atendente.tsx/secao-cobranca.tsx/secao-prospeccao.tsx.
//
// Nota (S07, PADRAO-MERCADO): empties de Gatilhos/Rotinas trocam o parágrafo
// didático por <EmptyState> (kit/empty-state.tsx, S01) com <MiniFluxo>
// GRANDE (kit/mini-fluxo.tsx, não compact) no slot de ilustração — o
// diagrama fala por si (Lei nº2). Cards existentes trocam `.auto-state` por
// <StatusChip size="s"> sem label custom (mesmo padrão da S05 pro dot solto
// "Ativo/Pausado" em secao-prospeccao.tsx — Lei nº3) e a caixa "Quando"/
// "Então" do gatilho por outro <MiniFluxo> (D4 abaixo). A5 (rotina sem
// pesquisa salva): o combo cede lugar a `.auto-flag-note` + link pra
// `/leads` — rota REAL confirmada por grep: leads/redirect.client.tsx seta
// sessionStorage "hbx:vendas-modo"="buscar" e manda pra /vendas, que abre
// a aba "Buscar empresas" (LeadsClient embutido) onde vive o botão "Salvar
// atual"; é o MESMO alias que dashboard/page.client.tsx já usa pro card
// "Leads na base (Radar)". Import novo: `next/link` (zero rota nova).
//
// D4. Item 4 do contrato (S07.md) pede "MiniFluxo compacto" pro QUANDO/
// ENTÃO do card — mas o modo `compact` (kit/mini-fluxo.tsx) rende só um DOT
// por nó (o ícone vira só `title`, hover). Num card que É o conteúdo
// principal (ao contrário do teaser do hub em page.client.tsx, S02, onde o
// detalhe mora 1 clique adiante), esconder o ícone atrás de hover falha a
// Lei nº2 ("se precisa de texto pra entender, a forma falhou" — aqui seria
// hover, pior que texto). Usa-se o MiniFluxo NÃO-compact (ícone+rótulo
// visíveis) — ainda assim mais compacto que a caixa "Quando"/"Então" antiga
// (1 linha corrida no lugar de 2 blocos empilhados), só não é o modo
// `compact` ao pé da letra.

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { GlassPill, useGlassPill } from "@/components/hbx/glass-pill";
import { I, ICONS } from "@/components/hbx/shell";
import { EmptyState } from "./kit/empty-state";
import { MiniFluxo, type MiniFluxoNode } from "./kit/mini-fluxo";
import { StatusChip } from "./kit/status-chip";
import { apiFetch } from "@/lib/api";

// ================================================================
// Tipos — espelham backend/src/cadencia/cadencia-gatilho.service.ts e
// cadencia-rotina.service.ts (reimplantados, não importados — D acima).
// ================================================================
type AcaoGatilho = { tipo: string; status?: string; titulo?: string; atividadeTipo?: string; diasVencimento?: number; mensagem?: string };
type Gatilho = { id: string; nome: string; evento: string; acoes: AcaoGatilho[]; ativo: boolean; fireCount: number; lastFiredAt: string | null };
type GatilhoResponse = { ok?: boolean; canManage?: boolean; gatilhos?: Gatilho[] } | null;

type Rotina = {
  id: string; nome: string; savedSearchId: string; assignedSellerId: number | null; everyWeeks: number; weekdays: number[];
  maxLeads: number; startsAt: string | null; endsAt: string | null; visibleOnlyToOwner: boolean; ativa: boolean;
  lastRunAt: string | null; lastRunCount: number | null; lastRunStatus: string | null;
};
type RotinaResponse = { ok?: boolean; canManage?: boolean; rotinas?: Rotina[] } | null;

type SavedSearch = { id: string; nome: string };

// Bloco `motor` do GET /automation/overview — espelha
// backend/src/automation/automation-overview.service.ts (AutomationOverviewResponse).
type ExecutorTelemetry = { key: string; enabled: boolean; lastTickAt: string | null; lastResult: "ok" | "skipped" | "error" | null };
type MotorBlock =
  | { ok: true; runnerEnabled: boolean; publishEnabled: boolean; chipConectado: boolean; executores: ExecutorTelemetry[] }
  | { ok: false; reason: string };

const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];
const WEEKDAY_FULL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const STATUS_OPTS = ["novo", "contato", "retorno", "qualificado", "encerrado"];

// D3 — rótulo do QUANDO, mapa extensível (S08-event-rules.md item 4).
const EVENTO_LABEL: Record<string, string> = {
  lead_respondeu_whatsapp: "Lead responde no WhatsApp",
  email_lido: "E-mail é lido",
  etapa_mudou: "Etapa do lead muda",
  atividade_vencida: "Atividade vence",
};
function eventoLabel(evento: string): string {
  return EVENTO_LABEL[evento] ?? evento;
}

const ACAO_META: Record<string, { icon: keyof typeof ICONS }> = {
  mover_status: { icon: "arrow" },
  criar_atividade: { icon: "agenda" },
  notificar_vendedor: { icon: "bell" },
};
function acaoLabel(a: AcaoGatilho): string {
  if (a.tipo === "mover_status") return `mover p/ ${a.status}`;
  if (a.tipo === "criar_atividade") return `criar atividade (${a.atividadeTipo || "ligacao"})`;
  if (a.tipo === "notificar_vendedor") return "notificar vendedor";
  return a.tipo;
}

// S07 (PADRAO-MERCADO) — item 4: QUANDO/ENTÃO do card vira <MiniFluxo> (D4 no
// cabeçalho do arquivo justifica o não-compact). 1º nó é o evento; os
// seguintes são as ações (fallback "sem ação" quando a lista vem vazia —
// mesmo caso que o antigo `.auto-chip` cobria).
function gatilhoFluxo(g: Gatilho): MiniFluxoNode[] {
  const nodes: MiniFluxoNode[] = [{ icon: "msg", label: eventoLabel(g.evento) }];
  if (g.acoes.length === 0) nodes.push({ icon: "check", label: "sem ação" });
  else for (const a of g.acoes) nodes.push({ icon: ACAO_META[a.tipo]?.icon || "check", label: acaoLabel(a) });
  return nodes;
}

// S07 (PADRAO-MERCADO) — itens 1/2: diagramas GRANDES dos 2 empties (o
// "embrião" já eram os pills do .auto-empty__demo antigo — só promovidos
// pro componente central em vez de HTML solto).
const GATILHO_EMPTY_FLUXO: MiniFluxoNode[] = [
  { icon: "msg", label: "Lead responde" },
  { icon: "arrow", label: "mover p/ retorno" },
  { icon: "bell", label: "notificar vendedor" },
];
const ROTINA_EMPTY_FLUXO: MiniFluxoNode[] = [
  { icon: "clock", label: "Toda segunda" },
  { icon: "search", label: "Pesquisa salva" },
  { icon: "vendas", label: "50 no funil" },
];

function LoadErrorPanel({ error, retry }: { error: string; retry: () => void }) {
  return (
    <section className="panel">
      <div style={{ padding: 18, display: "grid", gap: 10, justifyItems: "start" }}>
        <strong>Não carregou</strong>
        <span className="hint">{error}</span>
        <button className="btn-ghost" onClick={retry}>Tentar novamente</button>
      </div>
    </section>
  );
}

// ================================================================
// RAIZ — GET /cadencia/gatilhos + GET /cadencia/rotinas em paralelo, sub-abas
// GlassPill entre as duas listas.
// ================================================================
type SubTab = "gatilhos" | "rotinas";

export function SecaoRegras({ motor, onChanged }: { motor: MotorBlock; onChanged?: () => void }) {
  const [tab, setTab] = useState<SubTab>("gatilhos");
  const tabPill = useGlassPill<HTMLButtonElement>(tab);

  const [gat, setGat] = useState<GatilhoResponse>(null);
  const [rot, setRot] = useState<RotinaResponse>(null);
  const [loading, setLoading] = useState(true);
  const [errGat, setErrGat] = useState<string | null>(null);
  const [errRot, setErrRot] = useState<string | null>(null);

  const loadGat = useCallback(async () => {
    try { setGat(await apiFetch<GatilhoResponse>("/cadencia/gatilhos")); setErrGat(null); }
    catch (err) { setErrGat(err instanceof Error ? err.message : "Não foi possível carregar."); }
  }, []);
  const loadRot = useCallback(async () => {
    try { setRot(await apiFetch<RotinaResponse>("/cadencia/rotinas")); setErrRot(null); }
    catch (err) { setErrRot(err instanceof Error ? err.message : "Não foi possível carregar."); }
  }, []);

  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch paralelo ao montar (guarda `alive` contra race/unmount); efeito legítimo
    void Promise.allSettled([loadGat(), loadRot()]).then(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [loadGat, loadRot]);

  const gatilhos = gat?.gatilhos ?? [];
  const rotinas = rot?.rotinas ?? [];
  // D2 — runner lido do overview (prop `motor`), não mais do próprio GET /cadencia/rotinas.
  const runnerEnabled = Boolean(motor.ok && motor.runnerEnabled);

  return (
    <div className="ia-wrap">
      <div className="auto-tabs glass-pill-track">
        <GlassPill {...tabPill} />
        <button ref={tabPill.itemRef("gatilhos")} className={"auto-tab" + (tab === "gatilhos" ? " is-active" : "")} onClick={() => setTab("gatilhos")}>
          <I d={ICONS.bolt} size={15} /> Gatilhos
          <span className="auto-tab__n">{gatilhos.length}</span>
        </button>
        <button ref={tabPill.itemRef("rotinas")} className={"auto-tab" + (tab === "rotinas" ? " is-active" : "")} onClick={() => setTab("rotinas")}>
          <I d={ICONS.clock} size={15} /> Rotinas
          <span className="auto-tab__n">{rotinas.length}</span>
        </button>
      </div>

      {tab === "gatilhos" ? (
        <GatilhosTab data={gat} loading={loading} error={errGat} reload={async () => { await loadGat(); onChanged?.(); }} />
      ) : (
        <RotinasTab data={rot} loading={loading} error={errRot} reload={async () => { await loadRot(); onChanged?.(); }} runnerEnabled={runnerEnabled} />
      )}
    </div>
  );
}

// ================================================================
// GATILHOS (QUANDO → ENTÃO)
// ================================================================
function GatilhosTab({ data, loading, error, reload }: {
  data: GatilhoResponse; loading: boolean; error: string | null; reload: () => Promise<void>;
}) {
  const [novo, setNovo] = useState(false);

  const gatilhos = data?.gatilhos ?? [];
  const canManage = data?.canManage ?? false;

  async function toggle(g: Gatilho) {
    await apiFetch(`/cadencia/gatilhos/${encodeURIComponent(g.id)}`, { method: "PATCH", body: JSON.stringify({ ativo: !g.ativo }) }).catch(() => null);
    await reload();
  }
  async function remover(g: Gatilho) {
    await apiFetch(`/cadencia/gatilhos/${encodeURIComponent(g.id)}`, { method: "DELETE" }).catch(() => null);
    await reload();
  }

  return (
    <>
      <div className="auto-bar">
        {/* S07 (PADRAO-MERCADO) — item 5: linha encurtada pro teto (≤70 chars,
            Lei nº1) — "sem enviar mensagem automática" é a única frase de
            SEGURANÇA que a forma não carrega, então fica (só mais curta). */}
        <span className="hint">Reage ao lead no funil — sem enviar mensagem automática.</span>
        {canManage && gatilhos.length > 0 && (
          <button className="btn-teal" onClick={() => setNovo(true)}><I d={ICONS.plus} size={13} /> Novo gatilho</button>
        )}
      </div>

      {error && <LoadErrorPanel error={error} retry={() => void reload()} />}

      {!error && loading && !data && (
        <div className="auto-grid">
          {[0, 1].map((i) => <div key={i} className="auto-skel" />)}
        </div>
      )}

      {!error && !loading && gatilhos.length === 0 && (
        <EmptyState
          illustration={<MiniFluxo nodes={GATILHO_EMPTY_FLUXO} />}
          title="Nenhum gatilho ainda"
          line="Lead responde no WhatsApp, o funil reage sozinho."
          cta={canManage && (
            <button className="btn-teal" onClick={() => setNovo(true)}><I d={ICONS.plus} size={13} /> Criar meu primeiro gatilho</button>
          )}
        />
      )}

      {gatilhos.length > 0 && (
        <div className="auto-grid">
          {gatilhos.map((g) => (
            <div key={g.id} className={"auto-card" + (g.ativo ? "" : " is-inactive")}>
              <div className="auto-card__head">
                <span className="auto-card__ico"><I d={ICONS.bolt} size={16} /></span>
                <span className="auto-card__title">{g.nome}</span>
                <StatusChip tone={g.ativo ? "ligado" : "pausado"} size="s" />
              </div>

              <MiniFluxo nodes={gatilhoFluxo(g)} />

              <div className="aut-obj-card__metric">
                <span className="aut-obj-card__metric-n">{g.fireCount}</span>
                <span className="aut-obj-card__metric-l">Disparos</span>
              </div>
              {g.lastFiredAt && (
                <div className="auto-card__meta">
                  <span>Último disparo <b>{new Date(g.lastFiredAt).toLocaleDateString("pt-BR")}</b></span>
                </div>
              )}

              {canManage && (
                <div className="auto-card__foot">
                  <button className="btn-ghost btn-xs" onClick={() => toggle(g)}>{g.ativo ? "Desativar" : "Ativar"}</button>
                  <button className="btn-ghost btn-xs danger" onClick={() => remover(g)}>Remover</button>
                </div>
              )}
            </div>
          ))}
          {canManage && (
            <button type="button" className="auto-add-card" onClick={() => setNovo(true)}>
              <I d={ICONS.plus} size={22} />
              <b>Novo gatilho</b>
              <span>Reaja na hora quando um lead responder no WhatsApp.</span>
            </button>
          )}
        </div>
      )}

      {novo && <NovoGatilhoModal onClose={() => setNovo(false)} onDone={() => { setNovo(false); void reload(); }} />}
    </>
  );
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
            <label className="field-label" htmlFor="rg-nome">Nome</label>
            <input id="rg-nome" className="field-dark" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <span className="hint">Quando o lead responder no WhatsApp:</span>
          <div className="auto-form__row">
            <label className="field-label" htmlFor="rg-status">Mover para etapa</label>
            <select id="rg-status" className="field-dark" value={moverStatus} onChange={(e) => setMoverStatus(e.target.value)}>
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
// ROTINAS (agenda semanal visual)
// ================================================================
function RotinasTab({ data, loading, error, reload, runnerEnabled }: {
  data: RotinaResponse; loading: boolean; error: string | null; reload: () => Promise<void>; runnerEnabled: boolean;
}) {
  const [novo, setNovo] = useState(false);

  const rotinas = data?.rotinas ?? [];
  const canManage = data?.canManage ?? false;

  async function toggle(r: Rotina) {
    await apiFetch(`/cadencia/rotinas/${encodeURIComponent(r.id)}`, { method: "PATCH", body: JSON.stringify({ ativa: !r.ativa }) }).catch(() => null);
    await reload();
  }
  async function remover(r: Rotina) {
    await apiFetch(`/cadencia/rotinas/${encodeURIComponent(r.id)}`, { method: "DELETE" }).catch(() => null);
    await reload();
  }

  return (
    <>
      <div className="auto-bar">
        {/* S07 (PADRAO-MERCADO) — item 5: linha encurtada pro teto (≤70 chars, Lei nº1). */}
        <span className="hint">Recorrência sobre pesquisa salva, direto pro funil.</span>
        {canManage && rotinas.length > 0 && (
          <button className="btn-teal" onClick={() => setNovo(true)}><I d={ICONS.plus} size={13} /> Nova rotina</button>
        )}
      </div>

      {!runnerEnabled && rotinas.length > 0 && (
        <div className="auto-flag-note"><I d={ICONS.clock} size={15} /> Rotinas só rodam quando o motor está ligado pelo suporte.</div>
      )}

      {error && <LoadErrorPanel error={error} retry={() => void reload()} />}

      {!error && loading && !data && (
        <div className="auto-grid">
          {[0, 1].map((i) => <div key={i} className="auto-skel" />)}
        </div>
      )}

      {!error && !loading && rotinas.length === 0 && (
        <EmptyState
          illustration={<MiniFluxo nodes={ROTINA_EMPTY_FLUXO} />}
          title="Nenhuma rotina ainda"
          line="Toda semana, puxa leads de uma pesquisa salva pro funil."
          cta={canManage && (
            <button className="btn-teal" onClick={() => setNovo(true)}><I d={ICONS.plus} size={13} /> Criar minha primeira rotina</button>
          )}
        />
      )}

      {rotinas.length > 0 && (
        <div className="auto-grid">
          {rotinas.map((r) => (
            <div key={r.id} className={"auto-card" + (r.ativa ? "" : " is-inactive")}>
              <div className="auto-card__head">
                <span className="auto-card__ico"><I d={ICONS.clock} size={16} /></span>
                <span className="auto-card__title">{r.nome}</span>
                <StatusChip tone={r.ativa ? "ligado" : "pausado"} size="s" />
              </div>

              <div className="rot-week" title={r.weekdays.map((d) => WEEKDAY_FULL[d]).join(", ") || "Sem dias"}>
                {WEEKDAY_LABELS.map((lbl, d) => (
                  <span key={d} className={"rot-day" + (r.weekdays.includes(d) ? " is-on" : "")}>{lbl}</span>
                ))}
              </div>

              <div className="aut-obj-card__metric">
                <span className="aut-obj-card__metric-n">{r.maxLeads}</span>
                <span className="aut-obj-card__metric-l">Por execução</span>
              </div>
              {r.everyWeeks > 1 && (
                <div className="auto-card__meta"><span>A cada <b>{r.everyWeeks}</b> semanas</span></div>
              )}
              <div className="auto-card__meta">
                {r.lastRunAt ? (
                  <span className={"rot-status " + (r.lastRunStatus === "erro" ? "is-err" : "is-ok")}>
                    Última execução <b>{new Date(r.lastRunAt).toLocaleDateString("pt-BR")}</b> ({r.lastRunCount ?? 0} leads)
                  </span>
                ) : (
                  <span className="rot-status">Nunca rodou</span>
                )}
              </div>

              {canManage && (
                <div className="auto-card__foot">
                  <button className="btn-ghost btn-xs" onClick={() => toggle(r)}>{r.ativa ? "Desativar" : "Ativar"}</button>
                  <button className="btn-ghost btn-xs danger" onClick={() => remover(r)}>Remover</button>
                </div>
              )}
            </div>
          ))}
          {canManage && (
            <button type="button" className="auto-add-card" onClick={() => setNovo(true)}>
              <I d={ICONS.plus} size={22} />
              <b>Nova rotina</b>
              <span>Abasteça o funil sozinho nos dias que você escolher.</span>
            </button>
          )}
        </div>
      )}

      {novo && <NovaRotinaModal onClose={() => setNovo(false)} onDone={() => { setNovo(false); void reload(); }} />}
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
  // S07 (PADRAO-MERCADO) — A5: só depois que o fetch termina é que sabemos
  // se a empresa tem 0 pesquisas de verdade; sem esta flag o mini-empty
  // piscaria antes da 1ª resposta chegar (falso "sem pesquisa").
  const [searchesLoading, setSearchesLoading] = useState(true);

  useEffect(() => {
    void apiFetch<{ searches?: SavedSearch[] }>("/saved-search")
      .then((r) => setSearches(r?.searches ?? []))
      .catch(() => setSearches([]))
      .finally(() => setSearchesLoading(false));
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
            <label className="field-label" htmlFor="rr-nome">Nome</label>
            <input id="rr-nome" className="field-dark" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="auto-form__row">
            <label className="field-label" htmlFor="rr-search">Pesquisa salva</label>
            {searchesLoading ? (
              <span className="hint">Carregando pesquisas…</span>
            ) : searches.length === 0 ? (
              // S07 (PADRAO-MERCADO) — A5: sem pesquisa salva, o combo vazio
              // era beco sem saída (achado A5, README). `/leads` é a rota
              // REAL — alias já existente (leads/redirect.client.tsx) que
              // seta sessionStorage "hbx:vendas-modo"="buscar" e manda pro
              // /vendas, que abre direto na aba "Buscar empresas" (onde vive
              // o botão "Salvar atual", leads/page.client.tsx) — MESMO link
              // que dashboard/page.client.tsx já usa pro card "Leads na
              // base (Radar)".
              <div className="auto-flag-note">
                <I d={ICONS.search} size={14} />
                Nenhuma pesquisa salva — crie um filtro em Vendas.
                <Link className="btn-teal btn-xs" href="/leads">Criar pesquisa</Link>
              </div>
            ) : (
              <select id="rr-search" className="field-dark" value={savedSearchId} onChange={(e) => setSavedSearchId(e.target.value)}>
                <option value="">Selecione…</option>
                {searches.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            )}
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
              <label className="field-label" htmlFor="rr-every">Repete a cada (semanas)</label>
              <input id="rr-every" type="number" min={1} max={12} className="field-dark" value={everyWeeks} onChange={(e) => setEveryWeeks(Math.max(1, Number(e.target.value) || 1))} />
            </div>
            <div className="auto-form__row" style={{ flex: 1 }}>
              <label className="field-label" htmlFor="rr-max">Máx. leads por execução</label>
              <input id="rr-max" type="number" min={1} max={200} className="field-dark" value={maxLeads} onChange={(e) => setMaxLeads(Math.max(1, Number(e.target.value) || 1))} />
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
