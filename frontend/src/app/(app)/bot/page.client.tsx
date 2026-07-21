"use client";

// Tela Bot — painel de controle real: pino + 3 chavinhas + pré-voo + config 3 tipos.
// B: Header com faixa do pino (read-only) + chave de liberação + 3 guias por tipo.
// C: Aba Configurações com seletor de tipo: troca endpoint (atendimento/recovery/prospecção).
// D: S18 (MOTOR-ÚNICO) — o chat de teste FAKE (simulação local hardcoded) e o
// BotOnboarding (wizard duplicado) morreram; o sandbox real (POST
// /automation/agent/sandbox) e o wizard únicos vivem em /automacao (S13).
// Design System: zero hex/inline solto — só classes/tokens centrais. CSS novo em screens.css.

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { I, ICONS, useMyModules } from "@/components/hbx/shell";
import { BotFlowCanvas } from "@/components/hbx/bot-flow-canvas";
import { BotVariablesDrawer, type VarDef } from "@/components/hbx/bot-variables-drawer";
import { BotPhaseEditor } from "@/components/hbx/bot-phase-editor";
import { BotProspeccaoPanel } from "@/components/hbx/bot-prospeccao-panel";
import { BotTermsModal, isBotTermsAccepted, setBotTermsAccepted } from "@/components/hbx/bot-terms-modal";
import { apiFetch } from "@/lib/api";

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

// ── Montagem (Tabuleiro) ──────────────────────────────────────────────────────
// S18 (MOTOR-ÚNICO): Trilha e Bandeja morreram — a S13 manteve só Tabuleiro no
// /automacao novo (secao-atendente.tsx). "ajustes" é a peça-chave especial
// (regras), não uma das fases de mensagem.
type EditorKey = keyof BotConfig | "ajustes";

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

// ─── Componente principal ─────────────────────────────────────────────────────

export function BotClient() {
  // ── Tela dividida: fase em foco + gaveta de variáveis ──
  const [activeStep, setActiveStep] = useState<string>("welcomeMessage");
  const [varsOpen, setVarsOpen] = useState(false);
  const [activeFieldKey, setActiveFieldKey] = useState<keyof BotConfig | null>(null);
  // ── Termos ─────────────────────────────────────────────────────────────
  const [termsOpen, setTermsOpen] = useState(false);
  // flag: após aceitar os Termos, deve ligar o bot
  const pendingActivateRef = useRef(false);
  // ── Montagem: peça aberta no editor deslizante ──
  const [editorKey, setEditorKey] = useState<EditorKey | null>(null);
  // ref do textarea da fase atualmente focada (pra inserir variável no cursor)
  const activeFieldRef = useRef<HTMLTextAreaElement | null>(null);

  // ── Activation (pino + 3 chavinhas) ──────────────────────────────────────
  // GET/PUT /bot/activation exigem o módulo 'bot' liberado para a empresa
  // (@ModuleAccess('bot') no backend — 'bot' não vem em NENHUM plano padrão,
  // só entra via post-it do master). O Topbar já sabe disso e só chama o mesmo
  // endpoint quando mods.byKey["bot"]?.accessible é true; esta tela chamava
  // direto e martelava 403 em toda visita de empresa sem o módulo liberado.
  // Mesmo gate aqui — sem módulo liberado, a tela fica no estado padrão
  // (armed:false → "Aguardando ativação do Suporte"), que é visualmente
  // idêntico ao que já aparecia antes (a resposta 403 nunca era usada).
  const mods = useMyModules();
  const botAccessible = mods.loaded && Boolean(mods.byKey["bot"]?.accessible);
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
      atendimento: { live: false, preflight: { chipConectado: false, configCompleta: false }, blocked: null },
      recovery:    { live: false, preflight: { chipConectado: false, configCompleta: false }, blocked: null },
      prospeccao:  { live: false, preflight: { chipConectado: false, configCompleta: false }, blocked: null },
    },
  };

  // setState só em callback assíncrono (regra react-hooks/set-state-in-effect).
  // Sem módulo liberado (post-it do master ausente), nem tenta — devolveria 403.
  const loadActivation = useCallback(() => {
    if (!botAccessible) return;
    apiFetch<ActivationState>("/bot/activation")
      .then(data => { if (data) setActivation(data); })
      .catch(() => { /* backend indisponível — mantém estado padrão, tela não quebra */ });
  }, [botAccessible]);

  async function toggleType(tipo: BotTypeName, live: boolean) {
    if (actBusy) return;
    if (!botAccessible) {
      setActMsg("Bot não liberado para esta empresa. Acione o Suporte.");
      return;
    }
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
      })
      .catch(err => {
        setCfgData(null);
        setCfgErro(err instanceof Error ? err.message : "Não foi possível carregar a configuração do bot.");
      })
      .finally(() => { setCfgBusy(false); });
  }

  // Config inicial (Atendimento) na montagem — não depende do módulo 'bot'.
  useEffect(() => {
    initCfgTipo("atendimento");
  }, [initCfgTipo]);

  // Ativação (pino): loadActivation já se auto-guarda em botAccessible; este
  // efeito dispara de novo quando useMyModules termina de carregar (identidade
  // de loadActivation muda com botAccessible), então roda exatamente 1x
  // "de verdade" assim que soubermos se o módulo está liberado.
  useEffect(() => {
    loadActivation();
  }, [loadActivation]);


  // Trocar tipo → recarregar config. Prospecção NÃO usa o endpoint de bot-config
  // (é do atendimento); o <BotProspeccaoPanel> carrega sozinho via live-status.
  function selecionarTipo(tipo: BotTypeName) {
    setCfgTipo(tipo);
    setEditorKey(null);
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

  // ── Peças (Tabuleiro) ─────────────────────────────────────────────────────
  // Lista de peças do organograma: as 7 fases reais + "Ajustes" (regras,
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

  // Abre uma peça no editor deslizante. Fase real → também
  // destaca o nó (activeStep). "Ajustes" não é nó, só abre o editor.
  function abrirPeca(key: EditorKey) {
    setEditorKey(key);
    if (key !== "ajustes") setActiveStep(String(key));
  }

  // ── Variáveis: insere no cursor do textarea ancorado ────────────────────────

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

  // ── Derived state ─────────────────────────────────────────────────────────

  const act = activation ?? defaultActivation;

  // ── Gaveta de variáveis (compartilhada por todas as fases / aba Config) ────
  const variablesDrawer = (
    <BotVariablesDrawer
      open={varsOpen}
      variableCatalog={cfgData?.variableCatalog ?? []}
      onClose={() => setVarsOpen(false)}
      onInsert={inserirVariavel}
    />
  );

  // ── Editor deslizante de peça ───────────────────────────────────────────
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
      variableCatalog={cfgData?.variableCatalog ?? []}
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

  // ── Render desktop ────────────────────────────────────────────────────────

  return (
    <React.Fragment>
      {/* ── Header: título + faixa do pino + 3 chavinhas ── */}
      <div className="bot-head">
        <h1>Construtor de Bot <I d={["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"]} size={16} /></h1>

        <Link className="btn-ghost" href="/automacoes"><I d={ICONS.automacao} size={13} /> Ver Automações</Link>

        {/* Faixa do pino (read-only) */}
        <span className={"bot-pin-faixa" + (act.armed ? " bot-pin-faixa--armed" : "")}>
          {act.armed
            ? `Bot armado por ${act.armedBy ?? "Suporte"}${act.channel ? ` · ${act.channel}` : ""}`
            : "Aguardando ativação do Suporte"}
        </span>

        {/* Chave de liberação (read-only): amarela = armado, vermelha = não armado */}
        <span
          className={"bot-release-key" + (act.armed ? " bot-release-key--on" : " bot-release-key--off")}
          title={act.armed ? "Liberado pelo Suporte — configure e ligue" : "Aguardando liberação do Suporte"}
          aria-label={act.armed ? "Liberado pelo Suporte" : "Aguardando liberação do Suporte"}
        />

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
          {/* Prospecção tem barra própria no painel (Salvar disparo / recarregar). */}
          {cfgTipo !== "prospeccao" && (
            <>
              <button className="btn-ghost" style={{ minWidth: 38 }} title="Recarregar configuração" onClick={recarregar} disabled={cfgBusy}>⋯</button>
              {!act.types[cfgTipo].live && (
                <button className="btn-ghost" onClick={requestActivate} disabled={cfgBusy || actBusy}>
                  <I d={ICONS.bolt || ICONS.check} size={13} /> Ativar bot
                </button>
              )}
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

      {/* ── Painel integrado do tipo: fluxo=config (master arma → cliente configura → cliente liga) ── */}
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
            {/* Tabuleiro: organograma central — Trilha e Bandeja morreram (S18,
                README "DESCARTAR"); a S13 já manteve só este modo no /automacao novo. */}
            <div className="bot-modo-view bot-modo-view--tabuleiro">
              <div className="bot-board-canvas">
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
            </div>
          </div>
        )}
      </div>

      {/* Gaveta de variáveis + editor de peça (deslizam da direita) */}
      {variablesDrawer}
      {phaseEditor}

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
