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
import { BotVariablesDrawer, type VarDef } from "@/components/hbx/bot-variables-drawer";
import { BotPhaseEditor } from "@/components/hbx/bot-phase-editor";
import { BotProspeccaoPanel } from "@/components/hbx/bot-prospeccao-panel";
import { WhatsAppPreview, type WAMessage } from "@/components/hbx/whatsapp-preview";
import { BotOnboarding, type BotOnboardingField } from "@/components/hbx/bot-onboarding";
import { BotTermsModal, isBotTermsAccepted, setBotTermsAccepted } from "@/components/hbx/bot-terms-modal";
import { apiFetch } from "@/lib/api";
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
  // chave geral do bot (topo): true = dono desligou o bot inteiro
  masterOff?: boolean;
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

// ── Modos de montagem (experiência "tipo jogo") ──────────────────────────────
// As 3 visões mostram AS MESMAS peças (derivadas da config) — só muda o jeito de
// montar. "ajustes" é a peça-chave especial (regras), não uma das fases de mensagem.
type MontagemModo = "tabuleiro" | "trilha" | "bandeja";
type EditorKey = keyof BotConfig | "ajustes";

const MONTAGEM_MODOS: { key: MontagemModo; label: string; hint: string; icon: string }[] = [
  { key: "tabuleiro", label: "Tabuleiro", hint: "Mapa do fluxo — clique nas peças", icon: "dash" },
  { key: "trilha", label: "Trilha", hint: "Passo a passo numerado", icon: "vendas" },
  { key: "bandeja", label: "Bandeja", hint: "Arraste as peças pro fluxo", icon: "filter" },
];

// Mapeamento: qual endpoint GET/PATCH de config de MENSAGEM usar por tipo.
// Atendimento/Recovery são bots de menu (welcomeMessage/botões). Prospecção NÃO é
// um bot de menu — é motor de disparo frio; tem painel dedicado (<BotProspeccaoPanel>,
// live-status + prospecting/config) e NÃO usa este mapa. A entrada existe só para
// completar o Record; nenhum caminho a consome quando cfgTipo === "prospeccao".
const TYPE_ENDPOINT: Record<BotTypeName, string> = {
  atendimento: "/inbox/bot-config",
  recovery: "/hbx-recovery/bot-config",
  prospeccao: "/vendas/automation/live-status",
};

const TYPE_LABEL: Record<BotTypeName, string> = {
  atendimento: "Atendimento",
  recovery: "Recovery",
  prospeccao: "Prospecção",
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

// ─── Componente principal ─────────────────────────────────────────────────────

export function BotClient() {
  const isMobile = useIsMobile();
  const [chat, setChat] = useState(CHAT0);
  const [draft, setDraft] = useState("");
  // config do atendimento (alimenta o organograma + chat de teste)
  const [config, setConfig] = useState<BotConfig | null>(null);
  const [step, setStep] = useState(0);
  // ── Tela dividida: fase em foco + gaveta de variáveis + painel de teste ──
  const [activeStep, setActiveStep] = useState<string>("welcomeMessage");
  const [varsOpen, setVarsOpen] = useState(false);
  const [activeFieldKey, setActiveFieldKey] = useState<keyof BotConfig | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  // ── Onboarding + Termos ───────────────────────────────────────────────────
  const [onbOpen, setOnbOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  // flag: após aceitar os Termos, deve ligar o bot
  const pendingActivateRef = useRef(false);
  // guard: auto-open do onboarding dispara só 1x por tipo
  const onbAutoRef = useRef<Set<BotTypeName>>(new Set());
  // ── Montagem "tipo jogo": modo selecionado + peça aberta no editor deslizante ──
  const [montagemModo, setMontagemModo] = useState<MontagemModo>("tabuleiro");
  const [editorKey, setEditorKey] = useState<EditorKey | null>(null);
  // peça "arrastada/solta na área" (modo Bandeja) — destaca o alvo de drop
  const [dragOver, setDragOver] = useState(false);
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
        // Auto-open onboarding 1x quando config carrega incompleta (sem welcomeMessage)
        // Só para tipos que não são prospecção. Dispara no .then (async) — nunca setState síncrono.
        if (tipo !== "prospeccao" && !data.welcomeMessage && !onbAutoRef.current.has(tipo)) {
          onbAutoRef.current.add(tipo);
          setOnbOpen(true);
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

  // ── Auto-ligar: a chavinha NÃO depende de clique. Quando o pré-voo do tipo fica
  // OK (chip + config; proativos exigem também o teste feito), liga SOZINHO. Direção
  // única (liga ao ficar OK; não desliga sozinho). Em localhost o chip nunca conecta,
  // então isto NUNCA dispara aqui — só vale em produção (deploy do dono). Ver RISCOS.md.
  const autoArmedRef = useRef<Set<BotTypeName>>(new Set());
  useEffect(() => {
    if (!activation?.armed) return;
    if (activation.masterOff) return; // chave geral baixada → não re-liga sozinho
    (Object.keys(activation.types) as BotTypeName[]).forEach(tipo => {
      const st = activation.types[tipo];
      const pf = st.preflight;
      const ok = PROATIVO[tipo]
        ? pf.chipConectado && pf.configCompleta && pf.passouModoTeste
        : pf.chipConectado && pf.configCompleta;
      if (!ok) { autoArmedRef.current.delete(tipo); return; }
      if (st.live || autoArmedRef.current.has(tipo)) return;
      autoArmedRef.current.add(tipo);
      apiFetch<ActivationState>("/bot/activation", {
        method: "PUT",
        body: JSON.stringify({ type: tipo, live: true }),
      })
        .then(data => { if (data) setActivation(data); setActMsg(`✓ ${TYPE_LABEL[tipo]} ligado automaticamente.`); })
        .catch(() => { autoArmedRef.current.delete(tipo); });
    });
  }, [activation]);

  // Trocar tipo → recarregar config. Prospecção NÃO usa o endpoint de bot-config
  // (é do atendimento); o <BotProspeccaoPanel> carrega sozinho via live-status.
  function selecionarTipo(tipo: BotTypeName) {
    setCfgTipo(tipo);
    setEditorKey(null); // fecha qualquer peça aberta da guia anterior
    if (tipo === "prospeccao") {
      setCfgErro(null);
      setCfgMsg(null);
      setCfgData(null);
      setCfgForm({});
      setCfgRules({});
      setCfgBotoes({});
      return;
    }
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

  // ── Peças (modos de montagem) ─────────────────────────────────────────────
  // Lista de peças exibida pelos 3 modos: as 7 fases reais + "Ajustes" (regras,
  // só no atendimento). NADA inventado — espelha BOT_MSG_FIELDS / BOT_RULES.
  type Peca = { key: EditorKey; label: string; hint: string; icon: string; tone: string; buttonsKey?: BotaoGrupo; settings?: boolean };
  const pecas: Peca[] = useMemo(() => {
    const fases: Peca[] = BOT_MSG_FIELDS.map(f => ({
      key: f.key, label: f.label, hint: f.hint, icon: f.icon, tone: f.color, buttonsKey: f.buttonsKey,
    }));
    if (cfgTipo === "atendimento") {
      fases.push({ key: "ajustes", label: "Ajustes", hint: "Regras gerais do bot", icon: "config", tone: "var(--hbx-secondary)", settings: true });
    }
    return fases;
  }, [cfgTipo]);

  // Uma peça está "pronta" se a mensagem está preenchida OU tem botões. A peça
  // "Ajustes" conta como pronta se o bot está ligado nas regras (globalBotEnabled).
  function pecaPronta(p: Peca): boolean {
    if (p.settings) return ruleValue("globalBotEnabled");
    const valor = p.key === "ajustes" ? "" : cfgValue(p.key as keyof BotConfig);
    const botoes = p.buttonsKey ? botoesDe(p.buttonsKey) : [];
    return valor.trim().length > 0 || botoes.length > 0;
  }

  const pecasProntas = pecas.filter(pecaPronta).length;
  const pecasPct = pecas.length > 0 ? Math.round((pecasProntas / pecas.length) * 100) : 0;

  // Abre uma peça no editor deslizante (qualquer modo). Fase real → também
  // destaca o nó (activeStep). "Ajustes" não é nó, só abre o editor.
  function abrirPeca(key: EditorKey) {
    setEditorKey(key);
    if (key !== "ajustes") setActiveStep(String(key));
  }

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
    // Prospecção salva pelo próprio painel (PATCH prospecting/config); o botão
    // global de Salvar nem aparece nessa guia.
    if (cfgTipo === "prospeccao") return;
    void patchConfig(buildBody(), "✓ Configuração salva.");
  }

  // Gate de Termos: abre modal de aceite antes de ligar o bot.
  // Se já aceito, liga direto via toggleType.
  function requestActivate() {
    if (!isBotTermsAccepted(cfgTipo)) {
      pendingActivateRef.current = true;
      setTermsOpen(true);
    } else {
      if (PROATIVO[cfgTipo]) {
        if (!window.confirm(`Publicar o bot ${TYPE_LABEL[cfgTipo]}? Ele passará a agir automaticamente nas conversas.`)) return;
      }
      void toggleType(cfgTipo, true);
    }
  }

  function recarregar() {
    if (cfgTipo === "prospeccao") return; // painel dedicado recarrega sozinho
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
  // Mapeia o chat de teste pro formato do <WhatsAppPreview> (preview padrão).
  const previewMessages: WAMessage[] = chat.map(m => ({
    dir: m.dir,
    text: m.text,
    time: m.tm,
    status: m.dir === "out" ? "read" : undefined,
  }));
  const lastQuick = Boolean(chat[chat.length - 1]?.quick) && quickOptions.length > 0;

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
          <button className="icon-ghost" style={{ width: 28, height: 28 }} title="Reiniciar conversa de teste" onClick={resetChat}><I d={["M21 12a9 9 0 1 1-3-6.7", "M21 3v6h-6"]} size={14} /></button>
          <button className="icon-ghost" style={{ width: 28, height: 28 }} aria-label="Fechar" title="Fechar" onClick={() => setTestOpen(false)}>✕</button>
        </div>

        <WhatsAppPreview
          messages={previewMessages}
          header={{ name: "HBX Bot", status: "online agora" }}
          quickReplies={lastQuick ? quickOptions : undefined}
          onQuickReply={reply}
          bodyRef={endRef}
          footer={(
            <div className="wa-composer-row">
              <input className="field-dark wa-composer-input" placeholder="Digite sua mensagem..." value={draft}
                onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} />
              <button className="icon-ghost" title="Inserir emoji" onClick={addEmoji}><I d={ICONS.smile} size={16} /></button>
              <button className="send" onClick={send}><I d={ICONS.send} size={15} /></button>
            </div>
          )}
        />

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

  // ── Editor deslizante de peça (compartilhado pelos 3 modos) ───────────────
  // Montado SÓ quando há peça selecionada (editorKey). O próprio componente
  // desmonta ao fechar (padrão closing→finishClose), então não trava o véu.
  const pecaAtual = editorKey ? pecas.find(p => p.key === editorKey) ?? null : null;
  const phaseEditor = pecaAtual ? (
    <BotPhaseEditor
      open={editorKey !== null}
      title={pecaAtual.label}
      hint={pecaAtual.hint}
      icon={pecaAtual.icon}
      tone={pecaAtual.tone}
      isSettings={Boolean(pecaAtual.settings)}
      value={pecaAtual.settings ? "" : cfgValue(pecaAtual.key as keyof BotConfig)}
      onChange={next => { if (!pecaAtual.settings) setCfgForm(prev => ({ ...prev, [pecaAtual.key as string]: next })); }}
      onFocusField={el => { if (!pecaAtual.settings) { setActiveFieldKey(pecaAtual.key as keyof BotConfig); activeFieldRef.current = el; } }}
      onOpenVariables={el => { if (!pecaAtual.settings) abrirVariaveis(pecaAtual.key as keyof BotConfig, el); }}
      showButtons={Boolean(pecaAtual.buttonsKey)}
      buttons={pecaAtual.buttonsKey ? botoesDe(pecaAtual.buttonsKey) : []}
      actionCatalog={acoesDisponiveis}
      canUseOfficialButtons={canUseOfficialButtons}
      buttonsLabel={pecaAtual.buttonsKey === "welcomeButtons" ? "Botões de boas-vindas" : "Botões do menu"}
      buttonsHint={pecaAtual.buttonsKey === "welcomeButtons" ? "aparecem na primeira mensagem" : "opções do menu"}
      onButtonsChange={next => { if (pecaAtual.buttonsKey) setCfgBotoesGrupo(pecaAtual.buttonsKey, next); }}
      rules={BOT_RULES.map(r => ({ key: String(r.key), label: r.label, hint: r.hint }))}
      ruleValue={k => ruleValue(k as keyof BotRoutingRules)}
      onToggleRule={k => setCfgRules(prev => ({ ...prev, [k]: !ruleValue(k as keyof BotRoutingRules) }))}
      onClose={() => setEditorKey(null)}
    />
  ) : null;

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
            <button className="btn-ghost" onClick={() => setOnbOpen(true)}>
              <I d={ICONS.help || ICONS.bot} size={14} /> Configurar com ajuda
            </button>
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
                if (ligar) {
                  // Gate de termos antes de ativar
                  requestActivate();
                  return;
                }
                // Desligar: direto, sem gate
                void toggleType(tipo, ligar);
              }}
              disabled={actBusy || !act.armed}
            >
              {actBusy ? "Aguarde…" : act.types.atendimento.live ? "Desativar bot" : "Ativar bot"}
            </button>
          </div>
        </div>
        {testDrawer}

        {/* Onboarding assistido mobile */}
        <BotOnboarding
          open={onbOpen && cfgTipo !== "prospeccao"}
          botType={cfgTipo as "atendimento" | "recovery"}
          fields={BOT_MSG_FIELDS.map<BotOnboardingField>(f => ({
            key: String(f.key),
            label: f.label,
            hint: f.hint,
            icon: f.icon,
            tone: f.color,
            buttonsKey: f.buttonsKey,
          }))}
          value={k => cfgValue(k as keyof BotConfig)}
          onChange={(k, v) => setCfgForm(prev => ({ ...prev, [k]: v }))}
          onSave={async () => { await salvarConfig(); }}
          saving={cfgBusy}
          connectionReady={act.types[cfgTipo as "atendimento" | "recovery"].preflight.chipConectado}
          connectionHint={
            act.types[cfgTipo as "atendimento" | "recovery"].preflight.chipConectado
              ? "WhatsApp conectado"
              : "Conexão pendente — peça ao Suporte"
          }
          onClose={() => setOnbOpen(false)}
          onRequestActivate={() => { setOnbOpen(false); requestActivate(); }}
        />

        {/* Gate de Termos mobile */}
        <BotTermsModal
          open={termsOpen}
          botType={cfgTipo}
          checklist={[
            ...BOT_MSG_FIELDS.map(f => ({ label: f.label, done: cfgValue(f.key).trim().length > 0 })),
            { label: "WhatsApp conectado", done: act.types[cfgTipo].preflight.chipConectado },
          ]}
          onAccept={() => {
            setBotTermsAccepted(cfgTipo);
            setTermsOpen(false);
            pendingActivateRef.current = false;
            void toggleType(cfgTipo, true);
          }}
          onClose={() => { setTermsOpen(false); pendingActivateRef.current = false; }}
        />
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
          {/* Prospecção tem barra própria no painel (Salvar disparo / recarregar);
              o teste simulado é de menu (atendimento), não faz sentido no disparo frio. */}
          {cfgTipo !== "prospeccao" && (
            <>
              <button className="btn-ghost" style={{ minWidth: 38 }} title="Recarregar configuração" onClick={recarregar} disabled={cfgBusy}>⋯</button>
              <button className="btn-ghost" onClick={() => setOnbOpen(true)}><I d={ICONS.help || ICONS.bot} size={13} /> Configurar com ajuda</button>
              <button className="btn-ghost" onClick={() => setTestOpen(true)}><I d={ICONS.send} size={13} /> Testar bot</button>
              <button className="btn-ghost" onClick={salvarConfig} disabled={cfgBusy}>{cfgBusy ? "Salvando…" : "Salvar"}</button>
            </>
          )}
        </div>
      </div>

      {/* ── 3 GUIAS por tipo: cada guia É o tipo, com seu fluxo+config no mesmo
             painel. Substituem os 3 cards de ativação + o seletor de tipo + as abas. ── */}
      {!act.armed && (
        <div className="bot-pin-aviso">
          Pino não armado — ative o bot pelo Suporte para esta empresa.
        </div>
      )}
      <div className="bot-guias" role="tablist" aria-label="Tipo de bot">
        {(["atendimento", "recovery", "prospeccao"] as BotTypeName[]).map(t => {
          const st = act.types[t];
          return (
            <button
              key={t}
              role="tab"
              aria-selected={cfgTipo === t}
              className={"bot-guia" + (cfgTipo === t ? " on" : "")}
              onClick={() => { if (t !== cfgTipo) { selecionarTipo(t); setActiveStep("welcomeMessage"); } }}
              disabled={cfgBusy}
              title={st.live ? "Ligado automaticamente" : (st.blocked || "Configure pra ligar sozinho")}
            >
              <span className={"bot-guia__dot" + (st.live ? " bot-guia__dot--on" : "")} aria-hidden="true" />
              <span className="bot-guia__name">{TYPE_LABEL[t]}</span>
            </button>
          );
        })}
      </div>

      {/* ── Painel integrado do tipo: fluxo=config (a chavinha liga SOZINHA — ver efeito auto-ligar) ── */}
      <div className="bot-panel">
        {cfgTipo === "prospeccao" ? (
          /* Guia Prospecção: motor de disparo frio (config REAL via live-status +
             prospecting/config). NÃO usa as peças de mensagem do atendimento. */
          <BotProspeccaoPanel onSaved={loadActivation} />
        ) : cfgErro ? (
          <div className="bot-load-error" role="alert">
            <strong className="bot-load-error__title">Não deu pra carregar o bot</strong>
            <p className="bot-load-error__msg">{cfgErro}</p>
            <button className="btn-teal" onClick={recarregar} disabled={cfgBusy}>
              {cfgBusy ? "Carregando…" : "Tentar de novo"}
            </button>
          </div>
        ) : (
          <div className="bot-montagem">
            {/* Switcher de modo (segmented control): Tabuleiro · Trilha · Bandeja */}
            <div className="bot-modos" role="tablist" aria-label="Modo de montagem">
              {MONTAGEM_MODOS.map(m => (
                <button
                  key={m.key}
                  role="tab"
                  type="button"
                  aria-selected={montagemModo === m.key}
                  className={"bot-modo" + (montagemModo === m.key ? " on" : "")}
                  title={m.hint}
                  onClick={() => setMontagemModo(m.key)}
                >
                  <I d={ICONS[m.icon] || ICONS.dash} size={14} />
                  <span className="bot-modo__name">{m.label}</span>
                </button>
              ))}
              <span className="bot-modo__hint">{MONTAGEM_MODOS.find(m => m.key === montagemModo)?.hint}</span>
            </div>

            {/* ── MODO TABULEIRO: organograma é o herói, GRANDE e central ── */}
            {montagemModo === "tabuleiro" && (
              <div className="bot-modo-view bot-modo-view--tabuleiro">
                <BotFlowCanvas config={configVivo} activeStep={activeStep} onPickNode={k => abrirPeca(k as EditorKey)} />
                {cfgTipo === "atendimento" && (
                  <button
                    type="button"
                    className={"bot-board-settings" + (editorKey === "ajustes" ? " on" : "")}
                    onClick={() => abrirPeca("ajustes")}
                    title="Regras gerais do bot"
                  >
                    <span className="bot-board-settings__icon"><I d={ICONS.config} size={14} /></span>
                    <span className="bot-board-settings__txt">Ajustes</span>
                    <span className={"bot-board-settings__dot" + (ruleValue("globalBotEnabled") ? " on" : "")} aria-hidden="true" />
                  </button>
                )}
              </div>
            )}

            {/* ── MODO TRILHA: passos numerados verticais que ACENDEM ── */}
            {montagemModo === "trilha" && (
              <div className="bot-modo-view bot-modo-view--trilha">
                <ol className="bot-trail">
                  {pecas.map((p, i) => {
                    const pronto = pecaPronta(p);
                    const aberto = editorKey === p.key;
                    return (
                      <li key={String(p.key)} className={"bot-trail__step" + (pronto ? " is-done" : "") + (aberto ? " is-open" : "")}>
                        <span className="bot-trail__rail" aria-hidden="true" />
                        <span className="bot-trail__num" style={{ ["--bot-phase-color" as string]: p.tone }}>
                          {pronto ? <I d={ICONS.check} size={13} /> : i + 1}
                        </span>
                        <button type="button" className="bot-trail__card" onClick={() => abrirPeca(p.key)}>
                          <span className="bot-trail__icon" style={{ ["--bot-phase-color" as string]: p.tone }}>
                            <I d={ICONS[p.icon] || ICONS.msg} size={15} />
                          </span>
                          <span className="bot-trail__titles">
                            <span className="bot-trail__name">{p.label}</span>
                            <span className="bot-trail__hint">{p.hint}</span>
                          </span>
                          <span className={"bot-trail__badge" + (pronto ? " bot-trail__badge--ready" : "")}>
                            {pronto ? "Pronto" : "Montar"}
                          </span>
                          <span className="bot-trail__chev" aria-hidden="true"><I d={ICONS.arrow} size={12} /></span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}

            {/* ── MODO BANDEJA: arrasta peça da bandeja → área de montagem ── */}
            {montagemModo === "bandeja" && (
              <div className="bot-modo-view bot-modo-view--bandeja">
                <div className="bot-tray">
                  <span className="bot-tray__title">Peças disponíveis</span>
                  <span className="bot-tray__sub">Arraste para a área ao lado (ou clique) para montar</span>
                  <div className="bot-tray__chips">
                    {pecas.map(p => {
                      const pronto = pecaPronta(p);
                      return (
                        <button
                          key={String(p.key)}
                          type="button"
                          className={"bot-chip" + (pronto ? " is-done" : "")}
                          draggable
                          onDragStart={e => { e.dataTransfer.setData("text/plain", String(p.key)); e.dataTransfer.effectAllowed = "move"; }}
                          onClick={() => abrirPeca(p.key)}
                          title={pronto ? "Editar peça" : "Arraste pra montar ou clique"}
                        >
                          <span className="bot-chip__icon" style={{ ["--bot-phase-color" as string]: p.tone }}>
                            <I d={ICONS[p.icon] || ICONS.msg} size={13} />
                          </span>
                          <span className="bot-chip__name">{p.label}</span>
                          {pronto && <span className="bot-chip__done" aria-hidden="true"><I d={ICONS.check} size={11} /></span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div
                  className={"bot-drop" + (dragOver ? " is-over" : "")}
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (!dragOver) setDragOver(true); }}
                  onDragLeave={e => { if (e.target === e.currentTarget) setDragOver(false); }}
                  onDrop={e => {
                    e.preventDefault();
                    setDragOver(false);
                    const k = e.dataTransfer.getData("text/plain");
                    if (k) abrirPeca(k as EditorKey);
                  }}
                >
                  <div className="bot-drop__inner">
                    <span className="bot-drop__icon"><I d={ICONS.plus} size={22} /></span>
                    <strong className="bot-drop__title">Solte a peça aqui</strong>
                    <span className="bot-drop__hint">Arraste uma peça da bandeja para começar a preenchê-la</span>
                    <div className="bot-drop__progress">
                      <span className="bot-drop__count">{pecasProntas} de {pecas.length} peças · {pecasPct}%</span>
                      <span className="bot-drop__track"><span className="bot-drop__fill" style={{ width: `${pecasPct}%` }} /></span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Gaveta de variáveis + editor de peça (deslizam da direita) + painel de teste */}
      {variablesDrawer}
      {phaseEditor}
      {testDrawer}

      {/* Onboarding assistido (Atendimento/Recovery) */}
      <BotOnboarding
        open={onbOpen && cfgTipo !== "prospeccao"}
        botType={cfgTipo as "atendimento" | "recovery"}
        fields={BOT_MSG_FIELDS.map<BotOnboardingField>(f => ({
          key: String(f.key),
          label: f.label,
          hint: f.hint,
          icon: f.icon,
          tone: f.color,
          buttonsKey: f.buttonsKey,
        }))}
        value={k => cfgValue(k as keyof BotConfig)}
        onChange={(k, v) => setCfgForm(prev => ({ ...prev, [k]: v }))}
        onSave={async () => { await salvarConfig(); }}
        saving={cfgBusy}
        connectionReady={act.types[cfgTipo as "atendimento" | "recovery"].preflight.chipConectado}
        connectionHint={
          act.types[cfgTipo as "atendimento" | "recovery"].preflight.chipConectado
            ? "WhatsApp conectado"
            : "Conexão pendente — peça ao Suporte"
        }
        onClose={() => setOnbOpen(false)}
        onRequestActivate={() => { setOnbOpen(false); requestActivate(); }}
      />

      {/* Gate de Termos antes de ativar */}
      <BotTermsModal
        open={termsOpen}
        botType={cfgTipo}
        checklist={[
          ...BOT_MSG_FIELDS.map(f => ({ label: f.label, done: cfgValue(f.key).trim().length > 0 })),
          { label: "WhatsApp conectado", done: act.types[cfgTipo].preflight.chipConectado },
        ]}
        onAccept={() => {
          setBotTermsAccepted(cfgTipo);
          setTermsOpen(false);
          pendingActivateRef.current = false;
          void toggleType(cfgTipo, true);
        }}
        onClose={() => { setTermsOpen(false); pendingActivateRef.current = false; }}
      />
    </React.Fragment>
  );
}
