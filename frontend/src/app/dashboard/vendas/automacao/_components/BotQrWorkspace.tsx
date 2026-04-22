import { type ReactNode } from "react";
import type { BotQrWorkspaceTab } from "../model";
import styles from "../page.module.css";

type BotQrWorkspaceProps = {
  activeTab: BotQrWorkspaceTab;
  onTabChange: (tab: BotQrWorkspaceTab) => void;
  connectionPaired?: boolean;
  connectionPanel: ReactNode;
  flowPanel: ReactNode;
  publishPanel: ReactNode;
};

const TABS: Array<{ id: BotQrWorkspaceTab; label: string; helper: string }> = [
  { id: "connection", label: "Conexao", helper: "QR ao centro" },
  { id: "flow", label: "Fluxo", helper: "Edicao simples" },
  { id: "publish", label: "Publicar", helper: "Checklist final" },
];

export default function BotQrWorkspace({
  activeTab,
  onTabChange,
  connectionPaired = false,
  connectionPanel,
  flowPanel,
  publishPanel,
}: BotQrWorkspaceProps) {
  const currentPanel =
    activeTab === "connection"
      ? connectionPanel
      : activeTab === "publish"
        ? publishPanel
        : flowPanel;

  return (
    <section className={styles.workspaceSection}>
      <div className={styles.workspaceHeader}>
        <div>
          <span className={styles.sectionEyebrow}>Workspace</span>
          <h2 className={styles.sectionTitle}>Operacao sem JSON e sem jargao tecnico</h2>
        </div>
        <p className={styles.sectionText}>
          O operador enxerga conexao, fluxo e publicacao em uma trilha unica, com a complexidade interna escondida.
        </p>
      </div>

      <div className={styles.workspaceTabs} role="tablist" aria-label="Abas do Bot QRCode">
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
            <span>{connectionPaired && tab.id === "connection" ? "Sucessfully Paired" : tab.helper}</span>
          </button>
        ))}
      </div>

      <div className={styles.workspaceBody}>{currentPanel}</div>
    </section>
  );
}
