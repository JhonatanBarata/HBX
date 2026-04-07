"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  whatsappTemporaryLiveLabel,
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
  const [error, setError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [canManageModal, setCanManageModal] = useState<boolean | null>(null);

  function shouldLoadModalQr(nextPayload: WhatsAppModalPayload | null) {
    if (!nextPayload?.data.available) return false;
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

  async function loadCenter(background = false, refreshTemporary = false) {
    if (!background) setLoading(true);
    setError(null);
    try {
      const suffix = refreshTemporary ? "?refresh=true" : "";
      const data = await apiFetch<WhatsAppCenterPayload>(`/companies/me/whatsapp-center${suffix}`);
      setPayload(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar a central WhatsApp.");
    } finally {
      if (!background) setLoading(false);
    }
  }

  async function loadModalStatus(background = false) {
    if (!background) setModalLoading(true);
    setModalError(null);
    try {
      const statusData = await apiFetch<WhatsAppModalPayload>("/companies/me/whatsapp-modal/status");
      let nextPayload = statusData;

      if (shouldLoadModalQr(statusData)) {
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
      setModalError(loadError instanceof Error ? loadError.message : "Falha ao carregar o Modal WhatsApp.");
    } finally {
      if (!background) setModalLoading(false);
    }
  }

  async function runModalAction(action: "start" | "disconnect" | "restart") {
    setModalSaving(action);
    setModalError(null);
    try {
      const response = await apiFetch<WhatsAppModalPayload>(`/companies/me/whatsapp-modal/${action}`, {
        method: "POST",
      });
      let nextPayload = response;

      if (shouldLoadModalQr(response) && !response.data.qrCodeDataUrl) {
        const qrData = await apiFetch<WhatsAppModalPayload>("/companies/me/whatsapp-modal/qr");
        nextPayload = mergeModalPayload(response, qrData);
      }

      setModalPayload(nextPayload);
      if (response.success) {
        setMessage(response.message);
      }
    } catch (actionError) {
      setModalError(actionError instanceof Error ? actionError.message : "Falha ao executar a ação no Modal WhatsApp.");
    } finally {
      setModalSaving(null);
    }
  }

  async function loadModalAccess() {
    setModalLoading(true);
    try {
      const profile = await apiFetch<{ role?: string | null; isSystemMaster?: boolean }>("/profile/current-user");
      const allowed = Boolean(profile?.isSystemMaster) || String(profile?.role || "").trim().toUpperCase() === "ADMIN";
      setCanManageModal(allowed);

      if (allowed) {
        await loadModalStatus();
        return;
      }

      setModalPayload(null);
      setModalError(null);
    } catch (profileError) {
      setCanManageModal(false);
      setModalPayload(null);
      setModalError(profileError instanceof Error ? profileError.message : null);
    } finally {
      setModalLoading(false);
    }
  }

  useEffect(() => {
    if (hasToken !== true) return;
    void loadCenter();
    void loadModalAccess();
  }, [hasToken]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 2800);
    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!payload?.center.temporary.selected) return;
    const liveStatus = payload.center.temporary.liveStatus;
    if (liveStatus !== "qr_ready" && liveStatus !== "connected") return;

    const interval = window.setInterval(() => {
      void loadCenter(true, true);
    }, liveStatus === "connected" ? 20000 : 9000);

    return () => window.clearInterval(interval);
  }, [payload?.center.temporary.liveStatus, payload?.center.temporary.selected]);

  useEffect(() => {
    if (canManageModal !== true || !modalPayload?.data.available) return;

    const interval = window.setInterval(() => {
      void loadModalStatus(true);
    }, modalPayload.status === "connected" ? 20000 : 7000);

    return () => window.clearInterval(interval);
  }, [canManageModal, modalPayload?.data.available, modalPayload?.status]);

  useEffect(() => {
    if (!payload || typeof window === "undefined") return;
    const focus = String(searchParams.get("focus") || "").trim().toLowerCase();
    const focusTargetByKey: Record<string, string> = {
      temporary: "whatsapp-temporary",
      official: "whatsapp-official",
      status: "whatsapp-status",
      next: "whatsapp-next-steps",
    };
    const targetId = focusTargetByKey[focus];
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

  async function chooseMode(mode: "TEMPORARY" | "OFFICIAL") {
    setSaving(mode);
    setError(null);
    try {
      const next = await apiFetch<WhatsAppCenterPayload>("/companies/me/whatsapp-center", {
        method: "PATCH",
        body: JSON.stringify({ mode }),
      });
      setPayload(next);
      setMessage(
        mode === "TEMPORARY"
          ? "Trilha rápida selecionada para teste."
          : "Rota oficial pela Meta selecionada para esta empresa.",
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

  async function startTemporaryConnection() {
    setSaving("temporary-connect");
    setError(null);
    try {
      const next = await apiFetch<WhatsAppCenterPayload>("/companies/me/whatsapp-center/temporary/connect", {
        method: "POST",
      });
      setPayload(next);
      setMessage("QR gerado. Faça a leitura no WhatsApp para concluir o vínculo rápido.");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao iniciar o vínculo rápido por QR.");
    } finally {
      setSaving(null);
    }
  }

  async function disconnectTemporaryConnection() {
    setSaving("temporary-disconnect");
    setError(null);
    try {
      const next = await apiFetch<WhatsAppCenterPayload>("/companies/me/whatsapp-center/temporary/disconnect", {
        method: "POST",
      });
      setPayload(next);
      setMessage("Vínculo rápido desconectado.");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao desconectar o vínculo rápido.");
    } finally {
      setSaving(null);
    }
  }

  const currentSummary = useMemo(() => {
    if (!payload) return [];
    return [
      { label: "Status atual", value: payload.center.statusLabel, note: payload.center.statusHint },
      { label: "Modo escolhido", value: whatsappModeLabel(payload.center.mode), note: "Escolha objetiva entre trilho rapido e Meta oficial." },
      {
        label: "Módulo inicial",
        value: whatsappTrialModuleLabel(payload.company.trialModuleSelection),
        note: "O WhatsApp precisa servir a rotina principal da empresa.",
      },
    ];
  }, [payload]);

  const modalOperationalError = useMemo(() => {
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
      description="Escolha o trilho, conecte o canal e use a barra superior para diagnostico operacional sob demanda."
    >
      <div className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>Ativação comercial</span>
            <h1 className={styles.heroTitle}>Escolha o trilho do WhatsApp e conecte sem ruído.</h1>
            <p className={styles.heroText}>
              O detalhe operacional agora fica no topo. Aqui a tela fica focada em decidir entre QR rapido ou Meta oficial e executar a proxima ação.
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
              <article id="whatsapp-temporary" className={styles.pathCard} data-active={payload.center.mode === "TEMPORARY"}>
                <div className={styles.pathHeader}>
                  <div>
                    <span className={styles.pathEyebrow}>Conexão rápida / temporária</span>
                    <h2>Teste e valide sem travar a ativação.</h2>
                  </div>
                  <span className={styles.mutedPill}>
                    {payload.center.temporary.selected ? "Selecionada" : "Disponível para escolha"}
                  </span>
                </div>
                <p className={styles.pathText}>
                  Use quando a prioridade for colocar a operação em movimento e validar uso com o menor atrito possível.
                </p>
                <div className={styles.metaBox}>
                  <strong>{whatsappTemporaryLiveLabel(payload.center.temporary.liveStatus)}</strong>
                  <p>{payload.center.temporary.note}</p>
                </div>
                <div className={styles.infoGrid}>
                  <div>
                    <span>Estado do vínculo</span>
                    <strong>{whatsappTemporaryLiveLabel(payload.center.temporary.liveStatus)}</strong>
                  </div>
                  <div>
                    <span>Número temporário</span>
                    <strong>{payload.center.temporary.displayNumber || "-"}</strong>
                  </div>
                  <div>
                    <span>Última sincronização</span>
                    <strong>{formatWhatsAppDateTime(payload.center.temporary.lastSyncAt)}</strong>
                  </div>
                </div>
                {payload.center.temporary.errorMessage ? (
                  <div className={styles.errorInline}>
                    <strong>Atenção</strong>
                    <p>{payload.center.temporary.errorMessage}</p>
                  </div>
                ) : null}
                {payload.center.temporary.qrCodeDataUrl ? (
                  <div className={styles.qrPanel}>
                    <div className={styles.qrPanelCopy}>
                      <strong>Escaneie o QR com o WhatsApp</strong>
                      <p>
                        Abra o WhatsApp no celular, vá em aparelhos conectados e leia o QR abaixo para concluir o vínculo rápido.
                      </p>
                      <div className={styles.summaryStack}>
                        <p>Pairing code: {payload.center.temporary.pairingCode || "-"}</p>
                        <p>Instância técnica: {payload.center.temporary.instanceKey || "-"}</p>
                      </div>
                    </div>
                    <div className={styles.qrFrame}>
                      <img
                        src={payload.center.temporary.qrCodeDataUrl}
                        alt="QR Code para conectar o WhatsApp temporário"
                        className={styles.qrImage}
                      />
                    </div>
                  </div>
                ) : null}
                <div className={styles.pathActions}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void chooseMode("TEMPORARY")}
                    disabled={saving !== null}
                  >
                    {saving === "TEMPORARY" ? "Salvando..." : "Quero testar primeiro"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => void startTemporaryConnection()}
                    disabled={saving !== null || !payload.center.temporary.available}
                  >
                    {saving === "temporary-connect"
                      ? "Gerando QR..."
                      : payload.center.temporary.liveStatus === "connected"
                        ? "Atualizar status"
                        : "Conectar por QR"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => void loadCenter(true, true)}
                    disabled={saving !== null || !payload.center.temporary.available}
                  >
                    Atualizar leitura
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => void disconnectTemporaryConnection()}
                    disabled={
                      saving !== null
                      || (!payload.center.temporary.instanceKey && payload.center.temporary.liveStatus !== "connected")
                    }
                  >
                    {saving === "temporary-disconnect" ? "Desconectando..." : "Desconectar temporário"}
                  </button>
                </div>
              </article>

              <article id="whatsapp-official" className={styles.pathCardStrong} data-active={payload.center.mode === "OFFICIAL"}>
                <div className={styles.pathHeader}>
                  <div>
                    <span className={styles.pathEyebrow}>Conexão oficial / Meta</span>
                    <h2>Estruture a operação oficial com estabilidade.</h2>
                  </div>
                  <span className={styles.statusPill}>
                    {payload.center.official.connected ? "Oficial ativo" : "Estrutura oficial"}
                  </span>
                </div>
                <p className={styles.pathText}>
                  Use quando a empresa precisa de previsibilidade, automações e uma rota oficial pronta para crescer.
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
                    {saving === "OFFICIAL" ? "Salvando..." : "Quero a rota oficial"}
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

            <section id="whatsapp-modal" className={styles.panelCard}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.pathEyebrow}>Integração externa / Modal WhatsApp</span>
                  <h2>Conecte um motor externo na mesma network do backend.</h2>
                </div>
                <span className={styles.mutedPill}>
                  {modalPayload ? whatsappModalStatusLabel(modalPayload.status) : "Carregando status"}
                </span>
              </div>
              <p className={styles.helperText}>
                O HBX fala apenas com seus endpoints internos. O frontend nunca acessa o container externo diretamente.
              </p>

              {modalLoading && !modalPayload ? (
                <div className={styles.metaBox}>
                  <strong>Carregando Modal WhatsApp</strong>
                  <p>Consultando o backend HBX para obter o status atual da sessão.</p>
                </div>
              ) : null}

              {canManageModal === false ? (
                <div className={styles.metaBox}>
                  <strong>Área administrativa</strong>
                  <p>O Modal WhatsApp fica restrito a MASTER e ADMIN da empresa, seguindo o mesmo padrão de governança do painel.</p>
                </div>
              ) : null}

              {canManageModal === true && modalPayload ? (
                <>
                  <div className={styles.infoGrid}>
                    <div>
                      <span>Status atual</span>
                      <strong>{whatsappModalStatusLabel(modalPayload.status)}</strong>
                    </div>
                    <div>
                      <span>Tenant técnico</span>
                      <strong>{modalPayload.data.tenantKey}</strong>
                    </div>
                    <div>
                      <span>Número conectado</span>
                      <strong>{modalPayload.data.phone || "-"}</strong>
                    </div>
                    <div>
                      <span>Saúde do provedor</span>
                      <strong>{modalPayload.data.providerHealth}</strong>
                    </div>
                    <div>
                      <span>Última atualização</span>
                      <strong>{formatWhatsAppDateTime(modalPayload.data.updatedAt)}</strong>
                    </div>
                    <div>
                      <span>Disponibilidade</span>
                      <strong>{modalPayload.data.available ? "Pronta" : "Indisponível"}</strong>
                    </div>
                  </div>

                  <div className={styles.metaBox}>
                    <strong>{modalPayload.message}</strong>
                    <p>
                      {modalPayload.data.available
                        ? "Use iniciar, desconectar ou reiniciar sem expor a URL interna do serviço externo."
                        : modalPayload.data.enabled
                          ? "A integração está habilitada, mas ainda faltam variáveis de ambiente no backend."
                          : "Ative a feature por variável de ambiente quando o serviço externo estiver conectado à network compartilhada."}
                    </p>
                  </div>

                  {modalOperationalError ? (
                    <div className={styles.errorInline}>
                      <strong>Erro amigável</strong>
                      <p>{modalOperationalError}</p>
                    </div>
                  ) : null}

                  {modalPayload.data.qrCodeDataUrl ? (
                    <div className={styles.qrPanel}>
                      <div className={styles.qrPanelCopy}>
                        <strong>Escaneie o QR do modal externo</strong>
                        <p>
                          Abra o WhatsApp no celular, vá em aparelhos conectados e leia o QR abaixo para concluir a sessão.
                        </p>
                        <div className={styles.summaryStack}>
                          <p>Status: {whatsappModalStatusLabel(modalPayload.status)}</p>
                          <p>Atualizado em: {formatWhatsAppDateTime(modalPayload.data.updatedAt)}</p>
                        </div>
                      </div>
                      <div className={styles.qrFrame}>
                        <img
                          src={modalPayload.data.qrCodeDataUrl}
                          alt="QR Code do Modal WhatsApp"
                          className={styles.qrImage}
                        />
                      </div>
                    </div>
                  ) : null}

                  <div className={styles.pathActions}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => void runModalAction("start")}
                      disabled={modalSaving !== null || !modalPayload.data.available}
                    >
                      {modalSaving === "start" ? "Iniciando..." : "Iniciar conexão"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => void loadModalStatus(true)}
                      disabled={modalSaving !== null}
                    >
                      Atualizar status
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => void runModalAction("disconnect")}
                      disabled={
                        modalSaving !== null
                        || !modalPayload.data.available
                        || (modalPayload.status !== "connected" && modalPayload.status !== "waiting_qr")
                      }
                    >
                      {modalSaving === "disconnect" ? "Desconectando..." : "Desconectar"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => void runModalAction("restart")}
                      disabled={modalSaving !== null || !modalPayload.data.available}
                    >
                      {modalSaving === "restart" ? "Reiniciando..." : "Reiniciar sessão"}
                    </button>
                  </div>
                </>
              ) : null}
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
