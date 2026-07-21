"use client";

// S12 (MOTOR-ÚNICO) — /automacao: a CASCA ÚNICA. Hub de entrada POR OBJETIVO
// (padrão Intercom/HubSpot/ManyChat/Blip), no lugar de 3 telas soltas
// (/bot + /automacoes + /assistente). HERO com identidade + chip do motor
// (pré-voo do chip WhatsApp) e PAINEL DE STATUS: 4 cartões-objetivo com
// estado REAL, consumindo GET /automation/overview (fail-soft — bloco
// `ok:false` vira aviso no cartão, nunca derruba a tela; ver
// automation-overview.service.ts).
//
// Navegação por seção fica NA MESMA rota via `?secao=`, estado LOCAL (sem
// sub-rota Next — README "Regras de orquestração"). S13-S16 substituíram o
// placeholder "em migração" pelo conteúdo real, seção por seção — S16 (a
// última, "Reagir e abastecer") fecha a Fase 3. As telas velhas (/bot,
// /automacoes, /assistente) continuam no ar e intocadas — matar/redirecionar
// é trabalho da S17.
//
// Gates (README decisão nº2, revisada pós-S03 — S04-modulo-automation-
// overview.md "Gate de 3 chaves"):
//   · item da sidebar (shell.tsx) = atendimento OU bot OU vendas.
//   · cartão "Atender sozinho"    = atendimento OU bot.
//   · cartão "Cobrar quem deve"   = bot E atendimento (o bloco `cobranca` do
//     overview só sai ok:true quando as DUAS chaves batem — o recovery
//     bot-config é gateado por `atendimento`, a ativação por `bot`;
//     automation-overview.service.ts `buildCobranca`). Usar OR aqui deixaria
//     o cartão visível e permanentemente "indisponível" pra quem só tem uma
//     das duas — pior que escondê-lo.
//   · cartão "Buscar clientes"/"Reagir e abastecer" = vendas.
// Fonte do gate por SEÇÃO é o `moduleAccess` que o PRÓPRIO overview devolve
// (já calculado por usuário no backend) — não se refaz outra leitura de
// /modules/me aqui; isso é papel só do item da sidebar (shell.tsx).
//
// Design System: zero hex/inline solto — só classes/tokens centrais. HERO
// reusa .auto-hero*/.auto-engine* de screens.css (mesma linguagem visual da
// /automacoes v2 — Lei nº2, nunca repetir visual). CSS NOVO desta tela (grade
// de cartões-objetivo + placeholder de seção) vive em hbx-theme/automacao.css.

import { useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";

import { I, ICONS, useCurrentUser } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";
import { IlustracaoAtender, IlustracaoBuscar, IlustracaoCobrar, IlustracaoReagir } from "./kit/ilustracoes";
import { MiniFluxo, type MiniFluxoNode } from "./kit/mini-fluxo";
import { StatusChip, type StatusTone } from "./kit/status-chip";
import { SecaoAtendente } from "./secao-atendente";
import { SecaoCobranca } from "./secao-cobranca";
import { SecaoProspeccao } from "./secao-prospeccao";
import { SecaoRegras } from "./secao-regras";

// ================================================================
// Shape do GET /automation/overview — espelha
// backend/src/automation/automation-overview.service.ts (AutomationOverviewResponse).
// ================================================================
type AgentBrain = "roteiro" | "ia";
type Block<T extends Record<string, unknown>> = ({ ok: true } & T) | { ok: false; reason: string };

// S15: campos reais (não mais `unknown[]`) — a seção Prospecção & Cadência
// consome a telemetria por executor (backend/src/automation/outbound-
// orchestrator.service.ts OutboundExecutorTelemetry) pro chip de motor.
type ExecutorTelemetry = { key: string; enabled: boolean; lastTickAt: string | null; lastResult: "ok" | "skipped" | "error" | null };

type Overview = {
  companyId: number;
  moduleAccess: { atendimento: boolean; bot: boolean; vendas: boolean };
  botArmed: { armed: boolean; armedAt: string | null; armedByUserId: number | null };
  atendente: Block<{ brain: AgentBrain | null; published: boolean; updatedAt: string | null }>;
  cobranca: Block<{ live: boolean; workerEnabled: boolean }>;
  prospeccao: Block<{ live: boolean; campaignId: string | null; pendingLeads: number }>;
  regras: Block<{ gatilhosAtivos: number; rotinasAtivas: number }>;
  motor: Block<{ runnerEnabled: boolean; publishEnabled: boolean; chipConectado: boolean; executores: ExecutorTelemetry[] }>;
};

type SecaoKey = "atendente" | "cobranca" | "prospeccao" | "regras";
const SECOES: SecaoKey[] = ["atendente", "cobranca", "prospeccao", "regras"];
function isSecaoKey(v: string | null): v is SecaoKey {
  return v !== null && (SECOES as string[]).includes(v);
}

type SecaoMeta = { key: SecaoKey; titulo: string; sub: string; icon: keyof typeof ICONS };

const SECAO_META: Record<SecaoKey, SecaoMeta> = {
  atendente: {
    key: "atendente",
    titulo: "Atender sozinho",
    icon: "atend",
    sub: "Roteiro de menu ou IA respondendo o cliente no seu lugar, sem vendedor no meio.",
  },
  cobranca: {
    key: "cobranca",
    titulo: "Cobrar quem deve",
    icon: "money",
    // S04 (PADRAO-MERCADO, sprint "cobranca"): frase original estourava o
    // teto de copy (~84 chars, Lei nº1 ≤70) — a prévia no telefone já mostra
    // o tom do lembrete, então a linha só precisa dizer o QUÊ.
    sub: "Recovery: lembra o cliente que deve, no ritmo certo.",
  },
  prospeccao: {
    key: "prospeccao",
    titulo: "Buscar clientes",
    icon: "search",
    sub: "Cadência e prospecção ativa puxando leads pro funil sozinhas.",
  },
  regras: {
    key: "regras",
    titulo: "Reagir e abastecer",
    icon: "bolt",
    sub: "Gatilhos e rotinas cuidando do funil sozinhos, sem ninguém precisar lembrar.",
  },
};

function secaoGateOk(key: SecaoKey, ma: Overview["moduleAccess"]): boolean {
  if (key === "atendente") return ma.atendimento || ma.bot;
  if (key === "cobranca") return ma.bot && ma.atendimento;
  return ma.vendas; // prospeccao | regras
}

// Referência estável (fora do componente) pro fallback "sem overview ainda" —
// um objeto literal `?? {...}` inline recriaria uma referência nova a cada
// render e invalidaria o useMemo de `cards` sempre.
const EMPTY_MODULE_ACCESS: Overview["moduleAccess"] = { atendimento: false, bot: false, vendas: false };

// ================================================================
// Cartão-objetivo — normaliza cada bloco do overview num view-model comum
// (tone de status ÚNICO — kit/status-chip.tsx, Lei nº3 —, 1 número-chave,
// aviso opcional). Fail-soft: bloco `ok:false` nunca derruba a tela, vira
// estado "Indisponível". S02 (PADRAO-MERCADO): `dot`/`icon`/`sub` saíram —
// o dot solto virou StatusChip (mesmo componente do resto do módulo) e o
// ícone plano virou ilustração (SECAO_ILUSTRACAO, abaixo); `sub` (parágrafo
// descritivo) foi removido da tela sem substituto — a forma (ilustração +
// MiniFluxo + número + StatusChip) assume, nenhuma frase nova no lugar.
type CardVM = {
  key: SecaoKey;
  titulo: string;
  tone: StatusTone;
  stateLabel: string;
  metric: { value: string; label: string } | null;
  // NOVO (S02) — linha secundária, peso MENOR que o StatusChip. Hoje só o
  // cartão Cobrança usa (achado A6): nunca 2 termos de status com o mesmo
  // peso, então "Disparo automático" só vira texto quando DIVERGE do estado
  // principal — ver o bloco `cobranca` abaixo.
  secondary: string | null;
  note: string | null;
};

const INDISPONIVEL_NOTE = "Não deu pra ler o status agora — tente recarregar.";

function buildCard(key: SecaoKey, ov: Overview): CardVM {
  const meta = SECAO_META[key];
  const base = { key, titulo: meta.titulo };
  // Chip do WhatsApp é o MESMO pino físico pra todos os tipos de bot — usar o
  // preflight do bloco `motor` (fonte única) como proxy pros cartões que
  // dependem dele. `null` = motor indisponível (fail-soft: não assusta com
  // aviso que não dá pra confirmar).
  const chipOk = ov.motor.ok ? ov.motor.chipConectado : null;

  if (key === "atendente") {
    const b = ov.atendente;
    if (!b.ok) return { ...base, tone: "pausado", stateLabel: "Indisponível", metric: null, secondary: null, note: INDISPONIVEL_NOTE };
    const brainLabel = b.brain === "ia" ? "IA" : b.brain === "roteiro" ? "Roteiro" : "—";
    const publishBloqueado = ov.motor.ok && ov.motor.publishEnabled === false;
    let tone: StatusTone = "pausado";
    let stateLabel = "Não configurado";
    if (b.published && !publishBloqueado) {
      tone = "ligado";
      stateLabel = "Ligado";
    } else if (b.published && publishBloqueado) {
      tone = "atencao";
      stateLabel = "Aguardando suporte";
    } else if (b.brain) {
      tone = "rascunho";
      stateLabel = "Rascunho";
    }
    return {
      ...base,
      tone,
      stateLabel,
      metric: { value: brainLabel, label: "Cérebro atual" },
      secondary: null,
      note: chipOk === false ? "Sem chip do WhatsApp conectado." : null,
    };
  }

  if (key === "cobranca") {
    const b = ov.cobranca;
    if (!b.ok) return { ...base, tone: "pausado", stateLabel: "Indisponível", metric: null, secondary: null, note: INDISPONIVEL_NOTE };
    let tone: StatusTone = "pausado";
    let stateLabel = "Pausado";
    if (b.live) {
      tone = "ligado";
      stateLabel = "Ativo";
    } else if (chipOk === false) {
      tone = "atencao";
      stateLabel = "Pré-voo: sem chip";
    }
    // A6 (README) — antes: dot solto "Pausado" + metric GRANDE "Ligado"
    // liam como 2 status discordantes com o MESMO peso visual (achado do
    // QA). `workerEnabled` é flag de INFRA (disparo automático do sistema),
    // não config da empresa — deixa de ser metric; vira linha secundária
    // (peso menor, ver .aut-obj-card__secondary) e só aparece quando
    // DIVERGE do estado principal (b.live). Quando bate, é redundante e some.
    const secondary = b.workerEnabled !== b.live
      ? (b.workerEnabled ? "envio automático ativo" : "envio automático pausado")
      : null;
    return {
      ...base,
      tone,
      stateLabel,
      metric: null,
      secondary,
      note: tone === "atencao" ? "Conecte o WhatsApp para o recovery sair do pré-voo." : null,
    };
  }

  if (key === "prospeccao") {
    const b = ov.prospeccao;
    if (!b.ok) return { ...base, tone: "pausado", stateLabel: "Indisponível", metric: null, secondary: null, note: INDISPONIVEL_NOTE };
    let tone: StatusTone = "pausado";
    let stateLabel = "Pausado";
    if (b.live) {
      tone = "ligado";
      stateLabel = "Ativo";
    } else if (b.campaignId) {
      tone = "rascunho";
      stateLabel = "Configurado";
    }
    return { ...base, tone, stateLabel, metric: { value: String(b.pendingLeads), label: "Leads dentro" }, secondary: null, note: null };
  }

  // regras
  const b = ov.regras;
  if (!b.ok) return { ...base, tone: "pausado", stateLabel: "Indisponível", metric: null, secondary: null, note: INDISPONIVEL_NOTE };
  const total = b.gatilhosAtivos + b.rotinasAtivas;
  return {
    ...base,
    tone: total > 0 ? "ligado" : "pausado",
    stateLabel: total > 0 ? "Ativo" : "Nada ligado",
    metric: {
      value: String(total),
      label: `${b.gatilhosAtivos} gatilho${b.gatilhosAtivos === 1 ? "" : "s"} · ${b.rotinasAtivas} rotina${b.rotinasAtivas === 1 ? "" : "s"}`,
    },
    secondary: null,
    note: null,
  };
}

// Mapas estáticos de apresentação por objetivo (S02) — a ilustração (kit/
// ilustracoes.tsx) e o mini-fluxo compacto (kit/mini-fluxo.tsx) NÃO vêm do
// overview: são a FORMA fixa de cada objetivo (o dado real vira StatusChip +
// número-chave, via buildCard acima). Ficam fora de SECAO_META por serem
// puramente visuais, não meta de conteúdo.
const SECAO_ILUSTRACAO: Record<SecaoKey, (props: { className?: string }) => React.ReactElement> = {
  atendente: IlustracaoAtender,
  cobranca: IlustracaoCobrar,
  prospeccao: IlustracaoBuscar,
  regras: IlustracaoReagir,
};

const SECAO_FLUXO: Record<SecaoKey, MiniFluxoNode[]> = {
  atendente: [
    { icon: "msg", label: "Mensagem" },
    { icon: "atend", label: "Bot/IA" },
    { icon: "check", label: "Resposta" },
  ],
  cobranca: [
    { icon: "clock", label: "Vencido" },
    { icon: "send", label: "Lembrete" },
    { icon: "money", label: "Recebido" },
  ],
  prospeccao: [
    { icon: "search", label: "Lead" },
    { icon: "send", label: "Cadência" },
    { icon: "users", label: "Funil" },
  ],
  regras: [
    { icon: "bolt", label: "Gatilho" },
    { icon: "clock", label: "Rotina" },
    { icon: "users", label: "Funil" },
  ],
};

// ================================================================
// RAIZ
// ================================================================
export function AutomacaoHubClient() {
  useCurrentUser();
  const router = useRouter();
  const params = useSearchParams();
  const secaoParam = params.get("secao");

  // Deep-link (?secao=...) só decide o estado INICIAL — dali em diante é
  // estado local puro (mesmo padrão de /entrega/financeiro ?cliente=).
  const [secao, setSecao] = useState<SecaoKey | null>(isSecaoKey(secaoParam) ? secaoParam : null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<Overview>("/automation/overview");
      setOverview(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar o painel de automação.");
    }
  }, []);

  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch ao montar (guarda `alive` contra race/unmount); efeito legítimo
    void load().then(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [load]);

  const abrirSecao = useCallback((key: SecaoKey) => {
    setSecao(key);
    router.replace(`/automacao?secao=${key}`);
  }, [router]);

  const voltar = useCallback(() => {
    setSecao(null);
    router.replace("/automacao");
  }, [router]);

  const moduleAccess = overview?.moduleAccess ?? EMPTY_MODULE_ACCESS;

  const cards = useMemo(() => {
    if (!overview) return [];
    return SECOES.filter((key) => secaoGateOk(key, moduleAccess)).map((key) => buildCard(key, overview));
  }, [overview, moduleAccess]);

  // Seção aberta: só renderiza se o gate DAQUELA seção ainda passa (empresa
  // pode ter perdido acesso entre o deep-link e agora) — senão cai pro hub.
  // S13: "atendente" já tem conteúdo real (SecaoAtendente). S14: "cobranca"
  // idem (SecaoCobranca, Recovery reembalado). As demais (S15-S16) continuam
  // no placeholder "em migração" até a sprint delas chegar.
  if (secao && overview && secaoGateOk(secao, moduleAccess)) {
    const meta = SECAO_META[secao];
    return (
      <div className="work" style={{ flex: 1 }}>
        <div className="aut-secao-head">
          <button type="button" className="btn-ghost" onClick={voltar}><I d={ICONS.back} size={14} /> Voltar</button>
          <div style={{ minWidth: 0 }}>
            <div className="auto-hero__title">{meta.titulo}</div>
            <div className="auto-hero__sub">{meta.sub}</div>
          </div>
        </div>
        {secao === "atendente" ? (
          <SecaoAtendente
            iaPublishEnabled={Boolean(overview.motor.ok && overview.motor.publishEnabled)}
            onChanged={() => { void load(); }}
          />
        ) : secao === "cobranca" ? (
          <SecaoCobranca onChanged={() => { void load(); }} />
        ) : secao === "prospeccao" ? (
          <SecaoProspeccao motor={overview.motor} onChanged={() => { void load(); }} />
        ) : (
          <SecaoRegras motor={overview.motor} onChanged={() => { void load(); }} />
        )}
      </div>
    );
  }

  const motorOn = Boolean(overview?.motor.ok && overview.motor.chipConectado);

  return (
    <div className="work" style={{ flex: 1 }}>
      <header className="auto-hero">
        <div className="auto-hero__id">
          <span className="auto-hero__badge"><I d={ICONS.automacao} size={22} /></span>
          <div className="auto-hero__title">Automação</div>
        </div>
        {/* S02 (PADRAO-MERCADO) — hero enxuto: a frase "Uma superfície só..."
            e a explicação à direita saíram sem substituto (Lei nº1). O
            StatusChip fala sozinho: tone `ligado`/`atencao` já diz o estado;
            a AÇÃO (conectar o WhatsApp) vira tooltip, só quando falta chip. */}
        <div className="auto-engine">
          <span title={motorOn ? undefined : "Conecte o WhatsApp em qualquer seção com chip para os objetivos saírem do papel."}>
            <StatusChip tone={motorOn ? "ligado" : "atencao"} label={motorOn ? "WhatsApp conectado" : "Sem chip"} />
          </span>
        </div>
      </header>

      {error && (
        <section className="panel">
          <div style={{ padding: 18, display: "grid", gap: 10, justifyItems: "start" }}>
            <strong>Não carregou</strong>
            <span className="hint">{error}</span>
            <button className="btn-ghost" onClick={() => { setLoading(true); void load().then(() => setLoading(false)); }}>Tentar novamente</button>
          </div>
        </section>
      )}

      {!error && loading && (
        <div className="aut-hub-grid">
          {[0, 1, 2, 3].map((i) => <div key={i} className="auto-skel" />)}
        </div>
      )}

      {!error && !loading && cards.length === 0 && (
        <section className="panel">
          <div style={{ padding: 18, display: "grid", gap: 6, justifyItems: "start" }}>
            <strong>Nenhum objetivo liberado</strong>
            <span className="hint">Sua empresa ainda não tem atendimento, bot ou vendas liberado — fale com o suporte.</span>
          </div>
        </section>
      )}

      {!error && !loading && cards.length > 0 && (
        <div className="aut-hub-grid">
          {cards.map((c) => <ObjetivoCard key={c.key} card={c} onAbrir={() => abrirSecao(c.key)} />)}
        </div>
      )}
    </div>
  );
}

function ObjetivoCard({ card, onAbrir }: { card: CardVM; onAbrir: () => void }) {
  const Ilustracao = SECAO_ILUSTRACAO[card.key];
  return (
    <div className="aut-obj-card">
      <div className="aut-obj-card__head">
        <span className="aut-obj-card__illus" aria-hidden="true"><Ilustracao /></span>
        <div className="aut-obj-card__head-text">
          <div className="aut-obj-card__title">{card.titulo}</div>
          <MiniFluxo nodes={SECAO_FLUXO[card.key]} compact />
        </div>
      </div>

      <div className="aut-obj-card__status">
        <StatusChip tone={card.tone} label={card.stateLabel} />
        {/* Preflight ruim (S02, item 4): ícone+tooltip no lugar da frase
            solta — o texto de `card.note` só existe no hover (`title`). */}
        {card.note && (
          <span className="aut-obj-card__notebadge" title={card.note}>
            <I d={ICONS.bell} size={12} />
          </span>
        )}
      </div>

      {/* A6 (S02, item 3): linha secundária — só existe quando diverge do
          StatusChip acima; hoje só o cartão Cobrança preenche `secondary`. */}
      {card.secondary && <div className="aut-obj-card__secondary">{card.secondary}</div>}

      {card.metric && (
        <div className="aut-obj-card__metric">
          <span className="aut-obj-card__metric-n">{card.metric.value}</span>
          <span className="aut-obj-card__metric-l">{card.metric.label}</span>
        </div>
      )}

      <div className="aut-obj-card__foot">
        <button type="button" className="btn-teal" onClick={onAbrir}>Abrir</button>
      </div>
    </div>
  );
}
