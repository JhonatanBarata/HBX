"use client";

// S14 (MOTOR-ÚNICO) — Seção "Cobrar quem deve" (?secao=cobranca) do /automacao.
// REEMBALAGEM do Recovery: motor e endpoints INTOCADOS — consome só
//   GET/PATCH /hbx-recovery/bot-config  +  GET/PUT /bot/activation (type "recovery")
// UI no padrão da seção Atendente (S13): toolbar de estado + editor de fases
// (BotFlowCanvas/BotPhaseEditor) + celular de prévia. Recovery NÃO tem cérebro
// de IA hoje — não existe endpoint de sandbox pra ele, então a prévia é
// ESTÁTICA (derivada da config, sem input/envio) em vez do celular
// interativo que a Atendente tem — S14.md item 2 pede explicitamente
// "SEM sandbox IA... não inventar".
//
// ── Decisões/desvios documentados (S14.md pede: "qualquer desvio com
// justificativa") ──
//
// D1. `BotFlowCanvas` é de FORMATO FIXO — as 7 fases (welcomeMessage,
// mainMenuPrompt, postActionPrompt, closeTopicMessage, returningCustomerMessage,
// humanAckMessage, blockedMessage) são uma constante interna do componente
// (bot-flow-canvas.tsx), não vêm por prop. O contrato desta sprint PEDE
// explicitamente reusar "os MESMOS componentes de fase do S13:
// BotFlowCanvas/BotPhaseEditor" — então essas são as 7 peças mostradas aqui,
// mesmo mapeamento genérico que a guia Recovery do /bot velho já usava
// (BOT_MSG_FIELDS/BOT_BTN_GROUPS compartilhados com a guia Atendimento).
// O `RecoveryBotConfig` REAL (backend/src/hbx-recovery/recovery-bot-config.ts)
// tem outro vocabulário (declineMenuPrompt, followupPrompt, valueMessageTemplate,
// installmentsPrompt, installmentConfirmTemplate, cashLinkMessageTemplate,
// installmentLinkMessageTemplate, postLinkPrompt, paidClaimMessage…) — só 3
// das 7 peças do canvas têm campo real por trás (mainMenuPrompt, humanAckMessage,
// closeTopicMessage) e só 1 dos 2 grupos de botão (mainMenuButtons; welcomeButtons
// não existe no schema real). As outras 4 peças (Boas-vindas, Retorno, Pós-ação,
// Bloqueado) ficam "peça vazia" que nunca acende — o backend ignora esses
// campos em silêncio no PATCH (normalizeRecoveryBotConfig não os lê). Isto é
// um comportamento PRÉ-EXISTENTE da guia Recovery do /bot velho, não algo
// introduzido aqui — reproduzido tal qual (reembalagem = motor/endpoints
// intocados; cobrir o vocabulário REAL do Recovery exigiria tornar o
// BotFlowCanvas genérico, o que é trabalho de produto, fora do escopo desta
// sprint). `mainMenuPrompt`/`mainMenuButtons` — a peça que decide o pré-voo
// real (`resolveConfigCompleta` no backend) — está coberta e funcional.
//
// D2. `buildBody()` NUNCA escreve `routingRules` (diferente do /bot velho, que
// mandava um objeto no VOCABULÁRIO do Atendimento — globalBotEnabled,
// checkRecoveryBeforeReply… — nenhuma dessas chaves existe no
// `RecoveryRoutingRules` real, então o backend as ignorava e reescrevia o
// campo inteiro com os DEFAULTS a cada Salvar, apagando silenciosamente a
// preferência real da empresa). Esta seção não tem peça "Ajustes" (Recovery
// nunca teve, nem no /bot velho — `cfgTipo === "atendimento"` era a única
// guia que ganhava essa peça), então o PATCH aqui faz `{...config, ...edições}`
// sem tocar `routingRules` — o valor real salvo passa incólume pelo
// round-trip. Consequência: esta reembalagem não repete aquele bug lateral do
// /bot velho (efeito colateral de não ter a peça, não uma correção proposital
// fora de escopo).
//
// D3. `canUseOfficialButtons` fixo em `false` (mesma decisão documentada da
// S13/secao-atendente.tsx D4) — este endpoint também não devolve
// `providerCapabilities`; modo "opções numeradas" funciona em QR e Meta.
//
// D4. `canManage` não vem do backend (só `/automation/agent` GET tem esse
// campo — S05). Calculado no front com o MESMO helper central que resolve
// admin/master em todo o app (`isTenantAdmin`, frontend/src/lib/roles.ts —
// espelha `isAdminOrMaster` do backend). O PATCH de `/hbx-recovery/bot-config`
// não é gateado por papel no backend hoje (só por módulo `atendimento`) — like
// endpoint intocado, a trava de "vendedor = read-only" fica só na UI (mesmo
// limite que a S13 aceitou pro Atendente antes da S09/AutomationAgent existir).
//
// REUSA (importa, não copia): WhatsAppPreview, BotFlowCanvas, BotPhaseEditor,
// BotVariablesDrawer, BotTermsModal — e as classes centrais .ia-toolbar/
// .ia-pub-pill/.ia-split/.ia-chat-dock* (assistente.css) + .bot-panel/
// .bot-montagem/.bot-modo-view--tabuleiro/.bot-board-canvas (bot-builder.css)
// + .auto-flag-note (screens.css). Zero import das páginas velhas (bot/
// page.client.tsx) — zero CSS novo (automacao.css só ganha o comentário desta
// sprint, nada de classe nova: a reembalagem coube 100% no que já existe).

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { I, ICONS, useCurrentUser } from "@/components/hbx/shell";
import { isTenantAdmin } from "@/lib/roles";
// S01 (PADRAO-MERCADO): telefone (dock + <WhatsAppPreview>) extraído pro kit central — zero duplicação (era igual em secao-atendente.tsx).
import type { WAMessage } from "@/components/hbx/whatsapp-preview";
import { PhonePreview } from "./kit/phone-preview";
import { BotFlowCanvas } from "@/components/hbx/bot-flow-canvas";
import { BotPhaseEditor } from "@/components/hbx/bot-phase-editor";
import { BotVariablesDrawer, type VarDef } from "@/components/hbx/bot-variables-drawer";
import { BotTermsModal, isBotTermsAccepted, setBotTermsAccepted } from "@/components/hbx/bot-terms-modal";
import type { BotButton, BotAction } from "@/components/hbx/bot-buttons-editor";
import { apiFetch } from "@/lib/api";

// ================================================================
// Tipos — espelham backend/src/hbx-recovery/recovery-bot-config.ts
// (RecoveryBotConfig) SÓ nos campos que este editor toca (D1); o resto passa
// por `[key: string]: unknown` (round-trip intacto no PATCH — D2).
// ================================================================
type BotaoGrupo = "welcomeButtons" | "mainMenuButtons";
type MsgFieldKey =
  | "welcomeMessage"
  | "returningCustomerMessage"
  | "mainMenuPrompt"
  | "postActionPrompt"
  | "humanAckMessage"
  | "closeTopicMessage"
  | "blockedMessage";
type EditorKey = MsgFieldKey;
type Peca = { key: EditorKey; label: string; hint: string; icon: string; tone: string; buttonsKey?: BotaoGrupo };

type RecoveryConfig = {
  variableCatalog?: VarDef[];
  actionCatalog?: BotAction[];
  welcomeMessage?: string;
  returningCustomerMessage?: string;
  mainMenuPrompt?: string;
  mainMenuButtons?: BotButton[];
  welcomeButtons?: BotButton[];
  postActionPrompt?: string;
  humanAckMessage?: string;
  closeTopicMessage?: string;
  blockedMessage?: string;
  [key: string]: unknown;
};

type Preflight = { chipConectado: boolean; configCompleta: boolean } | null;
type ActivationState = {
  armed: boolean;
  types: {
    recovery: { live: boolean; preflight: Preflight; blocked: string | null };
  };
};

// ================================================================
// Constantes — mesmas 7 fases + 2 grupos de botão que BotFlowCanvas conhece
// (D1). Recovery nunca teve peça "Ajustes" (nem no /bot velho).
// ================================================================
const BOT_MSG_FIELDS: { key: MsgFieldKey; label: string; hint: string; icon: string; color: string; buttonsKey?: BotaoGrupo }[] = [
  { key: "welcomeMessage", label: "Boas-vindas", hint: "Primeira mensagem para contato novo", icon: "msg", color: "var(--hbx-brand)", buttonsKey: "welcomeButtons" },
  { key: "returningCustomerMessage", label: "Cliente retornando", hint: "Quando o contato já é conhecido", icon: "reply", color: "var(--hbx-info)" },
  { key: "mainMenuPrompt", label: "Menu principal", hint: "Pergunta com as opções do menu", icon: "atend", color: "var(--hbx-info)", buttonsKey: "mainMenuButtons" },
  { key: "postActionPrompt", label: "Pós-ação", hint: "Depois de concluir uma ação", icon: "check", color: "var(--hbx-success)" },
  { key: "humanAckMessage", label: "Transferência para humano", hint: "Aviso de que um atendente assume", icon: "users", color: "var(--hbx-warning)" },
  { key: "closeTopicMessage", label: "Encerramento", hint: "Fechamento da conversa", icon: "clock", color: "var(--hbx-secondary)" },
  { key: "blockedMessage", label: "Contato bloqueado", hint: "Resposta para contato bloqueado", icon: "x", color: "var(--hbx-danger)" },
];
const BOT_BTN_GROUPS: { key: BotaoGrupo; label: string; hint: string }[] = [
  { key: "welcomeButtons", label: "Botões de boas-vindas", hint: "aparecem na primeira mensagem" },
  { key: "mainMenuButtons", label: "Botões do menu principal", hint: "opções do menu" },
];

// ================================================================
// RAIZ da seção — GET /hbx-recovery/bot-config + GET /bot/activation.
// ================================================================
export function SecaoCobranca({ onChanged }: { onChanged?: () => void }) {
  const user = useCurrentUser();
  const canManage = isTenantAdmin(user);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<RecoveryConfig | null>(null);
  const [activation, setActivation] = useState<ActivationState | null>(null);

  const [activeStep, setActiveStep] = useState<string>("mainMenuPrompt");
  const [cfgForm, setCfgForm] = useState<Partial<Record<MsgFieldKey, string>>>({});
  const [cfgBotoes, setCfgBotoes] = useState<Partial<Record<BotaoGrupo, BotButton[]>>>({});
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [termsOpen, setTermsOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [cfg, act] = await Promise.all([
        apiFetch<RecoveryConfig>("/hbx-recovery/bot-config"),
        apiFetch<ActivationState>("/bot/activation"),
      ]);
      setConfig(cfg);
      setActivation(act);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar a Cobrança.");
    }
  }, []);

  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch ao montar (guarda `alive` contra race/unmount)
    void load().then(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [load]);

  // Resincroniza edições locais quando uma releitura fresca chega (salvar ou
  // publicar) — mesmo padrão de secao-atendente.tsx.
  /* eslint-disable react-hooks/set-state-in-effect -- resincroniza o editor quando `config` muda; efeito legítimo */
  useEffect(() => {
    setCfgForm({});
    setCfgBotoes({});
  }, [config]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function cfgValue(key: MsgFieldKey): string {
    const edited = cfgForm[key];
    if (typeof edited === "string") return edited;
    const real = config ? config[key] : "";
    return typeof real === "string" ? real : "";
  }
  function botoesDe(grupo: BotaoGrupo): BotButton[] {
    const edited = cfgBotoes[grupo];
    if (edited) return edited;
    const real = config ? config[grupo] : [];
    return Array.isArray(real) ? (real as BotButton[]) : [];
  }
  function onFieldChange(key: MsgFieldKey, value: string) { setCfgForm((prev) => ({ ...prev, [key]: value })); }
  function onButtonsChange(grupo: BotaoGrupo, next: BotButton[]) { setCfgBotoes((prev) => ({ ...prev, [grupo]: next })); }

  const dirty = Object.keys(cfgForm).length > 0 || Object.keys(cfgBotoes).length > 0;

  const configVivo = useMemo<RecoveryConfig>(() => {
    const base: RecoveryConfig = config ? { ...config } : {};
    const merged: RecoveryConfig = { ...base };
    for (const f of BOT_MSG_FIELDS) {
      const edited = cfgForm[f.key];
      if (typeof edited === "string") merged[f.key] = edited;
    }
    for (const g of BOT_BTN_GROUPS) {
      const edited = cfgBotoes[g.key];
      if (edited) merged[g.key] = edited;
    }
    return merged;
  }, [config, cfgForm, cfgBotoes]);

  // D2 (cabeçalho do arquivo): full-replace a partir da config REAL (`config`,
  // não `configVivo`) — preserva TODOS os campos reais que este editor não
  // toca (declineMenu*/followup*/value*/installment*/postLink*/startTemplates/
  // routingRules…). Nunca escreve `routingRules` — Cobrança não tem peça
  // "Ajustes" pra editá-lo.
  function buildBody(): Record<string, unknown> {
    const body: Record<string, unknown> = config ? { ...config } : {};
    for (const f of BOT_MSG_FIELDS) {
      const v = cfgValue(f.key);
      if (v.trim()) body[f.key] = v;
    }
    for (const g of BOT_BTN_GROUPS) {
      const edited = cfgBotoes[g.key];
      if (!edited) continue;
      body[g.key] = edited.map((b) => ({
        buttonId: b.buttonId,
        actionId: b.actionId,
        title: b.title.trim(),
        ...(b.nextNodeId ? { nextNodeId: b.nextNodeId } : {}),
      }));
    }
    return body;
  }

  async function salvar() {
    if (!config || saving) return;
    setSaving(true);
    setNote(null);
    try {
      const updated = await apiFetch<RecoveryConfig>("/hbx-recovery/bot-config", {
        method: "PATCH",
        body: JSON.stringify(buildBody()),
      });
      setConfig(updated);
      setNote("Roteiro de cobrança salvo.");
      onChanged?.();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function doPublish(on: boolean) {
    try {
      await apiFetch("/bot/activation", {
        method: "PUT",
        body: JSON.stringify({ type: "recovery", live: on }),
      });
      setNote(on ? "Cobrança publicada no WhatsApp." : "Cobrança pausada.");
      const fresh = await apiFetch<ActivationState>("/bot/activation");
      setActivation(fresh);
      onChanged?.();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Não foi possível publicar.");
    }
  }

  // Item 3 (S14.md): Recovery é PROATIVO — confirm() antes de ligar, mesma
  // sequência do /bot velho (Termos só na 1ª vez; confirm() no caminho rápido
  // de quem já aceitou — reproduzido tal qual).
  function requestPublish() {
    if (dirty) { setNote("Salve antes de publicar."); return; }
    if (!isBotTermsAccepted("recovery")) { setTermsOpen(true); return; }
    if (!window.confirm("Publicar a Cobrança? Ela passará a agir automaticamente nas conversas de devedores.")) return;
    void doPublish(true);
  }

  function buildChecklist(): { label: string; done: boolean }[] {
    return [
      { label: "Menu principal com botões", done: botoesDe("mainMenuButtons").length > 0 },
      { label: "WhatsApp conectado", done: Boolean(activation?.types.recovery.preflight?.chipConectado) },
    ];
  }

  const armed = activation?.armed ?? false;
  const live = activation?.types.recovery.live ?? false;
  const blocked = activation?.types.recovery.blocked ?? null;
  const stateLabel = !armed ? "Aguardando suporte" : live ? "Ativo no WhatsApp" : dirty ? "Alterações não salvas" : "Rascunho";
  const stateIcon = !armed ? ICONS.help : live ? ICONS.check : ICONS.edit;

  if (error) {
    return (
      <section className="panel">
        <div style={{ padding: 18, display: "grid", gap: 10, justifyItems: "start" }}>
          <strong>Não carregou</strong>
          <span className="hint">{error}</span>
          <button className="btn-ghost" onClick={() => { setLoading(true); void load().then(() => setLoading(false)); }}>Tentar novamente</button>
        </div>
      </section>
    );
  }

  if (loading || !config) return <div className="hint">Carregando…</div>;

  return (
    <>
      <div className="ia-toolbar">
        <span className="ia-toolbar__avatar">C</span>
        <div className="ia-toolbar__id">
          <span className="ia-toolbar__name">Cobrança</span>
          <span className="ia-toolbar__meta">Recovery — roteiro de menu</span>
        </div>
        <span className={"ia-pub-pill" + (live ? " is-on" : "")}>
          <I d={stateIcon} size={11} />
          {stateLabel}
        </span>

        <div className="ia-toolbar__actions">
          {canManage && (
            <button className="btn-ghost btn-xs" disabled={saving || !dirty} onClick={() => void salvar()}>
              {saving ? "Salvando…" : "Salvar"}
            </button>
          )}
          {canManage && (
            live ? (
              <button className="btn-ghost btn-xs danger" disabled={saving} onClick={() => void doPublish(false)}>Pausar no WhatsApp</button>
            ) : (
              <button className="btn-teal btn-xs" disabled={saving || dirty || !armed} onClick={requestPublish}>Publicar</button>
            )
          )}
        </div>
      </div>

      {!canManage && (
        <div className="auto-flag-note">
          <I d={ICONS.help} size={14} />
          Modo leitura — a configuração é feita pelo Admin da empresa.
        </div>
      )}
      {armed && blocked && (
        <div className="auto-flag-note"><I d={ICONS.help} size={14} />{blocked}</div>
      )}
      {note && <div className="auto-flag-note"><I d={ICONS.check} size={14} />{note}</div>}

      <div className="ia-split has-chat">
        <CobrancaPane
          config={configVivo}
          canManage={canManage}
          activeStep={activeStep}
          setActiveStep={setActiveStep}
          cfgValue={cfgValue}
          botoesDe={botoesDe}
          onFieldChange={onFieldChange}
          onButtonsChange={onButtonsChange}
        />
        <CobrancaPreview config={configVivo} />
      </div>

      <BotTermsModal
        open={termsOpen}
        botType="recovery"
        checklist={buildChecklist()}
        onAccept={() => { setBotTermsAccepted("recovery"); setTermsOpen(false); void doPublish(true); }}
        onClose={() => setTermsOpen(false)}
      />
    </>
  );
}

// ============================================================================
// PANE — Tabuleiro (organograma + peças), SÓ o modo Tabuleiro (Trilha e
// Bandeja morreram na S13, não portar). Leitura: sem `onPickNode` o próprio
// <BotFlowCanvas> vira read-only (cards não clicáveis).
// ============================================================================
function CobrancaPane({ config, canManage, activeStep, setActiveStep, cfgValue, botoesDe, onFieldChange, onButtonsChange }: {
  config: RecoveryConfig;
  canManage: boolean;
  activeStep: string;
  setActiveStep: (k: string) => void;
  cfgValue: (key: MsgFieldKey) => string;
  botoesDe: (grupo: BotaoGrupo) => BotButton[];
  onFieldChange: (key: MsgFieldKey, value: string) => void;
  onButtonsChange: (grupo: BotaoGrupo, next: BotButton[]) => void;
}) {
  const [editorKey, setEditorKey] = useState<EditorKey | null>(null);
  const [varsOpen, setVarsOpen] = useState(false);
  const [activeFieldKey, setActiveFieldKey] = useState<MsgFieldKey | null>(null);
  const activeFieldRef = useRef<HTMLTextAreaElement | null>(null);

  const pecas: Peca[] = useMemo(
    () => BOT_MSG_FIELDS.map((f) => ({ key: f.key, label: f.label, hint: f.hint, icon: f.icon, tone: f.color, buttonsKey: f.buttonsKey })),
    [],
  );

  function abrirPeca(key: EditorKey) {
    setEditorKey(key);
    setActiveStep(String(key));
  }

  function abrirVariaveis(key: MsgFieldKey, el: HTMLTextAreaElement | null) {
    setActiveFieldKey(key);
    setActiveStep(String(key));
    activeFieldRef.current = el;
    setVarsOpen(true);
  }

  function inserirVariavel(token: string) {
    const key = activeFieldKey;
    if (!key) return;
    const el = activeFieldRef.current;
    const atual = cfgValue(key);
    const start = el ? el.selectionStart ?? atual.length : atual.length;
    const end = el ? el.selectionEnd ?? atual.length : atual.length;
    const novo = atual.slice(0, start) + token + atual.slice(end);
    onFieldChange(key, novo);
    const caret = start + token.length;
    requestAnimationFrame(() => {
      const node = activeFieldRef.current;
      if (node) {
        node.focus();
        try { node.setSelectionRange(caret, caret); } catch { /* noop */ }
      }
    });
  }

  const pecaAtual = editorKey ? pecas.find((p) => p.key === editorKey) ?? null : null;
  const acoesDisponiveis = (config.actionCatalog || []).filter((a) => a.enabled !== false);
  // D3 (cabeçalho do arquivo): providerCapabilities não vem deste endpoint —
  // modo numerado fixo (funciona em QR e Meta).
  const canUseOfficialButtons = false;

  return (
    <div className="bot-panel">
      <div className="bot-montagem">
        <div className="bot-modo-view bot-modo-view--tabuleiro">
          <div className="bot-board-canvas">
            <BotFlowCanvas config={config} activeStep={activeStep} onPickNode={canManage ? (k) => abrirPeca(k as EditorKey) : undefined} />
          </div>
        </div>
      </div>

      {canManage && pecaAtual && (
        <BotPhaseEditor
          open={editorKey !== null}
          title={pecaAtual.label}
          hint={pecaAtual.hint}
          icon={pecaAtual.icon}
          tone={pecaAtual.tone}
          isSettings={false}
          value={cfgValue(pecaAtual.key)}
          onChange={(next) => onFieldChange(pecaAtual.key, next)}
          onFocusField={(el) => { setActiveFieldKey(pecaAtual.key); activeFieldRef.current = el; }}
          onOpenVariables={(el) => abrirVariaveis(pecaAtual.key, el)}
          variableCatalog={config.variableCatalog ?? []}
          showButtons={Boolean(pecaAtual.buttonsKey)}
          buttons={pecaAtual.buttonsKey ? botoesDe(pecaAtual.buttonsKey) : []}
          actionCatalog={acoesDisponiveis as BotAction[]}
          canUseOfficialButtons={canUseOfficialButtons}
          buttonsLabel={pecaAtual.buttonsKey === "welcomeButtons" ? "Botões de boas-vindas" : "Botões do menu"}
          buttonsHint={pecaAtual.buttonsKey === "welcomeButtons" ? "aparecem na primeira mensagem" : "opções do menu"}
          onButtonsChange={(next) => { if (pecaAtual.buttonsKey) onButtonsChange(pecaAtual.buttonsKey, next); }}
          rules={[]}
          ruleValue={() => false}
          onToggleRule={() => {}}
          onClose={() => setEditorKey(null)}
        />
      )}

      <BotVariablesDrawer open={varsOpen} variableCatalog={config.variableCatalog ?? []} onClose={() => setVarsOpen(false)} onInsert={inserirVariavel} />
    </div>
  );
}

// ============================================================================
// PRÉVIA ESTÁTICA — dock direita, <WhatsAppPreview> derivada da config,
// READ-ONLY (sem `footer` → composer decorativo; sem `onQuickReply` → botões
// só ilustram o que o cliente veria). Recovery não tem cérebro de IA hoje —
// não existe endpoint de sandbox pra simular resposta (S14.md item 2: "não
// inventar").
// ============================================================================
function CobrancaPreview({ config }: { config: RecoveryConfig }) {
  const messages = useMemo<WAMessage[]>(() => {
    const out: WAMessage[] = [];
    const wc = typeof config.welcomeMessage === "string" ? config.welcomeMessage.trim() : "";
    if (wc) out.push({ dir: "in", text: wc, time: "agora" });
    const mm = typeof config.mainMenuPrompt === "string" ? config.mainMenuPrompt.trim() : "";
    if (mm) out.push({ dir: "in", text: mm, time: "agora" });
    return out;
  }, [config]);

  const quick = useMemo<string[]>(() => {
    const grp = (config.mainMenuButtons?.length ? config.mainMenuButtons : config.welcomeButtons) || [];
    return grp.map((b) => b.title).filter(Boolean);
  }, [config]);

  // S01 (PADRAO-MERCADO): dock + <WhatsAppPreview> viviam duplicados aqui e
  // em AtendenteSandbox (secao-atendente.tsx) — componente único agora
  // (kit/phone-preview.tsx). Mesmas classes no mesmo DOM, zero mudança visual.
  return (
    <PhonePreview
      title="Prévia da Cobrança"
      messages={messages}
      header={{ name: "Cobrança", status: "online" }}
      emptyHint="A prévia aparece quando você escrever a Boas-vindas ou o Menu principal"
      quickReplies={quick.length ? quick : undefined}
      footerNote="Recovery não tem cérebro de IA — a prévia só mostra o que a config vai enviar, não simula resposta."
    />
  );
}
