"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { WhatsAppCenterPayload, WhatsAppModalPayload } from "@/lib/whatsapp-center";
import styles from "./WhatsAppConnectionWizard.module.css";

type ConnectionMode = "QR" | "OFFICIAL";

type Props = {
  payload: WhatsAppCenterPayload;
  modalPayload: WhatsAppModalPayload | null;
  loading?: boolean;
  saving: string | null;
  modalSaving: string | null;
  qrBusy: boolean;
  qrMessage?: string | null;
  qrError?: string | null;
  onChooseMode: (mode: ConnectionMode) => void;
  onConnectQr: () => void;
  onRequestMeta: () => void;
};

function isQrReady(modalPayload: WhatsAppModalPayload | null) {
  return modalPayload?.status === "connected";
}

function isMetaReady(payload: WhatsAppCenterPayload) {
  return Boolean(payload.center.official.connected);
}

function statusGlyph(active: boolean, ready: boolean) {
  if (ready) return "OK";
  return active ? "ON" : "--";
}

export default function WhatsAppConnectionWizard({
  payload,
  modalPayload,
  loading = false,
  saving,
  modalSaving,
  qrBusy,
  qrMessage,
  qrError,
  onChooseMode,
  onConnectQr,
  onRequestMeta,
}: Props) {
  const [qrPanelClosed, setQrPanelClosed] = useState(false);
  const mode = payload.center.mode;
  const qrSelected = mode === "QR";
  const metaSelected = mode === "OFFICIAL";
  const qrReady = isQrReady(modalPayload);
  const metaReady = isMetaReady(payload);
  const qrCode = modalPayload?.data.qrCodeDataUrl || null;
  const canUseQr = modalPayload?.data.available !== false;
  const canUseMeta = true;
  const showQrLoader = !qrReady && (qrBusy || modalSaving === "connect" || modalPayload?.status === "starting");
  const qrBotReady = qrReady && !showQrLoader && !qrError;
  const canGoBot = qrBotReady || metaReady;

  const chooseQr = () => {
    setQrPanelClosed(false);
    onChooseMode("QR");
  };

  const chooseMeta = () => {
    setQrPanelClosed(false);
    onChooseMode("OFFICIAL");
  };

  const connectQr = () => {
    setQrPanelClosed(false);
    onConnectQr();
  };

  return (
    <section className={styles.stage} aria-busy={loading || showQrLoader}>
      <div className={styles.orbit} aria-hidden="true" />
      <div className={styles.header}>
        <div className={styles.mark}>HBX</div>
        <div className={styles.dots} aria-hidden="true">
          <span data-active="true" />
          <span data-active={qrSelected || metaSelected ? "true" : "false"} />
          <span data-active={canGoBot ? "true" : "false"} />
        </div>
      </div>

      <div className={styles.connectionGrid}>
        <button
          type="button"
          className={styles.connectionCard}
          data-active={qrSelected}
          data-locked={!canUseQr}
          disabled={!canUseQr || saving !== null}
          onClick={chooseQr}
          aria-label="QR Code"
        >
          <span className={styles.cardHalo} aria-hidden="true" />
          <strong>QRCODE</strong>
          <span className={styles.cardIcon}>{statusGlyph(qrSelected, qrReady)}</span>
        </button>

        <button
          type="button"
          className={styles.connectionCard}
          data-active={metaSelected}
          data-locked={!canUseMeta}
          disabled={!canUseMeta || saving !== null}
          onClick={chooseMeta}
          aria-label="Meta"
        >
          <span className={styles.cardHalo} aria-hidden="true" />
          <strong>META</strong>
          <span className={styles.cardIcon}>{statusGlyph(metaSelected, metaReady)}</span>
        </button>
      </div>

      {qrSelected && !qrPanelClosed ? (
        <div className={styles.actionDeck} data-state={qrReady ? "ready" : showQrLoader ? "loading" : "idle"}>
          <div className={styles.qrShell}>
            {showQrLoader ? (
              <div className={styles.premiumLoader} aria-label="Carregando QR Code">
                <span />
                <i />
                <b />
              </div>
            ) : qrReady ? (
              <div className={styles.connectedPanel}>
                <span aria-hidden="true" />
                <strong>Conectado</strong>
              </div>
            ) : qrCode ? (
              <div className={styles.qrFrame}>
                <Image
                  src={qrCode}
                  alt="QR Code"
                  width={232}
                  height={232}
                  className={styles.qrImage}
                  unoptimized
                />
              </div>
            ) : (
              <button
                type="button"
                className={styles.bigAction}
                onClick={connectQr}
                disabled={!canUseQr || modalSaving !== null}
                aria-label="Gerar QR Code"
              >
                QRCODE
              </button>
            )}
          </div>

          <div className={styles.actionRow}>
            {!qrBotReady ? (
              <button
                type="button"
                className={styles.primaryAction}
                onClick={connectQr}
                disabled={!canUseQr || modalSaving !== null || showQrLoader || qrReady}
              >
                {qrReady ? "Bot" : qrCode ? "ATUALIZAR" : "GERAR"}
              </button>
            ) : (
              <Link className={styles.primaryAction} href="/vendas/automacao?tab=flow">
                Bot
              </Link>
            )}

            <button
              type="button"
              className={styles.secondaryAction}
              onClick={() => setQrPanelClosed(true)}
              disabled={modalSaving !== null}
            >
              FECHAR
            </button>
          </div>

          {(qrMessage || qrError) ? (
            <div className={styles.signal} data-error={Boolean(qrError)}>
              {qrError || qrMessage}
            </div>
          ) : null}
        </div>
      ) : null}

      {metaSelected ? (
        <div className={styles.actionDeck} data-state={metaReady ? "ready" : "idle"}>
          <div className={styles.metaMonolith}>
            <span aria-hidden="true" />
            <strong>META</strong>
          </div>
          <div className={styles.actionRow}>
            {metaReady ? (
              <Link className={styles.primaryAction} href="/vendas/automacao?tab=flow">
                Bot
              </Link>
            ) : (
              <button
                type="button"
                className={styles.primaryAction}
                onClick={onRequestMeta}
                disabled={saving !== null || payload.center.migration.interestRequested}
              >
                {payload.center.migration.interestRequested ? "OK" : "ATIVAR"}
              </button>
            )}
          </div>
        </div>
      ) : null}

      {!qrSelected && !metaSelected ? (
        <div className={styles.emptyPulse} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      ) : null}
    </section>
  );
}
