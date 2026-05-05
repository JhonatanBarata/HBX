import { type ReactNode } from "react";
import type { BotQrWorkspaceTab } from "../model";
import styles from "../page.module.css";

type BotQrWorkspaceProps = {
  activeTab: BotQrWorkspaceTab;
  onTabChange: (tab: BotQrWorkspaceTab) => void;
  connectionPaired?: boolean;
  connectionPanel: ReactNode;
  flowPanel: ReactNode;
  prospectingPanel: ReactNode;
  publishPanel: ReactNode;
};

const TABS: Array<{ id: BotQrWorkspaceTab; label: string; helper: string }> = [
  { id: "connection", label: "Conexão", helper: "QR" },
  { id: "flow", label: "Respostas de Vendas", helper: "Pós-contato" },
  { id: "prospeccao", label: "Campanha", helper: "Disparo inicial" },
  { id: "publish", label: "OK", helper: "Publicar" },
];

export default function BotQrWorkspace({
  activeTab,
  onTabChange,
  connectionPaired = false,
  connectionPanel,
  flowPanel,
  prospectingPanel,
  publishPanel,
}: BotQrWorkspaceProps) {
  const currentPanel =
    activeTab === "connection"
      ? connectionPanel
      : activeTab === "publish"
        ? publishPanel
        : activeTab === "prospeccao"
          ? prospectingPanel
          : flowPanel;

  return (
    <section className={styles.workspaceSection}>
      <div className={styles.workspaceHeader}>
        <div>
          <span className={styles.sectionEyebrow}>Automacao WhatsApp</span>
          <h2 className={styles.sectionTitle}>Bot</h2>
          <p className={styles.sectionText}>Campanha envia a primeira mensagem. Respostas de Vendas só responde depois que o lead retorna.</p>
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
