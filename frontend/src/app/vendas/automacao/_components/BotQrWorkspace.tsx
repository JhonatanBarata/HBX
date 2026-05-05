import { type ReactNode } from "react";
import type { BotQrWorkspaceTab } from "../model";
import styles from "../page.module.css";

type BotQrWorkspaceProps = {
  activeTab: BotQrWorkspaceTab;
  onTabChange: (tab: BotQrWorkspaceTab) => void;
  connectionPaired?: boolean;
  connectionPanel: ReactNode;
  atendimentoPanel: ReactNode;
  flowPanel: ReactNode;
  prospectingPanel: ReactNode;
  recoveryPanel: ReactNode;
};

const TABS: Array<{ id: BotQrWorkspaceTab; label: string; helper: string }> = [
  { id: "connection", label: "CONEXÃO", helper: "QR / WebWhats" },
  { id: "atendimento", label: "ATENDIMENTO", helper: "Fila Atendimento" },
  { id: "flow", label: "RESPOSTAS DE VENDAS", helper: "Pós-contato" },
  { id: "prospeccao", label: "CAMPANHA", helper: "Disparo inicial" },
  { id: "recovery", label: "RECOVERY", helper: "Financeiro" },
];

export default function BotQrWorkspace({
  activeTab,
  onTabChange,
  connectionPaired = false,
  connectionPanel,
  atendimentoPanel,
  flowPanel,
  prospectingPanel,
  recoveryPanel,
}: BotQrWorkspaceProps) {
  const currentPanel =
    activeTab === "connection"
      ? connectionPanel
      : activeTab === "atendimento"
        ? atendimentoPanel
        : activeTab === "recovery"
          ? recoveryPanel
        : activeTab === "prospeccao"
          ? prospectingPanel
          : flowPanel;

  return (
    <section className={styles.workspaceSection}>
      <div className={styles.workspaceHeader}>
        <div>
          <span className={styles.sectionEyebrow}>Automacao WhatsApp</span>
          <h2 className={styles.sectionTitle}>Bot</h2>
        </div>
      </div>

      <div className={styles.workspaceTabs} role="tablist" aria-label="Abas da Automacao WhatsApp">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={styles.workspaceTab}
            data-active={activeTab === tab.id ? "true" : "false"}
            data-paired={connectionPaired && tab.id === "connection" ? "true" : "false"}
            onClick={() => onTabChange(tab.id)}
            role="tab"
            aria-selected={activeTab === tab.id}
          >
            <strong>{tab.label}</strong>
            <span>{connectionPaired && tab.id === "connection" ? "Conectado agora" : tab.helper}</span>
          </button>
        ))}
      </div>

      <div className={styles.workspaceBody}>{currentPanel}</div>
    </section>
  );
}
