"use client";

// Tela Bot (template docs/TEMAS/*/corporate/Bot.html) ligada na config real:
// GET /inbox/bot-config → nós mapeáveis do canvas mostram os textos reais
// (Boas-vindas=welcomeMessage, Qualificação=mainMenuPrompt, Transferir para
// humano=humanAckMessage, Mensagem final=closeTopicMessage) e o chat de
// teste usa as mensagens/botões reais. O bot real é CONFIG estruturada, não
// grafo livre — edição pelo canvas precisa de decisão de produto (doc do PR).
// Salvar/Publicar = PATCH real: como o backend faz FULL-REPLACE (normaliza o
// payload do zero), mandamos a config COMPLETA carregada com as edições por
// cima, senão campos fora do formulário (botões, actionCatalog, setup) seriam
// zerados. ⋯ recarrega do servidor; zoom/pan do canvas, reset do chat de teste
// e inserir emoji ligados. Os blocos levam às Configurações (onde o bot é
// configurado); o construtor visual de grafo continua sendo decisão de produto.
// Adaptação SPA: classe extra "app-viewport" no .app (ver screens.css).

import React, { useEffect, useRef, useState } from "react";

import { I, ICONS, Sidebar, Topbar } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";
import { useTabIndex } from "@/lib/use-tab-param";

type BotButton = { buttonId: string; actionId: string; title: string; nextNodeId?: string };

type BotRoutingRules = {
  globalBotEnabled?: boolean;
  checkRecoveryBeforeReply?: boolean;
  autoRouteDebtorsToRecovery?: boolean;
  autoReopenClosedConversation?: boolean;
  notifyOnNewInbound?: boolean;
};

type BotAction = { actionId: string; title?: string; enabled?: boolean };

type BotConfig = {
  setup?: { completed?: boolean; botType?: string | null };
  welcomeMessage?: string;
  welcomeButtons?: BotButton[];
  returningCustomerMessage?: string;
  mainMenuPrompt?: string;
  mainMenuButtons?: BotButton[];
  postActionPrompt?: string;
  humanAckMessage?: string;
  closeTopicMessage?: string;
  blockedMessage?: string;
  routingRules?: BotRoutingRules;
  actionCatalog?: BotAction[];
};

// grupos de botões editáveis (PATCH /inbox/bot-config) — o backend exige
// buttonId estável e único e actionId existente no actionCatalog
type BotaoGrupo = "welcomeButtons" | "mainMenuButtons";
const BOT_BTN_GROUPS: { key: BotaoGrupo; label: string; hint: string }[] = [
  { key: "welcomeButtons", label: "Botões de boas-vindas", hint: "aparecem na primeira mensagem" },
  { key: "mainMenuButtons", label: "Botões do menu principal", hint: "opções do menu" },
];

// campos de mensagem editáveis na aba Configurações (PATCH /inbox/bot-config)
const BOT_MSG_FIELDS: { key: keyof BotConfig; label: string; hint: string }[] = [
  { key: "welcomeMessage", label: "Boas-vindas", hint: "Primeira mensagem para contato novo" },
  { key: "returningCustomerMessage", label: "Cliente retornando", hint: "Quando o contato já é conhecido" },
  { key: "mainMenuPrompt", label: "Menu principal", hint: "Pergunta com as opções do menu" },
  { key: "postActionPrompt", label: "Pós-ação", hint: "Depois de concluir uma ação" },
  { key: "humanAckMessage", label: "Transferência para humano", hint: "Aviso de que um atendente assume" },
  { key: "closeTopicMessage", label: "Encerramento", hint: "Fechamento da conversa" },
  { key: "blockedMessage", label: "Contato bloqueado", hint: "Resposta para contato bloqueado" },
];

const BOT_RULES: { key: keyof BotRoutingRules; label: string; hint: string }[] = [
  { key: "globalBotEnabled", label: "Bot ligado", hint: "Liga/desliga o bot em todas as conversas novas" },
  { key: "checkRecoveryBeforeReply", label: "Checar Recovery antes", hint: "Verifica pendências antes de responder" },
  { key: "autoRouteDebtorsToRecovery", label: "Devedor vai pro Recovery", hint: "Roteia inadimplente automaticamente" },
  { key: "autoReopenClosedConversation", label: "Reabrir conversa fechada", hint: "Nova mensagem reabre o atendimento" },
  { key: "notifyOnNewInbound", label: "Avisar nova mensagem", hint: "Notifica a equipe a cada inbound" },
];

const BLOCKS = [
  { t: "Mensagem", d: "Envie uma mensagem de texto", c: "var(--hbx-brand)", ic: "msg" },
  { t: "Pergunta", d: "Faça uma pergunta ao contato", c: "var(--hbx-info)", ic: "atend" },
  { t: "Condição", d: "Crie caminhos com regras", c: "var(--hbx-warning)", ic: "filter" },
  { t: "Ação", d: "Execute uma ação no sistema", c: "var(--hbx-success)", ic: "check" },
  { t: "Atraso", d: "Adicione uma pausa no fluxo", c: "var(--hbx-secondary)", ic: "clock" },
  { t: "Integração", d: "Conecte com outras ferramentas", c: "var(--hbx-info)", ic: "scrape" },
];

type FlowNode = { id: string; x: number; y: number; ic: string; c: string; t: string; b: string; f?: string; yn?: boolean };

const NODES: FlowNode[] = [
  { id: "boas", x: 40, y: 60, ic: "msg", c: "var(--hbx-brand)", t: "Boas-vindas", b: "👋 Olá! Bem-vindo à HBX. Como posso te ajudar hoje?", f: "Próximo passo" },
  { id: "qual", x: 300, y: 60, ic: "atend", c: "var(--hbx-info)", t: "Qualificação", b: "Qual melhor descreve sua necessidade hoje?", f: "Próximo passo" },
  { id: "cond", x: 560, y: 60, ic: "filter", c: "var(--hbx-warning)", t: "Condição", b: "Interessado em soluções comerciais?", yn: true },
  { id: "capt", x: 170, y: 290, ic: "doc", c: "var(--hbx-info)", t: "Capturar interesse", b: "Qual área da sua empresa você quer melhorar?", f: "Próximo passo" },
  { id: "agen", x: 420, y: 290, ic: "clock", c: "var(--hbx-success)", t: "Agendamento", b: "Posso agendar uma conversa com nosso especialista?", f: "Próximo passo" },
  { id: "msgf", x: 670, y: 290, ic: "msg", c: "var(--hbx-brand)", t: "Mensagem", b: "Tudo bem! Se precisar de algo, estarei por aqui. 😊", f: "Fim do fluxo" },
  { id: "ofer", x: 170, y: 480, ic: "money", c: "var(--hbx-success)", t: "Oferta", b: "Temos uma solução ideal para o que você precisa.", f: "Próximo passo" },
  { id: "tran", x: 420, y: 480, ic: "users", c: "var(--hbx-warning)", t: "Transferir para humano", b: "Conectando você com um de nossos atendentes...", f: "Próximo passo" },
];

type FlowEdge = { from: [number, number]; to: [number, number]; c: string; curve?: boolean };

const EDGES: FlowEdge[] = [
  { from: [255, 130], to: [300, 130], c: "var(--hbx-brand)" },
  { from: [515, 130], to: [560, 130], c: "var(--hbx-brand)" },
  { from: [620, 196], to: [278, 290], c: "var(--hbx-brand)", curve: true },
  { from: [660, 196], to: [528, 290], c: "var(--hbx-brand)", curve: true },
  { from: [700, 196], to: [778, 290], c: "var(--hbx-danger)", curve: true },
  { from: [278, 408], to: [278, 480], c: "var(--hbx-brand)" },
  { from: [528, 408], to: [528, 480], c: "var(--hbx-brand)" },
];

type ChatMsg = { dir: "in" | "out"; text: string; tm: string; quick?: boolean };

const CHAT0: ChatMsg[] = [
  { dir: "in", text: "👋 Olá! Bem-vindo à HBX. Como posso te ajudar hoje?", tm: "10:30" },
  { dir: "out", text: "Quero melhorar nosso processo comercial.", tm: "10:31" },
  { dir: "in", text: "Qual melhor descreve sua necessidade hoje?", tm: "10:31", quick: true },
];

const EMOJIS = ["😊", "👍", "🙏", "🎉", "❤️", "😂", "🚀", "✅"];

function hhmm() {
  return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// textos reais da config nos nós mapeáveis do canvas
const NODE_CONFIG_FIELD: Record<string, keyof BotConfig> = {
  boas: "welcomeMessage",
  qual: "mainMenuPrompt",
  tran: "humanAckMessage",
  msgf: "closeTopicMessage",
};

export function BotClient() {
  const [selNode, setSelNode] = useState("cond");
  const [chat, setChat] = useState(CHAT0);
  const [draft, setDraft] = useState("");
  const [config, setConfig] = useState<BotConfig | null>(null);
  const [step, setStep] = useState(0);
  // aba ativa + editor da aba Configurações (decisão do dono 12/06/2026:
  // a configuração do bot mora aqui; PATCH /inbox/bot-config)
  const [tab, setTab] = useTabIndex("tab", 0);
  const [cfgForm, setCfgForm] = useState<Partial<BotConfig>>({});
  const [cfgRules, setCfgRules] = useState<Partial<BotRoutingRules>>({});
  const [cfgBusy, setCfgBusy] = useState(false);
  const [cfgMsg, setCfgMsg] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [canvasTool, setCanvasTool] = useState<"select" | "pan">("select");
  const endRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  const emojiIdx = useRef(0);

  function cfgValue(key: keyof BotConfig): string {
    const edited = cfgForm[key];
    if (typeof edited === "string") return edited;
    const real = config?.[key];
    return typeof real === "string" ? real : "";
  }

  function ruleValue(key: keyof BotRoutingRules): boolean {
    const edited = cfgRules[key];
    if (typeof edited === "boolean") return edited;
    return Boolean(config?.routingRules?.[key]);
  }

  // editor de botões: null no grupo = não editado (mostra a config real)
  const [cfgBotoes, setCfgBotoes] = useState<Partial<Record<BotaoGrupo, BotButton[]>>>({});

  function botoesDe(grupo: BotaoGrupo): BotButton[] {
    return cfgBotoes[grupo] ?? (config?.[grupo] || []);
  }

  function editarBotao(grupo: BotaoGrupo, idx: number, patch: Partial<BotButton>) {
    setCfgBotoes(prev => {
      const atual = (prev[grupo] ?? (config?.[grupo] || [])).map(b => ({ ...b }));
      if (atual[idx]) atual[idx] = { ...atual[idx], ...patch };
      return { ...prev, [grupo]: atual };
    });
  }

  function addBotao(grupo: BotaoGrupo) {
    setCfgBotoes(prev => {
      const atual = (prev[grupo] ?? (config?.[grupo] || [])).map(b => ({ ...b }));
      // buttonId estável e único (exigência do backend)
      const novoId = `btn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      atual.push({ buttonId: novoId, actionId: "", title: "" });
      return { ...prev, [grupo]: atual };
    });
  }

  function removerBotao(grupo: BotaoGrupo, idx: number) {
    setCfgBotoes(prev => {
      const atual = (prev[grupo] ?? (config?.[grupo] || [])).filter((_, i) => i !== idx);
      return { ...prev, [grupo]: atual };
    });
  }

  const acoesDisponiveis = (config?.actionCatalog || []).filter(a => a.enabled !== false);

  // PATCH /inbox/bot-config é FULL-REPLACE (o backend normaliza o payload do
  // zero e zera o que não vier — welcomeButtons viram [], setup/actionCatalog
  // voltam ao default). Por isso partimos da config COMPLETA carregada e só
  // sobrepomos as edições do formulário: assim nada é perdido ao salvar.
  function buildBody(overrides?: { globalBotEnabled?: boolean }): Record<string, unknown> {
    const body: Record<string, unknown> = config ? { ...config } : {};
    for (const f of BOT_MSG_FIELDS) {
      const v = cfgValue(f.key);
      if (v.trim()) body[f.key] = v;
    }
    const rules: Record<string, boolean> = Object.fromEntries(BOT_RULES.map(r => [r.key, ruleValue(r.key)]));
    if (overrides && typeof overrides.globalBotEnabled === "boolean") rules.globalBotEnabled = overrides.globalBotEnabled;
    body.routingRules = rules;
    for (const g of BOT_BTN_GROUPS) {
      const editados = cfgBotoes[g.key];
      if (!editados) continue;
      body[g.key] = editados.map(b => ({
        buttonId: b.buttonId,
        actionId: b.actionId,
        title: b.title.trim(),
        ...(b.nextNodeId ? { nextNodeId: b.nextNodeId } : {}),
      }));
    }
    return body;
  }

  async function patchConfig(body: Record<string, unknown>, okMsg: string) {
    if (cfgBusy) return;
    setCfgBusy(true);
    setCfgMsg(null);
    try {
      const updated = await apiFetch<BotConfig>("/inbox/bot-config", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (updated && typeof updated === "object") setConfig(updated);
      setCfgForm({});
      setCfgRules({});
      setCfgBotoes({});
      setCfgMsg(okMsg);
    } catch (err) {
      setCfgMsg(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setCfgBusy(false);
    }
  }

  function salvarConfig() {
    void patchConfig(buildBody(), "✓ Configuração salva.");
  }

  // Publicar = salvar + ligar/desligar o bot em todas as conversas novas
  // (routingRules.globalBotEnabled). O backend recusa se o setup não estiver
  // completo — a mensagem dele aparece no cabeçalho.
  function publicar() {
    if (cfgBusy) return;
    const ligar = !Boolean(config?.routingRules?.globalBotEnabled);
    if (
      ligar &&
      typeof window !== "undefined" &&
      !window.confirm("Publicar o bot? Ele passará a responder automaticamente as novas conversas do WhatsApp.")
    ) return;
    void patchConfig(buildBody({ globalBotEnabled: ligar }), ligar ? "✓ Bot publicado e ativo." : "✓ Bot despublicado.");
  }

  // Recarrega a config salva do servidor (botão ⋯) e descarta edições locais.
  async function recarregar() {
    if (cfgBusy) return;
    setCfgMsg(null);
    try {
      const cfg = await apiFetch<BotConfig>("/inbox/bot-config");
      if (!cfg) return;
      setConfig(cfg);
      setCfgForm({});
      setCfgRules({});
      setCfgBotoes({});
      if (cfg.welcomeMessage) { setChat([{ dir: "in", text: cfg.welcomeMessage, tm: hhmm(), quick: true }]); setStep(0); }
      setCfgMsg("✓ Configuração recarregada.");
    } catch (err) {
      setCfgMsg(err instanceof Error ? err.message : "Não foi possível recarregar.");
    }
  }

  function resetChat() {
    if (config?.welcomeMessage) setChat([{ dir: "in", text: config.welcomeMessage, tm: hhmm(), quick: true }]);
    else setChat(CHAT0);
    setStep(0);
    setDraft("");
  }

  const zoomIn = () => setZoom(z => Math.min(1.5, Math.round((z + 0.1) * 10) / 10));
  const zoomOut = () => setZoom(z => Math.max(0.5, Math.round((z - 0.1) * 10) / 10));

  function addEmoji() {
    const e = EMOJIS[emojiIdx.current % EMOJIS.length];
    emojiIdx.current += 1;
    setDraft(d => d + e);
  }

  // pan do canvas quando a ferramenta "mover" está ativa (arrasta o scroll)
  function onCanvasDown(e: React.MouseEvent) {
    if (canvasTool !== "pan" || !canvasRef.current) return;
    panRef.current = { x: e.clientX, y: e.clientY, sl: canvasRef.current.scrollLeft, st: canvasRef.current.scrollTop };
  }
  function onCanvasMove(e: React.MouseEvent) {
    if (!panRef.current || !canvasRef.current) return;
    canvasRef.current.scrollLeft = panRef.current.sl - (e.clientX - panRef.current.x);
    canvasRef.current.scrollTop = panRef.current.st - (e.clientY - panRef.current.y);
  }
  function onCanvasUp() { panRef.current = null; }
  useEffect(() => { if (endRef.current) endRef.current.scrollTop = endRef.current.scrollHeight; }, [chat]);

  useEffect(() => {
    let alive = true;
    apiFetch<BotConfig>("/inbox/bot-config")
      .then(cfg => {
        if (!alive || !cfg) return;
        setConfig(cfg);
        if (cfg.welcomeMessage) {
          setChat([{ dir: "in", text: cfg.welcomeMessage, tm: hhmm(), quick: true }]);
          setStep(0);
        }
      })
      .catch(() => { /* config indisponível — teste segue com texto do template */ });
    return () => { alive = false; };
  }, []);

  function nodeBody(n: FlowNode) {
    const field = NODE_CONFIG_FIELD[n.id];
    const real = field && config ? config[field] : null;
    return typeof real === "string" && real.trim() ? real : n.b;
  }

  function reply(text: string) {
    const now = hhmm();
    setChat(c => {
      const next: ChatMsg[] = [...c.map(m => ({ ...m, quick: false })), { dir: "out" as const, text, tm: now }];
      if (config) {
        if (step === 0 && config.mainMenuPrompt) {
          next.push({ dir: "in" as const, text: config.mainMenuPrompt, tm: now, quick: Boolean(config.mainMenuButtons?.length) });
        } else if (config.postActionPrompt) {
          next.push({ dir: "in" as const, text: config.postActionPrompt, tm: now });
        }
      } else {
        next.push({ dir: "in" as const, text: "Perfeito! Posso agendar uma conversa com nosso especialista?", tm: now });
      }
      return next;
    });
    setStep(s => s + 1);
  }
  function send() { if (!draft.trim()) return; reply(draft.trim()); setDraft(""); }

  const quickOptions = config
    ? (step === 0 ? config.welcomeButtons : config.mainMenuButtons)?.map(b => b.title).filter(Boolean) || []
    : ["Aumentar vendas", "Organizar processos", "Encontrar novos clientes", "Outro"];
  const setupBadge = config
    ? config.setup?.completed ? "✓ Configurado" : "Configuração pendente"
    : "✓ Salvo";
  const botAtivo = Boolean(config?.routingRules?.globalBotEnabled);

  return (
    <div className="app app-viewport">
      <Sidebar active="bot" />
      <div className="main">
        <Topbar title="Bot" crumbs={<React.Fragment>Home &rsaquo; Bot &rsaquo; <b>Construtor</b></React.Fragment>} />
        <div className="bot-head">
          <h1>Construtor de Bot <I d={["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"]} size={16} /></h1>
          <span className="saved" style={config && !config.setup?.completed ? { color: "var(--hbx-warning)" } : {}}>{setupBadge}</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 9 }}>
            {cfgMsg && <span style={{ alignSelf: "center", fontSize: "0.7rem", fontWeight: 700, color: cfgMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-danger)" }}>{cfgMsg}</span>}
            <button className="btn-ghost" style={{ minWidth: 38 }} title="Recarregar configuração do servidor" onClick={recarregar} disabled={cfgBusy}>⋯</button>
            <button className="btn-ghost" onClick={() => setTab(0)}><I d={ICONS.send} size={13} /> Testar bot</button>
            <button className="btn-ghost" onClick={salvarConfig} disabled={cfgBusy}>{cfgBusy ? "Salvando…" : "Salvar"}</button>
            <button className="btn-teal" onClick={publicar} disabled={cfgBusy}>{botAtivo ? "Publicado ✓" : "Publicar"}</button>
          </div>
        </div>
        <div className="bot-tabs">
          {["Fluxo", "Configurações", "Integrações", "Publicação", "Análises"].map((t, i) => (
            <button key={t} className={"bot-tab" + (tab === i ? " on" : "")} onClick={() => setTab(i)}>{t}</button>
          ))}
          <div className="right"><span>Versão rascunho</span><span className="saved">{setupBadge}</span></div>
        </div>

        {tab === 0 && (
        <div className="builder">
          <aside className="blocks">
            <h2>Tipos de bloco</h2>
            <p className="hint">Clique para configurar o bot</p>
            {BLOCKS.map(b => (
              <div className="block" key={b.t} role="button" tabIndex={0} title="Configurar nas Configurações"
                style={{ cursor: "pointer" }} onClick={() => setTab(1)}
                onKeyDown={e => (e.key === "Enter" || e.key === " ") && setTab(1)}>
                <span className="bicon" style={{ background: b.c }}><I d={ICONS[b.ic]} size={15} /></span>
                <span><strong>{b.t}</strong><small>{b.d}</small></span>
              </div>
            ))}
            <div className="tip">💡 O fluxo do bot é configurado na aba Configurações (mensagens, botões e regras).</div>
          </aside>

          <div className="canvas" ref={canvasRef} onMouseDown={onCanvasDown} onMouseMove={onCanvasMove}
            onMouseUp={onCanvasUp} onMouseLeave={onCanvasUp} style={{ cursor: canvasTool === "pan" ? "grab" : "default" }}>
            <div className="canvas-tools">
              <button className={"ct" + (canvasTool === "select" ? " on" : "")} title="Selecionar" onClick={() => setCanvasTool("select")}><I d={["M4 4l7 16 2.5-6.5L20 11z"]} size={14} /></button>
              <button className={"ct" + (canvasTool === "pan" ? " on" : "")} title="Mover (arraste o canvas)" onClick={() => setCanvasTool("pan")}><I d={["M18 11V7a2 2 0 0 0-4 0v4M14 10V5a2 2 0 0 0-4 0v5M10 10.5V7a2 2 0 0 0-4 0v7a7 7 0 0 0 14 0v-3a2 2 0 0 0-4 0"]} size={14} /></button>
              <button className="ct" title="Diminuir zoom" onClick={zoomOut}><I d={ICONS.search} size={14} /></button>
              <button className="ct" style={{ minWidth: 44 }} title="Voltar a 100%" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
              <button className="ct" title="Aumentar zoom" onClick={zoomIn}><I d={ICONS.plus} size={14} /></button>
            </div>
            <div style={{ position: "relative", width: 940, height: 640, transform: `scale(${zoom})`, transformOrigin: "top left" }}>
              <svg style={{ position: "absolute", inset: 0, pointerEvents: "none" }} width="940" height="640">
                {EDGES.map((e, i) => {
                  const [x1, y1] = e.from, [x2, y2] = e.to;
                  const d = e.curve
                    ? `M ${x1} ${y1} C ${x1} ${y1 + 50}, ${x2} ${y2 - 50}, ${x2} ${y2}`
                    : `M ${x1} ${y1} L ${x2} ${y2}`;
                  return (
                    <g key={i}>
                      <path d={d} style={{ stroke: e.c }} strokeWidth="1.6" fill="none" opacity="0.85" />
                      <circle cx={x2} cy={y2} r="3.5" style={{ fill: e.c }} />
                      <circle cx={x1} cy={y1} r="3.5" style={{ fill: e.c }} opacity="0.6" />
                    </g>
                  );
                })}
              </svg>
              {NODES.map(n => (
                <article key={n.id} className={"node" + (selNode === n.id ? " sel" : "")} style={{ left: n.x, top: n.y }} onClick={() => setSelNode(n.id)}>
                  <div className="nh">
                    <span className="bicon" style={{ background: n.c, width: 26, height: 26 }}><I d={ICONS[n.ic]} size={13} /></span>
                    <strong>{n.t}</strong>
                  </div>
                  <div className="nb">{nodeBody(n)}</div>
                  {n.yn
                    ? <div className="yn"><span className="y">Sim</span><span className="n">Não</span></div>
                    : <div className="nf">{n.f}<I d={ICONS.arrow} size={11} /></div>}
                </article>
              ))}
            </div>
          </div>

          <aside className="test">
            <div className="test-head">
              <h2>Teste seu bot</h2>
              <span className="saved" style={{ fontSize: "0.66rem" }}>Online ●</span>
              <button className="icon-ghost" style={{ width: 28, height: 28 }} title="Reiniciar conversa de teste" onClick={resetChat}><I d={["M21 12a9 9 0 1 1-3-6.7", "M21 3v6h-6"]} size={14} /></button>
            </div>
            <div className="msgs" ref={endRef} style={{ padding: 14 }}>
              <div style={{ display: "flex", gap: 9, alignItems: "center", marginBottom: 6 }}>
                <span className="bicon" style={{ background: "var(--hbx-brand)", width: 32, height: 32, borderRadius: 999 }}><I d={ICONS.bot} size={16} /></span>
                <span><strong style={{ fontSize: "0.8rem" }}>HBX Bot</strong><br /><small style={{ fontSize: "0.62rem", color: "var(--hbx-brand-strong)", fontWeight: 700 }}>Online agora</small></span>
              </div>
              {chat.map((m, i) => (
                <div key={i} className={"msg " + m.dir} style={{ maxWidth: "88%" }}>
                  <div className="bubble" style={m.dir === "out" ? { background: "var(--hbx-brand)", borderColor: "var(--hbx-brand)", color: "var(--hbx-action-ink)", fontWeight: 600 } : {}}>
                    <div style={{ whiteSpace: "pre-line" }}>{m.text}</div>
                    <div className="tm" style={m.dir === "out" ? { color: "color-mix(in srgb, var(--hbx-action-ink) 60%, transparent)" } : {}}>{m.tm}{m.dir === "out" && <span className="ck" style={{ color: "color-mix(in srgb, var(--hbx-action-ink) 70%, transparent)" }}>✓✓</span>}</div>
                  </div>
                </div>
              ))}
              {chat[chat.length - 1].quick && quickOptions.length > 0 && (
                <div style={{ display: "grid", gap: 7, justifyItems: "start", marginTop: 4 }}>
                  {quickOptions.map(q => (
                    <button key={q} className="qr" onClick={() => reply(q)}>{q}</button>
                  ))}
                </div>
              )}
            </div>
            <div className="composer" style={{ padding: "10px 14px" }}>
              <div className="row">
                <input className="field-dark" style={{ flex: 1 }} placeholder="Digite sua mensagem..." value={draft}
                  onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} />
                <button className="icon-ghost" title="Inserir emoji" onClick={addEmoji}><I d={ICONS.smile} size={16} /></button>
                <button className="send" onClick={send}><I d={ICONS.send} size={15} /></button>
              </div>
            </div>
            <div className="test-foot">⚡ Teste simulado · As respostas podem variar.</div>
          </aside>
        </div>
        )}

        {tab === 1 && (
          <div className="work" style={{ flex: 1, overflowY: "auto" }}>
            <section className="panel">
              <div className="panel-head">
                <h2>Mensagens do bot</h2>
                <div className="meta">
                  <button className="btn-teal" onClick={salvarConfig} disabled={cfgBusy}>{cfgBusy ? "Salvando…" : "Salvar alterações"}</button>
                </div>
              </div>
              <div style={{ padding: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {BOT_MSG_FIELDS.map(f => (
                  <div key={String(f.key)} style={{ display: "grid", gap: 6 }}>
                    <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>{f.label} <span style={{ fontWeight: 600, opacity: 0.7 }}>· {f.hint}</span></label>
                    <textarea className="field-dark" rows={3} style={{ resize: "vertical", padding: "9px 12px", minHeight: 72 }}
                      value={cfgValue(f.key)} onChange={e => setCfgForm(prev => ({ ...prev, [f.key]: e.target.value }))} />
                  </div>
                ))}
              </div>
            </section>
            <section className="panel">
              <div className="panel-head"><h2>Botões do bot</h2></div>
              <div style={{ padding: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {BOT_BTN_GROUPS.map(g => (
                  <div key={g.key} style={{ display: "grid", gap: 8, alignContent: "start" }}>
                    <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>{g.label} <span style={{ fontWeight: 600, opacity: 0.7 }}>· {g.hint}</span></label>
                    {botoesDe(g.key).length === 0 && (
                      <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Sem botões — adicione o primeiro.</span>
                    )}
                    {botoesDe(g.key).map((b, i) => (
                      <div key={b.buttonId || i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 6 }}>
                        <input className="field-dark" style={{ minHeight: 34 }} maxLength={60} placeholder="Texto do botão"
                          value={b.title} onChange={e => editarBotao(g.key, i, { title: e.target.value })} />
                        <select className="field-dark" style={{ minHeight: 34 }} value={b.actionId}
                          onChange={e => editarBotao(g.key, i, { actionId: e.target.value })} aria-label="Ação do botão">
                          <option value="">Ação…</option>
                          {acoesDisponiveis.map(a => (
                            <option key={a.actionId} value={a.actionId}>{a.title || a.actionId}</option>
                          ))}
                          {b.actionId && !acoesDisponiveis.some(a => a.actionId === b.actionId) && (
                            <option value={b.actionId}>{b.actionId}</option>
                          )}
                        </select>
                        <button className="icon-ghost" title="Remover botão" aria-label="Remover botão"
                          onClick={() => removerBotao(g.key, i)}>✕</button>
                      </div>
                    ))}
                    <button className="btn-ghost" style={{ minHeight: 30, fontSize: "0.68rem", width: "fit-content" }} onClick={() => addBotao(g.key)}>
                      <I d={ICONS.plus} size={12} /> Adicionar botão
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ padding: "0 18px 14px", fontSize: "0.62rem", color: "var(--text-muted)" }}>
                Cada botão dispara uma ação do catálogo do bot. As alterações valem após “Salvar alterações”.
              </div>
            </section>
            <section className="panel">
              <div className="panel-head"><h2>Regras de roteamento</h2></div>
              <div style={{ padding: "6px 18px 14px" }}>
                {BOT_RULES.map(r => (
                  <div className="setting" key={String(r.key)}>
                    <div style={{ flex: 1 }}>
                      <strong>{r.label}</strong>
                      <small>{r.hint}</small>
                    </div>
                    <button className={"sw" + (ruleValue(r.key) ? " on" : "")} role="switch" aria-checked={ruleValue(r.key)}
                      onClick={() => setCfgRules(prev => ({ ...prev, [r.key]: !ruleValue(r.key) }))}><i></i></button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {tab >= 2 && (
          <div className="work" style={{ flex: 1 }}>
            <section className="panel">
              <div style={{ padding: 18, fontSize: "0.76rem", color: "var(--text-muted)" }}>
                {["", "", "Integrações", "Publicação", "Análises"][tab]} ainda não tem contrato no backend — entra na fase técnica.
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
