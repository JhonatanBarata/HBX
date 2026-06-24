"use client";

// FutureBotBuilder — Construtor de Bot cinematográfico neon/sci-fi.
// Ativo SOMENTE quando a pele `future` está ligada (montagem gated em
// bot-prospeccao-panel.tsx). Porteamento fiel do scaffold
// `refatoração tutofig/components/bot-builder/` para as 5 Leis do DS:
// — ZERO hex em TSX (tudo em theme-future.css, classes fbb-*)
// — ZERO style inline visual (background/color/border); inline só de
//   layout/animação não-visual (left, animationDelay, animationDuration)
// — Recolor por modo via data-mode no container + seletores CSS

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

// ────────────────────────────────────────────────────────────────────
// TIPOS
// ────────────────────────────────────────────────────────────────────
type BotModeId = "atendimento" | "recovery" | "prospeccao";

type ChatMessage = {
  from: "bot" | "user" | "system";
  text: string;
};

type RailCard = {
  title: string;
  description: string;
};

type ModeConfig = {
  id: BotModeId;
  label: string;
  icon: string;
  description: string;
  rail: RailCard[];
  chats: ChatMessage[][];
};

// ────────────────────────────────────────────────────────────────────
// DADOS (espelho de data.ts do scaffold)
// ────────────────────────────────────────────────────────────────────
const TOTAL_STEPS = 5;

const BOT_MODES: Record<BotModeId, ModeConfig> = {
  atendimento: {
    id: "atendimento",
    label: "Atendimento",
    icon: "🎧",
    description: "Responde dúvidas, orienta clientes e transfere para humano.",
    rail: [
      { title: "Fácil", description: "O cliente entende o que precisa preencher em cada etapa." },
      { title: "Guiado", description: "O fluxo conduz até o bot ficar pronto, sem soltar a pessoa no sistema." },
      { title: "Sem distrações", description: "A tela escurece e trava o foco no construtor." },
    ],
    chats: [
      [
        { from: "bot", text: "Olá! 👋 Sou o HBX Atendimento. Como posso ajudar hoje?" },
        { from: "user", text: "Quais são os planos disponíveis?" },
        { from: "bot", text: "Temos 3 planos principais: Starter, Pro e Enterprise. Quer detalhes de algum?" },
        { from: "user", text: "Quero falar com um atendente." },
        { from: "system", text: "Transferindo para atendente. Você será atendido em breve." },
      ],
      [
        { from: "user", text: "Olá, quero saber sobre troca ou devolução." },
        { from: "bot", text: "Nossa política permite solicitação em até 7 dias, com produto sem uso e embalagem original." },
        { from: "bot", text: "Deseja o passo a passo ou prefere falar com um atendente?" },
        { from: "user", text: "Prefiro atendente." },
        { from: "system", text: "Claro. Vou conectar você com um humano agora." },
      ],
      [
        { from: "bot", text: "Tudo pronto. Seu atendimento está configurado." },
        { from: "user", text: "Meu pedido é 12345." },
        { from: "bot", text: "Pedido localizado. Ele está em separação e será enviado até amanhã." },
        { from: "user", text: "Obrigado!" },
        { from: "system", text: "Atendimento ativo com sucesso." },
      ],
    ],
  },
  recovery: {
    id: "recovery",
    label: "Recovery",
    icon: "💰",
    description: "Recupera vendas, negocia pendências e reduz inadimplência.",
    rail: [
      { title: "Cobrança responsável", description: "Configura frequência, linguagem e horários permitidos." },
      { title: "Acordo rápido", description: "Preview mostra proposta, Pix e negociação em tempo real." },
      { title: "Bloqueio seguro", description: "Sem aceite de responsabilidade, a automação não ativa." },
    ],
    chats: [
      [
        { from: "bot", text: "Olá, Ana! Identificamos uma pendência de R$ 1.250,00." },
        { from: "user", text: "Consigo negociar esse valor?" },
        { from: "bot", text: "Claro. Posso oferecer parcelamento em até 3x sem juros." },
        { from: "user", text: "Pode ser." },
        { from: "system", text: "Vou gerar o acordo e enviar as opções de pagamento." },
      ],
      [
        { from: "bot", text: "Se quitar até amanhã, você ganha 12% de desconto." },
        { from: "user", text: "Qual fica o valor?" },
        { from: "system", text: "Resumo: de R$ 350,00 por R$ 308,00 via Pix." },
        { from: "user", text: "Pode mandar o Pix." },
        { from: "bot", text: "Pix enviado. Aguardando confirmação." },
      ],
      [
        { from: "bot", text: "Acordo confirmado com sucesso." },
        { from: "user", text: "Pagamento realizado." },
        { from: "system", text: "Recovery pronto. Missão concluída com segurança." },
      ],
    ],
  },
  prospeccao: {
    id: "prospeccao",
    label: "Prospecção",
    icon: "🎯",
    description: "Qualifica contatos, aquece leads e passa para vendedor.",
    rail: [
      { title: "Lead consciente", description: "Abordagem com contexto, sem disparo cego." },
      { title: "Qualificação", description: "Só passa para vendedor quando o lead fica quente." },
      { title: "Responsabilidade", description: "Aceite obrigatório sobre chip, Meta e uso correto." },
    ],
    chats: [
      [
        { from: "bot", text: "Olá! Sou o assistente de prospecção da HBX." },
        { from: "user", text: "Olá." },
        { from: "bot", text: "Identifiquei que sua empresa é uma clínica em São Paulo." },
        { from: "bot", text: "Qual o principal desafio hoje para crescer sua clínica?" },
        { from: "user", text: "Atrair mais pacientes." },
      ],
      [
        { from: "bot", text: "Ajudamos empresas a automatizar atendimento e gerar mais resultados com IA." },
        { from: "user", text: "Quero saber mais." },
        { from: "bot", text: "Qual seu principal interesse?" },
        { from: "user", text: "Automatizar atendimento." },
        { from: "system", text: "Lead quente. Transferindo para Lucas · Consultor." },
      ],
      [
        { from: "bot", text: "Você foi qualificado como lead com potencial." },
        { from: "user", text: "Quero conversar com vendas." },
        { from: "system", text: "Prospecção pronta. Conversa transferida para o vendedor." },
      ],
    ],
  },
};

function getStepSubtitle(mode: BotModeId, step: number): string {
  if (step === 1) {
    if (mode === "atendimento") return "Pré-configuração do atendimento";
    if (mode === "recovery") return "Público e objetivo da cobrança";
    return "Alvo, filtros e origem dos leads";
  }
  if (step === 2) {
    if (mode === "atendimento") return "Regras, base de conhecimento e respostas";
    if (mode === "recovery") return "Negociação, regras e automações";
    return "Abordagem, qualificação e handoff";
  }
  if (step < 5) return "Integrações, revisão e teste do fluxo";
  return "Responsabilidade, aceite e ativação";
}

function getChatIndex(step: number) {
  if (step >= 5) return 2;
  if (step >= 2) return 1;
  return 0;
}

// ────────────────────────────────────────────────────────────────────
// PROPS PÚBLICAS
// ────────────────────────────────────────────────────────────────────
export interface FutureBotBuilderProps {
  open: boolean;
  onClose: () => void;
  onFinish?: () => void;
}

// ────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ────────────────────────────────────────────────────────────────────
export function FutureBotBuilder({ open, onClose, onFinish }: FutureBotBuilderProps) {
  const [mode, setMode] = useState<BotModeId>("atendimento");
  const [step, setStep] = useState(1);
  const [accepted, setAccepted] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const config = BOT_MODES[mode];
  const modeList = useMemo(() => Object.values(BOT_MODES), []);

  // Foco inicial no diálogo ao abrir
  useEffect(() => {
    if (open) {
      dialogRef.current?.focus();
    }
  }, [open]);

  // Fechar com Esc
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 1600);
  }

  function handleModeChange(nextMode: BotModeId) {
    setMode(nextMode);
    setStep(1);
    setAccepted(false);
    notify(`Modo ${BOT_MODES[nextMode].label} selecionado.`);
  }

  function handleNext() {
    if (step < TOTAL_STEPS) {
      setStep((s) => s + 1);
      setAccepted(false);
      notify("Configuração salva automaticamente.");
      return;
    }
    onFinish?.();
    notify(`${config.label} ativado com segurança.`);
    window.setTimeout(() => onClose(), 1700);
  }

  function handleBack() {
    setStep((s) => Math.max(1, s - 1));
    setAccepted(false);
  }

  // Clique no backdrop fecha
  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  const finishDisabled = step === TOTAL_STEPS && !accepted;

  if (!open) return null;
  // Só renderiza no cliente (document.body deve existir para o portal).
  // useState(() => ...) é avaliado no primeiro render — no servidor retorna false,
  // no cliente retorna true — sem efeito, sem set-state-in-effect.
  const isClient = typeof document !== "undefined";
  if (!isClient) return null;

  const content = (
    <div
      className="fbb-root"
      data-mode={mode}
      role="dialog"
      aria-modal="true"
      aria-label={`Construtor de Bot — ${config.label}`}
      ref={dialogRef}
      tabIndex={-1}
      onClick={handleBackdropClick}
    >
      {/* App fantasma desfocado */}
      <FakeApp />

      {/* Foco */}
      <div className="fbb-focus-layer" />

      {/* Partículas flutuantes */}
      <div className="fbb-particles" aria-hidden="true">
        {Array.from({ length: 48 }, (_, i) => (
          <span
            key={i}
            style={{
              left: `${(i * 37) % 100}%`,
              animationDelay: `${(i % 9) * 0.7}s`,
              animationDuration: `${6 + (i % 7)}s`,
            }}
          />
        ))}
      </div>

      {/* HUD logo topo-centro */}
      <div className="fbb-hud" aria-hidden="true">HBX</div>

      {/* Stage 3 colunas */}
      <main className="fbb-stage">
        {/* ── WIZARD (esquerda) ── */}
        <section className="fbb-wizard">
          <FbbStepBreadcrumb step={step} total={TOTAL_STEPS} />

          <div className="fbb-title-row">
            <div>
              <h1>
                {config.label} · <strong>{step === TOTAL_STEPS ? "Passo final" : `Passo ${step}`}</strong>
              </h1>
              <div className="fbb-kicker">{getStepSubtitle(mode, step)}</div>
            </div>
          </div>

          {/* Seleção de modo */}
          <div className="fbb-mode-grid">
            {modeList.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`fbb-mode-card${mode === m.id ? " fbb-mode-card--active" : ""}`}
                data-mode-card={m.id}
                onClick={() => handleModeChange(m.id)}
                aria-pressed={mode === m.id}
              >
                <div className="fbb-mode-icon">{m.icon}</div>
                <h3>{m.label}</h3>
                <p>{m.description}</p>
              </button>
            ))}
          </div>

          <div className="fbb-content">
            <FbbWizardStep mode={mode} step={step} onAcceptedChange={setAccepted} />
          </div>

          <div className="fbb-actions">
            <button
              type="button"
              className="fbb-btn-secondary"
              onClick={step === 1 ? onClose : handleBack}
            >
              {step === 1 ? "← Fechar" : "← Voltar"}
            </button>

            <button
              type="button"
              className="fbb-btn-primary"
              disabled={finishDisabled}
              onClick={handleNext}
            >
              {step === TOTAL_STEPS
                ? `Concluir e ativar ${config.label}`
                : step === 4
                  ? "Continuar para responsabilidade →"
                  : "Salvar e continuar →"}
            </button>
          </div>

          {/* Nó hexagonal de missão no rodapé do wizard */}
          <FbbMissionHex step={step} total={TOTAL_STEPS} />
        </section>

        {/* ── PREVIEW WHATSAPP (centro) ── */}
        <FbbWhatsappPreview config={config} step={step} />

        {/* ── RAIL LATERAL (direita) ── */}
        <aside className="fbb-right-rail">
          {config.rail.map((item) => (
            <div key={item.title} className="fbb-rail-card">
              <div className="fbb-rail-title">{item.title}</div>
              <p>{item.description}</p>
            </div>
          ))}
        </aside>
      </main>

      {toast && <div className="fbb-toast">{toast}</div>}
    </div>
  );

  return createPortal(content, document.body);
}

// ────────────────────────────────────────────────────────────────────
// SUB: APP FANTASMA
// ────────────────────────────────────────────────────────────────────
function FakeApp() {
  const navItems = [
    "Dashboard", "Contatos", "Campanhas", "Automações",
    "Construtor de Bot", "Fluxos", "Integrações", "Configurações",
  ];
  return (
    <div className="fbb-fake-app" aria-hidden="true">
      <aside className="fbb-fake-side">
        <div className="fbb-fake-logo">HBX</div>
        {navItems.map((item) => (
          <div
            key={item}
            className={`fbb-fake-nav-item${item === "Construtor de Bot" ? " fbb-fake-nav-item--active" : ""}`}
          >
            <span className="fbb-fake-dot" />
            {item}
          </div>
        ))}
      </aside>
      <main className="fbb-fake-main">
        <div className="fbb-fake-grid">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="fbb-fake-card" />
          ))}
        </div>
      </main>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// SUB: BREADCRUMB DE PASSOS NUMERADOS (topo do wizard)
// ────────────────────────────────────────────────────────────────────
function FbbStepBreadcrumb({ step, total }: { step: number; total: number }) {
  return (
    <div className="fbb-breadcrumb" aria-label={`Passo ${step} de ${total}`}>
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        let cls = "fbb-bc-step";
        if (n < step) cls += " fbb-bc-step--done";
        else if (n === step) cls += " fbb-bc-step--active";
        return (
          <div key={n} className="fbb-bc-item">
            <div className={cls}>{n < step ? "✓" : n}</div>
            {n < total && <div className="fbb-bc-line" />}
          </div>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// SUB: NÓ HEXAGONAL DE MISSÃO (rodapé do wizard)
// ────────────────────────────────────────────────────────────────────
function FbbMissionHex({ step, total }: { step: number; total: number }) {
  const pct = Math.round((step / total) * 100);
  return (
    <div className="fbb-mission-hex-row" aria-label={`Missão ${step} de ${total} — ${pct}%`}>
      <div className="fbb-mission-hex">
        <div className="fbb-mission-hex-inner">
          <span className="fbb-mission-hex-pct">{pct}%</span>
        </div>
      </div>
      <div className="fbb-mission-hex-label">
        <span className="fbb-mission-hex-title">Missão {step} de {total}</span>
        <div className="fbb-mission-hex-bar">
          <div className="fbb-mission-hex-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// SUB: WIZARD STEP (conteúdo variável por passo)
// ────────────────────────────────────────────────────────────────────
function FbbWizardStep({
  mode,
  step,
  onAcceptedChange,
}: {
  mode: BotModeId;
  step: number;
  onAcceptedChange: (v: boolean) => void;
}) {
  const config = BOT_MODES[mode];

  if (step === 5) {
    return <FbbResponsibilityGate config={config} onAcceptedChange={onAcceptedChange} />;
  }

  if (step === 1) {
    if (mode === "atendimento") return <AtendimentoStepOne />;
    if (mode === "recovery") return <RecoveryStepOne />;
    return <ProspeccaoStepOne />;
  }

  if (step === 2) {
    if (mode === "atendimento") return <AtendimentoStepTwo />;
    if (mode === "recovery") return <RecoveryStepTwo />;
    return <ProspeccaoStepTwo />;
  }

  return <MiddleStep step={step} />;
}

// ────────────────────────────────────────────────────────────────────
// SUB: GATE DE RESPONSABILIDADE (passo 5)
// ────────────────────────────────────────────────────────────────────
function FbbResponsibilityGate({
  config,
  onAcceptedChange,
}: {
  config: ModeConfig;
  onAcceptedChange: (v: boolean) => void;
}) {
  const [hasScrolled, setHasScrolled] = useState(false);
  const [acceptChip, setAcceptChip] = useState(false);
  const [acceptMeta, setAcceptMeta] = useState(false);

  const accepted = hasScrolled && acceptChip && acceptMeta;

  useEffect(() => {
    onAcceptedChange(accepted);
  }, [accepted, onAcceptedChange]);

  return (
    <div className="fbb-grid-two">
      <div className="fbb-card">
        <h3>Termo de responsabilidade do chip e uso da Meta</h3>

        <div
          className="fbb-terms"
          onScroll={(e) => {
            const t = e.currentTarget;
            if (t.scrollTop + t.clientHeight >= t.scrollHeight - 8) setHasScrolled(true);
          }}
        >
          <p>
            Ao ativar o bot <b>{config.label}</b> no HBX, você declara que usa o número conectado com
            autorização do titular e assume responsabilidade pelas mensagens enviadas.
          </p>
          <p>
            Você confirma que não usará o sistema para spam, conteúdo abusivo, promessa enganosa,
            assédio, disparo sem contexto ou contato sem base legítima.
          </p>
          <p>
            Você entende que WhatsApp e Meta podem restringir, suspender ou banir números que violem
            políticas comerciais, limites de plataforma ou regras de uso.
          </p>
          <p>
            A HBX fornece a ferramenta. A estratégia, a lista de contatos, o conteúdo enviado, o
            consentimento e o uso correto do chip são de responsabilidade da empresa usuária.
          </p>
          <p>
            Use linguagem clara, identifique sua empresa, respeite horários, respeite solicitações de
            parada e mantenha registros internos quando necessário.
          </p>
          <p>
            Role até o final para liberar o aceite. Sem leitura e aceite, a automação permanece bloqueada.
          </p>
        </div>

        <label className="fbb-accept-row">
          <input
            type="checkbox"
            checked={acceptChip}
            disabled={!hasScrolled}
            onChange={(e) => setAcceptChip(e.target.checked)}
          />
          <span>Li e assumo a responsabilidade pelo uso do número conectado.</span>
        </label>

        <label className="fbb-accept-row">
          <input
            type="checkbox"
            checked={acceptMeta}
            disabled={!hasScrolled}
            onChange={(e) => setAcceptMeta(e.target.checked)}
          />
          <span>Aceito as regras de uso responsável e Meta/WhatsApp.</span>
        </label>

        <div className="fbb-lock-notice">
          🔒 Sem aceite, o bot não pode ser ativado.
        </div>
      </div>

      <div className="fbb-card">
        <h3>Checklist final</h3>
        <div className="fbb-checklist">
          <div className="fbb-check"><i>✓</i><div><b>Fluxo configurado</b><small>Etapas preenchidas.</small></div></div>
          <div className="fbb-check"><i>✓</i><div><b>Preview validado</b><small>Conversa testada.</small></div></div>
          <div className="fbb-check">
            <i>✓</i>
            <div>
              <b>{accepted ? "Responsabilidade aceita" : "Aceite pendente"}</b>
              <small>{accepted ? "Pronto para ativar." : "Role e marque os aceites."}</small>
            </div>
          </div>
        </div>
        <div className="fbb-metric-single">
          <b>{accepted ? "5/5" : "4/5"}</b>
          <span>{accepted ? "missão pronta para ativação" : "aguardando aceite obrigatório"}</span>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// SUB: PREVIEW WHATSAPP
// ────────────────────────────────────────────────────────────────────
function FbbWhatsappPreview({ config, step }: { config: ModeConfig; step: number }) {
  const messages = config.chats[getChatIndex(step)];

  return (
    <section className="fbb-phone-wrap" aria-label="Preview em tempo real do WhatsApp">
      <div className="fbb-preview-label">{"/// Preview em tempo real ///"}</div>
      <div className="fbb-phone">
        <div className="fbb-phone-screen">
          <header className="fbb-phone-top">
            <div className="fbb-avatar">HBX</div>
            <div className="fbb-chat-title">
              <b>HBX {config.label} ✓</b>
              <small>online</small>
            </div>
          </header>
          <div className="fbb-chat">
            {messages.map((msg, i) => {
              let cls = "fbb-bubble";
              if (msg.from === "user") cls += " fbb-bubble--user";
              else if (msg.from === "system") cls += " fbb-bubble--bot fbb-bubble--system";
              else cls += " fbb-bubble--bot";
              return (
                <div key={`${msg.from}-${i}`} className={cls}>
                  {msg.text}
                </div>
              );
            })}
          </div>
          <footer className="fbb-phone-input">
            <div className="fbb-input-pill">Digite uma mensagem</div>
            <div className="fbb-mic">🎙</div>
          </footer>
        </div>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────
// HELPERS: Field, ReadyCard, MetricsCard, Flow, Node
// ────────────────────────────────────────────────────────────────────
function Field({ label, help, children }: { label: string; help: string; children: React.ReactNode }) {
  return (
    <div className="fbb-field">
      <div>
        <div className="fbb-label">{label}</div>
        <div className="fbb-help">{help}</div>
      </div>
      {children}
    </div>
  );
}

function ReadyCard({ items }: { items: string[] }) {
  return (
    <div className="fbb-card">
      <h3>Pronto para iniciar</h3>
      <div className="fbb-checklist">
        {items.map((item) => (
          <div key={item} className="fbb-check">
            <i>✓</i>
            <div><b>{item}</b><small>Concluído.</small></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricsCard({ title, metrics }: { title: string; metrics: [string, string][] }) {
  return (
    <div className="fbb-card">
      <h3>{title}</h3>
      <div className="fbb-metric-row">
        {metrics.map(([value, label]) => (
          <div key={`${value}-${label}`} className="fbb-metric">
            <b>{value}</b>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Flow({ a, b, c, d }: { a: string; b: string; c: string; d: string }) {
  return (
    <div className="fbb-flow">
      <h3>Como a etapa funciona</h3>
      <div className="fbb-flow-line">
        <FbbNode title={a} />
        <div className="fbb-arrow">→</div>
        <FbbNode title={b} />
        <div className="fbb-arrow">→</div>
        <FbbNode title={c} />
        <div className="fbb-arrow">→</div>
        <FbbNode title={d} />
      </div>
    </div>
  );
}

function FbbNode({ title }: { title: string }) {
  return (
    <div className="fbb-node">
      <b>{title}</b>
      <div className="fbb-help">Resultado seguro</div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// PASSOS POR MODO
// ────────────────────────────────────────────────────────────────────
function AtendimentoStepOne() {
  return (
    <div className="fbb-grid-two">
      <div className="fbb-card">
        <Field label="Nome do bot" help="Nome que aparece na configuração interna.">
          <input value="HBX Atendimento" readOnly />
        </Field>
        <Field label="Tom de voz" help="Como o bot deve responder.">
          <div className="fbb-choice-row">
            <span className="fbb-choice">Profissional</span>
            <span className="fbb-choice fbb-choice--active">Amigável</span>
            <span className="fbb-choice">Objetivo</span>
          </div>
        </Field>
        <Field label="Horário" help="Período ativo.">
          <div className="fbb-choice-row">
            <span className="fbb-choice fbb-choice--active">08:00 — 18:00</span>
          </div>
        </Field>
        <Field label="Transferir humano" help="Quando o bot não resolver.">
          <div className="fbb-toggle fbb-toggle--on" />
        </Field>
        <Field label="Tempo máximo" help="Prazo antes de alertar.">
          <select defaultValue="2 minutos">
            <option>2 minutos</option>
            <option>5 minutos</option>
            <option>10 minutos</option>
          </select>
        </Field>
      </div>
      <ReadyCard items={["Número conectado", "Horário definido", "Humano vinculado"]} />
    </div>
  );
}

function RecoveryStepOne() {
  return (
    <div className="fbb-grid-two">
      <div className="fbb-card">
        <Field label="Origem" help="De onde vêm as pendências.">
          <div className="fbb-choice-row">
            <span className="fbb-choice fbb-choice--active">ERP</span>
            <span className="fbb-choice">Planilha</span>
            <span className="fbb-choice">Manual</span>
          </div>
        </Field>
        <Field label="Faixa de atraso" help="Quem entra na missão.">
          <div className="fbb-choice-row">
            <span className="fbb-choice">7 dias</span>
            <span className="fbb-choice">15 dias</span>
            <span className="fbb-choice fbb-choice--active">30 dias</span>
            <span className="fbb-choice">60+</span>
          </div>
        </Field>
        <Field label="Objetivo" help="Tom comercial da recuperação.">
          <div className="fbb-choice-row">
            <span className="fbb-choice">Cobrar</span>
            <span className="fbb-choice fbb-choice--active">Negociar</span>
            <span className="fbb-choice">Lembrar</span>
          </div>
        </Field>
        <Field label="Parcelamento" help="Permitir acordo em parcelas.">
          <div className="fbb-toggle fbb-toggle--on" />
        </Field>
      </div>
      <MetricsCard
        title="Clientes em risco"
        metrics={[["238", "importados"], ["64", "elegíveis"], ["27%", "chance inicial"]]}
      />
    </div>
  );
}

function ProspeccaoStepOne() {
  return (
    <div className="fbb-grid-two">
      <div className="fbb-card">
        <Field label="Origem dos leads" help="Escolha o canal principal.">
          <div className="fbb-choice-row">
            <span className="fbb-choice">Meta Ads</span>
            <span className="fbb-choice">Importação</span>
            <span className="fbb-choice fbb-choice--active">Radar HBX</span>
          </div>
        </Field>
        <Field label="Segmento" help="Quem será abordado.">
          <select defaultValue="Clínica · estética · saúde">
            <option>Clínica · estética · saúde</option>
            <option>Autopeças</option>
            <option>Contabilidade</option>
          </select>
        </Field>
        <Field label="Cidade e raio" help="Filtro geográfico.">
          <div className="fbb-choice-row">
            <span className="fbb-choice fbb-choice--active">São Paulo · 25 km</span>
          </div>
        </Field>
        <Field label="Qualidade mínima" help="Critério de entrega.">
          <div className="fbb-choice-row">
            <span className="fbb-choice fbb-choice--active">Telefone</span>
            <span className="fbb-choice fbb-choice--active">Site</span>
            <span className="fbb-choice fbb-choice--active">E-mail</span>
          </div>
        </Field>
      </div>
      <MetricsCard
        title="Filtro atual"
        metrics={[["880", "leads/mês"], ["320", "com site"], ["145", "com e-mail"]]}
      />
    </div>
  );
}

function AtendimentoStepTwo() {
  return (
    <>
      <div className="fbb-grid-two">
        <div className="fbb-card">
          <h3>Base de respostas</h3>
          <Field label="Perguntas frequentes" help="Dúvidas que o bot já resolve.">
            <div className="fbb-choice-row">
              <span className="fbb-choice fbb-choice--active">Troca</span>
              <span className="fbb-choice fbb-choice--active">Prazos</span>
              <span className="fbb-choice fbb-choice--active">Pedido</span>
            </div>
          </Field>
          <Field label="Base de conhecimento" help="Fontes confiáveis.">
            <div className="fbb-choice-row">
              <span className="fbb-choice fbb-choice--active">Produtos</span>
              <span className="fbb-choice fbb-choice--active">Políticas</span>
              <span className="fbb-choice">Manual interno</span>
            </div>
          </Field>
          <Field label="Transferir quando" help="Evita resposta ruim.">
            <div className="fbb-choice-row">
              <span className="fbb-choice fbb-choice--active">Cliente irritado</span>
              <span className="fbb-choice fbb-choice--active">Pedido complexo</span>
              <span className="fbb-choice fbb-choice--active">Sem resposta</span>
            </div>
          </Field>
        </div>
        <MetricsCard title="Confiança da resposta" metrics={[["94%", "com base nas regras"]]} />
      </div>
      <Flow a="Pergunta" b="Intenção" c="Resposta" d="Transferência" />
    </>
  );
}

function RecoveryStepTwo() {
  return (
    <>
      <div className="fbb-grid-two">
        <div className="fbb-card">
          <Field label="Desconto" help="Limite permitido.">
            <select defaultValue="12%">
              <option>12%</option>
              <option>20%</option>
              <option>30%</option>
            </select>
          </Field>
          <Field label="Entrada mínima" help="Segurança do acordo.">
            <input value="R$ 50,00" readOnly />
          </Field>
          <Field label="Pagamento" help="Canais liberados.">
            <div className="fbb-choice-row">
              <span className="fbb-choice fbb-choice--active">Pix</span>
              <span className="fbb-choice fbb-choice--active">Boleto</span>
              <span className="fbb-choice fbb-choice--active">Link</span>
            </div>
          </Field>
          <Field label="Janela" help="Evita excesso.">
            <div className="fbb-choice-row">
              <span className="fbb-choice fbb-choice--active">08:00 — 20:00</span>
              <span className="fbb-choice fbb-choice--active">Seg–Sex</span>
            </div>
          </Field>
        </div>
        <MetricsCard title="Negociação em tempo real" metrics={[["78%", "chance de acordo"]]} />
      </div>
      <Flow a="Dia 1 lembrete" b="Dia 3 proposta" c="Dia 7 urgência" d="Humano financeiro" />
    </>
  );
}

function ProspeccaoStepTwo() {
  return (
    <>
      <div className="fbb-grid-two">
        <div className="fbb-card">
          <Field label="Mensagem inicial" help="Primeiro contato.">
            <textarea defaultValue="Olá! Sou o assistente da HBX. Posso te fazer uma pergunta rápida?" />
          </Field>
          <Field label="Perguntas" help="Qualificação.">
            <div className="fbb-choice-row">
              <span className="fbb-choice fbb-choice--active">Interesse</span>
              <span className="fbb-choice fbb-choice--active">Ticket</span>
              <span className="fbb-choice fbb-choice--active">Urgência</span>
            </div>
          </Field>
          <Field label="Lead quente" help="Critério de passagem.">
            <div className="fbb-choice-row">
              <span className="fbb-choice fbb-choice--active">Respondeu</span>
              <span className="fbb-choice fbb-choice--active">Quer orçamento</span>
              <span className="fbb-choice fbb-choice--active">Score 70+</span>
            </div>
          </Field>
        </div>
        <MetricsCard
          title="Desempenho da etapa"
          metrics={[["68%", "resposta"], ["91", "score"], ["73%", "pronto"]]}
        />
      </div>
      <Flow a="Primeira mensagem" b="Resposta" c="Qualificação" d="Transferência" />
    </>
  );
}

function MiddleStep({ step }: { step: number }) {
  return (
    <>
      <div className="fbb-grid-two">
        <div className="fbb-card">
          <h3>{step === 3 ? "Integrações e limites" : "Teste final do fluxo"}</h3>
          <Field label="Número conectado" help="Chip responsável pela operação.">
            <div className="fbb-inline-check">✓ Validado</div>
          </Field>
          <Field label="Limite seguro" help="Evita abuso e reduz risco operacional.">
            <select defaultValue="Cadência conservadora">
              <option>Cadência conservadora</option>
              <option>Cadência moderada</option>
            </select>
          </Field>
          <Field label="Teste automático" help="Simula conversa antes de ativar.">
            <div className="fbb-toggle fbb-toggle--on" />
          </Field>
        </div>
        <ReadyCard items={["Configuração salva", "Preview aprovado", "Próxima etapa"]} />
      </div>
      <Flow a="Conectar" b="Validar" c="Simular" d="Preparar aceite" />
    </>
  );
}
