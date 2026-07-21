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

import Link from "next/link";

import { GlassPill, useGlassPill } from "@/components/hbx/glass-pill";
import { I, ICONS } from "@/components/hbx/shell";
import { BotProspeccaoPanel } from "@/components/hbx/bot-prospeccao-panel";
// S05 (PADRAO-MERCADO): prévia da abertura por persona via kit central — zero fork local (mesmo padrão de secao-atendente/cobranca, S01).
import type { WAMessage } from "@/components/hbx/whatsapp-preview";
import { PhonePreview } from "./kit/phone-preview";
// S05 (PADRAO-MERCADO): StatusChip único pro estado do motor e das plays (Lei nº3) — telemetria crua sai da tela.
import { StatusChip, type StatusTone } from "./kit/status-chip";
// S06 (PADRAO-MERCADO): EmptyState do kit pro funil vazio no picker de leads (Lei nº4 do README, nunca pedir ID) + a MESMA ilustração de busca já usada nesta seção (Lei nº2, nunca duplicar símbolo).
import { EmptyState } from "./kit/empty-state";
import { IlustracaoBuscar } from "./kit/ilustracoes";
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

// S06 (PADRAO-MERCADO) — picker de leads do modal Aplicar: reusa GET
// /vendas/board (zero endpoint novo, Lei nº6 do README). Shape real
// verificado em vendas/page.client.tsx (BoardResponse local, não exportado)
// e vendas.service.ts (getBoardForUser) — o board é um TETO de 240 leads
// (Prisma take:240, sem paginação de verdade), cabe inteiro num filtro
// client-side. Só os campos que a lista usa; `automation` é a MESMA
// projeção canônica (Fase 3, activeCommercialSlot) que também gera o
// `conflitosAutomacao` da S00 — mostrar aqui é aviso PRÉVIO do mesmo
// conflito, não uma checagem nova.
type BoardPickLead = {
  id: string;
  name: string | null;
  city: string | null;
  segment: string | null;
  automation?: { label: string } | null;
};
type BoardPickResponse = {
  blocks: { today: BoardPickLead[]; overdue: BoardPickLead[]; scheduled: BoardPickLead[]; closed: BoardPickLead[] };
} | null;

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
// S06 (PADRAO-MERCADO) — busca do picker: minúsculas + remove acento, pra
// "joao" bater em "João". Mesmo espírito do normalizador de
// casca-picker-sheet.tsx (mobile-casca) — reescrito aqui pra não acoplar
// telas de módulos diferentes (tipos re-declarados, mesmo padrão do topo
// deste arquivo).
function normalizeBusca(texto: string): string {
  const semAcento = texto.trim().toLowerCase().normalize("NFD");
  let out = "";
  for (const ch of semAcento) {
    const code = ch.codePointAt(0) || 0;
    if (code < 0x0300 || code > 0x036f) out += ch;
  }
  return out;
}
// S05 (PADRAO-MERCADO) — item 3: "X leads na fila/dentro" virava frase
// corrida dentro de .auto-card__meta; separa em número GRANDE (reusa
// .aut-obj-card__metric* do cartão do hub, S02 — Lei nº2, nunca duplicar
// visual) + rótulo curto (≤2 palavras).
function playMetric(p: AutomationPlay): { value: string; label: string } {
  if (p.tipo === "prospeccao") return { value: String(p.contagem), label: "Na fila" };
  if (p.tipo === "rotina") return { value: `≤${p.contagem}`, label: "Por execução" };
  return { value: String(p.contagem), label: "Leads dentro" };
}

// S05 (PADRAO-MERCADO) — item 4: teto de copy (Lei nº1, ≤70 chars). A
// descrição da persona vem do backend (cadencia-personas.ts, front-only não
// edita) sem garantia de tamanho — corta na EXIBIÇÃO, no espaço mais
// próximo, preservando o sentido (nunca no meio da palavra nem terminando
// num conector solto tipo "e"/"de").
function truncarDescricao(texto: string, max = 70): string {
  const t = texto.trim();
  if (t.length <= max) return t;
  let corte = t.slice(0, max);
  const ultimoEspaco = corte.lastIndexOf(" ");
  if (ultimoEspaco > 0) corte = corte.slice(0, ultimoEspaco);
  corte = corte.replace(/\s+(e|de|a|o|em|no|na|ou)$/i, "");
  return corte.trimEnd() + "…";
}

// S05 (PADRAO-MERCADO) — item 2: mensagem de ABERTURA da persona — dado que
// a tela JÁ TEM (passos[0], zero chamada nova de negócio). PhonePreview do
// kit mostra só isso, nunca a timeline inteira (peso visual de 3 telefones
// lado a lado — decisão do S05.md).
function personaAberturaMessages(c: Cadencia): WAMessage[] {
  const p0 = c.passos[0];
  if (!p0 || !p0.corpo) return [];
  return [{ dir: "in", text: p0.corpo, time: "agora" }];
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
  // S00 (PADRAO-MERCADO) — A3: tom da nota (aviso quando "aplicar" não inscreveu
  // ninguém de novo); default false preserva o ícone de check em todo o resto.
  const [msgWarn, setMsgWarn] = useState(false);
  const [prospOpen, setProspOpen] = useState(false);
  const [aplicando, setAplicando] = useState<Cadencia | null>(null);
  // S05 (PADRAO-MERCADO) — item 2: persona em foco no modal de prévia da
  // abertura (1 por vez — nunca os 3 telefones lado a lado).
  const [previewCad, setPreviewCad] = useState<Cadencia | null>(null);

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
    setMsgWarn(false);
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
  // S05 (PADRAO-MERCADO) — item 1: estado HUMANO do motor via StatusChip do
  // kit (Lei nº3) — a telemetria por executor (`ex.key`/`lastResult` cru)
  // sai da tela (decisão do README: remover, não esconder).
  const motorTone: StatusTone = !motorOk ? "atencao" : runnerOn ? "ligado" : "pausado";
  const motorLabel = !motorOk ? "Motor indisponível" : runnerOn ? "Disparo automático ativo" : "Disparo em espera";

  return (
    <div className="ia-wrap">
      {/* S05 (PADRAO-MERCADO) — item 1: chips de telemetria por executor
          (`cadencia_steps · ligado · skipped`) e a linha "o motor abaixo
          mostra o ritmo real" SAEM da tela (README: remover, não esconder —
          quem precisa do detalhe lê log). Fica só o estado humano do motor,
          via StatusChip do kit (Lei nº3, vocabulário único). */}
      <StatusChip tone={motorTone} label={motorLabel} />

      {/* S00 (PADRAO-MERCADO) — A3: aviso usa o MESMO .auto-flag-note, só troca
          o ícone p/ ICONS.help (convenção já usada em secao-atendente/cobranca
          pra tom de aviso) — nada de check verde quando não há sucesso real. */}
      {msg && <div className="auto-flag-note"><I d={ICONS[msgWarn ? "help" : "check"]} size={14} />{msg}</div>}

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
          {/* S05 (PADRAO-MERCADO) — item 4: teto de copy (Lei nº1). */}
          <p>Configure o disparo frio ou aplique uma cadência a um lead.</p>
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
            {/* S05 (PADRAO-MERCADO) — item 4: teto de copy (Lei nº1, ≤70 chars); Termos/confirm continuam no drawer (BotProspeccaoPanel, intocado). */}
            <span className="hint">Ritmo, limite diário e mensagens de abertura.</span>
          </div>
          <button className="btn-teal" onClick={() => setProspOpen(true)}>
            <I d={ICONS.search} size={13} /> Abrir configuração
          </button>
        </div>
      </section>

      {/* ── "Ritmo de toques" — item 3: cards de persona + aplicar, visual integrado ── */}
      <section style={{ display: "grid", gap: 14 }}>
        {/* S05 (PADRAO-MERCADO) — item 4: título curto no lugar da frase
            corrida (Lei nº1) — os cards + Aplicar já mostram a ação. */}
        <div className="auto-bar">
          <span className="hint">Ritmo de toques</span>
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
            {/* S05 (PADRAO-MERCADO) — item 4: teto de copy (Lei nº1). */}
            <p>Criadas automaticamente na primeira visita — recarregue se faltar.</p>
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
                onAplicar={() => { setAplicando(c); setMsg(null); setMsgWarn(false); }}
                onPreview={() => setPreviewCad(c)}
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
          onDone={(txt, tone) => { setAplicando(null); setMsg(txt); setMsgWarn(tone === "warn"); void loadCad(); void loadPlays(); onChanged?.(); }}
        />
      )}

      {previewCad && <PersonaPreviewModal cadencia={previewCad} onClose={() => setPreviewCad(null)} />}
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
  const metric = playMetric(play);
  return (
    <div className={"auto-card" + (play.ativo ? "" : " is-inactive")}>
      <div className="auto-card__head">
        <span className="auto-card__ico"><I d={ICONS[meta.icon]} size={16} /></span>
        <span className="auto-card__title">{play.nome}</span>
        {/* S05 (PADRAO-MERCADO) — item 3: dot solto "Ativo/Pausado" vira StatusChip (Lei nº3, vocabulário único). */}
        <StatusChip tone={play.ativo ? "ligado" : "pausado"} size="s" />
      </div>

      <span className="auto-chip"><I d={ICONS[meta.icon]} size={12} /> {meta.label}</span>

      <p className="hint" style={{ margin: 0 }}>{play.resumo}</p>

      {/* S05 (PADRAO-MERCADO) — item 3: número-chave GRANDE, reusa
          .aut-obj-card__metric* do cartão do hub (S02, kit) — zero classe
          nova, rótulo ≤2 palavras. */}
      <div className="aut-obj-card__metric">
        <span className="aut-obj-card__metric-n">{metric.value}</span>
        <span className="aut-obj-card__metric-l">{metric.label}</span>
      </div>

      {play.ultimaExecucao.at && (
        <div className="auto-card__meta">
          <span>Última execução <b>{fmtData(play.ultimaExecucao.at)}</b>{play.ultimaExecucao.count != null ? ` · ${play.ultimaExecucao.count}` : ""}</span>
        </div>
      )}

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
function PersonaCard({ c, canManage, onToggle, onAplicar, onPreview }: {
  c: Cadencia;
  canManage: boolean;
  onToggle: () => void;
  onAplicar: () => void;
  onPreview: () => void;
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
      {/* S05 (PADRAO-MERCADO) — item 4: teto de copy (Lei nº1, ≤70 chars);
          descrição vem do backend (cadencia-personas.ts, front-only não
          edita) — corta na exibição, nunca na fonte. */}
      {c.descricao && <p className="persona-card__desc">{truncarDescricao(c.descricao)}</p>}

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
        {/* S05 (PADRAO-MERCADO) — item 2: prévia da mensagem de ABERTURA em
            foco próprio (modal, 1 por vez) — timeline de toques acima
            continua igual; disponível pra qualquer papel (é leitura). */}
        <button className="btn-ghost btn-xs" onClick={onPreview} disabled={!c.passos[0]?.corpo}>
          <I d={ICONS.phone} size={12} /> Ver abertura
        </button>
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
// PRÉVIA DA ABERTURA — item 2 (S05): 1 persona em foco por vez (nunca 3
// telefones lado a lado). PhonePreview do kit (zero fork local) mostra só a
// mensagem de abertura (passos[0]); timeline completa continua no card.
// ============================================================================
function PersonaPreviewModal({ cadencia, onClose }: { cadencia: Cadencia; onClose: () => void }) {
  const messages = personaAberturaMessages(cadencia);
  const p0 = cadencia.passos[0];
  return (
    <div className="hbx-veil" onClick={onClose}>
      <div className="hbx-modal" style={{ width: "min(380px, 92vw)", padding: 20 }} onClick={(e) => e.stopPropagation()}>
        <h3>
          {cadencia.nome}
          <button className="btn-ghost btn-xs" onClick={onClose}>Fechar</button>
        </h3>
        <PhonePreview
          title="Mensagem de abertura"
          messages={messages}
          header={{ name: cadencia.nome, status: "online" }}
          emptyHint="Esta persona ainda não tem mensagem de abertura."
          footerNote={p0 && p0.canal !== "whats" ? `Abertura por ${canalLabel(p0.canal)}.` : "Prévia — não dispara WhatsApp real."}
        />
      </div>
    </div>
  );
}

// ============================================================================
// APLICAR MODAL — reimplantado do padrão /automacoes (mesmas classes), D3:
// rota nova do adapter (POST /automation/plays/cadencia/:id/aplicar).
// ============================================================================
function AplicarModal({ cadencia, onClose, onDone }: { cadencia: Cadencia; onClose: () => void; onDone: (msg: string, tone?: "ok" | "warn") => void }) {
  const [modo, setModo] = useState<"lista" | "pesquisa">("lista");
  const modoPill = useGlassPill<HTMLButtonElement>(modo);
  // S06 (PADRAO-MERCADO) — mata o achado A4: textarea de IDs colados à mão
  // vira seletor visual (busca + checkbox) sobre o MESMO GET /vendas/board
  // que a tela de Vendas já consome (Lei nº4 do README, nunca pedir ID; Lei
  // nº6, zero endpoint novo).
  const [board, setBoard] = useState<BoardPickLead[] | null>(null);
  const [boardLoading, setBoardLoading] = useState(true);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [savedSearchId, setSavedSearchId] = useState("");
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBoard = useCallback(async () => {
    try {
      const res = await apiFetch<BoardPickResponse>("/vendas/board");
      const blocks = res?.blocks;
      setBoard(blocks ? [...blocks.today, ...blocks.overdue, ...blocks.scheduled, ...blocks.closed] : []);
      setBoardError(null);
    } catch (err) {
      setBoardError(err instanceof Error ? err.message : "Não foi possível carregar os leads.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch único ao abrir o modal (mesmo padrão de loadPlays/loadCad na raiz); loading só vira false depois do fetch resolver.
    void loadBoard().then(() => setBoardLoading(false));
  }, [loadBoard]);

  useEffect(() => {
    void apiFetch<{ searches?: SavedSearch[] }>("/saved-search")
      .then((r) => setSearches(r?.searches ?? []))
      .catch(() => setSearches([]));
  }, []);

  // Busca client-side por nome (só o campo que o README pede) — board cabe
  // inteiro (teto de 240), zero necessidade de debounce/paginação aqui.
  const buscaKey = normalizeBusca(busca);
  const filteredLeads = board
    ? (buscaKey ? board.filter((l) => normalizeBusca(l.name || "").includes(buscaKey)) : board)
    : [];
  const todosVisiveisSelecionados = filteredLeads.length > 0 && filteredLeads.every((l) => selectedIds.has(l.id));

  function toggleLead(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  // "Selecionar visíveis" só liga/desliga o que a busca ATUAL mostra — nunca
  // perde a seleção feita antes de trocar o termo de busca.
  function toggleVisiveis() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (todosVisiveisSelecionados) filteredLeads.forEach((l) => next.delete(l.id));
      else filteredLeads.forEach((l) => next.add(l.id));
      return next;
    });
  }

  async function aplicar() {
    setError(null);
    const body: Record<string, unknown> = {};
    if (modo === "lista") {
      const ids = Array.from(selectedIds);
      if (!ids.length) return setError("Selecione ao menos um lead da lista.");
      body.leadIds = ids;
    } else {
      if (!savedSearchId) return setError("Escolha uma pesquisa salva.");
      body.savedSearchId = savedSearchId;
    }
    setBusy(true);
    try {
      // S00 (PADRAO-MERCADO) — A3: backend também devolve `conflitosAutomacao`
      // (cadencia.service.ts:317, leads já presos numa OUTRA automação) — a UI
      // jogava esse dado fora e sempre mostrava "✓" verde mesmo quando nada de
      // novo foi inscrito. Tipar o campo + decidir o tom da mensagem abaixo.
      const res = await apiFetch<{ inscritos?: number; jaInscritos?: number; conflitosAutomacao?: number; total?: number }>(
        `/automation/plays/cadencia/${encodeURIComponent(cadencia.id)}/aplicar`,
        { method: "POST", body: JSON.stringify(body) },
      );
      const inscritos = res?.inscritos ?? 0;
      const jaInscritos = res?.jaInscritos ?? 0;
      const conflitos = res?.conflitosAutomacao ?? 0;
      const extras = [
        jaInscritos > 0 ? `${jaInscritos} já estavam` : null,
        conflitos > 0 ? `${conflitos} bloqueado${conflitos === 1 ? "" : "s"} por outra automação` : null,
      ].filter(Boolean).join(" · ");
      if (inscritos > 0) {
        onDone(`✓ ${inscritos} lead(s) inscrito(s)${extras ? ` · ${extras}` : ""}.`, "ok");
      } else if (extras) {
        // Nada de novo: tom de AVISO, não de sucesso — sem "✓".
        onDone(`Nenhum novo: ${extras}.`, "warn");
      } else {
        onDone("Nenhum lead novo para inscrever.", "warn");
      }
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
              {boardLoading && <span className="hint">Carregando leads do funil…</span>}

              {!boardLoading && boardError && (
                <div style={{ display: "grid", gap: 8, justifyItems: "start" }}>
                  <span className="hint">{boardError}</span>
                  <button type="button" className="btn-ghost btn-xs" onClick={() => { setBoardLoading(true); void loadBoard().then(() => setBoardLoading(false)); }}>Tentar novamente</button>
                </div>
              )}

              {!boardLoading && !boardError && board && board.length === 0 && (
                <EmptyState
                  illustration={<IlustracaoBuscar />}
                  title="Funil vazio"
                  line="Cadastre leads em Vendas para aplicar a cadência."
                  cta={<Link className="btn-teal btn-xs" href="/vendas">Ir para Vendas</Link>}
                />
              )}

              {!boardLoading && !boardError && board && board.length > 0 && (
                <>
                  <div className="emp-toolbar">
                    <input
                      className="field-dark emp-search"
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                      placeholder="Buscar lead por nome…"
                      aria-label="Buscar lead por nome"
                    />
                    <button type="button" className="btn-ghost btn-xs" onClick={toggleVisiveis} disabled={!filteredLeads.length}>
                      {todosVisiveisSelecionados ? "Desmarcar visíveis" : "Selecionar visíveis"}
                    </button>
                    <span className="emp-count">{selectedIds.size} selecionado{selectedIds.size === 1 ? "" : "s"}</span>
                  </div>

                  {filteredLeads.length === 0 ? (
                    <span className="hint">Nenhum lead bate com a busca.</span>
                  ) : (
                    <div className="emp-list aut-pick-list">
                      {filteredLeads.map((lead) => {
                        const checked = selectedIds.has(lead.id);
                        const sub = [lead.city, lead.segment].filter(Boolean).join(" · ");
                        return (
                          <label key={lead.id} className={"emp-row" + (checked ? " is-active" : "")}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleLead(lead.id)}
                              aria-label={`Selecionar ${lead.name || "lead"}`}
                            />
                            <span className="emp-row__main">
                              <span className="emp-row__name">{lead.name || "Sem nome"}</span>
                              {sub && <span className="emp-row__sub"><I d={ICONS.mapin} size={10} /> {sub}</span>}
                            </span>
                            {lead.automation && (
                              <span className="emp-row__side">
                                <StatusChip tone="atencao" label={lead.automation.label} size="s" />
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
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
