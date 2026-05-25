import { type ReactNode } from "react";
import HbxGuide1 from "@/components/HbxGuide1";
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

const TABS: Array<{ key: BotQrWorkspaceTab; label: string }> = [
  { key: "connection", label: "Conexão" },
  { key: "atendimento", label: "Atendimento" },
  { key: "flow", label: "Respostas" },
  { key: "prospeccao", label: "Campanha" },
  { key: "recovery", label: "Recovery" },
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
  const tabs = TABS.map((tab) => ({
    ...tab,
    badge: connectionPaired && tab.key === "connection" ? "OK" : undefined,
  }));

  return (
    <section className={`${styles.workspaceSection} hbx-page-mobile-enter`}>
      <div className="hbx-guide1-slot">
        <HbxGuide1 tabs={tabs} activeKey={activeTab} ariaLabel="Guias da Automacao WhatsApp" onChange={onTabChange} />
      </div>

      <div key={activeTab} className={`${styles.workspaceBody} hbx-page-mobile-enter`}>
        {currentPanel}
      </div>
    </section>
  );
}
