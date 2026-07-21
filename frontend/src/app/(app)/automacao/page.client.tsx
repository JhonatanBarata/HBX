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
// sub-rota Next — README "Regras de orquestração"). Nesta sprint cada seção
// só mostra um placeholder "em migração" com link pra tela clássica
// correspondente; S13-S16 substituem pelo conteúdo real, seção por seção.
// As telas velhas (/bot, /automacoes, /assistente) continuam no ar e
// intocadas — matar/redirecionar é trabalho da S17.
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

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";

import { I, ICONS, useCurrentUser } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";
import { SecaoAtendente } from "./secao-atendente";

// ================================================================
// Shape do GET /automation/overview — espelha
// backend/src/automation/automation-overview.service.ts (AutomationOverviewResponse).
// ================================================================
type AgentBrain = "roteiro" | "ia";
type Block<T extends Record<string, unknown>> = ({ ok: true } & T) | { ok: false; reason: string };

type Overview = {
  companyId: number;
  moduleAccess: { atendimento: boolean; bot: boolean; vendas: boolean };
  botArmed: { armed: boolean; armedAt: string | null; armedByUserId: number | null };
  atendente: Block<{ brain: AgentBrain | null; published: boolean; updatedAt: string | null }>;
  cobranca: Block<{ live: boolean; workerEnabled: boolean }>;
  prospeccao: Block<{ live: boolean; campaignId: string | null; pendingLeads: number }>;
  regras: Block<{ gatilhosAtivos: number; rotinasAtivas: number }>;
  motor: Block<{ runnerEnabled: boolean; publishEnabled: boolean; chipConectado: boolean; executores: unknown[] }>;
};

type SecaoKey = "atendente" | "cobranca" | "prospeccao" | "regras";
const SECOES: SecaoKey[] = ["atendente", "cobranca", "prospeccao", "regras"];
function isSecaoKey(v: string | null): v is SecaoKey {
  return v !== null && (SECOES as string[]).includes(v);
}

type LegacyLink = { href: string; label: string };
type SecaoMeta = { key: SecaoKey; titulo: string; sub: string; icon: keyof typeof ICONS; legacy: LegacyLink[] };

const SECAO_META: Record<SecaoKey, SecaoMeta> = {
  atendente: {
    key: "atendente",
    titulo: "Atender sozinho",
    icon: "atend",
    sub: "Roteiro de menu ou IA respondendo o cliente no seu lugar, sem vendedor no meio.",
    legacy: [
      { href: "/assistente", label: "Assistente IA" },
      { href: "/bot", label: "Bot (roteiro)" },
    ],
  },
  cobranca: {
    key: "cobranca",
    titulo: "Cobrar quem deve",
    icon: "money",
    sub: "Recovery: lembra o cliente que ficou devendo, no ritmo certo, sem constrangimento.",
    legacy: [{ href: "/bot", label: "Bot — Cobrança" }],
  },
  prospeccao: {
    key: "prospeccao",
    titulo: "Buscar clientes",
    icon: "search",
    sub: "Cadência e prospecção ativa puxando leads pro funil sozinhas.",
    legacy: [
      { href: "/automacoes", label: "Automações — Cadências" },
      { href: "/bot", label: "Bot — Prospecção" },
    ],
  },
  regras: {
    key: "regras",
    titulo: "Reagir e abastecer",
    icon: "bolt",
    sub: "Gatilhos e rotinas cuidando do funil sozinhos, sem ninguém precisar lembrar.",
    legacy: [{ href: "/automacoes", label: "Automações — Gatilhos e rotinas" }],
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
// (dot de status, 1 número-chave, aviso opcional). Fail-soft: bloco
// `ok:false` nunca derruba a tela, vira estado "Indisponível".
// ================================================================
type Dot = "on" | "warn" | "off" | "muted";
type CardVM = {
  key: SecaoKey;
  titulo: string;
  sub: string;
  icon: keyof typeof ICONS;
  dot: Dot;
  stateLabel: string;
  metric: { value: string; label: string } | null;
  note: string | null;
};

const INDISPONIVEL_NOTE = "Não deu pra ler o status agora — tente recarregar.";

function buildCard(key: SecaoKey, ov: Overview): CardVM {
  const meta = SECAO_META[key];
  const base = { key, titulo: meta.titulo, sub: meta.sub, icon: meta.icon };
  // Chip do WhatsApp é o MESMO pino físico pra todos os tipos de bot — usar o
  // preflight do bloco `motor` (fonte única) como proxy pros cartões que
  // dependem dele. `null` = motor indisponível (fail-soft: não assusta com
  // aviso que não dá pra confirmar).
  const chipOk = ov.motor.ok ? ov.motor.chipConectado : null;

  if (key === "atendente") {
    const b = ov.atendente;
    if (!b.ok) return { ...base, dot: "muted", stateLabel: "Indisponível", metric: null, note: INDISPONIVEL_NOTE };
    const brainLabel = b.brain === "ia" ? "IA" : b.brain === "roteiro" ? "Roteiro" : "—";
    const publishBloqueado = ov.motor.ok && ov.motor.publishEnabled === false;
    let dot: Dot = "off";
    let stateLabel = "Não configurado";
    if (b.published && !publishBloqueado) {
      dot = "on";
      stateLabel = "Ligado";
    } else if (b.published && publishBloqueado) {
      dot = "warn";
      stateLabel = "Aguardando suporte";
    } else if (b.brain) {
      dot = "muted";
      stateLabel = "Rascunho";
    }
    return {
      ...base,
      dot,
      stateLabel,
      metric: { value: brainLabel, label: "Cérebro atual" },
      note: chipOk === false ? "Sem chip do WhatsApp conectado." : null,
    };
  }

  if (key === "cobranca") {
    const b = ov.cobranca;
    if (!b.ok) return { ...base, dot: "muted", stateLabel: "Indisponível", metric: null, note: INDISPONIVEL_NOTE };
    let dot: Dot = "off";
    let stateLabel = "Pausado";
    if (b.live) {
      dot = "on";
      stateLabel = "Ativo";
    } else if (chipOk === false) {
      dot = "warn";
      stateLabel = "Pré-voo: sem chip";
    }
    return {
      ...base,
      dot,
      stateLabel,
      metric: { value: b.workerEnabled ? "Ligado" : "Manual", label: "Disparo automático" },
      note: dot === "warn" ? "Conecte o WhatsApp para o recovery sair do pré-voo." : null,
    };
  }

  if (key === "prospeccao") {
    const b = ov.prospeccao;
    if (!b.ok) return { ...base, dot: "muted", stateLabel: "Indisponível", metric: null, note: INDISPONIVEL_NOTE };
    let dot: Dot = "off";
    let stateLabel = "Pausado";
    if (b.live) {
      dot = "on";
      stateLabel = "Ativo";
    } else if (b.campaignId) {
      dot = "muted";
      stateLabel = "Configurado";
    }
    return { ...base, dot, stateLabel, metric: { value: String(b.pendingLeads), label: "Leads dentro" }, note: null };
  }

  // regras
  const b = ov.regras;
  if (!b.ok) return { ...base, dot: "muted", stateLabel: "Indisponível", metric: null, note: INDISPONIVEL_NOTE };
  const total = b.gatilhosAtivos + b.rotinasAtivas;
  return {
    ...base,
    dot: total > 0 ? "on" : "off",
    stateLabel: total > 0 ? "Ativo" : "Nada ligado",
    metric: {
      value: String(total),
      label: `${b.gatilhosAtivos} gatilho${b.gatilhosAtivos === 1 ? "" : "s"} · ${b.rotinasAtivas} rotina${b.rotinasAtivas === 1 ? "" : "s"}`,
    },
    note: null,
  };
}

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
  // S13: "atendente" já tem conteúdo real (SecaoAtendente); as demais (S14-S16)
  // continuam no placeholder "em migração" até a sprint delas chegar.
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
        ) : (
          <section className="panel aut-secao-placeholder">
            <span className="aut-secao-placeholder__icon"><I d={ICONS[meta.icon]} size={26} /></span>
            <h4>Em migração</h4>
            <p>Esta seção ainda está sendo fundida na casca nova. Por enquanto, use a tela clássica abaixo — os dados são os mesmos.</p>
            <div className="aut-legacy-links">
              {meta.legacy.map((l) => (
                <Link key={l.href} className="btn-ghost" href={l.href}>{l.label}</Link>
              ))}
            </div>
          </section>
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
          <div style={{ minWidth: 0 }}>
            <div className="auto-hero__title">Automação</div>
            <div className="auto-hero__sub">Uma superfície só, entrada por objetivo — atender, cobrar, buscar e reagir sozinhos.</div>
          </div>
        </div>
        <div className="auto-engine">
          <span className={"auto-engine__chip " + (motorOn ? "is-on" : "is-off")}>
            <span className="auto-engine__dot" />
            {motorOn ? "WhatsApp conectado" : "Sem chip conectado"}
          </span>
          <span className="auto-engine__hint">
            {motorOn
              ? "O chip está pronto — cada cartão abaixo mostra se o objetivo está ligado de verdade."
              : "Conecte o WhatsApp em qualquer seção com chip pros objetivos saírem do papel."}
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
  return (
    <div className="aut-obj-card">
      <div className="aut-obj-card__head">
        <span className="aut-obj-card__icon"><I d={ICONS[card.icon]} size={18} /></span>
        <div style={{ minWidth: 0 }}>
          <div className="aut-obj-card__title">{card.titulo}</div>
          <div className="aut-obj-card__sub">{card.sub}</div>
        </div>
      </div>

      <div className="aut-obj-card__status">
        <span className={"aut-obj-dot is-" + card.dot} />
        <span>{card.stateLabel}</span>
      </div>

      <div className="aut-obj-card__metric">
        <span className="aut-obj-card__metric-n">{card.metric ? card.metric.value : "—"}</span>
        <span className="aut-obj-card__metric-l">{card.metric ? card.metric.label : "Sem dado"}</span>
      </div>

      {card.note && (
        <div className="aut-obj-card__note"><I d={ICONS.bell} size={13} /><span>{card.note}</span></div>
      )}

      <div className="aut-obj-card__foot">
        <button type="button" className="btn-teal" onClick={onAbrir}>Abrir</button>
      </div>
    </div>
  );
}
