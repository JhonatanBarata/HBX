"use client";

// Tela Bot — painel de controle real: pino + 3 chavinhas + pré-voo + config 3 tipos + modo teste.
// B: Header com faixa do pino (read-only) + 3 chavinhas (Atendimento/Recovery/Prospecção) cada
//    com chip tri-cor (chipConectado/configCompleta/passouModoTeste) e switch .sw.
// C: Aba Configurações com seletor de tipo: troca endpoint (atendimento/recovery/prospecção).
// D: Chat de teste chama POST /bot/activation/mark-tested ao concluir rodada → acende 3ª luz.
// Design System: zero hex/inline solto — só classes/tokens centrais. CSS novo em screens.css.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { I, ICONS } from "@/components/hbx/shell";
import { BotFlowCanvas } from "@/components/hbx/bot-flow-canvas";
import { BotButtonsEditor } from "@/components/hbx/bot-buttons-editor";
import { BotVariablesDrawer, type VarDef } from "@/components/hbx/bot-variables-drawer";
import { apiFetch } from "@/lib/api";
import { useTabIndex } from "@/lib/use-tab-param";
import { useIsMobile } from "@/lib/use-is-mobile";

// ─── Tipos ──────────────────────────────────────────────────────────────────

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
  variableCatalog?: VarDef[];
  providerCapabilities?: { provider?: string; canUseOfficialButtons?: boolean };
};

type BotTypeName = "atendimento" | "recovery" | "prospeccao";

type PreflightStatus = {
  chipConectado: boolean;
  configCompleta: boolean;
  passouModoTeste: boolean;
};

type BotTypeStatus = {
  live: boolean;
  preflight: PreflightStatus;
  blocked: string | null;
};

type ActivationState = {
  armed: boolean;
  armedBy: string | null;
  armReason: string | null;
  channel: string | null;
  canAdminToggle: boolean;
  types: Record<BotTypeName, BotTypeStatus>;
};

// ─── Constantes de config ────────────────────────────────────────────────────

type BotaoGrupo = "welcomeButtons" | "mainMenuButtons";

const BOT_BTN_GROUPS: { key: BotaoGrupo; label: string; hint: string }[] = [
  { key: "welcomeButtons", label: "Botões de boas-vindas", hint: "aparecem na primeira mensagem" },
  { key: "mainMenuButtons", label: "Botões do menu principal", hint: "opções do menu" },
];

// Cada fase do bot = um campo de mensagem. `icon`/`color` espelham o organograma
// (BotFlowCanvas) pra os cards da esquerda baterem com os nós da direita.
// `buttonsKey` marca as fases que emitem botões (boas-vindas / menu).
type MsgFieldDef = {
  key: keyof BotConfig;
  label: string;
  hint: string;
  icon: string;
  color: string;
  buttonsKey?: BotaoGrupo;
};

const BOT_MSG_FIELDS: MsgFieldDef[] = [
  { key: "welcomeMessage", label: "Boas-vindas", hint: "Primeira mensagem para contato novo", icon: "msg", color: "var(--hbx-brand)", buttonsKey: "welcomeButtons" },
  { key: "returningCustomerMessage", label: "Cliente retornando", hint: "Quando o contato já é conhecido", icon: "reply", color: "var(--hbx-info)" },
  { key: "mainMenuPrompt", label: "Menu principal", hint: "Pergunta com as opções do menu", icon: "atend", color: "var(--hbx-info)", buttonsKey: "mainMenuButtons" },
  { key: "postActionPrompt", label: "Pós-ação", hint: "Depois de concluir uma ação", icon: "check", color: "var(--hbx-success)" },
  { key: "humanAckMessage", label: "Transferência para humano", hint: "Aviso de que um atendente assume", icon: "users", color: "var(--hbx-warning)" },
  { key: "closeTopicMessage", label: "Encerramento", hint: "Fechamento da conversa", icon: "clock", color: "var(--hbx-secondary)" },
  { key: "blockedMessage", label: "Contato bloqueado", hint: "Resposta para contato bloqueado", icon: "x", color: "var(--hbx-danger)" },
];

const BOT_RULES: { key: keyof BotRoutingRules; label: string; hint: string }[] = [
  { key: "globalBotEnabled", label: "Bot ligado", hint: "Liga/desliga o bot em todas as conversas novas" },
  { key: "checkRecoveryBeforeReply", label: "Checar Recovery antes", hint: "Verifica pendências antes de responder" },
  { key: "autoRouteDebtorsToRecovery", label: "Devedor vai pro Recovery", hint: "Roteia inadimplente automaticamente" },
  { key: "autoReopenClosedConversation", label: "Reabrir conversa fechada", hint: "Nova mensagem reabre o atendimento" },
  { key: "notifyOnNewInbound", label: "Avisar nova mensagem", hint: "Notifica a equipe a cada inbound" },
];

// Mapeamento: qual endpoint GET/PATCH usar por tipo
const TYPE_ENDPOINT: Record<BotTypeName, string> = {
  atendimento: "/inbox/bot-config",
  recovery: "/hbx-recovery/bot-config",
  prospeccao: "/vendas/automation/bot-config",
};

const TYPE_LABEL: Record<BotTypeName, string> = {
  atendimento: "Atendimento",
  recovery: "Recovery",
  prospeccao: "Prospecção",
};

const TYPE_DESC: Record<BotTypeName, string> = {
  atendimento: "Responde contatos novos automaticamente",
  recovery: "Aciona devedores com templates de cobrança",
  prospeccao: "Inicia conversas com leads prospectados",
};

// Proativos = requerem confirmação ao ligar e têm pré-voo mais rigoroso
const PROATIVO: Record<BotTypeName, boolean> = {
  atendimento: false,
  recovery: true,
  prospeccao: true,
};

// ─── Chat de teste ────────────────────────────────────────────────────────────

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

// ─── Pré-voo chip ────────────────────────────────────────────────────────────

function PreflightChip({
  ok,
  label,
  tooltip,
}: {
  ok: boolean;
  label: string;
  tooltip: string;
}) {
  return (
    <span
      className={"bot-pf-chip" + (ok ? " bot-pf-chip--ok" : " bot-pf-chip--warn")}
      title={tooltip}
      aria-label={label + (ok ? " OK" : " — " + tooltip)}
    >
      {ok ? "✓" : "!"} {label}
    </span>
  );
}

// ─── Chavinha (card de tipo) ──────────────────────────────────────────────────

function BotTypeCard({
  tipo,
  status,
  armed,
  onToggle,
  busy,
}: {
  tipo: BotTypeName;
  status: BotTypeStatus;
  armed: boolean;
  onToggle: (tipo: BotTypeName, live: boolean) => void;
  busy: boolean;
}) {
  const pf = status.preflight;
  const isProativo = PROATIVO[tipo];

  // Pré-voo verde = todas as 3 luzes OK para proativos; atendimento só exige chip + config
  const preflightOk = isProativo
    ? pf.chipConectado && pf.configCompleta && pf.passouModoTeste
    : pf.chipConectado && pf.configCompleta;

  // Switch desabilitado quando: sem pino, pré-voo vermelho (proativos), ou busy
  const switchDisabled = !armed || (isProativo && !preflightOk) || busy;

  // Tooltip para o switch quando travado
  function switchTooltip(): string {
    if (!armed) return "Aguarde o Suporte armar o pino primeiro";
    if (!pf.chipConectado) return "Conecte o WhatsApp antes de ligar";
    if (!pf.configCompleta) return "Complete a configuração do bot antes de ligar";
    if (isProativo && !pf.passouModoTeste) return "Rode o teste simulado antes de ligar";
    return "";
  }

  function handleToggle() {
    if (switchDisabled) return;
    const ligar = !status.live;
    if (ligar && isProativo) {
      const msg =
        tipo === "recovery"
          ? "Ligar o Recovery? Ele vai CONTATAR devedores automaticamente. Começa devagar."
          : "Ligar a Prospecção? Ela vai INICIAR conversas com leads. Começa devagar.";
      if (!window.confirm(msg)) return;
    }
    onToggle(tipo, ligar);
  }

  return (
    <div className={"bot-type-card" + (!armed ? " bot-type-card--disabled" : "")}>
      <div className="bot-type-card-head">
        <div className="bot-type-card-info">
          <strong className="bot-type-card-name">{TYPE_LABEL[tipo]}</strong>
          <small className="bot-type-card-desc">{TYPE_DESC[tipo]}</small>
        </div>
        <button
          className={"sw" + (status.live ? " on" : "")}
          role="switch"
          aria-checked={status.live}
          aria-label={`Ligar ${TYPE_LABEL[tipo]}`}
          disabled={switchDisabled}
          title={switchDisabled ? switchTooltip() : (status.live ? "Desligar" : "Ligar")}
          onClick={handleToggle}
        >
          <i></i>
        </button>
      </div>
      <div className="bot-type-card-pf">
        <PreflightChip
          ok={pf.chipConectado}
          label="WhatsApp"
          tooltip={pf.chipConectado ? "Chip conectado" : "Conecte o WhatsApp"}
        />
        <PreflightChip
          ok={pf.configCompleta}
          label="Config"
          tooltip={pf.configCompleta ? "Configuração completa" : "Complete a configuração na aba Configurações"}
        />
        <PreflightChip
          ok={pf.passouModoTeste}
          label="Testado"
          tooltip={pf.passouModoTeste ? "Já testado" : (isProativo ? "Rode o teste simulado antes de ligar" : "Recomendado: rode o teste simulado")}
        />
      </div>
      {status.blocked && (
        <div className="bot-type-card-blocked">{status.blocked}</div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function BotClient() {
  const isMobile = useIsMobile();
  const [chat, setChat] = useState(CHAT0);
  const [draft, setDraft] = useState("");
  // config do atendimento (alimenta o organograma + chat de teste)
  const [config, setConfig] = useState<BotConfig | null>(null);
  const [step, setStep] = useState(0);
  const [tab, setTab] = useTabIndex("tab", 0);

  // ── Tela dividida: fase em foco + gaveta de variáveis + painel de teste ──
  const [activeStep, setActiveStep] = useState<string>("welcomeMessage");
  const [varsOpen, setVarsOpen] = useState(false);
  const [activeFieldKey, setActiveFieldKey] = useState<keyof BotConfig | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  // ref do textarea da fase atualmente focada (pra inserir variável no cursor)
  const activeFieldRef = useRef<HTMLTextAreaElement | null>(null);

  // ── Activation (pino + 3 chavinhas) ──────────────────────────────────────
  const [activation, setActivation] = useState<ActivationState | null>(null);
  const [actBusy, setActBusy] = useState(false);
  const [actMsg, setActMsg] = useState<string | null>(null);

  const defaultActivation: ActivationState = {
    armed: false,
    armedBy: null,
    armReason: null,
    channel: null,
    canAdminToggle: false,
    types: {
      atendimento: { live: false, preflight: { chipConectado: false, configCompleta: false, passouModoTeste: false }, blocked: null },
      recovery:    { live: false, preflight: { chipConectado: false, configCompleta: false, passouModoTeste: false }, blocked: null },
      prospeccao:  { live: false, preflight: { chipConectado: false, configCompleta: false, passouModoTeste: false }, blocked: null },
    },
  };

  // setState só em callback assíncrono (regra react-hooks/set-state-in-effect).
  const loadActivation = useCallback(() => {
    apiFetch<ActivationState>("/bot/activation")
      .then(data => { if (data) setActivation(data); })
      .catch(() => { /* backend indisponível — mantém estado padrão, tela não quebra */ });
  }, []);

  async function toggleType(tipo: BotTypeName, live: boolean) {
    if (actBusy) return;
    setActBusy(true);
    setActMsg(null);
    try {
      const data = await apiFetch<ActivationState>("/bot/activation", {
        method: "PUT",
        body: JSON.stringify({ type: tipo, live }),
      });
      if (data) setActivation(data);
      setActMsg(live ? `✓ ${TYPE_LABEL[tipo]} ligado.` : `✓ ${TYPE_LABEL[tipo]} desligado.`);
    } catch (err) {
      setActMsg(err instanceof Error ? err.message : "Não foi possível alterar.");
    } finally {
      setActBusy(false);
    }
  }

  // ── Tipo selecionado na aba Configurações ─────────────────────────────────
  const [cfgTipo, setCfgTipo] = useState<BotTypeName>("atendimento");
  // config carregada por tipo (cache simples: só o tipo atual)
  const [cfgData, setCfgData] = useState<BotConfig | null>(null);
  const [cfgForm, setCfgForm] = useState<Partial<BotConfig>>({});
  const [cfgRules, setCfgRules] = useState<Partial<BotRoutingRules>>({});
  const [cfgBotoes, setCfgBotoes] = useState<Partial<Record<BotaoGrupo, BotButton[]>>>({});
  const [cfgBusy, setCfgBusy] = useState(false);
  const [cfgMsg, setCfgMsg] = useState<string | null>(null);
  // erro EXPLÍCITO de carregamento — nunca renderiza editor com config vazia.
  const [cfgErro, setCfgErro] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement | null>(null);
  const emojiIdx = useRef(0);

  // ── Carregar config do tipo selecionado ───────────────────────────────────
  // setState só em callback assíncrono (regra react-hooks/set-state-in-effect).
  // initCfgTipo é para a montagem (sem setState síncrono); loadCfgTipo é para reload.

  const initCfgTipo = useCallback((tipo: BotTypeName) => {
    // sem setState síncrono aqui (chamado na montagem dentro de useEffect);
    // erro/sucesso são setados só nos callbacks assíncronos abaixo.
    apiFetch<BotConfig>(TYPE_ENDPOINT[tipo])
      .then(data => {
        if (!data) { setCfgErro("Não foi possível carregar a configuração do bot."); return; }
        setCfgData(data);
        if (tipo === "atendimento") {
          setConfig(data);
          if (data.welcomeMessage) {
            setChat([{ dir: "in", text: data.welcomeMessage, tm: hhmm(), quick: true }]);
            setStep(0);
          }
        }
      })
      .catch(err => {
        setCfgData(null);
        setCfgErro(err instanceof Error ? err.message : "Não foi possível carregar a configuração do bot.");
      });
  }, []);

  function loadCfgTipo(tipo: BotTypeName) {
    setCfgBusy(true);
    setCfgMsg(null);
    setCfgErro(null);
    setCfgForm({});
    setCfgRules({});
    setCfgBotoes({});
    apiFetch<BotConfig>(TYPE_ENDPOINT[tipo])
      .then(data => {
        if (!data) { setCfgErro("Não foi possível carregar a configuração do bot."); return; }
        setCfgData(data);
        if (tipo === "atendimento") {
          setConfig(data);
          if (data.welcomeMessage) {
            setChat([{ dir: "in", text: data.welcomeMessage, tm: hhmm(), quick: true }]);
            setStep(0);
          }
        }
      })
      .catch(err => {
        setCfgData(null);
        setCfgErro(err instanceof Error ? err.message : "Não foi possível carregar a configuração do bot.");
      })
      .finally(() => { setCfgBusy(false); });
  }

  // Carregar ativação + config inicial na montagem
  useEffect(() => {
    loadActivation();
    initCfgTipo("atendimento");
  }, [loadActivation, initCfgTipo]);

  // Trocar tipo → recarregar config
  function selecionarTipo(tipo: BotTypeName) {
    setCfgTipo(tipo);
    loadCfgTipo(tipo);
  }

  // ── Helpers de edição ─────────────────────────────────────────────────────

  function cfgValue(key: keyof BotConfig): string {
    const edited = cfgForm[key];
    if (typeof edited === "string") return edited;
    const real = cfgData?.[key];
    return typeof real === "string" ? real : "";
  }

  function ruleValue(key: keyof BotRoutingRules): boolean {
    const edited = cfgRules[key];
    if (typeof edited === "boolean") return edited;
    return Boolean(cfgData?.routingRules?.[key]);
  }

  function botoesDe(grupo: BotaoGrupo): BotButton[] {
    return cfgBotoes[grupo] ?? (cfgData?.[grupo] || []);
  }

  // onChange do <BotButtonsEditor>: troca o grupo inteiro de uma vez.
  function setCfgBotoesGrupo(grupo: BotaoGrupo, next: BotButton[]) {
    setCfgBotoes(prev => ({ ...prev, [grupo]: next }));
  }

  const acoesDisponiveis = (cfgData?.actionCatalog || []).filter(a => a.enabled !== false);
  const canUseOfficialButtons = cfgData?.providerCapabilities?.canUseOfficialButtons ?? false;

  // ── Variáveis: abre a gaveta apontando pra uma fase + insere no cursor ──────

  // Abre a gaveta de variáveis ancorada num campo (guarda o textarea focado).
  function abrirVariaveis(key: keyof BotConfig, el: HTMLTextAreaElement | null) {
    setActiveFieldKey(key);
    setActiveStep(String(key));
    activeFieldRef.current = el;
    setVarsOpen(true);
  }

  // Insere o token na posição do cursor do textarea salvo; reposiciona o cursor.
  function inserirVariavel(token: string) {
    const key = activeFieldKey;
    if (!key) return;
    const el = activeFieldRef.current;
    const atual = cfgValue(key);
    const start = el ? el.selectionStart ?? atual.length : atual.length;
    const end = el ? el.selectionEnd ?? atual.length : atual.length;
    const novo = atual.slice(0, start) + token + atual.slice(end);
    setCfgForm(prev => ({ ...prev, [key]: novo }));
    // reposiciona o cursor após o token e devolve o foco ao textarea
    const caret = start + token.length;
    requestAnimationFrame(() => {
      const node = activeFieldRef.current;
      if (node) {
        node.focus();
        try { node.setSelectionRange(caret, caret); } catch { /* noop */ }
      }
    });
  }

  // ── Organograma ao vivo: mescla cfgData + edições (cfgForm/cfgBotoes) ───────
  const configVivo = useMemo<BotConfig>(() => {
    const base: BotConfig = cfgData ? { ...cfgData } : {};
    for (const f of BOT_MSG_FIELDS) {
      const edited = cfgForm[f.key];
      if (typeof edited === "string") (base as Record<string, unknown>)[f.key as string] = edited;
    }
    for (const g of BOT_BTN_GROUPS) {
      const edited = cfgBotoes[g.key];
      if (edited) base[g.key] = edited;
    }
    return base;
  }, [cfgData, cfgForm, cfgBotoes]);

  // PATCH full-replace: parte da config completa + sobrepõe edições
  function buildBody(overrides?: { globalBotEnabled?: boolean }): Record<string, unknown> {
    const body: Record<string, unknown> = cfgData ? { ...cfgData } : {};
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
      const updated = await apiFetch<BotConfig>(TYPE_ENDPOINT[cfgTipo], {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (updated && typeof updated === "object") {
        setCfgData(updated);
        if (cfgTipo === "atendimento") setConfig(updated);
      }
      setCfgForm({});
      setCfgRules({});
      setCfgBotoes({});
      setCfgMsg(okMsg);
      // Recarregar ativação para atualizar pré-voo (configCompleta pode mudar)
      loadActivation();
    } catch (err) {
      setCfgMsg(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setCfgBusy(false);
    }
  }

  function salvarConfig() {
    void patchConfig(buildBody(), "✓ Configuração salva.");
  }

  function recarregar() {
    loadCfgTipo(cfgTipo);
    setCfgMsg("✓ Recarregando…");
  }

  // ── Chat de teste ─────────────────────────────────────────────────────────

  // Tipo selecionado no chat (Fluxo) — controla qual tipo "mark-tested" vai chamar
  const [chatTipo, setChatTipo] = useState<BotTypeName>("atendimento");

  function resetChat() {
    if (config?.welcomeMessage) setChat([{ dir: "in", text: config.welcomeMessage, tm: hhmm(), quick: true }]);
    else setChat(CHAT0);
    setStep(0);
    setDraft("");
  }

  // Ao concluir rodada de teste: chama mark-tested e recarrega ativação
  function marcarTestado(tipo: BotTypeName) {
    apiFetch("/bot/activation/mark-tested", {
      method: "POST",
      body: JSON.stringify({ type: tipo }),
    })
      .then(() => { loadActivation(); })
      .catch(() => { /* silencia — pré-voo será atualizado na próxima carga */ });
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
    const novoStep = step + 1;
    setStep(novoStep);
    // Após 2 trocas consideramos "rodada concluída" → marca como testado
    if (novoStep >= 2) {
      void marcarTestado(chatTipo);
    }
  }

  function send() { if (!draft.trim()) return; reply(draft.trim()); setDraft(""); }

  function addEmoji() {
    const e = EMOJIS[emojiIdx.current % EMOJIS.length];
    emojiIdx.current += 1;
    setDraft(d => d + e);
  }

  useEffect(() => { if (endRef.current) endRef.current.scrollTop = endRef.current.scrollHeight; }, [chat]);

  // ── Derived state ─────────────────────────────────────────────────────────

  const act = activation ?? defaultActivation;
  const setupBadge = cfgData
    ? cfgData.setup?.completed ? "✓ Configurado" : "Configuração pendente"
    : "✓ Salvo";

  const quickOptions = config
    ? (step === 0 ? config.welcomeButtons : config.mainMenuButtons)?.map(b => b.title).filter(Boolean) || []
    : ["Aumentar vendas", "Organizar processos", "Encontrar novos clientes", "Outro"];

  // ── Painel "Testar bot" deslizante (reusa .hbx-veil/.hbx-drawer) ──────────
  // Mesmo chat/estado de antes (mark-tested intacto), agora numa casca slide.
  const testDrawer = testOpen ? (
    <div
      className="hbx-veil to-right"
      onClick={e => { if (e.target === e.currentTarget) setTestOpen(false); }}
    >
      <div
        className="hbx-drawer bot-test-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Testar bot"
      >
        <div className="test-head">
          <h2>Teste seu bot</h2>
          <select
            className="field-dark bot-chat-tipo-sel"
            value={chatTipo}
            onChange={e => { setChatTipo(e.target.value as BotTypeName); resetChat(); }}
            aria-label="Tipo de bot no teste"
          >
            <option value="atendimento">Atendimento</option>
            <option value="recovery">Recovery</option>
            <option value="prospeccao">Prospecção</option>
          </select>
          <span className="saved" style={{ fontSize: "0.66rem" }}>Online ●</span>
          <button className="icon-ghost" style={{ width: 28, height: 28 }} title="Reiniciar conversa de teste" onClick={resetChat}><I d={["M21 12a9 9 0 1 1-3-6.7", "M21 3v6h-6"]} size={14} /></button>
          <button className="icon-ghost" style={{ width: 28, height: 28 }} aria-label="Fechar" title="Fechar" onClick={() => setTestOpen(false)}>✕</button>
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
      </div>
    </div>
  ) : null;

  // ── Gaveta de variáveis (compartilhada por todas as fases / aba Config) ────
  const variablesDrawer = (
    <BotVariablesDrawer
      open={varsOpen}
      variableCatalog={cfgData?.variableCatalog ?? []}
      onClose={() => setVarsOpen(false)}
      onInsert={inserirVariavel}
    />
  );

  // ── Render mobile ─────────────────────────────────────────────────────────

  if (isMobile) {
    return (
      <React.Fragment>
        <div className="bot-head">
          <h1>Bot <I d={["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"]} size={16} /></h1>
          <span className={"saved" + (cfgData && !cfgData.setup?.completed ? " bot-badge--warn" : "")}>{setupBadge}</span>
          {actMsg && (
            <span className={"bot-mobile-msg" + (actMsg.startsWith("✓") ? " bot-mobile-msg--ok" : " bot-mobile-msg--err")}>{actMsg}</span>
          )}
        </div>

        <div className="bot-mobile-view">
          <div className="bot-mobile-notice">
            <I d={ICONS.scrape} size={15} />
            Edição do desenho é no computador. Aqui você vê o fluxo e controla o bot.
          </div>

          <div className="bot-block-list">
            {BOT_MSG_FIELDS.map(f => {
              const real = config?.[f.key];
              const texto = typeof real === "string" && real.trim() ? real : "Sem mensagem ainda";
              const btns = f.buttonsKey ? (config?.[f.buttonsKey] || []) : [];
              return (
                <div className="bot-block-item" key={String(f.key)}>
                  <span className="bicon bot-block-icon" style={{ "--bot-nc": f.color, width: 34, height: 34, flexShrink: 0 } as React.CSSProperties}>
                    <I d={ICONS[f.icon] || ICONS.msg} size={16} />
                  </span>
                  <div className="bot-block-body">
                    <div className="bot-block-title">{f.label}</div>
                    <div className="bot-block-text">{texto}</div>
                    {btns.length > 0 && (
                      <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                        {btns.map((b, i) => (
                          <span className="tag teal" key={b.buttonId || i}>{b.title || `Opção ${i + 1}`}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bot-mobile-actions">
            <button className="btn-ghost" onClick={() => setTestOpen(true)}>
              <I d={ICONS.send} size={14} /> Testar bot
            </button>
            <button
              className="btn-teal"
              onClick={() => {
                const tipo = "atendimento";
                const status = act.types[tipo];
                if (!act.armed) return;
                const ligar = !status.live;
                if (ligar && !window.confirm("Publicar o bot? Ele passará a responder automaticamente as novas conversas do WhatsApp.")) return;
                void toggleType(tipo, ligar);
              }}
              disabled={actBusy || !act.armed}
            >
              {actBusy ? "Aguarde…" : act.types.atendimento.live ? "Desativar bot" : "Ativar bot"}
            </button>
          </div>
        </div>
        {testDrawer}
      </React.Fragment>
    );
  }

  // ── Render desktop ────────────────────────────────────────────────────────

  return (
    <React.Fragment>
      {/* ── Header: título + faixa do pino + 3 chavinhas ── */}
      <div className="bot-head">
        <h1>Construtor de Bot <I d={["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"]} size={16} /></h1>

        {/* Faixa do pino (read-only) */}
        <span className={"bot-pin-faixa" + (act.armed ? " bot-pin-faixa--armed" : "")}>
          {act.armed
            ? `Bot armado por ${act.armedBy ?? "Suporte"}${act.channel ? ` · ${act.channel}` : ""}`
            : "Aguardando ativação do Suporte"}
        </span>

        <div style={{ marginLeft: "auto", display: "flex", gap: 9, alignItems: "center" }}>
          {actMsg && (
            <span className={"bot-act-msg" + (actMsg.startsWith("✓") ? " bot-act-msg--ok" : " bot-act-msg--err")}>
              {actMsg}
            </span>
          )}
          {cfgMsg && (
            <span className={"bot-act-msg" + (cfgMsg.startsWith("✓") ? " bot-act-msg--ok" : " bot-act-msg--err")}>
              {cfgMsg}
            </span>
          )}
          <button className="btn-ghost" style={{ minWidth: 38 }} title="Recarregar configuração" onClick={recarregar} disabled={cfgBusy}>⋯</button>
          <button className="btn-ghost" onClick={() => setTestOpen(true)}><I d={ICONS.send} size={13} /> Testar bot</button>
          <button className="btn-ghost" onClick={salvarConfig} disabled={cfgBusy}>{cfgBusy ? "Salvando…" : "Salvar"}</button>
        </div>
      </div>

      {/* ── 3 chavinhas ── */}
      {!act.armed && (
        <div className="bot-pin-aviso">
          Pino não armado — chavinhas desabilitadas. Solicite ao Suporte a ativação do bot para esta empresa.
        </div>
      )}
      <div className="bot-type-cards">
        {(["atendimento", "recovery", "prospeccao"] as BotTypeName[]).map(tipo => (
          <BotTypeCard
            key={tipo}
            tipo={tipo}
            status={act.types[tipo]}
            armed={act.armed}
            onToggle={toggleType}
            busy={actBusy}
          />
        ))}
      </div>

      {/* ── Abas ── */}
      <div className="bot-tabs">
        {["Fluxo", "Configurações", "Integrações", "Publicação", "Análises"].map((t, i) => (
          <button key={t} className={"bot-tab" + (tab === i ? " on" : "")} onClick={() => setTab(i)}>{t}</button>
        ))}
        <div className="right"><span>Versão rascunho</span><span className="saved">{setupBadge}</span></div>
      </div>

      {/* ── Aba Fluxo → TELA DIVIDIDA: esquerda monta as fases, direita é o
             organograma que acende ao vivo ── */}
      {tab === 0 && (
        cfgErro ? (
          <div className="bot-load-error" role="alert">
            <strong className="bot-load-error__title">Não deu pra carregar o bot</strong>
            <p className="bot-load-error__msg">{cfgErro}</p>
            <button className="btn-teal" onClick={recarregar} disabled={cfgBusy}>
              {cfgBusy ? "Carregando…" : "Tentar de novo"}
            </button>
          </div>
        ) : (
          <div className="bot-split">
            {/* ESQUERDA: pilha de fases */}
            <div className="bot-split__left">
              <p className="bot-split__left-intro">
                Monte o bot fase por fase. Cada fase preenchida acende um bloco no organograma ao lado.
              </p>
              {BOT_MSG_FIELDS.map(f => {
                const valor = cfgValue(f.key);
                const grupo = f.buttonsKey;
                const botoes = grupo ? botoesDe(grupo) : [];
                const pronto = valor.trim().length > 0 || botoes.length > 0;
                const ativo = activeStep === String(f.key);
                return (
                  <section
                    key={String(f.key)}
                    className={"bot-phase" + (ativo ? " bot-phase--active" : "")}
                    style={{ ["--bot-phase-color" as string]: f.color }}
                  >
                    <header className="bot-phase__head">
                      <span className="bot-phase__icon"><I d={ICONS[f.icon] || ICONS.msg} size={16} /></span>
                      <div className="bot-phase__titles">
                        <span className="bot-phase__name">{f.label}</span>
                        <span className="bot-phase__hint">{f.hint}</span>
                      </div>
                      <span className={"bot-phase__badge" + (pronto ? " bot-phase__badge--ready" : "")}>
                        {pronto ? "Pronto" : "Vazio"}
                      </span>
                    </header>
                    <div className="bot-phase__body">
                      <textarea
                        className="field-dark bot-phase__field"
                        value={valor}
                        onFocus={e => { setActiveStep(String(f.key)); setActiveFieldKey(f.key); activeFieldRef.current = e.currentTarget; }}
                        onChange={e => { setActiveFieldKey(f.key); activeFieldRef.current = e.currentTarget; setCfgForm(prev => ({ ...prev, [f.key]: e.target.value })); }}
                        placeholder="Escreva a mensagem desta fase…"
                      />
                      <div className="bot-phase__tools">
                        <button
                          type="button"
                          className="btn-ghost bot-phase__var-btn"
                          title="Inserir variável nesta mensagem"
                          onClick={() => abrirVariaveis(f.key, activeFieldRef.current)}
                        >
                          <I d={ICONS.bolt} size={12} /> Variáveis
                        </button>
                      </div>
                      {grupo && (
                        <div className="bot-phase__buttons">
                          <BotButtonsEditor
                            buttons={botoes}
                            actionCatalog={acoesDisponiveis}
                            canUseOfficialButtons={canUseOfficialButtons}
                            label={grupo === "welcomeButtons" ? "Botões de boas-vindas" : "Botões do menu"}
                            hint={grupo === "welcomeButtons" ? "aparecem na primeira mensagem" : "opções do menu"}
                            onChange={next => setCfgBotoesGrupo(grupo, next)}
                          />
                        </div>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>

            {/* DIREITA: organograma vivo (deriva de configVivo) */}
            <div className="bot-split__right">
              <BotFlowCanvas config={configVivo} activeStep={activeStep} />
            </div>
          </div>
        )
      )}

      {/* ── Aba Configurações (3 tipos) ── */}
      {tab === 1 && (
        <div className="work" style={{ flex: 1, overflowY: "auto" }}>
          {/* Seletor de tipo */}
          <section className="panel">
            <div className="panel-head">
              <h2>Tipo de bot</h2>
            </div>
            <div className="bot-cfg-tipo-row">
              {(["atendimento", "recovery", "prospeccao"] as BotTypeName[]).map(t => (
                <button
                  key={t}
                  className={"bot-cfg-tipo-btn" + (cfgTipo === t ? " on" : "")}
                  onClick={() => selecionarTipo(t)}
                  disabled={cfgBusy}
                >
                  {TYPE_LABEL[t]}
                </button>
              ))}
              <span className="bot-cfg-tipo-desc">{TYPE_DESC[cfgTipo]}</span>
            </div>
          </section>

          {cfgErro ? (
            <div className="bot-load-error" role="alert">
              <strong className="bot-load-error__title">Não deu pra carregar o bot</strong>
              <p className="bot-load-error__msg">{cfgErro}</p>
              <button className="btn-teal" onClick={recarregar} disabled={cfgBusy}>
                {cfgBusy ? "Carregando…" : "Tentar de novo"}
              </button>
            </div>
          ) : (
          <React.Fragment>
          {/* Mensagens */}
          <section className="panel">
            <div className="panel-head">
              <h2>Mensagens do bot — {TYPE_LABEL[cfgTipo]}</h2>
              <div className="meta">
                <button className="btn-teal" onClick={salvarConfig} disabled={cfgBusy}>{cfgBusy ? "Salvando…" : "Salvar alterações"}</button>
              </div>
            </div>
            <div style={{ padding: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {BOT_MSG_FIELDS.map(f => (
                <div key={String(f.key)} style={{ display: "grid", gap: 6 }}>
                  <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>{f.label} <span style={{ fontWeight: 600, opacity: 0.7 }}>· {f.hint}</span></label>
                  <textarea className="field-dark" rows={3} style={{ resize: "vertical", padding: "9px 12px", minHeight: 72 }}
                    value={cfgValue(f.key)}
                    onFocus={e => { setActiveFieldKey(f.key); activeFieldRef.current = e.currentTarget; }}
                    onChange={e => { setActiveFieldKey(f.key); activeFieldRef.current = e.currentTarget; setCfgForm(prev => ({ ...prev, [f.key]: e.target.value })); }} />
                  <button
                    type="button"
                    className="btn-ghost bot-phase__var-btn"
                    title="Inserir variável nesta mensagem"
                    style={{ justifySelf: "start" }}
                    onClick={() => abrirVariaveis(f.key, activeFieldRef.current)}
                  >
                    <I d={ICONS.bolt} size={12} /> Variáveis
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Botões */}
          <section className="panel">
            <div className="panel-head"><h2>Botões do bot — {TYPE_LABEL[cfgTipo]}</h2></div>
            <div style={{ padding: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {BOT_BTN_GROUPS.map(g => (
                <BotButtonsEditor
                  key={g.key}
                  buttons={botoesDe(g.key)}
                  actionCatalog={acoesDisponiveis}
                  canUseOfficialButtons={canUseOfficialButtons}
                  label={g.label}
                  hint={g.hint}
                  onChange={next => setCfgBotoesGrupo(g.key, next)}
                />
              ))}
            </div>
            <div style={{ padding: "0 18px 14px", fontSize: "0.62rem", color: "var(--text-muted)" }}>
              As alterações valem após &quot;Salvar alterações&quot;.
            </div>
          </section>

          {/* Regras de roteamento (só Atendimento tem essas opções) */}
          {cfgTipo === "atendimento" && (
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
          )}
          </React.Fragment>
          )}
        </div>
      )}

      {/* ── Abas em breve ── */}
      {tab >= 2 && (() => {
        const slots: Record<number, { icon: string[]; title: string; desc: string; color: string }> = {
          2: { icon: ICONS.scrape, title: "Conecte suas ferramentas", desc: "Zapier, webhooks, API própria e muito mais — disponível na fase técnica.", color: "var(--hbx-info)" },
          3: { icon: ICONS.send,   title: "Publique com controle total", desc: "Ambientes, versionamento e rollback instantâneo do bot — chegando em breve.", color: "var(--hbx-brand)" },
          4: { icon: ICONS.relat,  title: "Veja o bot em ação", desc: "Taxa de conclusão, pontos de abandono e funil de conversão em tempo real.", color: "var(--hbx-success)" },
        };
        const s = slots[tab];
        if (!s) return null;
        return (
          <div className="bot-empty">
            <div className="bot-empty-ring" style={{ "--ec": s.color } as React.CSSProperties}>
              <span className="bicon" style={{ background: s.color }}><I d={s.icon} size={26} /></span>
            </div>
            <strong className="bot-empty-title">{s.title}</strong>
            <p className="bot-empty-desc">{s.desc}</p>
            <span className="bot-empty-badge">Em breve</span>
          </div>
        );
      })()}

      {/* Gaveta de variáveis (castelo deslizante da direita) + painel de teste */}
      {variablesDrawer}
      {testDrawer}
    </React.Fragment>
  );
}
