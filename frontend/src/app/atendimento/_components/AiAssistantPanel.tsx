"use client";

import styles from "./AiAssistantPanel.module.css";

export type AiAssistantStatus = {
  visualFeatureEnabled: boolean;
  smartRepliesFeatureEnabled: boolean;
  autoSendFeatureEnabled: boolean;
  visualEnabled: boolean;
  smartRepliesEnabled: boolean;
  autoSendEnabled: boolean;
  openAiAvailable: boolean;
  availabilityLabel: string;
  safeMode: boolean;
};

export type AiAssistantProspect = {
  available: boolean;
  leadId?: string | null;
  name?: string | null;
  phone?: string | null;
  statusLabel?: string | null;
  reason?: string | null;
  action?: { label: string; href: string } | null;
  message?: string | null;
};

export type AiAssistantInsights = {
  requestMoreVisible?: boolean;
  requestMoreMessage?: string | null;
  bestHour?: string | null;
  queue?: { pendingLeads?: number | null };
  bubbles?: Array<{ id: string; label: string; count?: number | null }>;
  insights?: Array<{
    id: string;
    title: string;
    description: string;
    tone: "info" | "warning" | "success" | "danger";
    actionLabel?: string | null;
  }>;
};

type AiAssistantPanelProps = {
  status: AiAssistantStatus;
  prospect: AiAssistantProspect | null;
  insights: AiAssistantInsights | null;
  loading?: boolean;
  compact?: boolean;
  onStartProspect: (href?: string | null) => void;
  onRequestMoreLeads: () => void;
  onToggleCompact: () => void;
};

export default function AiAssistantPanel({
  status,
  prospect,
  insights,
  loading,
  compact,
  onStartProspect,
  onRequestMoreLeads,
  onToggleCompact,
}: AiAssistantPanelProps) {
  if (!status.visualEnabled) return null;

  const insightRows = insights?.insights || [];
  const bubbles = insights?.bubbles || [];

  return (
    <div className={styles.aiLayer} data-compact={compact ? "true" : "false"}>
      <button
        type="button"
        className={styles.compactButton}
        onClick={onToggleCompact}
        aria-label={compact ? "Abrir Assistente IA" : "Recolher Assistente IA"}
        title={compact ? "Abrir Assistente IA" : "Recolher Assistente IA"}
      >
        IA
      </button>

      <div className={styles.robotWrap} aria-hidden="true">
        <div className={styles.robotHalo} />
        <div className={styles.robot}>
          <span className={styles.robotAntenna} />
          <span className={styles.robotEyeLeft} />
          <span className={styles.robotEyeRight} />
          <span className={styles.robotSmile} />
        </div>
      </div>

      <aside className={styles.panel} aria-label="Assistente HBX IA">
        <div className={styles.statusCard}>
          <span className={styles.onlineDot} data-online={status.openAiAvailable ? "true" : "false"} />
          <div>
            <strong>{status.openAiAvailable ? "Assistente HBX IA — Online" : "IA indisponível"}</strong>
            <p>{status.openAiAvailable ? "Sugestoes comerciais seguras com aprovacao humana." : "Sistema normal preservado."}</p>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span>Proximo Prospect</span>
            <strong>{prospect?.available ? prospect.statusLabel || "Pendente" : "Fila limpa"}</strong>
          </div>
          {loading ? (
            <p className={styles.cardText}>Lendo oportunidades...</p>
          ) : prospect?.available ? (
            <>
              <p className={styles.prospectName}>{prospect.name || "Prospect sem nome"}</p>
              <p className={styles.cardText}>{[prospect.phone, prospect.reason].filter(Boolean).join(" · ")}</p>
              <button type="button" className={styles.primaryAction} onClick={() => onStartProspect(prospect.action?.href)}>
                Iniciar conversa
              </button>
            </>
          ) : (
            <p className={styles.cardText}>{prospect?.message || "Nenhum contato elegivel agora."}</p>
          )}
        </div>

        {insights?.requestMoreVisible ? (
          <div className={styles.requestCard}>
            <p>{insights.requestMoreMessage || "Sua busca atual foi concluida e nao ha novos leads no momento."}</p>
            <button type="button" className={styles.primaryAction} onClick={onRequestMoreLeads}>
              Pedir Mais Leads
            </button>
          </div>
        ) : null}

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span>Melhor horario</span>
            <strong>{insights?.bestHour || "Em leitura"}</strong>
          </div>
          <p className={styles.cardText}>Baseado nas respostas recentes dos leads.</p>
        </div>

        <div className={styles.insightsPanel}>
          <div className={styles.cardHeader}>
            <span>Insights em tempo real</span>
            <strong>{insightRows.length}</strong>
          </div>
          <div className={styles.bubbleRail}>
            {bubbles.map((bubble) => (
              <span key={bubble.id} className={styles.sideBubble}>
                {bubble.label}
                {bubble.count ? <strong>{bubble.count}</strong> : null}
              </span>
            ))}
          </div>
          <div className={styles.insightList}>
            {insightRows.length ? (
              insightRows.slice(0, 4).map((item) => (
                <article key={item.id} className={styles.insightItem} data-tone={item.tone}>
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                </article>
              ))
            ) : (
              <p className={styles.cardText}>Sem alertas comerciais agora.</p>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
