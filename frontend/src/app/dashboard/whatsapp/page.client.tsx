"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "../_lib/api";
import { useRequireAuth } from "../_lib/useRequireAuth";
import {
  getWhatsAppModalPlanRedirect,
  type WhatsAppModalPayload,
  type WhatsAppCenterPayload,
} from "@/lib/whatsapp-center";
import WhatsAppConnectionWizard from "./_components/WhatsAppConnectionWizard";
import styles from "./page.module.css";

type WhatsAppBootstrapPayload = {
  success: boolean;
  connected: boolean;
  bootstrapOk: boolean;
  syncedContacts: number;
  syncedConversations: number;
  engine: string | null;
  message: string;
  error?: string | null;
};

type QrBootstrapStage = "idle" | "connecting" | "mirroring" | "ready" | "error";

export default function WhatsAppCenterClientPage() {
  const hasToken = useRequireAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [modalLoading, setModalLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [modalSaving, setModalSaving] = useState<string | null>(null);
  const [payload, setPayload] = useState<WhatsAppCenterPayload | null>(null);
  const [modalPayload, setModalPayload] = useState<WhatsAppModalPayload | null>(null);
  const [modalQrRequested, setModalQrRequested] = useState(false);
  const [qrBootstrapStage, setQrBootstrapStage] = useState<QrBootstrapStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const bootstrapInFlightRef = useRef(false);
  const lastBootstrapAttemptKeyRef = useRef<string | null>(null);

  function shouldLoadModalQr(nextPayload: WhatsAppModalPayload | null, includeQr: boolean) {
    if (!includeQr || !nextPayload?.data.available) return false;
    return nextPayload.status !== "connected";
  }

  function mergeModalPayload(
    statusPayload: WhatsAppModalPayload,
    qrPayload: WhatsAppModalPayload,
  ): WhatsAppModalPayload {
    if (qrPayload.data.qrCodeDataUrl || qrPayload.status === "connected") {
      return {
        ...qrPayload,
        data: {
          ...statusPayload.data,
          ...qrPayload.data,
        },
      };
    }

    return {
      ...statusPayload,
      data: {
        ...statusPayload.data,
        updatedAt: qrPayload.data.updatedAt || statusPayload.data.updatedAt,
        lastError: qrPayload.data.lastError || statusPayload.data.lastError,
        qrCodeDataUrl: qrPayload.data.qrCodeDataUrl || null,
      },
    };
  }

  const buildBootstrapKey = useCallback((nextPayload: WhatsAppModalPayload) => {
    return [
      nextPayload.data.companyId,
      nextPayload.data.tenantKey,
      nextPayload.data.connectedAt || nextPayload.data.phone || "connected",
    ].join(":");
  }, []);

  const loadCenter = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<WhatsAppCenterPayload>("/companies/me/whatsapp-center");
      setPayload(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar a central WhatsApp.");
    } finally {
      if (!background) setLoading(false);
    }
  }, []);

  const runBootstrapAfterConnect = useCallback(async (connectedPayload: WhatsAppModalPayload) => {
    const bootstrapKey = buildBootstrapKey(connectedPayload);
    if (
      bootstrapInFlightRef.current
      || lastBootstrapAttemptKeyRef.current === bootstrapKey
      || connectedPayload.status !== "connected"
    ) {
      return;
    }

    bootstrapInFlightRef.current = true;
    lastBootstrapAttemptKeyRef.current = bootstrapKey;
    setQrBootstrapStage("mirroring");
    setMessage("Espelhando conversas e clientes...");
    setModalError(null);

    try {
      const bootstrap = await apiFetch<WhatsAppBootstrapPayload>("/companies/me/whatsapp-modal/bootstrap", {
        method: "POST",
      });
      if (!bootstrap.success || !bootstrap.connected || !bootstrap.bootstrapOk) {
        throw new Error(bootstrap.error || bootstrap.message || "Falha ao executar bootstrap local do WhatsApp.");
      }
      setQrBootstrapStage("ready");
      setMessage("Pronto");
      void loadCenter(true);
    } catch (bootstrapError) {
      const detail = bootstrapError instanceof Error ? bootstrapError.message : "";
      setQrBootstrapStage("error");
      setMessage(null);
      setModalError(
        detail
          ? `WhatsApp conectou, mas falhou ao espelhar conversas/clientes. ${detail}`
          : "WhatsApp conectou, mas falhou ao espelhar conversas/clientes.",
      );
    } finally {
      bootstrapInFlightRef.current = false;
    }
  }, [buildBootstrapKey, loadCenter]);

  const waitForModalQrCode = useCallback(async (statusPayload: WhatsAppModalPayload) => {
    let latestPayload = statusPayload;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const qrData = await apiFetch<WhatsAppModalPayload>("/companies/me/whatsapp-modal/qr");
      latestPayload = mergeModalPayload(latestPayload, qrData);
      setModalPayload(latestPayload);
      if (latestPayload.data.qrCodeDataUrl || latestPayload.status === "connected") {
        return latestPayload;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
    }

    return latestPayload;
  }, []);

  const loadModalStatus = useCallback(async (background = false, includeQr = false) => {
    if (!background) setModalLoading(true);
    if (!background) setModalError(null);
    try {
      const statusData = await apiFetch<WhatsAppModalPayload>("/companies/me/whatsapp-modal/status");
      let nextPayload = statusData;

      if (shouldLoadModalQr(statusData, includeQr)) {
        const qrData = await apiFetch<WhatsAppModalPayload>("/companies/me/whatsapp-modal/qr");
        nextPayload = mergeModalPayload(statusData, qrData);
      } else {
        nextPayload = {
          ...statusData,
          data: {
            ...statusData.data,
            qrCodeDataUrl: statusData.data.qrCodeDataUrl || null,
          },
        };
      }

      setModalPayload(nextPayload);
      const planRedirect = getWhatsAppModalPlanRedirect(nextPayload);
      if (planRedirect) {
        router.push(planRedirect);
        return;
      }
    } catch (loadError) {
      setModalError(loadError instanceof Error ? loadError.message : "Falha ao carregar a conexão rápida por QR.");
    } finally {
      if (!background) setModalLoading(false);
    }
  }, [router]);

  async function ensureQrModeSelected() {
    if (payload?.center.mode === "QR") {
      return payload;
    }

    const next = await apiFetch<WhatsAppCenterPayload>("/companies/me/whatsapp-center", {
      method: "PATCH",
      body: JSON.stringify({ mode: "QR" }),
    });
    setPayload(next);
    return next;
  }

  async function runModalAction(action: "connect" | "disconnect") {
    setModalSaving(action);
    setModalError(null);
    try {
      const requestQrOnly =
        action === "connect"
        && modalPayload?.status === "waiting_qr"
        && !modalPayload.data.qrCodeDataUrl;

      if (action === "connect") {
        setModalQrRequested(true);
        setQrBootstrapStage("connecting");
        setMessage(requestQrOnly ? "Atualizando o QR..." : "Conectando ao motor...");
        if (!requestQrOnly) {
          await ensureQrModeSelected();
        }
      } else {
        setModalQrRequested(false);
        setQrBootstrapStage("idle");
        bootstrapInFlightRef.current = false;
        lastBootstrapAttemptKeyRef.current = null;
        setMessage("Encerrando a sessão no motor...");
      }

      const response = action === "connect" && requestQrOnly
        ? await apiFetch<WhatsAppModalPayload>("/companies/me/whatsapp-modal/qr")
        : await apiFetch<WhatsAppModalPayload>(
            `/companies/me/whatsapp-modal/${action === "connect" ? "start" : "disconnect"}`,
            {
              method: "POST",
            },
          );
      let nextPayload = response;

      if (action === "connect" && shouldLoadModalQr(response, true) && !response.data.qrCodeDataUrl) {
        setMessage("Motor respondeu. Solicitando o QR code...");
        nextPayload = await waitForModalQrCode(response);
      }

      setModalPayload(nextPayload);
      const planRedirect = getWhatsAppModalPlanRedirect(nextPayload);
      if (planRedirect) {
        setModalError(nextPayload.message);
        router.push(planRedirect);
        return;
      }
      void loadCenter(true);
      if (!response.success) {
        setQrBootstrapStage(action === "connect" ? "error" : "idle");
        setMessage(null);
        setModalError(response.message || (action === "connect" ? "Falha ao conectar por QR." : "Falha ao desconectar o QR."));
        return;
      }
      if (response.success) {
        if (action === "connect") {
          if (nextPayload.status === "connected") {
            setQrBootstrapStage("mirroring");
            setMessage("Espelhando conversas e clientes...");
          } else {
            setQrBootstrapStage("idle");
            setMessage(
              nextPayload.data.qrCodeDataUrl
                ? "QR pronto para leitura."
                : "Motor respondeu. Ainda aguardando o QR code.",
            );
          }
        } else {
          setMessage("WhatsApp desconectado.");
        }
      }
    } catch (actionError) {
      if (action === "connect") {
        setModalQrRequested(false);
        setQrBootstrapStage("error");
      }
      setModalError(
        actionError instanceof Error
          ? actionError.message
          : action === "connect"
            ? "Falha ao conectar por QR."
            : "Falha ao desconectar o QR."
      );
    } finally {
      setModalSaving(null);
    }
  }

  useEffect(() => {
    if (hasToken !== true) return;
    void loadCenter();
    void loadModalStatus(false, false);
  }, [hasToken, loadCenter, loadModalStatus]);

  useEffect(() => {
    if (!message) return;
    if (qrBootstrapStage === "connecting" || qrBootstrapStage === "mirroring") return;
    const timer = window.setTimeout(() => setMessage(null), 2800);
    return () => window.clearTimeout(timer);
  }, [message, qrBootstrapStage]);

  useEffect(() => {
    if (!modalPayload?.data.available) return;
    if (modalPayload.status === "connected") {
      void runBootstrapAfterConnect(modalPayload);
      return;
    }
    if (modalPayload.status === "offline" || modalPayload.status === "disconnected") {
      setQrBootstrapStage("idle");
      bootstrapInFlightRef.current = false;
      lastBootstrapAttemptKeyRef.current = null;
    }
  }, [modalPayload, runBootstrapAfterConnect]);

  useEffect(() => {
    if (!modalPayload?.data.available) return;

    const interval = window.setInterval(() => {
      void loadModalStatus(
        true,
        modalQrRequested && modalPayload.status !== "connected",
      );
    }, modalPayload.status === "connected" ? 20000 : 7000);

    return () => window.clearInterval(interval);
  }, [modalPayload?.data.available, modalPayload?.status, loadModalStatus, modalQrRequested]);

  async function chooseMode(mode: "QR" | "OFFICIAL") {
    setSaving(mode);
    setError(null);
    try {
      const next = await apiFetch<WhatsAppCenterPayload>("/companies/me/whatsapp-center", {
        method: "PATCH",
        body: JSON.stringify({ mode }),
      });
      setPayload(next);
      setMessage(
        mode === "QR"
          ? "Conexão rápida por QR selecionada para ativação inicial."
          : "Meta oficial selecionada para esta empresa.",
      );
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao atualizar o modo de vínculo.");
    } finally {
      setSaving(null);
    }
  }

  async function requestMigration(source: string) {
    setSaving("migration");
    setError(null);
    try {
      const next = await apiFetch<WhatsAppCenterPayload>("/companies/me/whatsapp-center/migration-interest", {
        method: "POST",
        body: JSON.stringify({ source }),
      });
      setPayload(next);
      setMessage("Aceite registrado. O MASTER já consegue visualizar o interesse desta empresa.");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao registrar o interesse.");
    } finally {
      setSaving(null);
    }
  }

  const qrBootstrapBusy = qrBootstrapStage === "connecting" || qrBootstrapStage === "mirroring";

  const qrOperationalError = useMemo(() => {
    if (!modalPayload) return null;
    if (modalPayload.status === "connected") return null;
    if (modalError) return modalError;
    if (modalPayload.data.missingConfigKeys.length > 0 && !modalPayload.data.available) {
      return `Configuração pendente: ${modalPayload.data.missingConfigKeys.join(", ")}.`;
    }
    if (!modalPayload.success && modalPayload.status === "error") {
      return modalPayload.message;
    }
    if (modalPayload.status === "error") return modalPayload.data.lastError || modalPayload.message || null;
    if (!modalPayload.data.qrCodeDataUrl) return modalPayload.data.lastError || null;
    return null;
  }, [modalError, modalPayload]);

  if (hasToken === null) {
    return (
      <DashboardScaffold title="Central WhatsApp" description="Carregando central de vínculo.">
        <section className={styles.loadingCard}>Carregando...</section>
      </DashboardScaffold>
    );
  }

  if (!hasToken) return null;

  return (
    <DashboardScaffold title="" description="" hideHeader={true}>
      <div className={styles.page}>
        {error ? <section className={styles.errorCard}>{error}</section> : null}

        {loading || !payload ? (
          <section className={styles.loadingCard}>Carregando central...</section>
        ) : (
          <WhatsAppConnectionWizard
            payload={payload}
            modalPayload={modalPayload}
            loading={loading || modalLoading}
            saving={saving}
            modalSaving={modalSaving}
            qrBusy={qrBootstrapBusy}
            qrMessage={message}
            qrError={qrOperationalError}
            onChooseMode={(mode) => void chooseMode(mode)}
            onConnectQr={() => void runModalAction("connect")}
            onRequestMeta={() => void requestMigration("central_whatsapp")}
          />
        )}
      </div>
    </DashboardScaffold>
  );
}
