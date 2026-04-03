"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "../_lib/api";
import { useRequireAuth } from "../_lib/useRequireAuth";
import {
  formatWhatsAppDateTime,
  type WhatsAppCenterPayload,
  whatsappModeLabel,
  whatsappTemporaryLiveLabel,
  whatsappTrialModuleLabel,
} from "@/lib/whatsapp-center";
import styles from "./page.module.css";

export default function WhatsAppCenterClientPage() {
  const hasToken = useRequireAuth();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [payload, setPayload] = useState<WhatsAppCenterPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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

  useEffect(() => {
    if (hasToken !== true) return;
    void loadCenter();
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
