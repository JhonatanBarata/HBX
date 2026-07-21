"use client";

// S15 (MOTOR-ÚNICO) — Seção "Buscar clientes" (?secao=prospeccao) do /automacao.
// Funde as DUAS caras do outbound frio que existiam em telas separadas:
//   · guia "Prospecção" do /bot          → motor de disparo frio (<BotProspeccaoPanel>)
//   · aba "Cadências" do /automacoes     → cards de persona + aplicar (ritmo de toques)
// numa seção só, alimentada pela lista unificada de plays (S11):
//   GET  /automation/plays
//   POST /automation/plays/:tipo/:id/toggle
//   POST /automation/plays/cadencia/:id/aplicar
// Config de prospecção continua nos endpoints ATUAIS (/vendas/automation/*, dentro
// de <BotProspeccaoPanel>/useProspectingConfig — INTOCADOS, S15.md item 2).
// Detalhe de cadência (descricao/passos/inscritos p/ os cards de persona) vem do
// endpoint ATUAL `GET /cadencia` — o adapter de plays (S11) devolve só um resumo
// em string, sem os passos; ler daqui é "endpoint atual", não chamada de negócio
// nova (critério de aceite desta sprint: "zero chamada nova de negócio").
//
// ── Decisões/desvios documentados (S15.md pede: "qualquer desvio com
// justificativa") ──
//
// D1. A grade do TOPO (item 1) traz os 3 tipos, mas o TOGGLE só existe pra
// `cadencia`. `cadencia.ativa` é flag de configuração (disponibilidade da
// persona pra aplicar) — o /automacoes velho já fazia isso com um PATCH cru,
// sem Termos nem confirm. Já `prospeccao.ativo` aqui É
// `activation.types.prospeccao.live`, o pino "ao vivo" que o /bot velho só liga
// via Termos (`BotTermsModal`) + `window.confirm` (`requestActivate()` em
// bot/page.client.tsx). Termos é gate SÓ DE CLIENTE (`isBotTermsAccepted`,
// localStorage — `botActivationService.putActivation` não valida isso no
// backend). Expor o toggle cru `/automation/plays/prospeccao/:id/toggle` no
// card do topo pularia esse gate — violaria "Aviso de proativo + Termos
// mantidos" (guardrail duro desta sprint). O card de Prospecção no topo só
// abre a MESMA gaveta do bloco "Disparo frio" (item 2); dentro dela,
// `<BotProspeccaoPanel>` mantém intacto o fluxo Termos+confirm original.
// Rotina: zero ação no topo (leitura — gestão é da S16).
//
// D2. `canManage` das ações de cadência (toggle no topo, toggle no card de
// persona, Aplicar) usa `GET /cadencia` → `canManage` (mesmo campo que o
// /automacoes velho já consumia) — `GET /automation/plays` é um array puro
// (S11.md item 1), sem esse campo. Fonte única e correta pro domínio cadência.
//
// D3. Toggle e Aplicar de cadência passam a usar as rotas NOVAS do adapter
// (`POST /automation/plays/cadencia/:id/toggle` e `.../aplicar`, S11) em vez
// das rotas legadas `PATCH /cadencia/:id` / `POST /cadencia/:id/aplicar` — é
// exatamente o papel do adapter (S11.md: "a S15 ... precisa de UMA lista com
// estado uniforme"); a permissão/validação por trás é a MESMA
// (plays.service.ts só delega pro CadenciaService, zero lógica nova).
//
// REUSA (importa, não copia): <BotProspeccaoPanel> (components/hbx — motor de
// disparo frio, intocado) + classes centrais .auto-*/.persona-*/.step-flow*
// (screens.css, mesmas da /automacoes v2) + `.hbx-veil.to-right`/`.hbx-drawer`
// (kit.css) pro drawer largo. Zero import de bot/page.client.tsx ou
// automacoes/page.client.tsx (telas velhas) — tipos re-declarados aqui, mesmo
// padrão de secao-atendente.tsx/secao-cobranca.tsx.

import React, { useCallback, useEffect, useState } from "react";

import { GlassPill, useGlassPill } from "@/components/hbx/glass-pill";
import { I, ICONS } from "@/components/hbx/shell";
import { BotProspeccaoPanel } from "@/components/hbx/bot-prospeccao-panel";
import { apiFetch } from "@/lib/api";

// ================================================================
// Tipos — espelham backend/src/automation/plays.service.ts (AutomationPlay) +
// backend/src/automation/automation-overview.service.ts (bloco `motor`).
// ================================================================
type AutomationPlayTipo = "prospeccao" | "cadencia" | "rotina";
type AutomationPlay = {
  id: string;
  tipo: AutomationPlayTipo;
  nome: string;
  ativo: boolean;
  resumo: string;
  contagem: number;
  ultimaExecucao: { at: string | null; status: string | null; count: number | null };
  fonte: { savedSearchId?: string; persona?: string };
};

type ExecutorTelemetry = { key: string; enabled: boolean; lastTickAt: string | null; lastResult: "ok" | "skipped" | "error" | null };
type MotorBlock =
  | { ok: true; runnerEnabled: boolean; publishEnabled: boolean; chipConectado: boolean; executores: ExecutorTelemetry[] }
  | { ok: false; reason: string };

// Cadência detalhada — só os campos que os cards de persona usam (D2, GET /cadencia).
type Passo = { dia: number; canal: "whats" | "email" | "atividade"; titulo?: string; corpo?: string };
type Cadencia = {
  id: string; nome: string; persona: string; descricao: string | null;
  passos: Passo[]; ativa: boolean; inscritos?: number;
};
type CadenciaResponse = { ok?: boolean; canManage?: boolean; cadencias?: Cadencia[] } | null;

type SavedSearch = { id: string; nome: string };

const PLAY_TIPO_META: Record<AutomationPlayTipo, { label: string; icon: keyof typeof ICONS }> = {
  prospeccao: { label: "Prospecção", icon: "search" },
  cadencia: { label: "Cadência", icon: "send" },
  rotina: { label: "Rotina", icon: "clock" },
};
const CANAL_META: Record<string, { label: string; icon: keyof typeof ICONS }> = {
  whats: { label: "WhatsApp", icon: "msg" },
  email: { label: "E-mail", icon: "mail" },
  atividade: { label: "Atividade", icon: "check" },
};
const PERSONA_CLASSES = new Set(["conservador", "moderado", "agressivo"]);

function personaClass(persona: string): string {
  const key = String(persona || "").toLowerCase();
  return "persona-card--" + (PERSONA_CLASSES.has(key) ? key : "custom");
}
function diaLabel(dia: number): string {
  return dia === 0 ? "Dia 0" : `Dia ${dia}`;
}
function canalLabel(canal: string): string {
  return CANAL_META[canal]?.label || canal;
}
function fmtData(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}
function playContagemLabel(p: AutomationPlay): string {
  if (p.tipo === "prospeccao") return `${p.contagem} lead${p.contagem === 1 ? "" : "s"} na fila`;
  if (p.tipo === "rotina") return `até ${p.contagem} lead${p.contagem === 1 ? "" : "s"} por execução`;
  return `${p.contagem} lead${p.contagem === 1 ? "" : "s"} dentro`;
}

// ================================================================
// RAIZ — GET /automation/plays + GET /cadencia (D2/D3).
// ================================================================
export function SecaoProspeccao({ motor, onChanged }: { motor: MotorBlock; onChanged?: () => void }) {
  const [plays, setPlays] = useState<AutomationPlay[] | null>(null);
  const [loadingPlays, setLoadingPlays] = useState(true);
  const [errorPlays, setErrorPlays] = useState<string | null>(null);

  const [cad, setCad] = useState<CadenciaResponse>(null);
  const [loadingCad, setLoadingCad] = useState(true);
  const [errorCad, setErrorCad] = useState<string | null>(null);

  const [msg, setMsg] = useState<string | null>(null);
  const [prospOpen, setProspOpen] = useState(false);
  const [aplicando, setAplicando] = useState<Cadencia | null>(null);

  const loadPlays = useCallback(async () => {
    try { setPlays(await apiFetch<AutomationPlay[]>("/automation/plays")); setErrorPlays(null); }
    catch (err) { setErrorPlays(err instanceof Error ? err.message : "Não foi possível carregar os disparos."); }
  }, []);
  const loadCad = useCallback(async () => {
    try { setCad(await apiFetch<CadenciaResponse>("/cadencia")); setErrorCad(null); }
    catch (err) { setErrorCad(err instanceof Error ? err.message : "Não foi possível carregar as cadências."); }
  }, []);

  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch paralelo ao montar (guarda `alive` contra race/unmount); efeito legítimo
    void Promise.allSettled([loadPlays(), loadCad()]).then(() => {
      if (alive) { setLoadingPlays(false); setLoadingCad(false); }
    });
    return () => { alive = false; };
  }, [loadPlays, loadCad]);

  const canManage = cad?.canManage ?? false;
  const cadencias = cad?.cadencias ?? [];

  // Toggle uniforme (S11) — D1: só chamado pra tipo 'cadencia' nesta tela
  // (prospeccao não ganha toggle solto; rotina é leitura).
  async function togglePlay(tipo: AutomationPlayTipo, id: string, ativoAtual: boolean) {
    setMsg(null);
    try {
      await apiFetch(`/automation/plays/${tipo}/${encodeURIComponent(id)}/toggle`, {
        method: "POST",
        body: JSON.stringify({ ativo: !ativoAtual }),
      });
      await Promise.all([loadPlays(), loadCad()]);
      onChanged?.();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Não foi possível alterar.");
    }
  }

  const motorOk = motor.ok;
  const runnerOn = motorOk && motor.runnerEnabled;
  const executores = motorOk ? motor.executores : [];

  return (
    <div className="ia-wrap">
      {/* ── Chip do motor (item 4) — telemetria por executor (S07) ── */}
      <div className="auto-bar">
        <span className="hint">Prospecção fria e cadência de toques saem pelo mesmo canal — o motor abaixo mostra o ritmo real.</span>
        <span className={"auto-engine__chip " + (runnerOn ? "is-on" : "is-off")}>
          <span className="auto-engine__dot" />
          {motorOk ? (runnerOn ? "Disparo automático ATIVO" : "Disparo em espera") : "Motor indisponível"}
        </span>
      </div>
      {executores.length > 0 && (
        <div className="auto-bar">
          {executores.map((ex) => (
            <span key={ex.key} className="auto-chip">
              <I d={ICONS.bolt} size={12} />
              {ex.key} · {ex.enabled ? "ligado" : "desligado"}
              {ex.lastResult ? ` · ${ex.lastResult}` : ""}
            </span>
          ))}
        </div>
      )}

      {msg && <div className="auto-flag-note"><I d={ICONS.check} size={14} />{msg}</div>}

      {/* ── Topo: lista unificada de plays (item 1) ── */}
      {errorPlays && (
        <section className="panel">
          <div style={{ padding: 18, display: "grid", gap: 10, justifyItems: "start" }}>
            <strong>Não carregou</strong>
            <span className="hint">{errorPlays}</span>
            <button className="btn-ghost" onClick={() => { setLoadingPlays(true); void loadPlays().then(() => setLoadingPlays(false)); }}>Tentar novamente</button>
          </div>
        </section>
      )}

      {!errorPlays && loadingPlays && !plays && (
        <div className="auto-grid">{[0, 1, 2].map((i) => <div key={i} className="auto-skel" />)}</div>
      )}

      {!errorPlays && !loadingPlays && plays && plays.length === 0 && (
        <div className="auto-empty">
          <span className="auto-empty__icon"><I d={ICONS.search} size={26} /></span>
          <h4>Nada disparando ainda</h4>
          <p>Configure o disparo frio ou aplique uma cadência a um lead — os dois aparecem aqui assim que ligados.</p>
        </div>
      )}

      {!errorPlays && plays && plays.length > 0 && (
        <div className="auto-grid">
          {plays.map((p) => (
            <PlayCard
              key={`${p.tipo}:${p.id}`}
              play={p}
              canManage={canManage}
              onToggle={() => void togglePlay(p.tipo, p.id, p.ativo)}
              onAbrirProspeccao={() => setProspOpen(true)}
            />
          ))}
        </div>
      )}

      {/* ── "Disparo frio" — item 2: painel real em drawer largo ── */}
      <section className="panel" style={{ padding: 18, display: "grid", gap: 10 }}>
        <div className="auto-bar">
          <div style={{ display: "grid", gap: 2 }}>
            <strong>Disparo frio</strong>
            <span className="hint">Motor de prospecção ativa — ritmo, limite diário e mensagens de 1º contato, com aviso de proativo e Termos.</span>
          </div>
          <button className="btn-teal" onClick={() => setProspOpen(true)}>
            <I d={ICONS.search} size={13} /> Abrir configuração
          </button>
        </div>
      </section>

      {/* ── "Ritmo de toques" — item 3: cards de persona + aplicar, visual integrado ── */}
      <section style={{ display: "grid", gap: 14 }}>
        <div className="auto-bar">
          <span className="hint">Ritmo de toques — escolha uma personalidade de cadência e aplique a uma lista de leads ou pesquisa salva.</span>
        </div>

        {errorCad && (
          <section className="panel">
            <div style={{ padding: 18, display: "grid", gap: 10, justifyItems: "start" }}>
              <strong>Não carregou</strong>
              <span className="hint">{errorCad}</span>
              <button className="btn-ghost" onClick={() => { setLoadingCad(true); void loadCad().then(() => setLoadingCad(false)); }}>Tentar novamente</button>
            </div>
          </section>
        )}

        {!errorCad && loadingCad && !cad && (
          <div className="persona-grid">{[0, 1, 2].map((i) => <div key={i} className="auto-skel" />)}</div>
        )}

        {!errorCad && !loadingCad && cadencias.length === 0 && (
          <div className="auto-empty">
            <span className="auto-empty__icon"><I d={ICONS.send} size={26} /></span>
            <h4>Nenhuma cadência ainda</h4>
            <p>As personalidades padrão são criadas automaticamente na primeira visita. Recarregue a tela — se não aparecerem, chame o suporte.</p>
            <button className="btn-ghost" onClick={() => { setLoadingCad(true); void loadCad().then(() => setLoadingCad(false)); }}>Recarregar</button>
          </div>
        )}

        {cadencias.length > 0 && (
          <div className="persona-grid">
            {cadencias.map((c) => (
              <PersonaCard
                key={c.id}
                c={c}
                canManage={canManage}
                onToggle={() => void togglePlay("cadencia", c.id, c.ativa)}
                onAplicar={() => { setAplicando(c); setMsg(null); }}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Drawer largo do Disparo frio (item 2) ── */}
      {prospOpen && (
        <div className="hbx-veil to-right" onClick={() => setProspOpen(false)}>
          <div className="hbx-drawer prosp-drawer" onClick={(e) => e.stopPropagation()}>
            <h3>
              Disparo frio — configuração
              <button className="btn-ghost btn-xs" onClick={() => setProspOpen(false)}>Fechar</button>
            </h3>
            <div className="bot-panel">
              <BotProspeccaoPanel onSaved={() => { void loadPlays(); onChanged?.(); }} />
            </div>
          </div>
        </div>
      )}

      {aplicando && (
        <AplicarModal
          cadencia={aplicando}
          onClose={() => setAplicando(null)}
          onDone={(txt) => { setAplicando(null); setMsg(txt); void loadCad(); void loadPlays(); onChanged?.(); }}
        />
      )}
    </div>
  );
}

// ============================================================================
// PLAY CARD — item da grade unificada do topo (prospeccao | cadencia | rotina).
// ============================================================================
function PlayCard({ play, canManage, onToggle, onAbrirProspeccao }: {
  play: AutomationPlay;
  canManage: boolean;
  onToggle: () => void;
  onAbrirProspeccao: () => void;
}) {
  const meta = PLAY_TIPO_META[play.tipo];
  return (
    <div className={"auto-card" + (play.ativo ? "" : " is-inactive")}>
      <div className="auto-card__head">
        <span className="auto-card__ico"><I d={ICONS[meta.icon]} size={16} /></span>
        <span className="auto-card__title">{play.nome}</span>
        <span className={"auto-state" + (play.ativo ? " is-on" : "")}>{play.ativo ? "Ativo" : "Pausado"}</span>
      </div>

      <span className="auto-chip"><I d={ICONS[meta.icon]} size={12} /> {meta.label}</span>

      <p className="hint" style={{ margin: 0 }}>{play.resumo}</p>

      <div className="auto-card__meta">
        <span>{playContagemLabel(play)}</span>
        {play.ultimaExecucao.at && (
          <span>Última execução <b>{fmtData(play.ultimaExecucao.at)}</b>{play.ultimaExecucao.count != null ? ` · ${play.ultimaExecucao.count}` : ""}</span>
        )}
      </div>

      <div className="auto-card__foot">
        {play.tipo === "rotina" && <span className="hint">Leitura — gestão chega na próxima sprint.</span>}
        {play.tipo === "prospeccao" && (
          <button className="btn-ghost btn-xs" onClick={onAbrirProspeccao}>Configurar</button>
        )}
        {play.tipo === "cadencia" && canManage && (
          <button className="btn-ghost btn-xs" onClick={onToggle}>{play.ativo ? "Desativar" : "Ativar"}</button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// PERSONA CARD — "Ritmo de toques" (reimplantado do padrão /automacoes, mesmas
// classes .persona-card*/.step-flow*/.touch-badge).
// ============================================================================
function PersonaCard({ c, canManage, onToggle, onAplicar }: {
  c: Cadencia;
  canManage: boolean;
  onToggle: () => void;
  onAplicar: () => void;
}) {
  return (
    <div className={"persona-card " + personaClass(c.persona) + (c.ativa ? "" : " is-inactive")}>
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

      <div className="step-flow">
        {c.passos.map((p, idx) => (
          <div key={idx} className="step-row">
            <span className="step-row__day">{diaLabel(p.dia)}</span>
            <span className="step-row__node"><I d={ICONS[CANAL_META[p.canal]?.icon || "check"]} size={15} /></span>
            <span className="step-row__body">
              <span className="step-row__label">{p.titulo || canalLabel(p.canal)}</span>
              {p.corpo && <span className="step-row__text">{p.corpo}</span>}
            </span>
          </div>
        ))}
      </div>

      <div className="persona-card__foot">
        <span className="persona-card__count"><b>{c.inscritos ?? 0}</b><span>lead{(c.inscritos ?? 0) === 1 ? "" : "s"} dentro</span></span>
        {canManage && (
          <>
            <button className="btn-ghost btn-xs" onClick={onToggle}>{c.ativa ? "Desativar" : "Ativar"}</button>
            <button className="btn-teal btn-xs" onClick={onAplicar} disabled={!c.ativa}>
              <I d={ICONS.send} size={12} /> Aplicar
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// APLICAR MODAL — reimplantado do padrão /automacoes (mesmas classes), D3:
// rota nova do adapter (POST /automation/plays/cadencia/:id/aplicar).
// ============================================================================
function AplicarModal({ cadencia, onClose, onDone }: { cadencia: Cadencia; onClose: () => void; onDone: (msg: string) => void }) {
  const [modo, setModo] = useState<"lista" | "pesquisa">("lista");
  const modoPill = useGlassPill<HTMLButtonElement>(modo);
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
        `/automation/plays/cadencia/${encodeURIComponent(cadencia.id)}/aplicar`,
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
          <div className="auto-tabs glass-pill-track">
            <GlassPill {...modoPill} />
            <button ref={modoPill.itemRef("lista")} className={"auto-tab" + (modo === "lista" ? " is-active" : "")} onClick={() => setModo("lista")}>Lista de leads</button>
            <button ref={modoPill.itemRef("pesquisa")} className={"auto-tab" + (modo === "pesquisa" ? " is-active" : "")} onClick={() => setModo("pesquisa")}>Pesquisa salva</button>
          </div>

          {modo === "lista" ? (
            <div className="auto-form__row">
              <label className="field-label" htmlFor="prosp-apl-ids">IDs dos cards (um por linha ou separados por vírgula)</label>
              <textarea id="prosp-apl-ids" className="field-dark" rows={4} value={leadIdsRaw} onChange={(e) => setLeadIdsRaw(e.target.value)} placeholder="Cole os IDs dos cards do funil" />
            </div>
          ) : (
            <div className="auto-form__row">
              <label className="field-label" htmlFor="prosp-apl-search">Pesquisa salva</label>
              <select id="prosp-apl-search" className="field-dark" value={savedSearchId} onChange={(e) => setSavedSearchId(e.target.value)}>
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
