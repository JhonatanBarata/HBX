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

type AiReplySuggestionPanel = {
  loading: boolean;
  text: string;
  status: string;
  message?: string | null;
};

type AiAssistantPanelProps = {
  status: AiAssistantStatus;
  prospect: AiAssistantProspect | null;
  insights: AiAssistantInsights | null;
  replySuggestion?: AiReplySuggestionPanel | null;
  smartReplyEnabled?: boolean;
  replyDisabled?: boolean;
  loading?: boolean;
  compact?: boolean;
  onStartProspect: (href?: string | null) => void;
  onRequestMoreLeads: () => void;
  onRequestReplySuggestion?: () => void;
  onApplyReplySuggestion?: () => void;
  onToggleCompact: () => void;
};

const DEFAULT_INSIGHTS: NonNullable<AiAssistantInsights["insights"]> = [
  {
    id: "message_long",
    title: "Mensagem longa",
    description: "Considere uma resposta mais direta antes de enviar.",
    tone: "warning",
  },
  {
    id: "lead_cold",
    title: "Lead frio",
    description: "Priorize contexto e proposta objetiva.",
    tone: "info",
  },
  {
    id: "no_response",
    title: "Sem resposta",
    description: "Evite insistência rápida. Aguarde a janela de retorno.",
    tone: "danger",
  },
  {
    id: "adjust_approach",
    title: "Ajustar abordagem",
    description: "Use uma pergunta simples para retomar a conversa.",
    tone: "success",
  },
];

export default function AiAssistantPanel({
  status,
  prospect,
  insights,
  replySuggestion,
  smartReplyEnabled,
  replyDisabled,
  loading,
  compact,
  onStartProspect,
  onRequestMoreLeads,
  onRequestReplySuggestion,
  onApplyReplySuggestion,
  onToggleCompact,
}: AiAssistantPanelProps) {
  const insightRows = insights?.insights?.length ? insights.insights : DEFAULT_INSIGHTS;
  const pendingLeads = Number(insights?.queue?.pendingLeads || 0);
  const canSuggestReply = Boolean(smartReplyEnabled && onRequestReplySuggestion && !replyDisabled);
  const hasSuggestion = Boolean(replySuggestion?.text?.trim());

  if (compact) {
    return (
      <button
        type="button"
        className={styles.compactButton}
        onClick={onToggleCompact}
        aria-label="Abrir painel do Assistente HBX IA"
        title="Abrir Assistente HBX IA"
      >
        IA
      </button>
    );
  }

  return (
    <aside className={styles.panel} aria-label="Painel do Assistente HBX IA">
      <header className={styles.panelHeader}>
        <span className={styles.avatar} aria-hidden="true">IA</span>
        <div>
          <span className={styles.eyebrow}>Assistente HBX IA</span>
          <strong>{status.openAiAvailable ? "Assistente HBX IA Online" : "Assistente HBX IA em verificação"}</strong>
          <p>{status.openAiAvailable ? "Apoio comercial em tempo real." : status.availabilityLabel || "Aguardando confirmação do serviço."}</p>
        </div>
        <button type="button" className={styles.collapseButton} onClick={onToggleCompact}>
          Recolher
        </button>
      </header>

      <section className={styles.statusGrid} aria-label="Status do assistente">
        <article className={styles.metricCard} data-tone={status.openAiAvailable ? "success" : "warning"}>
          <span>Status</span>
          <strong>{status.openAiAvailable ? "Online" : "Atenção"}</strong>
          <small>{status.safeMode ? "Modo seguro" : "Modo padrão"}</small>
        </article>
        <article className={styles.metricCard} data-tone={smartReplyEnabled ? "info" : "neutral"}>
          <span>Respostas</span>
          <strong>{smartReplyEnabled ? "Ativas" : "Inativas"}</strong>
          <small>{pendingLeads ? `${pendingLeads} leads na fila` : "Sem fila crítica"}</small>
        </article>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <span>Próximo prospect</span>
          <strong>{prospect?.available ? prospect.statusLabel || "Pendente" : "Fila limpa"}</strong>
        </div>
        {loading ? (
          <p className={styles.cardText}>Lendo oportunidades...</p>
        ) : prospect?.available ? (
          <>
            <p className={styles.prospectName}>{prospect.name || "Prospect sem nome"}</p>
            <p className={styles.cardText}>{[prospect.phone, prospect.reason].filter(Boolean).join(" - ")}</p>
            <button type="button" className={styles.primaryAction} onClick={() => onStartProspect(prospect.action?.href)}>
              Iniciar conversa
            </button>
          </>
        ) : (
          <p className={styles.cardText}>{prospect?.message || "Nenhum contato elegível agora."}</p>
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <span>Melhor horário</span>
          <strong>{insights?.bestHour || "Em leitura"}</strong>
        </div>
        <p className={styles.cardText}>Janela sugerida a partir das respostas recentes dos leads.</p>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <span>Resposta inteligente</span>
          <strong>{smartReplyEnabled ? "Disponível" : "Desligada"}</strong>
        </div>
        {hasSuggestion ? (
          <div className={styles.replyBox}>
            <p>{replySuggestion?.text}</p>
            <button type="button" className={styles.secondaryAction} onClick={onApplyReplySuggestion} disabled={replyDisabled}>
              Aplicar no chat
            </button>
          </div>
        ) : (
          <p className={styles.cardText}>
            {replySuggestion?.message || "Gere uma sugestão e revise antes de enviar ao cliente."}
          </p>
        )}
        <button
          type="button"
          className={styles.primaryAction}
          onClick={onRequestReplySuggestion}
          disabled={!canSuggestReply || replySuggestion?.loading}
        >
          {replySuggestion?.loading ? "Gerando..." : hasSuggestion ? "Gerar outra" : "Sugerir resposta"}
        </button>
      </section>

      <section className={styles.requestCard}>
        <div className={styles.cardHeader}>
          <span>Leads</span>
          <strong>Pedir mais</strong>
        </div>
        <p>{insights?.requestMoreMessage || "Solicite novos leads quando a fila comercial precisar de reforço."}</p>
        <button type="button" className={styles.primaryAction} onClick={onRequestMoreLeads}>
          Pedir mais leads
        </button>
      </section>

      <section className={styles.insightsPanel}>
        <div className={styles.cardHeader}>
          <span>Opiniões do assistente</span>
          <strong>{insightRows.length}</strong>
        </div>
        <div className={styles.insightList}>
          {insightRows.slice(0, 5).map((item) => (
            <article key={item.id} className={styles.insightItem} data-tone={item.tone}>
              <strong>{item.title}</strong>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>
    </aside>
  );
}
