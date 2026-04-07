"use client";

import Link from "next/link";
import { useEffect } from "react";
import styles from "./WhatsAppOperationalDialog.module.css";
import {
  formatWhatsAppDateTime,
  type WhatsAppCenterPayload,
  type WhatsAppDiagnosticFocus,
  whatsappModeLabel,
  whatsappTemporaryLiveLabel,
  whatsappTrialModuleLabel,
} from "@/lib/whatsapp-center";

type WhatsAppOperationalDialogProps = {
  isOpen: boolean;
  focus: WhatsAppDiagnosticFocus;
  loading: boolean;
  busyAction: string | null;
  payload: WhatsAppCenterPayload | null;
  error: string | null;
  message: string | null;
  onClose: () => void;
  onFocusChange: (focus: WhatsAppDiagnosticFocus) => void;
  onChooseMode: (mode: "TEMPORARY" | "OFFICIAL") => void;
  onRequestMigration: () => void;
  onStartTemporaryConnection: () => void;
  onDisconnectTemporaryConnection: () => void;
  onRefreshTemporary: () => void;
};

const FOCUS_LABELS: Record<WhatsAppDiagnosticFocus, string> = {
  status: "Diagnostico",
  temporary: "QR rapido",
  official: "Meta oficial",
};

export default function WhatsAppOperationalDialog({
  isOpen,
  focus,
  loading,
  busyAction,
  payload,
  error,
  message,
  onClose,
  onFocusChange,
  onChooseMode,
  onRequestMigration,
  onStartTemporaryConnection,
  onDisconnectTemporaryConnection,
  onRefreshTemporary,
}: WhatsAppOperationalDialogProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const companyName = payload?.company.name || "Empresa";
  const temporary = payload?.center.temporary;
  const official = payload?.center.official;
  const migration = payload?.center.migration;
  const statusHref = `/dashboard/whatsapp?focus=${focus}`;

  return (
    <div className={styles.backdrop} onClick={onClose}>
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
                O clique da barra superior agora abre o estado real de token, Meta e WebWhats sem esconder QR, pairing ou proximo passo comercial.
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
                  <p className={styles.note}>A topbar deixa visivel qual trilho a empresa assumiu.</p>
                </article>
                <article className={styles.summaryCard}>
                  <span>Modulo inicial</span>
                  <strong>{whatsappTrialModuleLabel(payload.company.trialModuleSelection)}</strong>
                  <p className={styles.note}>O vinculo precisa servir a operacao principal, nao o contrario.</p>
                </article>
                <article className={styles.summaryCard}>
                  <span>Contato tecnico</span>
                  <strong>{migration?.interestRequested ? "Solicitado" : "Nao solicitado"}</strong>
                  <p className={styles.note}>
                    {migration?.interestRequested
                      ? `Pedido registrado em ${formatWhatsAppDateTime(migration.requestedAt)}.`
                      : "O aceite para migracao oficial ainda nao foi registrado."}
                  </p>
                </article>
              </div>

              <div className={styles.focusRail} aria-label="Foco do diagnostico do WhatsApp">
                {(["status", "temporary", "official"] as WhatsAppDiagnosticFocus[]).map((key) => (
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
                        O topo sinaliza se a empresa tem rota oficial pronta, QR aguardando leitura ou um gargalo tecnico que exige decisao do time.
                      </p>
                    </div>

                    <div className={styles.statusHero}>
                      <span className={styles.detailLabel}>Prioridade atual</span>
                      <strong className={styles.statusLead}>{payload.center.statusLabel}</strong>
                      <p className={styles.statusHint}>{payload.center.statusHint}</p>
                    </div>

                    <div className={styles.statusBadgeRow}>
                      <article className={styles.badge}>
                        <span className={styles.badgeLabel}>Trilho rapido</span>
                        <strong className={styles.badgeValue}>{whatsappTemporaryLiveLabel(temporary?.liveStatus)}</strong>
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
                        <span>Numero temporario</span>
                        <strong>{temporary?.displayNumber || "-"}</strong>
                      </article>
                      <article className={styles.fact}>
                        <span>Ultima leitura temporaria</span>
                        <strong>{formatWhatsAppDateTime(temporary?.lastSyncAt)}</strong>
                      </article>
                      <article className={styles.fact}>
                        <span>Aceite de migracao</span>
                        <strong>{migration?.interestRequested ? formatWhatsAppDateTime(migration.requestedAt) : "Nao registrado"}</strong>
                      </article>
                    </div>
                  </section>

                  <section className={styles.section} data-active={focus === "temporary"}>
                    <div className={styles.sectionHeader}>
                      <strong>Conexao rapida por QR</strong>
                      <p>{temporary?.note || "A trilha temporaria destrava teste e prova de uso quando o objetivo e tirar a empresa da inercia."}</p>
                    </div>

                    {temporary && !temporary.available ? (
                      <div className={styles.alert}>
                        <strong>WebWhats indisponível neste ambiente.</strong>
                        <p>{temporary.setupHint || "Configure o provider temporário no backend para habilitar QR."}</p>
                        {temporary.missingConfigKeys?.length ? (
                          <p>Faltando: {temporary.missingConfigKeys.join(", ")}</p>
                        ) : null}
                      </div>
                    ) : null}

                    <div className={styles.detailGrid}>
                      <article className={styles.fact}>
                        <span>Estado do vinculo</span>
                        <strong>{whatsappTemporaryLiveLabel(temporary?.liveStatus)}</strong>
                      </article>
                      <article className={styles.fact}>
                        <span>Instancia tecnica</span>
                        <strong>{temporary?.instanceKey || "-"}</strong>
                      </article>
                      <article className={styles.fact}>
                        <span>Pairing code</span>
                        <strong>{temporary?.pairingCode || "-"}</strong>
                      </article>
                      <article className={styles.fact}>
                        <span>Conectado em</span>
                        <strong>{formatWhatsAppDateTime(temporary?.connectedAt)}</strong>
                      </article>
                      <article className={styles.fact}>
                        <span>Provedor QR</span>
                        <strong>{temporary?.provider || "Nao configurado"}</strong>
                      </article>
                      <article className={styles.fact}>
                        <span>Configuracao</span>
                        <strong>{temporary?.available ? "Pronta" : "Pendente"}</strong>
                      </article>
                    </div>

                    {temporary?.errorMessage ? <div className={styles.alert}>{temporary.errorMessage}</div> : null}

                    {temporary?.qrCodeDataUrl ? (
                      <div className={styles.qrPanel}>
                        <div className={styles.qrMeta}>
                          <strong>QR pronto para leitura</strong>
                          <p>
                            Abra o WhatsApp no celular, entre em aparelhos conectados e leia o QR para concluir o vinculo rapido sem sair da topbar.
                          </p>
                          <p>Pairing code: {temporary.pairingCode || "-"}</p>
                        </div>
                        <div className={styles.qrImageWrap}>
                          <img
                            src={temporary.qrCodeDataUrl}
                            alt="QR Code para conectar o WhatsApp temporario"
                            className={styles.qrImage}
                          />
                        </div>
                      </div>
                    ) : null}

                    <div className={styles.actions}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => onChooseMode("TEMPORARY")}
                        disabled={busyAction !== null}
                      >
                        {busyAction === "TEMPORARY" ? "Salvando..." : "Usar trilho rapido"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={onStartTemporaryConnection}
                        disabled={busyAction !== null || !temporary?.available}
                      >
                        {!temporary?.available
                          ? "Provider QR indisponivel"
                          : busyAction === "temporary-connect"
                            ? "Gerando QR..."
                            : temporary?.liveStatus === "connected"
                              ? "Atualizar status por QR"
                              : "Conectar por QR"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={onRefreshTemporary}
                        disabled={busyAction !== null || !temporary?.available}
                      >
                        Atualizar leitura
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={onDisconnectTemporaryConnection}
                        disabled={busyAction !== null || (!temporary?.instanceKey && temporary?.liveStatus !== "connected")}
                      >
                        {busyAction === "temporary-disconnect" ? "Desconectando..." : "Desconectar temporario"}
                      </button>
                    </div>
                  </section>
                </div>

                <div className={styles.sideColumn}>
                  <section className={styles.section} data-active={focus === "official"}>
                    <div className={styles.sectionHeader}>
                      <strong>Meta oficial</strong>
                      <p>
                        O topo deixa claro se a credencial oficial existe, se ja esta operando e se a origem do token e MASTER ou empresa.
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
                        {busyAction === "OFFICIAL" ? "Salvando..." : "Usar rota oficial"}
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
                      <strong>Proximos passos sugeridos</strong>
                      <p>O clique no topo precisa virar decisao rapida, nao so navegacao.</p>
                    </div>
                    <ul className={styles.list}>
                      <li>Se o objetivo e provar uso agora, deixe o trilho rapido selecionado e gere o QR.</li>
                      <li>Se a conta vai operar com previsibilidade e automacoes, selecione a rota oficial e registre o aceite tecnico.</li>
                      <li>Quando a barra mostrar atencao ou falha, abra a central completa para investigar historico e contexto adicional.</li>
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
    </div>
  );
}
