"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "../_lib/api";
import { useRequireAuth } from "../_lib/useRequireAuth";
import styles from "./page.module.css";

type WhatsAppCenterPayload = {
  generatedAt: string;
  company: {
    id: number;
    name?: string | null;
    onboardingStatus?: string | null;
    paymentStatus?: string | null;
    subscriptionStatus?: string | null;
    premiumAccess?: boolean;
    trialModuleSelection?: string | null;
    whatsappConnectionMode?: string | null;
    whatsappTemporaryStatus?: string | null;
  };
  center: {
    mode: "NONE" | "TEMPORARY" | "OFFICIAL";
    status: "NOT_CONNECTED" | "TEMPORARY" | "OFFICIAL" | "ATTENTION";
    statusLabel: string;
    statusHint: string;
    temporary: {
      selected: boolean;
      status: "NOT_CONNECTED" | "TEMPORARY" | "ATTENTION";
      available: boolean;
      note: string;
      liveStatus: "idle" | "qr_ready" | "connected" | "error";
      provider?: string | null;
      instanceKey?: string | null;
      pairingCode?: string | null;
      qrCodeDataUrl?: string | null;
      displayNumber?: string | null;
      connectedAt?: string | null;
      lastSyncAt?: string | null;
      errorMessage?: string | null;
    };
    official: {
      selected: boolean;
      configured: boolean;
      connected: boolean;
      status?: string | null;
      displayNumber?: string | null;
      usingMasterToken: boolean;
      credentialLabel?: string | null;
      phoneNumberId?: string | null;
      wabaId?: string | null;
    };
    migration: {
      interestRequested: boolean;
      requestedAt?: string | null;
    };
  };
};

function formatDateTime(value?: string | null) {
  const iso = String(value || "").trim();
  if (!iso) return "-";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("pt-BR");
}

function modeLabel(value?: string | null) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "TEMPORARY") return "Conexão rápida / temporária";
  if (normalized === "OFFICIAL") return "Conexão oficial / Meta";
  return "Ainda não definido";
}

function trialModuleLabel(value?: string | null) {
  return String(value || "").trim().toLowerCase() === "recovery" ? "Recovery" : "Vendas";
}

function temporaryLiveLabel(value?: string | null) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "connected") return "Conectado por QR";
  if (normalized === "qr_ready") return "QR aguardando leitura";
  if (normalized === "error") return "Atenção técnica";
  return "Aguardando ativação";
}

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
      { label: "Modo escolhido", value: modeLabel(payload.center.mode), note: "Clareza comercial antes de escalar." },
      {
        label: "Módulo inicial",
        value: trialModuleLabel(payload.company.trialModuleSelection),
        note: "A operação começa daqui para frente.",
      },
      {
        label: "Conta",
        value: payload.company.paymentStatus === "TRIAL" ? "Free trial ativo" : "Conta ativa",
        note: payload.company.premiumAccess ? "Ambiente premium liberado." : "Aguardando ativação completa.",
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
      description="Escolha com clareza entre o vínculo rápido para testar e a operação oficial pela Meta."
    >
      <div className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>Ativação comercial</span>
            <h1 className={styles.heroTitle}>O HBX agora trata o vínculo do WhatsApp como decisão de produto.</h1>
            <p className={styles.heroText}>
              Em vez de misturar tudo em um único formulário técnico, a empresa escolhe de forma clara se quer testar rápido ou estruturar a operação oficial para estabilidade, automações e crescimento.
            </p>
          </div>

          <aside className={styles.heroPanel} data-tone={payload?.center.status || "NOT_CONNECTED"}>
            <span className={styles.statusPill}>{payload?.center.statusLabel || "Não conectado"}</span>
            <strong className={styles.heroValue}>{payload?.company.name || "Empresa"}</strong>
            <p className={styles.heroHint}>{payload?.center.statusHint || "Escolha o caminho ideal para começar."}</p>
            <div className={styles.heroMeta}>
              <span>{payload?.center.official.displayNumber || "Sem número oficial"}</span>
              <span>{modeLabel(payload?.center.mode)}</span>
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
                    <h2>Melhor para testar e validar a operação.</h2>
                  </div>
                  <span className={styles.mutedPill}>
                    {payload.center.temporary.selected ? "Selecionada" : "Disponível para escolha"}
                  </span>
                </div>
                <p className={styles.pathText}>
                  Essa trilha é a mais leve para começar, provar uso e tirar a empresa da inércia. Agora ela já pode funcionar por QR sem misturar a operação temporária com a rota oficial da Meta.
                </p>
                <div className={styles.featureList}>
                  <span className={styles.featureChip}>Bom para teste</span>
                  <span className={styles.featureChip}>Baixa fricção comercial</span>
                  <span className={styles.featureChip}>Conexão real por QR</span>
                </div>
                <div className={styles.metaBox}>
                  <strong>{temporaryLiveLabel(payload.center.temporary.liveStatus)}</strong>
                  <p>{payload.center.temporary.note}</p>
                </div>
                <div className={styles.infoGrid}>
                  <div>
                    <span>Estado do vínculo</span>
                    <strong>{temporaryLiveLabel(payload.center.temporary.liveStatus)}</strong>
                  </div>
                  <div>
                    <span>Número temporário</span>
                    <strong>{payload.center.temporary.displayNumber || "-"}</strong>
                  </div>
                  <div>
                    <span>Última sincronização</span>
                    <strong>{formatDateTime(payload.center.temporary.lastSyncAt)}</strong>
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
                    <h2>Melhor para estabilidade, automações e crescimento.</h2>
                  </div>
                  <span className={styles.statusPill}>
                    {payload.center.official.connected ? "Oficial ativo" : "Estrutura oficial"}
                  </span>
                </div>
                <p className={styles.pathText}>
                  Esse é o caminho certo para contas que querem previsibilidade, número oficial, automações e expansão sem improviso. Se a conexão oficial ainda não estiver fechada, o produto já registra a decisão e acelera o contato técnico.
                </p>
                <div className={styles.featureList}>
                  <span className={styles.featureChipStrong}>Estabilidade</span>
                  <span className={styles.featureChipStrong}>Automações</span>
                  <span className={styles.featureChipStrong}>Escala operacional</span>
                </div>
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

            <section className={styles.grid}>
              <article id="whatsapp-status" className={styles.panelCard}>
                <div className={styles.sectionHeader}>
                  <div>
                    <strong>Situação operacional</strong>
                    <p className={styles.helperText}>
                      Leitura objetiva do que a empresa já definiu e do que o HBX já consegue enxergar.
                    </p>
                  </div>
                </div>
                <div className={styles.infoGrid}>
                  <div>
                    <span>Status visual</span>
                    <strong>{payload.center.statusLabel}</strong>
                  </div>
                  <div>
                    <span>Escolha atual</span>
                    <strong>{modeLabel(payload.center.mode)}</strong>
                  </div>
                  <div>
                    <span>Contato técnico</span>
                    <strong>{payload.center.migration.interestRequested ? "Solicitado" : "Ainda não solicitado"}</strong>
                  </div>
                </div>
                <div className={styles.summaryStack}>
                  <p>{payload.center.statusHint}</p>
                  <p>
                    Interesse técnico:{" "}
                    {payload.center.migration.interestRequested
                      ? `${formatDateTime(payload.center.migration.requestedAt)}`
                      : "Nenhum aceite registrado ainda."}
                  </p>
                </div>
              </article>

              <article id="whatsapp-next-steps" className={styles.panelCard}>
                <div className={styles.sectionHeader}>
                  <div>
                    <strong>Próximos passos recomendados</strong>
                    <p className={styles.helperText}>O vínculo do WhatsApp precisa servir a operação, e não virar obstáculo técnico.</p>
                  </div>
                </div>
                <div className={styles.stepList}>
                  <div className={styles.step}>
                    <span className={styles.stepDot} aria-hidden="true" />
                    <div>
                      <strong>Escolha um trilho</strong>
                      <p>Rápido para testar, oficial para crescer com estabilidade e automações.</p>
                    </div>
                  </div>
                  <div className={styles.step}>
                    <span className={styles.stepDotActive} aria-hidden="true" />
                    <div>
                      <strong>Continue a operação no módulo principal</strong>
                      <p>
                        Sua empresa escolheu começar por <strong>{trialModuleLabel(payload.company.trialModuleSelection)}</strong>, então o WhatsApp deve apoiar essa rotina sem atrapalhar a ativação.
                      </p>
                    </div>
                  </div>
                  <div className={styles.step}>
                    <span className={styles.stepDotSoon} aria-hidden="true" />
                    <div>
                      <strong>Acompanhe a evolução no MASTER</strong>
                      <p>O aceite para contato técnico e o status desta central já ficam visíveis para o time interno.</p>
                    </div>
                  </div>
                </div>
                <div className={styles.pathActions}>
                  <Link href={payload.company.trialModuleSelection === "recovery" ? "/dashboard/inbox?atendimentoTab=recovery" : "/dashboard/vendas"} className="btn btn-secondary">
                    Voltar para {trialModuleLabel(payload.company.trialModuleSelection)}
                  </Link>
                  <Link href="/dashboard/financeiro" className="btn btn-secondary">
                    Abrir Financeiro
                  </Link>
                </div>
              </article>
            </section>
          </>
        )}
      </div>
    </DashboardScaffold>
  );
}
