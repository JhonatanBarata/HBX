"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "../_lib/api";
import { useRequireAuth } from "../_lib/useRequireAuth";
import {
  formatWhatsAppDateTime,
  type WhatsAppModalPayload,
  type WhatsAppCenterPayload,
  whatsappModalStatusLabel,
  whatsappModeLabel,
  whatsappQrConnectionLiveLabel,
  whatsappTrialModuleLabel,
} from "@/lib/whatsapp-center";
import styles from "./page.module.css";

export default function WhatsAppCenterClientPage() {
  const hasToken = useRequireAuth();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [modalLoading, setModalLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [modalSaving, setModalSaving] = useState<string | null>(null);
  const [payload, setPayload] = useState<WhatsAppCenterPayload | null>(null);
  const [modalPayload, setModalPayload] = useState<WhatsAppModalPayload | null>(null);
  const [modalQrRequested, setModalQrRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function shouldLoadModalQr(nextPayload: WhatsAppModalPayload | null, includeQr: boolean) {
    if (!includeQr || !nextPayload?.data.available) return false;
    return nextPayload.status === "waiting_qr" || nextPayload.status === "starting";
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

  const loadModalStatus = useCallback(async (background = false, includeQr = false) => {
    if (!background) setModalLoading(true);
    setModalError(null);
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
            qrCodeDataUrl: null,
          },
        };
      }

      setModalPayload(nextPayload);
    } catch (loadError) {
      setModalError(loadError instanceof Error ? loadError.message : "Falha ao carregar a conexão rápida por QR.");
    } finally {
      if (!background) setModalLoading(false);
    }
  }, []);

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
      if (action === "connect") {
        setModalQrRequested(true);
        await ensureQrModeSelected();
      } else {
        setModalQrRequested(false);
      }

      const endpoint = action === "connect" ? "start" : "disconnect";
      const response = await apiFetch<WhatsAppModalPayload>(`/companies/me/whatsapp-modal/${endpoint}`, {
        method: "POST",
      });
      let nextPayload = response;

      if (action === "connect" && shouldLoadModalQr(response, true) && !response.data.qrCodeDataUrl) {
        const qrData = await apiFetch<WhatsAppModalPayload>("/companies/me/whatsapp-modal/qr");
        nextPayload = mergeModalPayload(response, qrData);
      }

      setModalPayload(nextPayload);
      void loadCenter(true);
      if (response.success) {
        setMessage(
          action === "connect"
            ? nextPayload.data.qrCodeDataUrl
              ? "QR pronto para leitura."
              : nextPayload.status === "connected"
                ? "WhatsApp conectado."
                : "Conexão iniciada."
            : "WhatsApp desconectado."
        );
      }
    } catch (actionError) {
      if (action === "connect") {
        setModalQrRequested(false);
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
    const timer = window.setTimeout(() => setMessage(null), 2800);
    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!modalPayload?.data.available) return;

    const interval = window.setInterval(() => {
      void loadModalStatus(
        true,
        modalQrRequested && (modalPayload.status === "waiting_qr" || modalPayload.status === "starting"),
      );
    }, modalPayload.status === "connected" ? 20000 : 7000);

    return () => window.clearInterval(interval);
  }, [modalPayload?.data.available, modalPayload?.status, loadModalStatus, modalQrRequested]);

  useEffect(() => {
    if (!payload || typeof window === "undefined") return;
    const focus = String(searchParams.get("focus") || "").trim().toLowerCase();
    const normalizedFocus = focus === "temporary" ? "qr" : focus;
    const focusTargetByKey: Record<string, string> = {
      qr: "whatsapp-qr",
      official: "whatsapp-official",
      status: "whatsapp-status",
      next: "whatsapp-next-steps",
    };
    const targetId = focusTargetByKey[normalizedFocus];
    if (!targetId) return;
    const target = document.getElementById(targetId);
    if (!target) return;

    const topbarOffset = Number.parseInt(
      window.getComputedStyle(document.documentElement).getPropertyValue("--topbar-total-height"),
      10,
    );
    const nextTop = target.getBoundingClientRect().top + window.scrollY - (Number.isFinite(topbarOffset) ? topbarOffset + 16 : 92);
    window.scrollTo({ top: Math.max(0, nextTop), behavior: "smooth" });
  }, [payload, searchParams]);

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

  const currentSummary = useMemo(() => {
    if (!payload) return [];
    return [
      { label: "Status atual", value: payload.center.statusLabel, note: payload.center.statusHint },
      { label: "Modo escolhido", value: whatsappModeLabel(payload.center.mode), note: "Escolha objetiva entre conexão rápida por QR e Meta oficial." },
      {
        label: "Módulo inicial",
        value: whatsappTrialModuleLabel(payload.company.trialModuleSelection),
        note: "O WhatsApp precisa servir a rotina principal da empresa.",
      },
    ];
  }, [payload]);

  const qrConnectionStatusLabel = useMemo(() => {
    if (modalPayload) {
      if (modalPayload.status === "waiting_qr") return "QR aguardando leitura";
      if (modalPayload.status === "connected") return "Conectado por QR";
      if (modalPayload.status === "starting") return "Iniciando";
      if (modalPayload.status === "error") return "Atencao tecnica";
      if (modalPayload.status === "disconnected") return "Desconectado";
    }
    return whatsappQrConnectionLiveLabel(payload?.center.qrConnection.liveStatus);
  }, [modalPayload, payload?.center.qrConnection.liveStatus]);

  const qrConnectionNote = useMemo(() => {
    if (!modalPayload) {
      return "Clique em Conectar para iniciar a sessão QR no modal WhatsApp do HBX.";
    }
    if (!modalPayload.data.available) {
      return "Configure o modal WhatsApp do HBX neste ambiente para habilitar a conexão rápida por QR.";
    }
    if (modalPayload.status === "connected") {
      return "WhatsApp conectado pelo trilho rápido por QR.";
    }
    if (modalPayload.data.qrCodeDataUrl) {
      return "QR pronto. Abra o WhatsApp no celular e faça a leitura.";
    }
    if (modalPayload.status === "starting") {
      return "Sessão iniciada. Aguarde alguns segundos até o QR ficar pronto.";
    }
    if (modalPayload.status === "waiting_qr") {
      return "Conexão iniciada. Atualize novamente se o QR ainda não apareceu.";
    }
    return "Clique em Conectar para gerar um novo QR.";
  }, [modalPayload]);

  const qrOperationalError = useMemo(() => {
    if (modalError) return modalError;
    if (!modalPayload) return null;
    if (modalPayload.data.missingConfigKeys.length > 0 && !modalPayload.data.available) {
      return `Configuração pendente: ${modalPayload.data.missingConfigKeys.join(", ")}.`;
    }
    if (!modalPayload.success && modalPayload.status === "error") {
      return modalPayload.message;
    }
    return modalPayload.data.lastError || null;
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
    <DashboardScaffold
      title="Central WhatsApp"
      description="Escolha o trilho, conecte o canal e deixe a Meta como rota premium para operação oficial."
    >
      <div className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>Ativação comercial</span>
            <h1 className={styles.heroTitle}>Escolha o trilho do WhatsApp e conecte sem ruído.</h1>
            <p className={styles.heroText}>
              Esta tela agora fala a linguagem da trindade: conexão rápida por QR para ativação inicial e Meta oficial como trilho premium e institucional.
            </p>
          </div>

          <aside className={styles.heroPanel} data-tone={payload?.center.status || "NOT_CONNECTED"}>
            <span className={styles.statusPill}>{payload?.center.statusLabel || "Não conectado"}</span>
            <strong className={styles.heroValue}>{payload?.company.name || "Empresa"}</strong>
            <p className={styles.heroHint}>{payload?.center.statusHint || "Escolha o caminho ideal para começar."}</p>
            <div className={styles.heroMeta}>
              <span>{payload?.center.official.displayNumber || "Sem número oficial"}</span>
              <span>{whatsappModeLabel(payload?.center.mode)}</span>
            </div>
          </aside>
        </section>

        {error ? <section className={styles.errorCard}>{error}</section> : null}
        {message ? <section className={styles.successCard}>{message}</section> : null}

        {loading || !payload ? (
          <section className={styles.loadingCard}>Carregando central...</section>
        ) : (
          <>
            <section className={styles.metricsGrid}>
              {currentSummary.map((item) => (
                <article key={item.label} className={styles.metricCard}>
                  <span className={styles.metricLabel}>{item.label}</span>
                  <strong className={styles.metricValue}>{item.value}</strong>
                  <p className={styles.metricNote}>{item.note}</p>
                </article>
              ))}
            </section>

            <section className={styles.pathGrid}>
              <article id="whatsapp-qr" className={styles.pathCard} data-active={payload.center.mode === "QR"}>
                <div className={styles.pathHeader}>
                  <div>
                    <span className={styles.pathEyebrow}>Conexão rápida por QR</span>
                    <h2>Ligue a operação em minutos, sem travar a ativação.</h2>
                  </div>
                  <span className={styles.mutedPill}>
                    {payload.center.qrConnection.selected ? "Selecionada" : "Disponível para escolha"}
                  </span>
                </div>
                <p className={styles.pathText}>
                  Clique em Conectar para gerar o QR e leia no celular.
                </p>
                <div className={styles.metaBox}>
                  <strong>{qrConnectionStatusLabel}</strong>
                  <p>{qrConnectionNote}</p>
                </div>
                <div className={styles.infoGrid}>
                  <div>
                    <span>Estado da conexão</span>
                    <strong>{qrConnectionStatusLabel}</strong>
                  </div>
                  <div>
                    <span>Número conectado</span>
                    <strong>{modalPayload?.data.phone || "-"}</strong>
                  </div>
                  <div>
                    <span>Última atualização</span>
                    <strong>{formatWhatsAppDateTime(modalPayload?.data.updatedAt || payload.center.qrConnection.lastSyncAt)}</strong>
                  </div>
                </div>
                {qrOperationalError ? (
                  <div className={styles.errorInline}>
                    <strong>Atenção</strong>
                    <p>{qrOperationalError}</p>
                  </div>
                ) : null}
                {modalPayload?.data.qrCodeDataUrl ? (
                  <div className={styles.qrPanel}>
                    <div className={styles.qrPanelCopy}>
                      <strong>QR pronto</strong>
                      <p>Abra o WhatsApp no celular e leia o QR.</p>
                      <div className={styles.summaryStack}>
                        <p>Pairing code: -</p>
                        <p>Tenant técnico: {modalPayload?.data.tenantKey || "-"}</p>
                      </div>
                    </div>
                    <div className={styles.qrFrame}>
                      <Image
                        src={modalPayload.data.qrCodeDataUrl}
                        alt="QR Code para conexão rápida por QR"
                        className={styles.qrImage}
                        width={208}
                        height={208}
                        unoptimized
                      />
                    </div>
                  </div>
                ) : null}
                <div className={styles.pathActions}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void runModalAction("connect")}
                    disabled={
                      modalSaving !== null
                      || !modalPayload?.data.available
                      || modalPayload.status === "connected"
                      || modalPayload.status === "waiting_qr"
                      || modalPayload.status === "starting"
                    }
                  >
                    {modalSaving === "connect" ? "Conectando..." : "Conectar"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => void runModalAction("disconnect")}
                    disabled={
                      modalSaving !== null
                      || !modalPayload?.data.available
                      || (
                        modalPayload.status !== "connected"
                        && modalPayload.status !== "waiting_qr"
                        && modalPayload.status !== "starting"
                      )
                    }
                  >
                    {modalSaving === "disconnect" ? "Desconectando..." : "Desconectar"}
                  </button>
                </div>
              </article>

              <article id="whatsapp-official" className={styles.pathCardStrong} data-active={payload.center.mode === "OFFICIAL"}>
                <div className={styles.pathHeader}>
                  <div>
                    <span className={styles.pathEyebrow}>Meta oficial</span>
                    <h2>Estruture a operação premium com estabilidade.</h2>
                  </div>
                  <span className={styles.statusPill}>
                    {payload.center.official.connected ? "Meta ativa" : "Estrutura oficial"}
                  </span>
                </div>
                <p className={styles.pathText}>
                  Use quando a empresa precisa de previsibilidade, automações, governança e uma rota oficial pronta para crescer.
                </p>
                <div className={styles.infoGrid}>
                  <div>
                    <span>Status Meta</span>
                    <strong>{payload.center.official.connected ? "Conectado" : payload.center.official.status || "Pendente"}</strong>
                  </div>
                  <div>
                    <span>Número exibido</span>
                    <strong>{payload.center.official.displayNumber || "-"}</strong>
                  </div>
                  <div>
                    <span>Origem da credencial</span>
                    <strong>{payload.center.official.usingMasterToken ? "MASTER" : "Empresa"}</strong>
                  </div>
                </div>
                <div className={styles.pathActions}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void chooseMode("OFFICIAL")}
                    disabled={saving !== null}
                  >
                    {saving === "OFFICIAL" ? "Salvando..." : "Usar Meta oficial"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => void requestMigration("central_whatsapp")}
                    disabled={saving !== null || payload.center.migration.interestRequested}
                  >
                    {payload.center.migration.interestRequested
                      ? "Técnico já acionado"
                      : saving === "migration"
                        ? "Registrando..."
                        : "Aceito que um técnico entre em contato"}
                  </button>
                </div>
              </article>
            </section>

            <section id="whatsapp-next-steps" className={styles.panelCard}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.pathEyebrow}>Leitura estratégica</span>
                  <h2>Qual é o próximo passo certo para esta empresa?</h2>
                </div>
                <span className={styles.mutedPill}>
                  {modalLoading ? "Lendo conexão" : modalPayload ? whatsappModalStatusLabel(modalPayload.status) : "Sem leitura"}
                </span>
              </div>
              <p className={styles.helperText}>
                QR liga o cliente rápido. Meta protege a operação premium e os fluxos mais críticos.
              </p>
              <div className={styles.summaryStack}>
                <p>Se a empresa está validando o produto, mantenha a conexão rápida por QR como trilho principal.</p>
                <p>Se a empresa vai amadurecer automações, cobrança ou governança, registre o interesse na Meta oficial.</p>
                <p>O motor do QR já está isolado no modal do HBX; a UI agora trata isso como produto, não como detalhe de runtime.</p>
              </div>
            </section>

            <section className={styles.pathActions}>
              <Link href={payload.company.trialModuleSelection === "recovery" ? "/dashboard/inbox?atendimentoTab=recovery" : "/dashboard/vendas"} className="btn btn-secondary">
                Voltar para {whatsappTrialModuleLabel(payload.company.trialModuleSelection)}
              </Link>
              <Link href="/dashboard/financeiro" className="btn btn-secondary">
                Abrir Financeiro
              </Link>
            </section>
          </>
        )}
      </div>
    </DashboardScaffold>
  );
}
