"use client";

// S13 (MOTOR-ÚNICO) — Seção "Atender sozinho" (?secao=atendente) do /automacao.
// A FUSÃO que o cliente VÊ: bot-atendimento (roteiro de botões) + assistente
// (IA) viram UM "Atendente" — identidade única, escolha de cérebro, editor do
// cérebro escolhido, UM celular de teste real. Consome SÓ os endpoints novos
// (S05, era ADAPTER — schema `AutomationAgent` só chega na S09):
//   GET/PUT /automation/agent · POST /automation/agent/sandbox ·
//   POST /automation/agent/publish
// NUNCA chama /assistente ou /inbox/bot-config direto (README + S13.md item 1).
//
// ── Decisões/desvios documentados (S13.md pede: "qualquer desvio com
// justificativa" — nenhum deles muda contrato de backend, só como o front
// CONSOME o adapter existente) ──
//
// D1. `resolveAgentBrain` (agent.service.ts) é um ratchet: assim que existe
// QUALQUER linha AssistenteConfig (mesmo rascunho), o `brain` resolvido pelo
// GET vira 'ia' pra sempre — mesmo se o roteiro estiver ativo/publicado. Por
// isso o cérebro MOSTRADO no editor é estado LOCAL (`selectedBrain`), não
// `view.brain` — o switch troca só qual editor/sandbox está em foco; o que
// fica ATIVO de verdade é decidido só no Publicar (que aceita `{brain}`
// explícito e o backend GARANTE mútua exclusão). Consequência aceita: o
// cartão do hub (`GET /automation/overview`) pode rotular "IA" enquanto os
// dois cérebros ainda estão em rascunho (nenhum publicado) — cosmético,
// autocorrige no primeiro publish real. Não dá pra corrigir sem tocar o
// adapter (fora do escopo desta sprint).
//
// D2. Wizard passo 3 escolhe o cérebro — mas só GRAVA no store do cérebro
// ESCOLHIDO (nunca os dois), exatamente pra não disparar o ratchet acima
// cedo demais numa empresa nova. `nome/tom` (passo 1) só existem como campo
// no schema do cérebro IA (`AssistenteConfigShape`); se o dono escolhe
// "Roteiro de botões", esses dois campos não têm pra onde ir (o roteiro não
// tem persona) — ficam só na prévia do wizard e são descartados no finalizar.
//
// D3. Sem `ia`/`roteiro` configurados ainda para o cérebro que o switch está
// mostrando, NÃO existe fetch alternativo pra "espiar" os defaults (GET
// devolve `null` de propósito — sinal de "nada configurado"). Em vez de
// fabricar um objeto padrão no front (chutando actionCatalog etc.), a peça
// pede confirmação ("Começar a configurar") e faz um PUT mínimo (`roteiro:{}`
// ou `ia` com campos vazios) — o BACKEND devolve os defaults reais na
// releitura. Isso também é o que faz nascer a primeira versão em
// `BotConfigStoreService` (sem isso, `hasRoteiro` nunca vira true).
//
// D4. `AtendimentoBotConfig` (roteiro) devolvido por este endpoint NÃO carrega
// `providerCapabilities` (isso é enriquecimento do controller de
// `/inbox/bot-config`, fora do contrato do agente). `canUseOfficialButtons`
// fica fixo em `false` (modo "opções numeradas", que funciona em QR e Meta) —
// documentado, não inventado.
//
// D5. `BotOnboarding` morreu nesta sprint (README "DESCARTAR"). O papel dele
// era só marcar `setup.completed=true` + `setup.botType='atendimento'`
// depois de preencher os campos mínimos — nosso `Salvar` do roteiro assume
// esse papel (grava sempre `setup.completed:true, botType:'atendimento'`);
// as mesmas validações de conteúdo mínimo (`isAtendimentoBotSetupComplete`,
// já existente no backend) continuam de pé pra travar `globalBotEnabled`.
//
// REUSA (importa, não copia): WhatsAppPreview, BotFlowCanvas, BotPhaseEditor,
// BotVariablesDrawer, BotTermsModal, GlassPill/useGlassPill — e os padrões do
// wizard de /assistente/page.client.tsx (identidade+negócio) e do Tabuleiro
// de /bot/page.client.tsx (organograma). Zero import das páginas velhas.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { GlassPill, useGlassPill } from "@/components/hbx/glass-pill";
import { I, ICONS, useCurrentUser } from "@/components/hbx/shell";
// S01 (PADRAO-MERCADO): telefone (dock + <WhatsAppPreview>) extraído pro kit central — zero duplicação (era igual em secao-cobranca.tsx).
import type { WAMessage } from "@/components/hbx/whatsapp-preview";
import { PhonePreview } from "./kit/phone-preview";
// S03 (PADRAO-MERCADO): StatusChip pro aviso do fallback do sandbox — Lei nº3 (vocabulário único de status).
// S09 (PADRAO-MERCADO): StatusTone junto — a toolbar passa a usar o MESMO StatusChip (ver `status` abaixo).
import { StatusChip, type StatusTone } from "./kit/status-chip";
// S08 (PADRAO-MERCADO): card de template padrão (kit central, ver seu cabeçalho) — a galeria do passo 3 usa.
import { TemplateCard, type TemplateCardOption } from "./kit/template-card";
import { BotFlowCanvas } from "@/components/hbx/bot-flow-canvas";
import { BotPhaseEditor, type PhaseRuleDef } from "@/components/hbx/bot-phase-editor";
import { BotVariablesDrawer, type VarDef } from "@/components/hbx/bot-variables-drawer";
import { BotTermsModal, isBotTermsAccepted, setBotTermsAccepted } from "@/components/hbx/bot-terms-modal";
import type { BotButton, BotAction } from "@/components/hbx/bot-buttons-editor";
import { apiFetch } from "@/lib/api";

// ================================================================
// Tipos — espelham backend/src/automation/dto/agent.dto.ts +
// backend/src/assistente/assistente-flow.ts + backend/src/inbox/atendimento-config.ts
// ================================================================
type AgentBrain = "roteiro" | "ia";
type Tom = "formal" | "normal" | "descontraido";
type Perfil = "vendas" | "suporte";
type FluxoPasso = { id: string; tipo: "mensagem"; texto: string };
type FluxoCondicao = { id: string; rotulo: string; comportamento: string; exemplos: string[]; proximoPassoId?: string | null };
type Fluxo = { entradaPassoId?: string | null; passos: FluxoPasso[]; condicoes: FluxoCondicao[] };
type IaConfig = { nome: string; tom: Tom; perfil: Perfil; produtos: string; empresaNome: string; fluxo: Fluxo };

type RoutingRules = {
  globalBotEnabled: boolean;
  checkRecoveryBeforeReply: boolean;
  autoRouteDebtorsToRecovery: boolean;
  autoReopenClosedConversation: boolean;
  notifyOnNewInbound: boolean;
};
type RoteiroConfig = {
  setup?: { completed?: boolean; botType?: string | null; [k: string]: unknown };
  variableCatalog: VarDef[];
  actionCatalog: BotAction[];
  routingRules: RoutingRules;
  welcomeMessage: string;
  welcomeButtons: BotButton[];
  returningCustomerMessage: string;
  returningCustomerButtons: BotButton[];
  mainMenuPrompt: string;
  mainMenuButtons: BotButton[];
  recoveryDetectedMessage: string;
  recoveryDetectedButtons: BotButton[];
  postActionPrompt: string;
  postActionButtons: BotButton[];
  humanAckMessage: string;
  closeTopicMessage: string;
  blockedMessage: string;
  [key: string]: unknown; // passthrough (smartVariables/sceneRules — não editados aqui)
};

type Preflight = { chipConectado: boolean; configCompleta: boolean } | null;

type AgentView = {
  companyId: number;
  brain: AgentBrain;
  published: boolean;
  updatedAt: string | null;
  updatedByUserId: number | null;
  roteiro: RoteiroConfig | null;
  ia: IaConfig | null;
  canManage: boolean;
  armed: boolean;
  preflight: Preflight;
};

type SandboxResponse = {
  reply: string;
  source: string;
  brain: AgentBrain;
  testNumber?: number;
  latencyMs?: number;
  stage?: "welcome" | "menu" | "pos_acao";
  buttons?: BotButton[];
  matchedButtonId?: string | null;
};

type PublishResponse = { published: boolean; brain: AgentBrain; ok: boolean; message?: string | null };

// ================================================================
// Constantes (dados — não é "a página velha", só as tabelas de campo)
// ================================================================
const TONS: { key: Tom; title: string; desc: string; frase: string }[] = [
  { key: "formal", title: "Formal", desc: "Respeitoso, sem gírias", frase: "Olá! Como posso ajudá-lo hoje? Fico à disposição para atendê-lo." },
  { key: "normal", title: "Normal", desc: "Cordial e direto", frase: "Oi! Tudo bem? Me conta como posso te ajudar." },
  { key: "descontraido", title: "Descontraído", desc: "Leve e amigável", frase: "E aí! Bora resolver isso rapidinho? 😄 Me diz o que você precisa!" },
];
const PERFIS: { key: Perfil; title: string; desc: string }[] = [
  { key: "vendas", title: "Vendas", desc: "Desperta interesse e conduz para o próximo passo" },
  { key: "suporte", title: "Suporte", desc: "Entende o problema e ajuda ou encaminha" },
];
// S08 (PADRAO-MERCADO) — modelos da galeria do passo 3 (achado do README:
// "os modelos JÁ EXISTEM como seeds/templates no código", só não estavam
// visíveis). A IA tem 3 seeds por complexidade (backend/src/assistente/
// assistente-seeds.ts, WORM-14: "2 perfis x 3 templates" — agil=1
// mensagem/1 condição, flexivel=+1/+2, avancado=+1/+2, contagens REAIS do
// arquivo de seeds, não inventadas aqui); o Roteiro tem 1 modelo fixo (7
// peças, ver BOT_MSG_FIELDS acima — já populadas pelo backend quando
// seedRoteiro() salva `{roteiro:{}}` vazio, sem variação).
//
// `template` viaja dentro do payload `ia` do PUT /automation/agent (ver
// finalizar() abaixo) SEM mudar contrato nenhum: AgentService.updateAgent
// repassa `dto.ia` inteiro pra AssistenteService.save(user, dto.ia as any)
// (backend/src/automation/agent.service.ts linha ~485), e esse save() JÁ
// aceita `template` — materializa getSeedFluxo(perfil, template) quando
// `fluxo.passos` vier vazio (assistente.service.ts linha ~132; o campo
// segue existindo desde antes da fusão S13, só nenhuma tela do /automacao
// novo mandava — capacidade que já existia, ficou invisível). Zero rota
// nova, zero DTO novo — só o FRONT passou a mandar o campo que faltava
// (Lei nº6, front-only).
type AssistenteTemplateKey = "agil" | "flexivel" | "avancado";
export type AtendenteModeloKey = "roteiro" | AssistenteTemplateKey;

type AtendenteModelo = TemplateCardOption & {
  key: AtendenteModeloKey;
  cerebro: AgentBrain;
  template?: AssistenteTemplateKey;
};

// Exportado: a faixa "Começar por um modelo" do hub (page.client.tsx, S08)
// reusa a MESMA lista — zero conteúdo novo, zero duplicação de metadado.
export const ATENDENTE_MODELOS: AtendenteModelo[] = [
  {
    key: "roteiro", cerebro: "roteiro", icon: "bot", title: "Roteiro pronto", tag: "Recomendado pra começar",
    fluxo: [
      { icon: "msg", label: "Boas-vindas" },
      { icon: "atend", label: "Menu" },
      { icon: "check", label: "Resposta" },
    ],
    metric: "7 mensagens prontas",
  },
  {
    key: "agil", cerebro: "ia", template: "agil", icon: "assistente", title: "IA Ágil",
    fluxo: [
      { icon: "msg", label: "Abertura" },
      { icon: "reply", label: "Condição" },
    ],
    metric: "1 mensagem · 1 condição",
  },
  {
    key: "flexivel", cerebro: "ia", template: "flexivel", icon: "assistente", title: "IA Flexível",
    fluxo: [
      { icon: "msg", label: "Abertura" },
      { icon: "msg", label: "Explica" },
      { icon: "reply", label: "Condição" },
    ],
    metric: "2 mensagens · 3 condições",
  },
  {
    key: "avancado", cerebro: "ia", template: "avancado", icon: "assistente", title: "IA Avançado",
    fluxo: [
      { icon: "msg", label: "Abertura" },
      { icon: "msg", label: "Explica" },
      { icon: "msg", label: "Fecha" },
      { icon: "reply", label: "Condição" },
    ],
    metric: "3 mensagens · 5 condições",
  },
];

type MsgFieldKey =
  | "welcomeMessage"
  | "returningCustomerMessage"
  | "mainMenuPrompt"
  | "postActionPrompt"
  | "humanAckMessage"
  | "closeTopicMessage"
  | "blockedMessage";
type BotaoGrupo = "welcomeButtons" | "mainMenuButtons";
type EditorKey = MsgFieldKey | "ajustes";
type Peca = { key: EditorKey; label: string; hint: string; icon: string; tone: string; buttonsKey?: BotaoGrupo; settings?: boolean };

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
const BOT_RULES: { key: keyof RoutingRules; label: string; hint: string }[] = [
  { key: "globalBotEnabled", label: "Roteiro ligado", hint: "Liga/desliga o roteiro em todas as conversas novas" },
  { key: "checkRecoveryBeforeReply", label: "Checar Recovery antes", hint: "Verifica pendências antes de responder" },
  { key: "autoRouteDebtorsToRecovery", label: "Devedor vai pro Recovery", hint: "Roteia inadimplente automaticamente" },
  { key: "autoReopenClosedConversation", label: "Reabrir conversa fechada", hint: "Nova mensagem reabre o atendimento" },
  { key: "notifyOnNewInbound", label: "Avisar nova mensagem", hint: "Notifica a equipe a cada inbound" },
];

const SANDBOX_SOURCE_LABEL: Record<string, string> = {
  ia: "respondido pela IA local",
  roteiro: "respondido pelo roteiro de botões",
  fallback: "roteiro de reserva — IA indisponível",
};

const EMPTY_ROTEIRO_FALLBACK: RoteiroConfig = {
  setup: { completed: false, botType: null },
  variableCatalog: [],
  actionCatalog: [],
  routingRules: {
    globalBotEnabled: false,
    checkRecoveryBeforeReply: false,
    autoRouteDebtorsToRecovery: false,
    autoReopenClosedConversation: false,
    notifyOnNewInbound: false,
  },
  welcomeMessage: "",
  welcomeButtons: [],
  returningCustomerMessage: "",
  returningCustomerButtons: [],
  mainMenuPrompt: "",
  mainMenuButtons: [],
  recoveryDetectedMessage: "",
  recoveryDetectedButtons: [],
  postActionPrompt: "",
  postActionButtons: [],
  humanAckMessage: "",
  closeTopicMessage: "",
  blockedMessage: "",
};

function emptyFluxo(): Fluxo {
  return { entradaPassoId: null, passos: [], condicoes: [] };
}
function nowTime(): string {
  const d = new Date();
  return d.getHours().toString().padStart(2, "0") + ":" + d.getMinutes().toString().padStart(2, "0");
}

// ================================================================
// RAIZ da seção — GET /automation/agent, decide wizard × editor.
// ================================================================
export function SecaoAtendente({ iaPublishEnabled, onChanged, initialTemplate }: {
  iaPublishEnabled: boolean;
  onChanged?: () => void;
  /** S08 (PADRAO-MERCADO): chave da galeria vinda do hub (?template=, ver page.client.tsx) — string livre de propósito (query param cru); chave desconhecida cai no 1º modelo dentro do Wizard. */
  initialTemplate?: string | null;
}) {
  const user = useCurrentUser();
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<AgentView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"wizard" | "editor">("editor");

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<AgentView>("/automation/agent");
      setView(res);
      setMode(res && res.ia === null && res.roteiro === null ? "wizard" : "editor");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar o Atendente.");
    }
  }, []);

  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch ao montar (guarda `alive` contra race/unmount)
    void load().then(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [load]);

  const empresaPadrao = user?.company?.name || "";

  function handleChanged(next: AgentView) {
    setView(next);
    setMode(next.ia === null && next.roteiro === null ? "wizard" : "editor");
    onChanged?.();
  }

  return (
    <div className="ia-wrap">
      {error && (
        <section className="panel">
          <div style={{ padding: 18, display: "grid", gap: 10, justifyItems: "start" }}>
            <strong>Não carregou</strong>
            <span className="hint">{error}</span>
            <button className="btn-ghost" onClick={() => { setLoading(true); void load().then(() => setLoading(false)); }}>Tentar novamente</button>
          </div>
        </section>
      )}

      {!error && loading && <div className="hint">Carregando…</div>}

      {!error && !loading && view && mode === "wizard" && (
        view.canManage ? (
          <Wizard
            empresaPadrao={empresaPadrao}
            onCancel={view.ia || view.roteiro ? () => setMode("editor") : undefined}
            onCreated={handleChanged}
            initialModelo={initialTemplate}
          />
        ) : (
          <div className="ia-split has-chat">
            <AguardandoConfigPanel />
            <AtendenteSandbox
              brain={view.brain}
              iaLive={null}
              roteiroLive={null}
              displayName={empresaPadrao || "Atendente"}
              disabledReason={null}
            />
          </div>
        )
      )}

      {!error && !loading && view && mode === "editor" && (
        <Editor
          view={view}
          canManage={view.canManage}
          iaPublishEnabled={iaPublishEnabled}
          empresaNome={empresaPadrao}
          onRefazer={() => setMode("wizard")}
          onChanged={handleChanged}
        />
      )}
    </div>
  );
}

function AguardandoConfigPanel() {
  // S03 (PADRAO-MERCADO): parágrafo de 2 frases virou 1 linha (Lei nº1).
  return (
    <div className="panel aut-secao-placeholder">
      <span className="aut-secao-placeholder__icon"><I d={ICONS.atend} size={26} /></span>
      <h4>Nenhum atendente configurado ainda</h4>
      <p>Configuração é do Admin — teste o padrão no sandbox.</p>
    </div>
  );
}

// ============================================================================
// WIZARD — 3 passos (identidade, negócio, cérebro)
// ============================================================================
function Wizard({ empresaPadrao, onCreated, onCancel, initialModelo }: {
  empresaPadrao: string;
  onCreated: (v: AgentView) => void;
  onCancel?: () => void;
  /** S08 (PADRAO-MERCADO): string livre (query param cru) — chave inválida/ausente cai no 1º modelo (Roteiro). */
  initialModelo?: string | null;
}) {
  const [step, setStep] = useState(1);
  const [nome, setNome] = useState("");
  const [tom, setTom] = useState<Tom>("normal");
  const [perfil, setPerfil] = useState<Perfil>("vendas");
  const [produtos, setProdutos] = useState("");
  const [empresaNome, setEmpresaNome] = useState(empresaPadrao);
  // S08 (PADRAO-MERCADO): cérebro + template nascem do MESMO clique num card
  // da galeria (passo 3, ATENDENTE_MODELOS) — `initialModelo` só escolhe QUAL
  // card começa marcado (deep-link do hub); o usuário segue livre pra trocar.
  const modeloDeAbertura = ATENDENTE_MODELOS.find((m) => m.key === initialModelo) ?? ATENDENTE_MODELOS[0];
  const [cerebro, setCerebro] = useState<AgentBrain>(modeloDeAbertura.cerebro);
  const [template, setTemplate] = useState<AssistenteTemplateKey>(modeloDeAbertura.template ?? "agil");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const stepPill = useGlassPill<HTMLSpanElement>(String(step));
  const tomPill = useGlassPill<HTMLButtonElement>(tom);
  const perfilPill = useGlassPill<HTMLButtonElement>(perfil);
  const modeloKey: AtendenteModeloKey = cerebro === "ia" ? template : "roteiro";
  const modeloPill = useGlassPill<HTMLButtonElement>(modeloKey);

  const fraseExemplo = useMemo(() => TONS.find((t) => t.key === tom)?.frase ?? "", [tom]);
  const canNext1 = nome.trim().length >= 2;

  // D2 (cabeçalho do arquivo): só grava o store do cérebro ESCOLHIDO — nome/tom
  // (passo 1) só tem campo no schema da IA; escolhendo Roteiro, ficam sem
  // destino e são descartados aqui (nunca chegam a virar payload).
  //
  // S08 (PADRAO-MERCADO): `template` viaja junto no payload `ia` — `fluxo`
  // continua vazio (emptyFluxo()) de propósito: é o QUE FAZ o backend
  // reconhecer "sem fluxo próprio ainda" e materializar o seed (ver comentário
  // de ATENDENTE_MODELOS acima). Escolher "Roteiro" não manda `template`
  // nenhum — o roteiro não tem variação, `seedRoteiro`-equivalente já roda no
  // `{roteiro:{}}` de sempre.
  async function finalizar() {
    setSaving(true);
    setErr(null);
    try {
      const body: Record<string, unknown> =
        cerebro === "ia"
          ? { ia: { nome, tom, perfil, produtos, empresaNome, fluxo: emptyFluxo(), template } }
          : { roteiro: {} };
      const res = await apiFetch<AgentView>("/automation/agent", { method: "PUT", body: JSON.stringify(body) });
      onCreated(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível criar o atendente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel ia-form-panel">
      <div className="ia-steps">
        <GlassPill {...stepPill} />
        {[1, 2, 3].map((n, i) => (
          <React.Fragment key={n}>
            {i > 0 && <span className="ia-step-sep" />}
            <span ref={step === n ? stepPill.itemRef(String(n)) : undefined}
              className={"ia-step-pill" + (step === n ? " is-active" : step > n ? " is-done" : "")}>
              <span className="ia-step-pill__num">{step > n ? "✓" : n}</span>
              {n === 1 ? "Identidade" : n === 2 ? "Negócio" : "Cérebro"}
            </span>
          </React.Fragment>
        ))}
      </div>

      {step === 1 && (
        <div className="ia-form">
          <div className="ia-field">
            <label className="field-label">Nome do atendente</label>
            <input className="field-dark" maxLength={60} placeholder="Ex.: Júlia, Leonardo, Bia…"
              value={nome} onChange={(e) => setNome(e.target.value)} />
            {/* S03 (PADRAO-MERCADO): hint no teto da Lei nº1 (era 72 chars). */}
            <span className="ia-field__hint">Se escolher IA, seus clientes conversam com esse nome.</span>
          </div>
          <div className="ia-field">
            <label className="field-label">Estilo de comunicação</label>
            <div className="ia-choice-row">
              <GlassPill {...tomPill} />
              {TONS.map((t) => (
                <button key={t.key} ref={tomPill.itemRef(t.key)} type="button" className={"ia-choice" + (tom === t.key ? " is-on" : "")} onClick={() => setTom(t.key)}>
                  <span className="ia-choice__title">{t.title}</span>
                  <span className="ia-choice__desc">{t.desc}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="ia-field">
            <label className="field-label">Como soa no WhatsApp</label>
            <div className="ia-style-preview">
              <div className="wa-msg wa-msg--in">
                <div className="wa-bubble">
                  <span className="wa-bubble__text">{fraseExemplo}</span>
                  <span className="wa-bubble__meta"><span className="wa-bubble__time">{nowTime()}</span></span>
                </div>
              </div>
            </div>
          </div>
          <div className="ia-actions">
            {onCancel && <button className="btn-ghost" onClick={onCancel}>Cancelar</button>}
            <button className="btn-teal ia-spacer" disabled={!canNext1} onClick={() => setStep(2)}>Continuar</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="ia-form">
          <div className="ia-field">
            <label className="field-label">Perfil do atendente</label>
            <div className="ia-choice-row">
              <GlassPill {...perfilPill} />
              {PERFIS.map((p) => (
                <button key={p.key} ref={perfilPill.itemRef(p.key)} type="button" className={"ia-choice" + (perfil === p.key ? " is-on" : "")} onClick={() => setPerfil(p.key)}>
                  <span className="ia-choice__title">{p.title}</span>
                  <span className="ia-choice__desc">{p.desc}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="ia-form__grid">
            <div className="ia-field">
              <label className="field-label">Nome da empresa</label>
              <input className="field-dark" maxLength={120} placeholder="Ex.: Colsani Ar-Condicionado"
                value={empresaNome} onChange={(e) => setEmpresaNome(e.target.value)} />
            </div>
          </div>
          <div className="ia-field">
            <label className="field-label">Produtos ou serviços</label>
            {/* S09 (PADRAO-MERCADO): placeholder estourava o teto de copy (79
                chars, Lei nº1 ≤70) — mesmo corte que o campo gêmeo do drawer
                de Ajustes (IaAjustesDrawer, abaixo) já usava. */}
            <textarea className="field-dark" rows={3} maxLength={600} placeholder="Ex.: instalação e manutenção de ar-condicionado…"
              value={produtos} onChange={(e) => setProdutos(e.target.value)} />
            {/* S03 (PADRAO-MERCADO): hint no teto da Lei nº1 (era 90 chars). */}
            <span className="ia-field__hint">Vale só pra IA — o roteiro usa as mensagens da próxima tela.</span>
          </div>
          <div className="ia-actions">
            <button className="btn-ghost" onClick={() => setStep(1)}>Voltar</button>
            <button className="btn-teal ia-spacer" onClick={() => setStep(3)}>Continuar</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="ia-form">
          <div className="ia-field">
            <label className="field-label">Como o Atendente vai responder</label>
            <span className="ia-field__hint">Dá pra trocar depois, a qualquer momento, sem perder a configuração.</span>
          </div>
          {/* S08 (PADRAO-MERCADO): galeria de modelos prontos (card central,
              kit/template-card.tsx) no lugar dos 2 cards de texto — cada card
              JÁ decide cérebro+template num clique só (ManyChat-style:
              escolher > editar, nunca do zero). */}
          <div className="aut-tpl-grid">
            <GlassPill {...modeloPill} />
            {ATENDENTE_MODELOS.map((m) => (
              <TemplateCard
                key={m.key}
                option={m}
                selected={modeloKey === m.key}
                innerRef={modeloPill.itemRef(m.key)}
                onSelect={() => { setCerebro(m.cerebro); if (m.template) setTemplate(m.template); }}
              />
            ))}
          </div>
          {err && <div className="auto-flag-note"><I d={ICONS.help} size={14} />{err}</div>}
          <div className="ia-actions">
            <button className="btn-ghost" onClick={() => setStep(2)}>Voltar</button>
            <button className="btn-teal ia-spacer" disabled={saving} onClick={finalizar}>
              {saving ? "Criando…" : "Criar atendente"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// EDITOR — toolbar (identidade+estado+switch de cérebro) + peça do cérebro
// selecionado + sandbox único.
// ============================================================================
function Editor({ view, canManage, iaPublishEnabled, empresaNome, onRefazer, onChanged }: {
  view: AgentView;
  canManage: boolean;
  iaPublishEnabled: boolean;
  empresaNome: string;
  onRefazer: () => void;
  onChanged: (v: AgentView) => void;
}) {
  // D1 (cabeçalho do arquivo): local, não sincroniza com `view.brain` depois do
  // 1º render — só o switch do usuário e a recriação do componente (troca de
  // `mode` no pai) mudam qual cérebro está em foco.
  const [selectedBrain, setSelectedBrain] = useState<AgentBrain>(view.brain);
  const brainSwitchPill = useGlassPill<HTMLButtonElement>(selectedBrain);

  const [iaFluxo, setIaFluxo] = useState<Fluxo>(view.ia?.fluxo ?? emptyFluxo());
  const [iaDirty, setIaDirty] = useState(false);
  const [cfgForm, setCfgForm] = useState<Partial<Record<MsgFieldKey, string>>>({});
  const [cfgRules, setCfgRules] = useState<Partial<RoutingRules>>({});
  const [cfgBotoes, setCfgBotoes] = useState<Partial<Record<BotaoGrupo, BotButton[]>>>({});
  const [activeStep, setActiveStep] = useState<string>("welcomeMessage");

  const [saving, setSaving] = useState(false);
  const [seedingIa, setSeedingIa] = useState(false);
  const [seedingRoteiro, setSeedingRoteiro] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [termsOpen, setTermsOpen] = useState(false);
  // S03 (PADRAO-MERCADO): painel "Ajustes" do cérebro IA (persona pós-wizard) — espelha o
  // `editorKey==="ajustes"` que o Roteiro já tem; estado próprio, PUT próprio (ver salvarAjustesIa).
  const [iaAjustesOpen, setIaAjustesOpen] = useState(false);
  const [savingAjustes, setSavingAjustes] = useState(false);

  // Resincroniza edições locais quando uma releitura fresca chega (salvar,
  // seed ou publicar) — mesmo padrão de assistente/page.client.tsx Editor.
  /* eslint-disable react-hooks/set-state-in-effect -- resincroniza o editor quando a prop `view` muda; efeito legítimo */
  useEffect(() => {
    setIaFluxo(view.ia?.fluxo ?? emptyFluxo());
    setIaDirty(false);
    setCfgForm({});
    setCfgRules({});
    setCfgBotoes({});
  }, [view]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function cfgValue(key: MsgFieldKey): string {
    const edited = cfgForm[key];
    if (typeof edited === "string") return edited;
    const real = view.roteiro ? (view.roteiro as Record<string, unknown>)[key] : "";
    return typeof real === "string" ? real : "";
  }
  function ruleValue(key: keyof RoutingRules): boolean {
    const edited = cfgRules[key];
    if (typeof edited === "boolean") return edited;
    return Boolean(view.roteiro?.routingRules?.[key]);
  }
  function botoesDe(grupo: BotaoGrupo): BotButton[] {
    return cfgBotoes[grupo] ?? ((view.roteiro ? (view.roteiro as Record<string, unknown>)[grupo] : []) as BotButton[] || []);
  }
  function onFieldChange(key: MsgFieldKey, value: string) { setCfgForm((prev) => ({ ...prev, [key]: value })); }
  function onRuleToggle(key: keyof RoutingRules) { setCfgRules((prev) => ({ ...prev, [key]: !ruleValue(key) })); }
  function onButtonsChange(grupo: BotaoGrupo, next: BotButton[]) { setCfgBotoes((prev) => ({ ...prev, [grupo]: next })); }

  const roteiroDirty = Object.keys(cfgForm).length > 0 || Object.keys(cfgRules).length > 0 || Object.keys(cfgBotoes).length > 0;

  const roteiroVivo = useMemo<RoteiroConfig>(() => {
    const base: RoteiroConfig = view.roteiro ? { ...view.roteiro } : EMPTY_ROTEIRO_FALLBACK;
    const merged: RoteiroConfig = { ...base };
    for (const f of BOT_MSG_FIELDS) {
      const edited = cfgForm[f.key];
      if (typeof edited === "string") (merged as Record<string, unknown>)[f.key] = edited;
    }
    merged.routingRules = { ...base.routingRules, ...cfgRules };
    for (const g of BOT_BTN_GROUPS) {
      const edited = cfgBotoes[g.key];
      if (edited) (merged as Record<string, unknown>)[g.key] = edited;
    }
    return merged;
  }, [view.roteiro, cfgForm, cfgRules, cfgBotoes]);

  function buildRoteiroBody(): Record<string, unknown> {
    const body: Record<string, unknown> = { ...roteiroVivo };
    // D5 (cabeçalho do arquivo): sem BotOnboarding nesta casca — Salvar assume o
    // papel de marcar o setup como concluído; conteúdo mínimo continua exigido
    // pela validação do backend (isAtendimentoBotSetupComplete).
    body.setup = { ...(view.roteiro?.setup || {}), completed: true, botType: "atendimento" };
    return body;
  }

  async function salvarIa() {
    setSaving(true);
    setNote(null);
    try {
      const res = await apiFetch<AgentView>("/automation/agent", {
        method: "PUT",
        body: JSON.stringify({
          ia: {
            nome: view.ia?.nome ?? "Assistente",
            tom: view.ia?.tom ?? "normal",
            perfil: view.ia?.perfil ?? "vendas",
            produtos: view.ia?.produtos ?? "",
            empresaNome: view.ia?.empresaNome ?? empresaNome,
            fluxo: iaFluxo,
          },
        }),
      });
      onChanged(res);
      setNote("Fluxo da IA salvo.");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  // S03 (PADRAO-MERCADO): Ajustes da IA (persona pós-wizard) — MESMO PUT que
  // salvarIa()/seedIa()/wizard.finalizar() já usam, {ia:{...}}, zero rota nova.
  // CUIDADO (S03.md): manda `fluxo: iaFluxo` (o vivo, com edições locais ainda
  // não salvas) — NUNCA `view.ia.fluxo` (o do servidor) — porque o backend
  // (AssistenteService.save) faz upsert de substituição inteira; mandar sem
  // `fluxo` ou com a versão velha ZERARIA mensagens/condições em edição.
  async function salvarAjustesIa(persona: { nome: string; tom: Tom; perfil: Perfil; produtos: string; empresaNome: string }) {
    setSavingAjustes(true);
    setNote(null);
    try {
      const res = await apiFetch<AgentView>("/automation/agent", {
        method: "PUT",
        body: JSON.stringify({ ia: { ...persona, fluxo: iaFluxo } }),
      });
      onChanged(res);
      setNote("Ajustes da IA salvos.");
      setIaAjustesOpen(false);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Não foi possível salvar os ajustes.");
    } finally {
      setSavingAjustes(false);
    }
  }

  async function salvarRoteiro() {
    setSaving(true);
    setNote(null);
    try {
      const res = await apiFetch<AgentView>("/automation/agent", {
        method: "PUT",
        body: JSON.stringify({ roteiro: buildRoteiroBody() }),
      });
      onChanged(res);
      setNote("Roteiro salvo.");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function seedIa() {
    setSeedingIa(true);
    setNote(null);
    try {
      const res = await apiFetch<AgentView>("/automation/agent", {
        method: "PUT",
        body: JSON.stringify({ ia: { nome: "Assistente", tom: "normal", perfil: "vendas", produtos: "", empresaNome, fluxo: emptyFluxo() } }),
      });
      onChanged(res);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Não foi possível começar a configurar a IA.");
    } finally {
      setSeedingIa(false);
    }
  }

  async function seedRoteiro() {
    setSeedingRoteiro(true);
    setNote(null);
    try {
      const res = await apiFetch<AgentView>("/automation/agent", { method: "PUT", body: JSON.stringify({ roteiro: {} }) });
      onChanged(res);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Não foi possível começar a configurar o Roteiro.");
    } finally {
      setSeedingRoteiro(false);
    }
  }

  // Publicado É por cérebro: o backend garante mútua exclusão no publish
  // (README linha 36 / S13.md item 5) — então quem NÃO é `view.brain` nunca
  // está publicado de verdade (ver D1).
  const publishedByBrain: Record<AgentBrain, boolean> = {
    ia: view.brain === "ia" ? view.published : false,
    roteiro: view.brain === "roteiro" ? view.published : false,
  };
  const currentPublished = publishedByBrain[selectedBrain];
  const currentDirty = selectedBrain === "ia" ? iaDirty : roteiroDirty;

  async function doPublish(on: boolean) {
    try {
      const res = await apiFetch<PublishResponse>("/automation/agent/publish", {
        method: "POST",
        body: JSON.stringify({ brain: selectedBrain, on }),
      });
      setNote(res?.message || (res?.ok ? (on ? "Atendente publicado no WhatsApp." : "Atendente pausado.") : "Não foi possível publicar."));
      const fresh = await apiFetch<AgentView>("/automation/agent");
      onChanged(fresh);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Não foi possível publicar.");
    }
  }

  function requestPublish() {
    if (currentDirty) { setNote("Salve antes de publicar."); return; }
    if (!isBotTermsAccepted("atendimento")) { setTermsOpen(true); return; }
    void doPublish(true);
  }

  function buildChecklist(): { label: string; done: boolean }[] {
    if (selectedBrain === "ia") {
      return [
        { label: "Nome definido", done: Boolean(view.ia?.nome && view.ia.nome.trim().length > 0) },
        { label: "Ao menos 1 mensagem no fluxo", done: iaFluxo.passos.length > 0 },
        { label: "WhatsApp conectado", done: Boolean(view.preflight?.chipConectado) },
      ];
    }
    return [
      ...BOT_MSG_FIELDS.map((f) => ({ label: f.label, done: cfgValue(f.key).trim().length > 0 })),
      { label: "WhatsApp conectado", done: Boolean(view.preflight?.chipConectado) },
    ];
  }

  const displayName = selectedBrain === "ia" ? (view.ia?.nome || "IA") : (empresaNome || "Atendente");
  // S09 (PADRAO-MERCADO) — auditoria de status (Lei nº3, "zero tolerância"):
  // esta toolbar desenhava o pill de estado por conta própria (`.ia-pub-pill`,
  // span cru com ícone+texto) em vez do <StatusChip> central — a MESMA
  // inconsistência que a S04 já tinha corrigido no toolbar da Cobrança
  // (secao-cobranca.tsx `status`, achado A6: nunca 2 fatos com o mesmo peso
  // visual). Alinhado ao mesmo padrão: StatusChip reflete só a verdade do
  // servidor (armado/publicado); "edição não salva" vira linha secundária
  // (`.aut-obj-card__secondary`, já usada por page.client.tsx/secao-cobranca)
  // e só aparece quando existe.
  const status: { tone: StatusTone; label: string } = !view.armed
    ? { tone: "atencao", label: "Aguardando suporte" }
    : currentPublished
      ? { tone: "ligado", label: "Ativo no WhatsApp" }
      : { tone: "rascunho", label: "Rascunho" };

  return (
    <>
      <div className="ia-toolbar">
        <span className="ia-toolbar__avatar">{(displayName || "A").trim().charAt(0).toUpperCase()}</span>
        <div className="ia-toolbar__id">
          <span className="ia-toolbar__name">{displayName}</span>
          <span className="ia-toolbar__meta">{selectedBrain === "ia" ? "Cérebro: Inteligência Artificial" : "Cérebro: Roteiro de botões"}</span>
        </div>
        <div className="ia-toolbar__status">
          <StatusChip tone={status.tone} label={status.label} />
          {currentDirty && <span className="aut-obj-card__secondary">Alterações não salvas</span>}
        </div>

        <div className="atd-brain-switch glass-pill-track">
          <GlassPill {...brainSwitchPill} />
          {(["roteiro", "ia"] as AgentBrain[]).map((b) => (
            <button
              key={b}
              ref={brainSwitchPill.itemRef(b)}
              type="button"
              className={"atd-brain-btn glass-pill-item" + (selectedBrain === b ? " active" : "")}
              onClick={() => setSelectedBrain(b)}
            >
              <I d={ICONS[b === "ia" ? "assistente" : "bot"]} size={13} />
              {b === "ia" ? "IA" : "Roteiro"}
            </button>
          ))}
        </div>

        {/* S03 (PADRAO-MERCADO): "Refazer"→"Recomeçar" e reordenado pro FIM — deixa
            de ser a 1ª ação da barra (não pode mais parecer "o jeito de editar",
            papel que agora é do botão Ajustes dentro do próprio cérebro IA). */}
        <div className="ia-toolbar__actions">
          {canManage && (
            <button
              className="btn-ghost btn-xs"
              disabled={saving || !currentDirty}
              onClick={() => void (selectedBrain === "ia" ? salvarIa() : salvarRoteiro())}
            >
              {saving ? "Salvando…" : "Salvar"}
            </button>
          )}
          {canManage && (
            currentPublished ? (
              <button className="btn-ghost btn-xs danger" disabled={saving} onClick={() => void doPublish(false)}>Pausar no WhatsApp</button>
            ) : (
              <button className="btn-teal btn-xs" disabled={saving || currentDirty || !view.armed} onClick={requestPublish}>Publicar</button>
            )
          )}
          {canManage && <button className="btn-ghost btn-xs" onClick={onRefazer} title="Recomeçar o wizard do zero">Recomeçar</button>}
        </div>
      </div>

      {!canManage && (
        <div className="auto-flag-note">
          <I d={ICONS.help} size={14} />
          Modo leitura — configuração é do Admin; teste à vontade no sandbox.
        </div>
      )}
      {selectedBrain === "ia" && !iaPublishEnabled && (
        <div className="auto-flag-note">
          <I d={ICONS.help} size={14} />
          IA desligada aqui — teste à vontade, nada sai no WhatsApp.
        </div>
      )}
      {view.preflight && !view.preflight.chipConectado && (
        <div className="auto-flag-note">
          <I d={ICONS.help} size={14} />
          WhatsApp não conectado — conecte o chip para publicar de verdade.
        </div>
      )}
      {note && <div className="auto-flag-note"><I d={ICONS.check} size={14} />{note}</div>}

      <div className="ia-split has-chat">
        {selectedBrain === "ia" ? (
          view.ia ? (
            <IaPane
              fluxo={iaFluxo}
              onChange={(f) => { setIaFluxo(f); setIaDirty(true); }}
              canManage={canManage}
              ajustesOpen={iaAjustesOpen}
              onOpenAjustes={() => setIaAjustesOpen(true)}
            />
          ) : (
            <EmptyBrainCta
              icon="assistente"
              title="Configurar a IA"
              desc="IA conduz a conversa — você ajusta o fluxo na hora."
              canManage={canManage}
              busy={seedingIa}
              onStart={() => void seedIa()}
            />
          )
        ) : (
          view.roteiro ? (
            <RoteiroPane
              config={roteiroVivo}
              canManage={canManage}
              activeStep={activeStep}
              setActiveStep={setActiveStep}
              cfgValue={cfgValue}
              ruleValue={ruleValue}
              botoesDe={botoesDe}
              onFieldChange={onFieldChange}
              onRuleToggle={onRuleToggle}
              onButtonsChange={onButtonsChange}
            />
          ) : (
            <EmptyBrainCta
              icon="bot"
              title="Configurar o Roteiro"
              desc="Mensagens padrão prontas — ajuste do seu jeito."
              canManage={canManage}
              busy={seedingRoteiro}
              onStart={() => void seedRoteiro()}
            />
          )
        )}

        <AtendenteSandbox
          brain={selectedBrain}
          iaLive={selectedBrain === "ia" && view.ia ? { ...view.ia, fluxo: iaFluxo } : null}
          roteiroLive={selectedBrain === "roteiro" ? roteiroVivo : null}
          displayName={displayName}
          disabledReason={selectedBrain === "ia" && !view.ia ? "Configure a IA (ou peça ao Admin) para liberar o teste deste cérebro." : null}
        />
      </div>

      <BotTermsModal
        open={termsOpen}
        botType="atendimento"
        checklist={buildChecklist()}
        onAccept={() => { setBotTermsAccepted("atendimento"); setTermsOpen(false); void doPublish(true); }}
        onClose={() => setTermsOpen(false)}
      />

      {/* S03 (PADRAO-MERCADO): Ajustes da IA — só existe com o cérebro IA em foco
          e já configurado (o botão que abre vive dentro do próprio IaPane). */}
      {selectedBrain === "ia" && view.ia && (
        <IaAjustesDrawer
          open={iaAjustesOpen}
          ia={view.ia}
          empresaPadrao={empresaNome}
          saving={savingAjustes}
          onSave={(persona) => void salvarAjustesIa(persona)}
          onClose={() => setIaAjustesOpen(false)}
        />
      )}
    </>
  );
}

function EmptyBrainCta({ icon, title, desc, canManage, busy, onStart }: {
  icon: keyof typeof ICONS;
  title: string;
  desc: string;
  canManage: boolean;
  busy?: boolean;
  onStart?: () => void;
}) {
  return (
    <div className="panel aut-secao-placeholder">
      <span className="aut-secao-placeholder__icon"><I d={ICONS[icon]} size={24} /></span>
      <h4>{title}</h4>
      <p>{desc}</p>
      {canManage ? (
        <button className="btn-teal" disabled={busy} onClick={onStart}>{busy ? "Preparando…" : "Começar a configurar"}</button>
      ) : (
        <span className="hint">A configuração é feita pelo Admin da empresa.</span>
      )}
    </div>
  );
}

// ============================================================================
// IA PANE — fluxo em trilho (mensagens + condições), mesmo padrão de
// /assistente/page.client.tsx, sem a identidade (isso é só no wizard).
// ============================================================================
function IaPane({ fluxo, onChange, canManage, ajustesOpen, onOpenAjustes }: {
  fluxo: Fluxo;
  onChange: (next: Fluxo) => void;
  canManage: boolean;
  ajustesOpen: boolean;
  onOpenAjustes: () => void;
}) {
  function updatePasso(id: string, texto: string) {
    onChange({ ...fluxo, passos: fluxo.passos.map((p) => (p.id === id ? { ...p, texto } : p)) });
  }
  function addPasso() {
    const id = `passo_${Date.now().toString(36)}`;
    onChange({ ...fluxo, passos: [...fluxo.passos, { id, tipo: "mensagem", texto: "" }] });
  }
  function removePasso(id: string) {
    onChange({ ...fluxo, passos: fluxo.passos.filter((p) => p.id !== id) });
  }
  function updateCond(id: string, patch: Partial<FluxoCondicao>) {
    onChange({ ...fluxo, condicoes: fluxo.condicoes.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  }
  function addCond() {
    const id = `cond_${Date.now().toString(36)}`;
    onChange({ ...fluxo, condicoes: [...fluxo.condicoes, { id, rotulo: "Nova condição", comportamento: "", exemplos: [] }] });
  }
  function removeCond(id: string) {
    onChange({ ...fluxo, condicoes: fluxo.condicoes.filter((c) => c.id !== id) });
  }
  function addExemplo(condId: string, frase: string) {
    const f = frase.trim();
    if (!f) return;
    const c = fluxo.condicoes.find((x) => x.id === condId);
    if (!c || c.exemplos.includes(f)) return;
    updateCond(condId, { exemplos: [...c.exemplos, f] });
  }
  function removeExemplo(condId: string, frase: string) {
    const c = fluxo.condicoes.find((x) => x.id === condId);
    if (!c) return;
    updateCond(condId, { exemplos: c.exemplos.filter((e) => e !== frase) });
  }

  return (
    // S03 (PADRAO-MERCADO): wrap posicionado (mesmo truque estrutural do
    // .bot-board-canvas do Roteiro) — o botão "Ajustes" fica fixo no canto
    // enquanto o trilho (.ia-flow) rola por dentro; espelha o
    // .bot-board-settings que o Roteiro já tem no canvas (mesma peça visual).
    <div className="ia-flow-wrap">
      <div className="ia-flow">
      <div className="ia-rail">
        <div className="ia-rail__sec">
          <span className="ia-rail__sec-tag"><I d={ICONS.msg} size={12} /> Mensagens</span>
          <span className="ia-rail__sec-sub">o que a IA fala, na ordem</span>
        </div>
        {fluxo.passos.map((p, i) => (
          <div key={p.id} className="ia-rail__item">
            <span className="ia-rail__dot">{i + 1}</span>
            <div className="ia-flow-node">
              <div className="ia-flow-node__head">
                <span className="ia-flow-node__tag">Mensagem {i + 1}</span>
                <span className="ia-flow-node__title">para o cliente</span>
                {canManage && (
                  <div className="ia-flow-node__actions">
                    <button className="btn-ghost btn-xs danger" onClick={() => removePasso(p.id)} aria-label="Remover mensagem"><I d={ICONS.trash} size={13} /></button>
                  </div>
                )}
              </div>
              <div className="ia-flow-node__body">
                <textarea className="field-dark" rows={2} maxLength={1500} placeholder="Escreva a mensagem. Use [[Seu nome]] e [[nome da empresa]]."
                  value={p.texto} disabled={!canManage} onChange={(e) => updatePasso(p.id, e.target.value)} />
              </div>
            </div>
          </div>
        ))}
        {canManage && (
          <div className="ia-rail__item is-add">
            <span className="ia-rail__dot is-add"><I d={ICONS.plus} size={12} /></span>
            <button className="ia-rail__add" onClick={addPasso}>Adicionar mensagem</button>
          </div>
        )}
      </div>

      <div className="ia-rail is-cond">
        <div className="ia-rail__sec">
          <span className="ia-rail__sec-tag is-cond"><I d={ICONS.filter} size={12} /> Condições</span>
          <span className="ia-rail__sec-sub">como interpretar a resposta do cliente</span>
        </div>
        {fluxo.condicoes.map((c) => (
          <div key={c.id} className="ia-rail__item">
            <span className="ia-rail__dot is-cond"><I d={ICONS.reply} size={12} /></span>
            <CondicaoEditor
              cond={c}
              passos={fluxo.passos}
              canManage={canManage}
              onChange={(patch) => updateCond(c.id, patch)}
              onRemove={() => removeCond(c.id)}
              onAddExemplo={(frase) => addExemplo(c.id, frase)}
              onRemoveExemplo={(frase) => removeExemplo(c.id, frase)}
            />
          </div>
        ))}
        {canManage && (
          <div className="ia-rail__item is-add">
            <span className="ia-rail__dot is-add is-cond"><I d={ICONS.plus} size={12} /></span>
            <button className="ia-rail__add" onClick={addCond}>Adicionar condição</button>
          </div>
        )}
      </div>
      </div>
      {canManage && (
        <button
          type="button"
          className={"bot-board-settings" + (ajustesOpen ? " on" : "")}
          onClick={onOpenAjustes}
          title="Ajustes da persona (nome, tom, perfil, produtos)"
        >
          <span className="bot-board-settings__icon"><I d={ICONS.config} size={14} /></span>
          <span className="bot-board-settings__txt">Ajustes</span>
        </button>
      )}
    </div>
  );
}

function CondicaoEditor({ cond, passos, canManage, onChange, onRemove, onAddExemplo, onRemoveExemplo }: {
  cond: FluxoCondicao;
  passos: FluxoPasso[];
  canManage: boolean;
  onChange: (patch: Partial<FluxoCondicao>) => void;
  onRemove: () => void;
  onAddExemplo: (frase: string) => void;
  onRemoveExemplo: (frase: string) => void;
}) {
  const [draft, setDraft] = useState("");
  return (
    <div className="ia-flow-node">
      <div className="ia-flow-node__head">
        <span className="ia-flow-node__tag is-cond">Condição</span>
        <input className="field-dark" maxLength={120} value={cond.rotulo} disabled={!canManage}
          onChange={(e) => onChange({ rotulo: e.target.value })} placeholder="Ex.: Cliente confirmou" />
        {canManage && (
          <div className="ia-flow-node__actions">
            <button className="btn-ghost btn-xs danger" onClick={onRemove} aria-label="Remover condição"><I d={ICONS.trash} size={13} /></button>
          </div>
        )}
      </div>
      <div className="ia-flow-node__body">
        <div className="ia-field">
          <label className="field-label">Comportamento esperado</label>
          <input className="field-dark" maxLength={400} value={cond.comportamento} disabled={!canManage}
            onChange={(e) => onChange({ comportamento: e.target.value })} placeholder="O que o cliente demonstra nessa resposta" />
        </div>
        <div className="ia-field">
          <label className="field-label">Frases que significam isso</label>
          <div className="ia-fewshots">
            {cond.exemplos.map((ex) => (
              <span key={ex} className="ia-fewshot">{ex}
                {canManage && <button onClick={() => onRemoveExemplo(ex)} aria-label="Remover exemplo"><I d={ICONS.x} size={11} /></button>}
              </span>
            ))}
          </div>
          {canManage && (
            <div className="ia-fewshot-add">
              <input className="field-dark" value={draft} maxLength={200} placeholder='Ex.: "quero sim", "pode falar"'
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { onAddExemplo(draft); setDraft(""); } }} />
              <button className="btn-ghost btn-xs" onClick={() => { onAddExemplo(draft); setDraft(""); }} aria-label="Adicionar exemplo"><I d={ICONS.plus} size={13} /></button>
            </div>
          )}
        </div>
        {passos.length > 1 && (
          <div className="ia-field">
            <label className="field-label">Próximo passo quando casar</label>
            <select className="field-dark" value={cond.proximoPassoId ?? ""} disabled={!canManage} onChange={(e) => onChange({ proximoPassoId: e.target.value || null })}>
              <option value="">— seguir a conversa —</option>
              {passos.map((p, i) => <option key={p.id} value={p.id}>Mensagem {i + 1}</option>)}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// AJUSTES DA IA — painel deslizante da persona pós-wizard (achado A2 do
// README: "mudar = Refazer do zero"). Espelha 100% a casca do editor de peça
// do Roteiro (.hbx-veil.to-right + .hbx-drawer + .bot-phase-editor,
// bot-builder.css) e reusa os MESMOS campos/classes do wizard (nome/tom
// pills/perfil pills/produtos/nome da empresa — .ia-field/.ia-choice-row/
// .ia-choice, assistente.css) — zero classe nova pro conteúdo (Lei nº2).
// Estado de abertura/fechamento espelha EXATAMENTE BotPhaseEditor (mesmo
// `closing` + finishClose/requestClose + onAnimationEnd + timeout de
// fallback) — gotcha documentado no cabeçalho de bot-phase-editor.tsx: sem
// isso o véu trava aberto ao fechar.
// ============================================================================
function IaAjustesDrawer({ open, ia, empresaPadrao, saving, onSave, onClose }: {
  open: boolean;
  ia: IaConfig;
  empresaPadrao: string;
  saving: boolean;
  onSave: (persona: { nome: string; tom: Tom; perfil: Perfil; produtos: string; empresaNome: string }) => void;
  onClose: () => void;
}) {
  // Seedado 1x na abertura (o componente desmonta ao fechar de vez — mesmo
  // padrão de BotPhaseEditor) — reabrir sempre parte dos valores atuais de `ia`.
  const [nome, setNome] = useState(ia.nome);
  const [tom, setTom] = useState<Tom>(ia.tom);
  const [perfil, setPerfil] = useState<Perfil>(ia.perfil);
  const [produtos, setProdutos] = useState(ia.produtos);
  const [empresaNome, setEmpresaNome] = useState(ia.empresaNome || empresaPadrao);

  const tomPill = useGlassPill<HTMLButtonElement>(tom);
  const perfilPill = useGlassPill<HTMLButtonElement>(perfil);
  const fraseExemplo = useMemo(() => TONS.find((t) => t.key === tom)?.frase ?? "", [tom]);
  const canSave = nome.trim().length >= 2;

  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [closing, setClosing] = useState(false);

  // Reset SEM effect ao reabrir (mesmo padrão de BotPhaseEditor).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open && closing) setClosing(false);
  }

  const finishClose = useCallback(() => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    setClosing(false);
    onClose();
  }, [onClose]);

  const requestClose = useCallback(() => {
    setClosing(true);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(finishClose, 360);
  }, [finishClose]);

  const handleAnimEnd = useCallback(() => {
    if (!closing) return;
    finishClose();
  }, [closing, finishClose]);

  useEffect(() => {
    return () => { if (closeTimer.current) clearTimeout(closeTimer.current); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); requestClose(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, requestClose]);

  useEffect(() => {
    if (open) {
      if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
      panelRef.current?.focus();
    }
  }, [open]);

  if (!open && !closing) return null;

  return (
    <div
      className={"hbx-veil to-right" + (closing ? " bot-phase-veil--closing" : "")}
      onClick={(e) => { if (e.target === e.currentTarget) requestClose(); }}
    >
      <div
        ref={panelRef}
        className={"hbx-drawer bot-phase-editor" + (closing ? " bot-phase-editor--closing" : "")}
        role="dialog"
        aria-modal="true"
        aria-label="Ajustes da IA"
        tabIndex={-1}
        onAnimationEnd={handleAnimEnd}
      >
        <header className="bot-phase-editor__head">
          <span className="bot-phase-editor__icon" style={{ ["--bot-phase-color" as string]: "var(--hbx-secondary)" }}>
            <I d={ICONS.config} size={16} />
          </span>
          <span className="bot-phase-editor__titles">
            <span className="bot-phase-editor__title">Ajustes da IA</span>
            <span className="bot-phase-editor__hint">Persona do cérebro — nome, tom, perfil</span>
          </span>
          <button type="button" className="bot-phase-editor__close" aria-label="Fechar" title="Fechar" onClick={requestClose}>✕</button>
        </header>

        <div className="bot-phase-editor__body">
          <div className="ia-field">
            <label className="field-label">Nome do atendente</label>
            <input className="field-dark" maxLength={60} placeholder="Ex.: Júlia, Leonardo, Bia…"
              value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>

          <div className="ia-field">
            <label className="field-label">Estilo de comunicação</label>
            <div className="ia-choice-row">
              <GlassPill {...tomPill} />
              {TONS.map((t) => (
                <button key={t.key} ref={tomPill.itemRef(t.key)} type="button" className={"ia-choice" + (tom === t.key ? " is-on" : "")} onClick={() => setTom(t.key)}>
                  <span className="ia-choice__title">{t.title}</span>
                  <span className="ia-choice__desc">{t.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="ia-style-preview">
            <div className="wa-msg wa-msg--in">
              <div className="wa-bubble">
                <span className="wa-bubble__text">{fraseExemplo}</span>
                <span className="wa-bubble__meta"><span className="wa-bubble__time">{nowTime()}</span></span>
              </div>
            </div>
          </div>

          <div className="ia-field">
            <label className="field-label">Perfil do atendente</label>
            <div className="ia-choice-row">
              <GlassPill {...perfilPill} />
              {PERFIS.map((p) => (
                <button key={p.key} ref={perfilPill.itemRef(p.key)} type="button" className={"ia-choice" + (perfil === p.key ? " is-on" : "")} onClick={() => setPerfil(p.key)}>
                  <span className="ia-choice__title">{p.title}</span>
                  <span className="ia-choice__desc">{p.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="ia-field">
            <label className="field-label">Nome da empresa</label>
            <input className="field-dark" maxLength={120} placeholder="Ex.: Colsani Ar-Condicionado"
              value={empresaNome} onChange={(e) => setEmpresaNome(e.target.value)} />
          </div>

          <div className="ia-field">
            <label className="field-label">Produtos ou serviços</label>
            <textarea className="field-dark" rows={3} maxLength={600} placeholder="Ex.: instalação e manutenção de ar-condicionado…"
              value={produtos} onChange={(e) => setProdutos(e.target.value)} />
          </div>
        </div>

        <footer className="bot-phase-editor__foot">
          <button
            type="button"
            className="btn-teal bot-phase-editor__done"
            disabled={!canSave || saving}
            onClick={() => onSave({ nome: nome.trim(), tom, perfil, produtos, empresaNome: empresaNome.trim() })}
          >
            <I d={ICONS.check} size={13} /> {saving ? "Salvando…" : "Salvar ajustes"}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ============================================================================
// ROTEIRO PANE — Tabuleiro (organograma + peças), SÓ o modo Tabuleiro (Trilha
// e Bandeja morreram — S13.md item 3, não portar). Leitura: sem `onPickNode`
// o próprio <BotFlowCanvas> vira read-only (cards não clicáveis).
// ============================================================================
function RoteiroPane({ config, canManage, activeStep, setActiveStep, cfgValue, ruleValue, botoesDe, onFieldChange, onRuleToggle, onButtonsChange }: {
  config: RoteiroConfig;
  canManage: boolean;
  activeStep: string;
  setActiveStep: (k: string) => void;
  cfgValue: (key: MsgFieldKey) => string;
  ruleValue: (key: keyof RoutingRules) => boolean;
  botoesDe: (grupo: BotaoGrupo) => BotButton[];
  onFieldChange: (key: MsgFieldKey, value: string) => void;
  onRuleToggle: (key: keyof RoutingRules) => void;
  onButtonsChange: (grupo: BotaoGrupo, next: BotButton[]) => void;
}) {
  const [editorKey, setEditorKey] = useState<EditorKey | null>(null);
  const [varsOpen, setVarsOpen] = useState(false);
  const [activeFieldKey, setActiveFieldKey] = useState<MsgFieldKey | null>(null);
  const activeFieldRef = useRef<HTMLTextAreaElement | null>(null);

  const pecas: Peca[] = useMemo(() => {
    const fases: Peca[] = BOT_MSG_FIELDS.map((f) => ({ key: f.key, label: f.label, hint: f.hint, icon: f.icon, tone: f.color, buttonsKey: f.buttonsKey }));
    fases.push({ key: "ajustes", label: "Ajustes", hint: "Regras gerais do roteiro", icon: "config", tone: "var(--hbx-secondary)", settings: true });
    return fases;
  }, []);

  function abrirPeca(key: EditorKey) {
    setEditorKey(key);
    if (key !== "ajustes") setActiveStep(String(key));
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
  // D4 (cabeçalho do arquivo): providerCapabilities não vem no contrato do
  // agente — modo numerado fixo (funciona em QR e Meta).
  const canUseOfficialButtons = false;

  return (
    <div className="bot-panel">
      <div className="bot-montagem">
        <div className="bot-modo-view bot-modo-view--tabuleiro">
          <div className="bot-board-canvas">
            <BotFlowCanvas config={config} activeStep={activeStep} onPickNode={canManage ? (k) => abrirPeca(k as EditorKey) : undefined} />
            {canManage && (
              <button
                type="button"
                className={"bot-board-settings" + (editorKey === "ajustes" ? " on" : "")}
                onClick={() => abrirPeca("ajustes")}
                title="Regras gerais do roteiro"
              >
                <span className="bot-board-settings__icon"><I d={ICONS.config} size={14} /></span>
                <span className="bot-board-settings__txt">Ajustes</span>
                <span className={"bot-board-settings__dot" + (ruleValue("globalBotEnabled") ? " on" : "")} aria-hidden="true" />
              </button>
            )}
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
          isSettings={Boolean(pecaAtual.settings)}
          value={pecaAtual.settings ? "" : cfgValue(pecaAtual.key as MsgFieldKey)}
          onChange={(next) => { if (!pecaAtual.settings) onFieldChange(pecaAtual.key as MsgFieldKey, next); }}
          onFocusField={(el) => { if (!pecaAtual.settings) { setActiveFieldKey(pecaAtual.key as MsgFieldKey); activeFieldRef.current = el; } }}
          onOpenVariables={(el) => { if (!pecaAtual.settings) abrirVariaveis(pecaAtual.key as MsgFieldKey, el); }}
          variableCatalog={config.variableCatalog ?? []}
          showButtons={Boolean(pecaAtual.buttonsKey)}
          buttons={pecaAtual.buttonsKey ? botoesDe(pecaAtual.buttonsKey) : []}
          actionCatalog={acoesDisponiveis as BotAction[]}
          canUseOfficialButtons={canUseOfficialButtons}
          buttonsLabel={pecaAtual.buttonsKey === "welcomeButtons" ? "Botões de boas-vindas" : "Botões do menu"}
          buttonsHint={pecaAtual.buttonsKey === "welcomeButtons" ? "aparecem na primeira mensagem" : "opções do menu"}
          onButtonsChange={(next) => { if (pecaAtual.buttonsKey) onButtonsChange(pecaAtual.buttonsKey, next); }}
          rules={BOT_RULES.map<PhaseRuleDef>((r) => ({ key: String(r.key), label: r.label, hint: r.hint }))}
          ruleValue={(k) => ruleValue(k as keyof RoutingRules)}
          onToggleRule={(k) => onRuleToggle(k as keyof RoutingRules)}
          onClose={() => setEditorKey(null)}
        />
      )}

      <BotVariablesDrawer open={varsOpen} variableCatalog={config.variableCatalog ?? []} onClose={() => setVarsOpen(false)} onInsert={inserirVariavel} />
    </div>
  );
}

// ============================================================================
// SANDBOX ÚNICO — dock direita, <WhatsAppPreview>, chama
// POST /automation/agent/sandbox com o cérebro EM FOCO (S13.md item 4). Morre
// o chat fake hardcoded do bot velho. Rótulo de fonte (ia/roteiro/fallback)
// mantido. Botões do roteiro viram quick-replies clicáveis (mesmo texto que
// o backend casa em replayRoteiroSandbox).
// ============================================================================
function AtendenteSandbox({ brain, iaLive, roteiroLive, displayName, disabledReason }: {
  brain: AgentBrain;
  iaLive: IaConfig | null;
  roteiroLive: RoteiroConfig | null;
  displayName: string;
  disabledReason: string | null;
}) {
  const [msgs, setMsgs] = useState<WAMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastTestNo, setLastTestNo] = useState<number | null>(null);
  const [lastSource, setLastSource] = useState<{ source: string; ms: number } | null>(null);
  const [quick, setQuick] = useState<string[]>([]);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  // Troca de cérebro = conversa nova (contexto muda de verdade no backend).
  useEffect(() => {
    setMsgs([]);
    setQuick([]);
    setLastSource(null);
  }, [brain]);

  const scrollDown = useCallback(() => {
    requestAnimationFrame(() => {
      const el = bodyRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  async function send(text0?: string) {
    const text = (text0 ?? input).trim();
    if (!text || busy || disabledReason) return;
    setInput("");
    const history = msgs.filter((m) => !m.system).map((m) => ({ role: m.dir === "out" ? "user" : "assistant", content: m.text }));
    setMsgs((prev) => [...prev, { dir: "out", text, time: nowTime(), status: "read" }]);
    setQuick([]);
    setBusy(true);
    scrollDown();
    try {
      const agent: Record<string, unknown> = { brain };
      if (brain === "ia" && iaLive) agent.ia = iaLive;
      if (brain === "roteiro" && roteiroLive) agent.roteiro = roteiroLive;
      const res = await apiFetch<SandboxResponse>("/automation/agent/sandbox", {
        method: "POST",
        body: JSON.stringify({ message: text, history, agent }),
      });
      setLastTestNo(res?.testNumber ?? null);
      setLastSource(res?.source ? { source: res.source, ms: res.latencyMs ?? 0 } : null);
      setMsgs((prev) => [...prev, { dir: "in", text: res?.reply || "…", time: nowTime() }]);
      setQuick((res?.buttons || []).map((b) => b.title).filter(Boolean));
    } catch (e) {
      setMsgs((prev) => [...prev, { dir: "in", system: true, tone: "red", text: e instanceof Error ? e.message : "Falhou." }]);
      setLastSource(null);
    } finally {
      setBusy(false);
      scrollDown();
    }
  }

  const srcLabel = lastSource
    ? (SANDBOX_SOURCE_LABEL[lastSource.source] || lastSource.source) + (lastSource.source === "ia" && lastSource.ms > 0 ? ` · ${(lastSource.ms / 1000).toFixed(1)}s` : "")
    : null;
  // S03 (PADRAO-MERCADO): fallback (timeout/erro da IA → roteiro de reserva,
  // achado A1/S03.md item 4) precisa ser INCONFUNDÍVEL com resposta real da
  // IA — StatusChip `atencao` + 1 linha, nunca o rodapé apagado de sempre.
  const isFallback = lastSource?.source === "fallback";

  // S01 (PADRAO-MERCADO): dock + <WhatsAppPreview> viviam duplicados aqui e
  // em CobrancaPreview (secao-cobranca.tsx) — componente único agora
  // (kit/phone-preview.tsx). Mesmas classes no mesmo DOM, zero mudança visual.
  return (
    <PhonePreview
      title="Testar o Atendente"
      badge={lastTestNo != null ? `Teste nº ${lastTestNo}` : brain === "ia" ? "IA" : "Roteiro"}
      messages={msgs}
      typing={busy}
      bodyRef={bodyRef}
      header={{ name: displayName, status: "online" }}
      emptyHint={disabledReason || `Mande um "oi" pra testar — nada sai pro WhatsApp de verdade.`}
      quickReplies={quick.length ? quick : undefined}
      onQuickReply={(q) => void send(q)}
      footer={
        <form className="wa-composer-row" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <input
            className="field-dark wa-composer-input"
            value={input}
            placeholder={disabledReason ? "Indisponível" : "Escreva como um cliente…"}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy || Boolean(disabledReason)}
            aria-label="Mensagem de teste"
          />
          <button type="submit" className="wa-send" disabled={busy || !input.trim() || Boolean(disabledReason)} aria-label="Enviar">
            <I d={ICONS.send} size={16} />
          </button>
        </form>
      }
      footerNote={
        isFallback ? (
          <><StatusChip tone="atencao" size="s" /> Isto é o roteiro de reserva, não a IA.</>
        ) : srcLabel ? (
          <><I d={ICONS.bolt} size={11} /> {srcLabel}</>
        ) : (
          disabledReason || "O teste roda local — nada é enviado no WhatsApp."
        )
      }
    />
  );
}
