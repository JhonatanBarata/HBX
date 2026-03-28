"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { HbxThemeId, HbxThemeMode } from "@/lib/theme-palettes";
import InboxV2SegmentedControl from "./InboxV2SegmentedControl";
import styles from "./InboxV2.module.css";

type InboxV2ShellProps = {
  themeId: HbxThemeId;
  themeMode: HbxThemeMode;
  themeLabel: string;
  section: "conversa" | "financeiro" | "agenda" | "automacao";
  onSectionChange: (section: "conversa" | "financeiro" | "agenda" | "automacao") => void;
  queuePane?: ReactNode;
  conversationPane?: ReactNode;
  contextPane?: ReactNode;
  overlayPane?: ReactNode;
  overlayTitle?: string;
  onCloseOverlay?: () => void;
  notice?: ReactNode;
};

const SECTION_ITEMS = [
  { id: "conversa", label: "Conversa" },
  { id: "financeiro", label: "Financeiro" },
  { id: "agenda", label: "Agenda" },
  { id: "automacao", label: "Automacao" },
] as const;

export default function InboxV2Shell({
  themeId,
  themeMode,
  themeLabel,
  section,
  onSectionChange,
  queuePane,
  conversationPane,
  contextPane,
  overlayPane,
  overlayTitle,
  onCloseOverlay,
  notice,
}: InboxV2ShellProps) {
  const [overlayActive, setOverlayActive] = useState(false);

  useEffect(() => {
    if (!overlayPane) {
      setOverlayActive(false);
      return;
    }
    const frame = window.requestAnimationFrame(() => setOverlayActive(true));
    return () => window.cancelAnimationFrame(frame);
  }, [overlayPane]);

  return (
    <section className={styles.shell} data-theme-id={themeId} data-theme-mode={themeMode}>
      <div className={styles.page}>
        <header className={styles.topbar}>
          <div className={styles.topbarMain}>
            <p className={styles.eyebrow}>HBX Atendimento</p>
            <div className={styles.titleRow}>
              <h1 className={styles.title}>Inbox</h1>
              <span className={styles.pill}>{themeLabel}</span>
            </div>
            
          </div>

          <div className={styles.toolbarActions}>
            <InboxV2SegmentedControl
              items={SECTION_ITEMS}
              value={section}
              onChange={(nextSection) => onSectionChange(nextSection as InboxV2ShellProps["section"])}
              className={styles.sectionNav}
              buttonClassName={styles.sectionButton}
              activeButtonClassName={styles.sectionButtonActive}
              role="tablist"
              buttonRole="tab"
              ariaLabel="Navegacao principal do Atendimento"
            />
          </div>
        </header>

        {notice}

        <div className={styles.workspaceStage}>
          <div className={styles.stage}>
            {queuePane}
            {conversationPane}
            {contextPane}
          </div>
          {overlayPane ? (
            <div className={`${styles.workspaceOverlay} ${overlayActive ? styles.workspaceOverlayActive : ""}`}>
              <div className={styles.workspaceOverlayScrim} onClick={onCloseOverlay} />
              <section
                className={`${styles.workspaceOverlayCard} ${overlayActive ? styles.workspaceOverlayCardActive : ""}`}
                aria-label={overlayTitle || "Painel"}
              >
                <header className={styles.workspaceOverlayHeader}>
                  <div className={styles.paneTitle}>
                    <strong>{overlayTitle || "Painel"}</strong>
                    <span>Janela operacional com rolagem propria, sem cortar o workspace.</span>
                  </div>
                  <button type="button" className={styles.buttonGhost} onClick={onCloseOverlay}>
                    Fechar
                  </button>
                </header>
                <div className={styles.workspaceOverlayBody}>{overlayPane}</div>
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
