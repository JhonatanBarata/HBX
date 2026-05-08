"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import styles from "./WhatsAppOperationalDialog.module.css";
import {
  formatWhatsAppDateTime,
  type WhatsAppCenterPayload,
  type WhatsAppDiagnosticFocus,
  type WhatsAppModalPayload,
  whatsappModeLabel,
  whatsappQrConnectionLiveLabel,
  whatsappTrialModuleLabel,
} from "@/lib/whatsapp-center";

type WhatsAppOperationalDialogProps = {
  isOpen: boolean;
  focus: WhatsAppDiagnosticFocus;
  loading: boolean;
  modalLoading: boolean;
  busyAction: string | null;
  payload: WhatsAppCenterPayload | null;
  modalPayload: WhatsAppModalPayload | null;
  error: string | null;
  modalError: string | null;
  message: string | null;
  onClose: () => void;
  onFocusChange: (focus: WhatsAppDiagnosticFocus) => void;
  onChooseMode: (mode: "QR" | "OFFICIAL") => void;
  onRequestMigration: () => void;
  onStartQrConnection: () => void;
  onDisconnectQrConnection: () => void;
};

const FOCUS_LABELS: Record<WhatsAppDiagnosticFocus, string> = {
  status: "Diagnostico",
  qr: "QR rapido",
  official: "Meta oficial",
};

export default function WhatsAppOperationalDialog({
  isOpen,
  focus,
  loading,
  modalLoading,
  busyAction,
  payload,
  modalPayload,
  error,
  modalError,
  message,
  onClose,
  onFocusChange,
  onChooseMode,
  onRequestMigration,
  onStartQrConnection,
  onDisconnectQrConnection,
}: WhatsAppOperationalDialogProps) {
  const [qrSuccess, setQrSuccess] = useState(false);
  const prevModalStatusRef = useRef<string | null>(null);

  useEffect(() => {
    const prev = prevModalStatusRef.current;
    const curr = modalPayload?.status ?? null;
    prevModalStatusRef.current = curr;
    if (prev !== null && prev !== "connected" && curr === "connected") {
      const showTimer = window.setTimeout(() => {
        setQrSuccess(true);
      }, 0);
      const hideTimer = window.setTimeout(() => {
        setQrSuccess(false);
      }, 2400);
      return () => {
        window.clearTimeout(showTimer);
        window.clearTimeout(hideTimer);
      };
    }
  }, [modalPayload?.status]);

  useEffect(() => {
    if (!isOpen) {
      prevModalStatusRef.current = null;
      const timer = window.setTimeout(() => {
        setQrSuccess(false);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (qrSuccess) return;
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose, qrSuccess]);

  if (!isOpen) return null;

  const companyName = payload?.company.name || "Empresa";
  const qrConnection = payload?.center.qrConnection;
  const official = payload?.center.official;
  const migration = payload?.center.migration;
  const statusHref = `/whatsapp?focus=${focus}`;
  const qrConnectionLabel = modalPayload
    ? modalPayload.status === "waiting_qr"
      ? "QR aguardando leitura"
      : modalPayload.status === "connected"
        ? "Conectado por QR"
        : modalPayload.status === "starting"
          ? "Iniciando"
          : modalPayload.status === "error"
            ? "Atencao tecnica"
            : modalPayload.status === "disconnected"
              ? "Desconectado"
              : "Offline"
    : whatsappQrConnectionLiveLabel(qrConnection?.liveStatus);
  const modalStatus = modalPayload?.status || "offline";
  const modalConfiguredForAction = modalPayload ? modalPayload.data.available : true;
  const hasQrCode = Boolean(modalPayload?.data.qrCodeDataUrl);
  const qrConnectionError =
    modalError ||
    (modalPayload?.data.lastError || null) ||
    (modalPayload && !modalPayload.success && modalPayload.status === "error" ? modalPayload.message : null) ||
    null;

  return (
    <div className={styles.backdrop} onClick={qrSuccess ? undefined : onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Diagnostico operacional do WhatsApp"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.frame}>
          <div className={styles.header}>
            <div className={styles.headerCopy}>
              <span className={styles.eyebrow}>WhatsApp operacional</span>
              <h2 className={styles.title}>{companyName}</h2>
              <p className={styles.subtitle}>
                Conecte ou desconecte o WhatsApp por QR e veja o código quando ele estiver pronto.
              </p>
            </div>

            <div className={styles.headerActions}>
              <Link href={statusHref} className={`btn btn-secondary btn-sm ${styles.linkButton}`}>
                Abrir central completa
              </Link>
              <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
                Fechar
              </button>
            </div>
          </div>

          {error ? <div className={styles.alert}>{error}</div> : null}
          {message ? <div className={styles.success}>{message}</div> : null}

          {loading && !payload ? (
            <div className={styles.loading}>Carregando diagnostico do WhatsApp...</div>
          ) : payload ? (
            <>
              <div className={styles.summaryGrid}>
                <article className={styles.summaryCard}>
                  <span>Status atual</span>
                  <strong>{payload.center.statusLabel}</strong>
                  <p className={styles.note}>{payload.center.statusHint}</p>
                </article>
                <article className={styles.summaryCard}>
                  <span>Modo escolhido</span>
                  <strong>{whatsappModeLabel(payload.center.mode)}</strong>
                  <p className={styles.note}>A topbar deixa visível qual trilho a empresa assumiu.</p>
                </article>
                <article className={styles.summaryCard}>
                  <span>Modulo inicial</span>
                  <strong>{whatsappTrialModuleLabel(payload.company.trialModuleSelection)}</strong>
                  <p className={styles.note}>A conexão precisa servir a operação principal, não o contrário.</p>
                </article>
                <article className={styles.summaryCard}>
                  <span>Contato tecnico</span>
                  <strong>{migration?.interestRequested ? "Solicitado" : "Nao solicitado"}</strong>
                  <p className={styles.note}>
                    {migration?.interestRequested
                      ? `Pedido registrado em ${formatWhatsAppDateTime(migration.requestedAt)}.`
                      : "O aceite para migração oficial ainda não foi registrado."}
                  </p>
                </article>
              </div>

              <div className={styles.focusRail} aria-label="Foco do diagnostico do WhatsApp">
                {(["status", "qr", "official"] as WhatsAppDiagnosticFocus[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={styles.focusButton}
                    data-active={focus === key}
                    onClick={() => onFocusChange(key)}
                  >
                    {FOCUS_LABELS[key]}
                  </button>
                ))}
              </div>

              <div className={styles.contentGrid} data-focus={focus}>
                <div className={styles.mainColumn}>
                  <section className={styles.sectionWide} data-active={focus === "status"}>
                    <div className={styles.sectionHeader}>
                      <strong>Leitura objetiva da barra superior</strong>
                      <p>
                        O topo sinaliza se a empresa tem Meta pronta, QR aguardando leitura ou um gargalo técnico que exige decisão do time.
                      </p>
                    </div>

                    <div className={styles.statusHero}>
                      <span className={styles.detailLabel}>Prioridade atual</span>
                      <strong className={styles.statusLead}>{payload.center.statusLabel}</strong>
                      <p className={styles.statusHint}>{payload.center.statusHint}</p>
                    </div>

                    <div className={styles.statusBadgeRow}>
                      <article className={styles.badge}>
                        <span className={styles.badgeLabel}>Conexao rapida por QR</span>
                        <strong className={styles.badgeValue}>{qrConnectionLabel}</strong>
                      </article>
                      <article className={styles.badge}>
                        <span className={styles.badgeLabel}>Meta oficial</span>
                        <strong className={styles.badgeValue}>{official?.connected ? "Conectado" : official?.status || "Pendente"}</strong>
                      </article>
                      <article className={styles.badge}>
                        <span className={styles.badgeLabel}>Origem da credencial</span>
                        <strong className={styles.badgeValue}>{official?.usingMasterToken ? "MASTER" : "Empresa"}</strong>
                      </article>
                    </div>

                    <div className={styles.detailGrid}>
                      <article className={styles.fact}>
                        <span>Numero oficial</span>
                        <strong>{official?.displayNumber || "-"}</strong>
                      </article>
                      <article className={styles.fact}>
                        <span>Numero do QR</span>
                        <strong>{modalPayload?.data.phone || qrConnection?.displayNumber || "-"}</strong>
                      </article>
                      <article className={styles.fact}>
                        <span>Ultima leitura do QR</span>
                        <strong>{formatWhatsAppDateTime(modalPayload?.data.updatedAt || qrConnection?.lastSyncAt)}</strong>
                      </article>
                      <article className={styles.fact}>
                        <span>Aceite de migracao</span>
                        <strong>{migration?.interestRequested ? formatWhatsAppDateTime(migration.requestedAt) : "Nao registrado"}</strong>
                      </article>
                    </div>
                  </section>

                  <section className={styles.section} data-active={focus === "qr"}>
                    <div className={styles.sectionHeader}>
                      <strong>Conexao rapida por QR</strong>
                      <p>Use Conectar para gerar o QR e Desconectar para encerrar a sessão. Sem câmera, use a opção Vincular por telefone.</p>
                    </div>

                    {modalLoading && !modalPayload ? (
                      <div className={styles.loading}>Consultando o modal WhatsApp para ler o estado técnico atual...</div>
                    ) : null}

                    {qrConnection && !modalPayload?.data.available && !modalLoading ? (
                      <div className={styles.alert}>
                        <strong>Conexão rápida indisponível neste ambiente.</strong>
                        <p>{qrConnection.setupHint || "Configure o modal WhatsApp no backend para habilitar o QR."}</p>
                        {qrConnection.missingConfigKeys?.length ? (
                          <p>Faltando: {qrConnection.missingConfigKeys.join(", ")}</p>
                        ) : null}
                      </div>
                    ) : null}

                    <div className={styles.detailGrid}>
                      <article className={styles.fact}>
                        <span>Estado da conexão</span>
                        <strong>{qrConnectionLabel}</strong>
                      </article>
                      <article className={styles.fact}>
                        <span>Tenant tecnico</span>
                        <strong>{modalPayload?.data.tenantKey || "-"}</strong>
                      </article>
                      <article className={styles.fact}>
                        <span>Numero conectado</span>
                        <strong>{modalPayload?.data.phone || "-"}</strong>
                      </article>
                      <article className={styles.fact}>
                        <span>Conectado em</span>
                        <strong>{formatWhatsAppDateTime(modalPayload?.data.connectedAt || qrConnection?.connectedAt)}</strong>
                      </article>
                      <article className={styles.fact}>
                        <span>Saude do provedor</span>
                        <strong>{modalPayload ? modalPayload.data.providerHealth : "Aguardando acionamento"}</strong>
                      </article>
                      <article className={styles.fact}>
                        <span>Configuracao</span>
                        <strong>{modalPayload?.data.available || qrConnection?.available ? "Pronta" : "Pendente"}</strong>
                      </article>
                    </div>

                    {qrConnectionError ? <div className={styles.alert}>{qrConnectionError}</div> : null}

                    {modalPayload?.data.qrCodeDataUrl ? (
                      <div className={styles.qrPanel}>
                        <div className={styles.qrMeta}>
                          <strong>QR pronto</strong>
                          <p>Abra o WhatsApp no celular e leia o QR.</p>
                          <p>Pairing code: -</p>
                        </div>
                        <div className={styles.qrImageWrap}>
                          <Image
                            src={modalPayload.data.qrCodeDataUrl}
                            alt="QR Code para conexão rápida por QR"
                            className={styles.qrImage}
                            width={148}
                            height={148}
                            unoptimized
                          />
                        </div>
                      </div>
                    ) : null}

                    <div className={styles.actions}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={onStartQrConnection}
                        disabled={
                          busyAction !== null
                          || !modalConfiguredForAction
                          || modalStatus === "connected"
                          || (modalStatus === "waiting_qr" && hasQrCode)
                        }
                      >
                        {busyAction === "qr-connect"
                          ? "Conectando..."
                          : modalStatus === "waiting_qr" && !hasQrCode
                            ? "Atualizar QR"
                            : "Conectar"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={onDisconnectQrConnection}
                        disabled={
                          busyAction !== null
                          || !modalConfiguredForAction
                          || (
                            modalStatus !== "connected"
                            && modalStatus !== "waiting_qr"
                            && modalStatus !== "starting"
                          )
                        }
                      >
                        {busyAction === "qr-disconnect" ? "Desconectando..." : "Desconectar"}
                      </button>
                      <Link href="/whatsapp?focus=phone" className="btn btn-secondary">
                        Vincular por telefone
                      </Link>
                    </div>
                  </section>
                </div>

                <div className={styles.sideColumn}>
                  <section className={styles.section} data-active={focus === "official"}>
                    <div className={styles.sectionHeader}>
                      <strong>Meta oficial</strong>
                      <p>
                        O topo deixa claro se a credencial oficial existe, se já está operando e se a origem do token é MASTER ou empresa.
                      </p>
                    </div>

                    <div className={styles.detailGrid}>
                      <article className={styles.fact}>
                        <span>Status Meta</span>
                        <strong>{official?.connected ? "Conectado" : official?.status || "Pendente"}</strong>
                      </article>
                      <article className={styles.fact}>
                        <span>Numero exibido</span>
                        <strong>{official?.displayNumber || "-"}</strong>
                      </article>
                      <article className={styles.fact}>
                        <span>Phone number ID</span>
                        <strong>{official?.phoneNumberId || "-"}</strong>
                      </article>
                      <article className={styles.fact}>
                        <span>WABA ID</span>
                        <strong>{official?.wabaId || "-"}</strong>
                      </article>
                    </div>

                    <div className={styles.actions}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => onChooseMode("OFFICIAL")}
                        disabled={busyAction !== null}
                      >
                        {busyAction === "OFFICIAL" ? "Salvando..." : "Usar Meta oficial"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={onRequestMigration}
                        disabled={busyAction !== null || Boolean(migration?.interestRequested)}
                      >
                        {migration?.interestRequested
                          ? "Tecnico ja acionado"
                          : busyAction === "migration"
                            ? "Registrando..."
                            : "Aceitar contato tecnico"}
                      </button>
                    </div>
                  </section>

                  <section className={styles.section} data-active={focus === "status"}>
                    <div className={styles.sectionHeader}>
                      <strong>Próximos passos sugeridos</strong>
                      <p>O clique no topo precisa virar decisão rápida, não só navegação.</p>
                    </div>
                    <ul className={styles.list}>
                      <li>Se o objetivo é provar uso agora, deixe a conexão rápida por QR selecionada e gere o QR.</li>
                      <li>Se a conta vai operar com previsibilidade e automações, selecione a Meta oficial e registre o aceite técnico.</li>
                      <li>Quando a barra mostrar atenção ou falha, abra a central completa para investigar histórico e contexto adicional.</li>
                    </ul>
                  </section>
                </div>
              </div>
            </>
          ) : (
            <div className={styles.loading}>Nao foi possivel carregar o diagnostico do WhatsApp.</div>
          )}
        </div>
      </div>

      {qrSuccess && (
        <div className={styles.qrSuccessOverlay} aria-live="assertive" role="status">
          <div className={styles.qrSuccessCard}>
            <div className={styles.qrSuccessIconWrap}>
              <svg className={styles.qrSuccessCheck} viewBox="0 0 52 52" fill="none" aria-hidden="true">
                <circle cx="26" cy="26" r="25" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" fill="rgba(255,255,255,0.12)" />
                <path className={styles.qrCheckPath} d="M14 27l9 9 15-18" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <strong className={styles.qrSuccessTitle}>WhatsApp conectado!</strong>
            <p className={styles.qrSuccessSubtitle}>Sessao ativa. A fila sera atualizada automaticamente.</p>
            <div className={styles.qrSuccessBar} />
          </div>
        </div>
      )}
    </div>
  );
}
