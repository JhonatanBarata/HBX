import { formatWhatsAppDateTime } from "@/lib/whatsapp-center";
import styles from "../page.module.css";

type BotQrConnectionCardProps = {
  loading: boolean;
  actionLoading: string | null;
  error: string | null;
  statusLabel: string;
  centerModeLabel: string;
  mainNote: string;
  phone: string | null;
  updatedAt: string | null;
  connectedAt: string | null;
  qrCodeDataUrl: string | null;
  isQrPrimary: boolean;
  onGenerateQr: () => void;
  onReconnect: () => void;
  onDisconnect: () => void;
  onRefresh: () => void;
};

export default function BotQrConnectionCard({
  loading,
  actionLoading,
  error,
  statusLabel,
  centerModeLabel,
  mainNote,
  phone,
  updatedAt,
  connectedAt,
  qrCodeDataUrl,
  isQrPrimary,
  onGenerateQr,
  onReconnect,
  onDisconnect,
  onRefresh,
}: BotQrConnectionCardProps) {
  return (
    <div className={styles.connectionGrid}>
      <article className={styles.connectionCard}>
        <div className={styles.connectionHeader}>
          <div>
            <span className={styles.sectionEyebrow}>Conexao</span>
            <h3 className={styles.cardTitle}>Central QR simplificada</h3>
          </div>
          <span className={styles.statusPill} data-active={isQrPrimary ? "true" : "false"}>
            {isQrPrimary ? "Caminho principal agora" : "QR ainda nao e o caminho principal"}
          </span>
        </div>

        <div className={styles.connectionSummaryCard}>
          <strong>{statusLabel}</strong>
          <p>{mainNote}</p>
        </div>

        <div className={styles.connectionMetricGrid}>
          <div className={styles.connectionMetric}>
            <span>Modo escolhido</span>
            <strong>{centerModeLabel}</strong>
          </div>
          <div className={styles.connectionMetric}>
            <span>Numero conectado</span>
            <strong>{phone || "-"}</strong>
          </div>
          <div className={styles.connectionMetric}>
            <span>Ultima atualizacao</span>
            <strong>{formatWhatsAppDateTime(updatedAt)}</strong>
          </div>
          <div className={styles.connectionMetric}>
            <span>Conectado em</span>
            <strong>{formatWhatsAppDateTime(connectedAt)}</strong>
          </div>
        </div>

        <div className={styles.connectionActionRow}>
          <button type="button" className={styles.primaryButton} onClick={onGenerateQr} disabled={loading || Boolean(actionLoading)}>
            {actionLoading === "generate_qr" ? "Gerando..." : "Gerar novo QR"}
          </button>
          <button type="button" className={styles.secondaryButton} onClick={onReconnect} disabled={loading || Boolean(actionLoading)}>
            {actionLoading === "reconnect" ? "Reconectando..." : "Reconectar"}
          </button>
          <button type="button" className={styles.ghostButton} onClick={onDisconnect} disabled={loading || Boolean(actionLoading)}>
            {actionLoading === "disconnect" ? "Desconectando..." : "Desconectar"}
          </button>
          <button type="button" className={styles.ghostButton} onClick={onRefresh} disabled={loading || Boolean(actionLoading)}>
            Atualizar status
          </button>
        </div>

        <div className={styles.connectionDisclaimer}>
          Este produto e controlado por operacao. Sem envio automatico. Sem comportamento escondido.
        </div>

        {error ? <div className={styles.inlineError}>{error}</div> : null}
      </article>

      <article className={styles.qrPreviewCard}>
        <div className={styles.connectionHeader}>
          <div>
            <span className={styles.sectionEyebrow}>QR code</span>
            <h3 className={styles.cardTitle}>Leitura imediata</h3>
          </div>
          <span className={styles.qrStatusBadge}>{qrCodeDataUrl ? "QR pronto" : "Aguardando QR"}</span>
        </div>

        <div className={styles.qrFrame}>
          {qrCodeDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrCodeDataUrl} alt="QR do WhatsApp" className={styles.qrImage} />
          ) : (
            <div className={styles.qrEmptyState}>
              <strong>QR ainda nao carregado</strong>
              <p>Gere ou reconecte a sessao para puxar um novo codigo nesta mesma tela.</p>
            </div>
          )}
        </div>
      </article>
    </div>
  );
}
