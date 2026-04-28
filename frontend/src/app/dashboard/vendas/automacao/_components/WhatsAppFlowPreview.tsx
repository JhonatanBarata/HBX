import type { ProviderCapabilities } from "@/lib/provider-capabilities";
import type { AtendimentoBotConfig } from "../../../inbox/inbox-model";
import type { ConversationPreviewPeriod, ConversationScene } from "./ConversationBuilder";
import { resolveGreetingPreview } from "./GreetingVariablePopover";
import styles from "./ConversationBuilder.module.css";

type Props = {
  scene: ConversationScene;
  config: AtendimentoBotConfig;
  providerCapabilities: ProviderCapabilities;
  recoveryEnabled: boolean;
  period: ConversationPreviewPeriod;
  previewRun: number;
  onPeriodChange: (period: ConversationPreviewPeriod) => void;
};

const SAMPLE_VALUES: Record<string, string> = {
  cliente: "Rafaela",
  empresa: "HBX Prime",
  funcionario: "Time HBX",
  valor_formatado: "R$ 480,00",
  agenda_nome: "Instalacao",
  agenda_slots: "Qui 14:00 | Sex 09:30",
};

function renderMessage(config: AtendimentoBotConfig, message: string, period: ConversationPreviewPeriod) {
  return String(message || "")
    .replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, token) => {
      if (token === "cumprimentacao") return resolveGreetingPreview(config, period);
      return SAMPLE_VALUES[token] || `[${token}]`;
    })
    .trim();
}

function isRecoveryAction(actionId: string) {
  const normalized = String(actionId || "").trim().toLowerCase();
  return normalized === "enter_recovery" || normalized.includes("recovery") || normalized.includes("payment") || normalized.includes("debt");
}

export default function WhatsAppFlowPreview({
  scene,
  config,
  providerCapabilities,
  recoveryEnabled,
  period,
  previewRun,
  onPeriodChange,
}: Props) {
  const isMeta = providerCapabilities.canUseOfficialButtons;
  const lockedRecovery = scene.id === "recovery" && !recoveryEnabled;
  const buttons = lockedRecovery ? [] : scene.buttons.filter((button) => recoveryEnabled || !isRecoveryAction(button.actionId));
  const text = lockedRecovery
    ? "Recovery indisponivel neste plano."
    : renderMessage(config, scene.message, period) || "Mensagem do bloco";

  return (
    <aside className={styles.previewPanel}>
      <header className={styles.panelHeader}>
        <div>
          <span className={styles.eyebrow}>WhatsApp</span>
          <strong>{isMeta ? "Meta: botoes" : "QR/Evolution: lista"}</strong>
        </div>
      </header>

      <div className={styles.periodTabs} role="tablist" aria-label="Periodo da saudacao">
        <button type="button" data-active={period === "morning" ? "true" : "false"} onClick={() => onPeriodChange("morning")}>
          Manha
        </button>
        <button type="button" data-active={period === "afternoon" ? "true" : "false"} onClick={() => onPeriodChange("afternoon")}>
          Tarde
        </button>
        <button type="button" data-active={period === "night" ? "true" : "false"} onClick={() => onPeriodChange("night")}>
          Noite
        </button>
      </div>

      <div className={styles.phoneFrame} key={`${scene.id}-${period}-${previewRun}-${isMeta ? "meta" : "qr"}`}>
        <div className={styles.phoneTopbar}>
          <span className={styles.phoneAvatar}>HBX</span>
          <div>
            <strong>Atendimento</strong>
            <small>online</small>
          </div>
        </div>
        <div className={styles.phoneBody}>
          <span className={styles.previewDate}>Hoje</span>
          <div className={styles.customerBubble}>Oi, preciso de atendimento.</div>
          <div className={styles.botBubble}>
            <p>{text}</p>
            {buttons.length ? (
              isMeta ? (
                <div className={styles.officialButtons}>
                  {buttons.slice(0, 5).map((button) => (
                    <button key={button.buttonId} type="button">
                      {button.title}
                    </button>
                  ))}
                </div>
              ) : (
                <ol className={styles.numberedList}>
                  {buttons.map((button) => (
                    <li key={button.buttonId}>{button.title}</li>
                  ))}
                </ol>
              )
            ) : null}
          </div>
        </div>
        <div className={styles.phoneComposer}>
          <span>Mensagem</span>
          <strong>+</strong>
        </div>
      </div>
    </aside>
  );
}
