"use client";

import type { ReactNode } from "react";
import {
  ChatActionButton,
  ChatEmptyState,
} from "@/components/chat/PremiumChat";
import styles from "./ConversationWorkspaceStatus.module.css";

type ConversationWorkspaceStatusTone = "neutral" | "error";

type ConversationWorkspaceDiagnostic = {
  label: ReactNode;
  value: ReactNode;
};

type ConversationWorkspaceStatusProps = {
  title: string;
  description?: ReactNode;
  tone?: ConversationWorkspaceStatusTone;
  retryLabel?: string;
  onRetry?: () => void;
  diagnostics?: ConversationWorkspaceDiagnostic[];
};

export default function ConversationWorkspaceStatus({
  title,
  description,
  tone = "neutral",
  retryLabel = "Tentar novamente",
  onRetry,
  diagnostics,
}: ConversationWorkspaceStatusProps) {
  const hasDiagnostics = Array.isArray(diagnostics) && diagnostics.length > 0;

  return (
    <div className={styles.root} data-tone={tone}>
      <ChatEmptyState title={title} className={styles.empty}>
        {description ? <p>{description}</p> : null}
      </ChatEmptyState>

      {onRetry || hasDiagnostics ? (
        <div className={styles.footer}>
          {onRetry ? (
            <div className={styles.actions}>
              <ChatActionButton
                type="button"
                className={styles.retryButton}
                onClick={onRetry}
              >
                {retryLabel}
              </ChatActionButton>
            </div>
          ) : null}

          {hasDiagnostics ? (
            <details className={styles.diagnostics}>
              <summary>Diagnostico tecnico</summary>
              <dl className={styles.diagnosticGrid}>
                {diagnostics.map((item, index) => (
                  <div key={index} className={styles.diagnosticRow}>
                    <dt>{item.label}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ))}
              </dl>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
