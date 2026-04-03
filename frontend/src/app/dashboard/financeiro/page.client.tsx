"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "../_lib/api";
import { useRequireAuth } from "../_lib/useRequireAuth";
import styles from "./page.module.css";

type FinanceiroOverview = {
  generatedAt: string;
  company: {
    id: number;
    name: string;
    paymentStatus: string;
    paymentMethod?: string | null;
    billingCycle: "MONTHLY" | "ANNUAL";
    billingProvider?: string | null;
    subscriptionStatus?: string | null;
    premiumAccess?: boolean;
    trialStartsAt?: string | null;
    trialEndsAt?: string | null;
    trialRemainingDays?: number | null;
    isActive: boolean;
    acquisitionSource?: string | null;
    acquisitionSourceDetail?: string | null;
    referralReferrerName?: string | null;
    referralCode?: string | null;
    plan?: { id: number; name: string; price: number } | null;
  };
  modules: Array<{ key: string; name: string; monthlyPrice?: number }>;
  pricing: {
    billingCycle: "MONTHLY" | "ANNUAL";
    monthlyValue: number;
    annualPlanDiscountPercent: number;
    annualDiscountValue: number;
    manualDiscountPercent: number;
    manualDiscountValue: number;
    referralDiscountPercent: number;
    referralDiscountMode: "ONCE" | "RECURRING";
    referralDiscountValue: number;
    referralDiscountEligible: boolean;
    referralDiscountAppliedNow: boolean;
    referralDiscountConsumedAt?: string | null;
    acquisitionSource?: string | null;
    acquisitionSourceDetail?: string | null;
    referralReferrerName?: string | null;
    referralCode?: string | null;
    isReferral?: boolean;
    freeMonths: number;
    baseCycleAmount: number;
    finalCycleAmount: number;
    pendingCount: number;
    failedCount: number;
    refundCount: number;
    refundAmount: number;
    cardConfigured: boolean;
    pixAvailable: boolean;
  };
  paymentOptions: {
    selectedMethod: string;
    card: {
      configured: boolean;
      brand?: string | null;
      last4?: string | null;
      holderName?: string | null;
      expMonth?: number | null;
      expYear?: number | null;
      updatedAt?: string | null;
    };
    pix: {
      available: boolean;
      preferred: boolean;
    };
  };
  accountStatus: {
    label: string;
    nextDueAt?: string | null;
    lastPayment?: {
      paidAt?: string | null;
      amount: number;
      status: string;
    } | null;
    lastFailure?: {
      createdAt?: string | null;
      amount: number;
      status: string;
    } | null;
  };
  latestCharge?: {
    id: string;
    amount: number;
    currency: string;
    description: string;
    billingCycle: "MONTHLY" | "ANNUAL";
    paymentMethod: string;
    status: string;
    lifecycle: string;
    competence?: string | null;
    externalReference?: string | null;
    paymentUrl?: string | null;
    pixQrCode?: string | null;
    pixQrCodeBase64?: string | null;
    pixTicketUrl?: string | null;
    paidAt?: string | null;
    refundedAt?: string | null;
    refundAmount?: number;
    createdAt?: string | null;
    updatedAt?: string | null;
    lastWebhookAt?: string | null;
  } | null;
  history: Array<{
    id: string;
    entryType: string;
    status: string;
    origin?: string | null;
    amount: number;
    dueDate?: string | null;
    paidAt?: string | null;
    paymentMethod?: string | null;
    referenceLabel?: string | null;
    competence?: string | null;
    createdAt?: string | null;
  }>;
};

function formatCurrency(value?: number | null) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDate(value?: string | null) {
  const iso = String(value || "").trim();
  if (!iso) return "-";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("pt-BR");
}

function formatDateTime(value?: string | null) {
  const iso = String(value || "").trim();
  if (!iso) return "-";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("pt-BR");
}

function paymentMethodLabel(value?: string | null) {
  const method = String(value || "").trim().toUpperCase();
  if (method === "CARD") return "Cartão";
  if (method === "PIX") return "Pix";
  if (method === "BOLETO") return "Boleto";
  if (method === "MANUAL") return "Manual";
  return "Sem método";
}

function subscriptionLabel(value?: string | null) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "trialing") return "Free trial";
  if (normalized === "active") return "Ativa";
  if (normalized === "past_due") return "Em atraso";
  if (normalized === "canceled") return "Cancelada";
  if (normalized === "expired") return "Expirada";
  return normalized || "-";
}

function chargeStatusLabel(value?: string | null) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "approved") return "Pago";
  if (normalized === "pending") return "Aguardando pagamento";
  if (normalized === "failed") return "Falhou";
  if (normalized === "cancelled") return "Cancelado";
  if (normalized === "refunded") return "Estornado";
  if (normalized === "partially_refunded") return "Estorno parcial";
  return normalized || "-";
}

function acquisitionSourceLabel(value?: string | null) {
  const source = String(value || "").trim().toLowerCase();
  if (source === "google") return "Google";
  if (source === "instagram") return "Instagram";
  if (source === "youtube") return "YouTube";
  if (source === "indicacao") return "Indicação";
  if (source === "parceiro") return "Parceiro";
  if (source === "outro") return "Outro";
  return "Não informado";
}

function referralModeLabel(value?: string | null) {
  return String(value || "").trim().toUpperCase() === "RECURRING" ? "recorrente" : "único";
}

export default function FinanceiroClientPage() {
  const hasToken = useRequireAuth();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [overview, setOverview] = useState<FinanceiroOverview | null>(null);
  const [preferences, setPreferences] = useState({
    paymentMethod: "NONE",
    billingCycle: "MONTHLY",
  });
  const [cardForm, setCardForm] = useState({
    brand: "",
    last4: "",
    holderName: "",
    expMonth: "",
    expYear: "",
  });

  async function startCheckout(paymentMethod: "PIX" | "CARD") {
    setSaving(`checkout-${paymentMethod.toLowerCase()}`);
    setError(null);
    try {
      const payload = await apiFetch<{ charge?: FinanceiroOverview["latestCharge"]; complimentary?: boolean; overview?: FinanceiroOverview }>(
        "/financeiro/checkout",
        {
          method: "POST",
          body: JSON.stringify({ paymentMethod }),
        },
      );
      if (payload?.overview) {
        setOverview(payload.overview);
      } else {
        await loadOverview(true);
      }

      if (paymentMethod === "CARD" && payload?.charge?.paymentUrl) {
        window.open(payload.charge.paymentUrl, "_blank", "noopener,noreferrer");
        setMessage("Checkout de cartão aberto em nova aba.");
      } else if (payload?.complimentary) {
        setMessage("Ciclo liquidado com mês grátis configurado.");
      } else {
        setMessage(paymentMethod === "PIX" ? "PIX gerado com sucesso." : "Checkout preparado com sucesso.");
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao iniciar cobrança.");
    } finally {
      setSaving(null);
    }
  }

  async function refreshLatestCharge(paymentIdOverride?: string | null, chargeIdOverride?: string | null) {
    const chargeId = chargeIdOverride || overview?.latestCharge?.id;
    if (!chargeId) return;
    setSaving("refresh-charge");
    setError(null);
    try {
      const payload = await apiFetch<FinanceiroOverview>(`/financeiro/charges/${chargeId}/refresh`, {
        method: "POST",
        body: JSON.stringify(paymentIdOverride ? { paymentId: paymentIdOverride } : {}),
      });
      setOverview(payload);
      setMessage("Status da cobrança atualizado.");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao atualizar cobrança.");
    } finally {
      setSaving(null);
    }
  }

  async function loadOverview(background = false) {
    if (!background) setLoading(true);
    setError(null);
    try {
      const payload = await apiFetch<FinanceiroOverview>("/financeiro/overview");
      setOverview(payload);
      setPreferences({
        paymentMethod: payload.paymentOptions.selectedMethod || "NONE",
        billingCycle: payload.company.billingCycle || "MONTHLY",
      });
      setCardForm({
        brand: payload.paymentOptions.card.brand || "",
        last4: payload.paymentOptions.card.last4 || "",
        holderName: payload.paymentOptions.card.holderName || "",
        expMonth: payload.paymentOptions.card.expMonth ? String(payload.paymentOptions.card.expMonth) : "",
        expYear: payload.paymentOptions.card.expYear ? String(payload.paymentOptions.card.expYear) : "",
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar o Financeiro.");
    } finally {
      if (!background) setLoading(false);
    }
  }

  useEffect(() => {
    if (hasToken !== true) return;
    void loadOverview();
  }, [hasToken]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 2800);
    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!overview?.latestCharge) return;
    if (overview.latestCharge.status !== "pending") return;
    const timer = window.setInterval(() => {
      void refreshLatestCharge();
    }, 20000);
    return () => window.clearInterval(timer);
  }, [overview?.latestCharge?.id, overview?.latestCharge?.status]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const chargeId = params.get("charge");
    const paymentId = params.get("payment_id");
    if (!chargeId || !paymentId) return;
    void refreshLatestCharge(paymentId, chargeId);
  }, []);

  useEffect(() => {
    if (!overview || typeof window === "undefined") return;
    const focus = String(searchParams.get("focus") || "").trim().toLowerCase();
    const focusTargetByKey: Record<string, string> = {
      access: "financeiro-access",
      preferences: "financeiro-preferences",
      payment: "financeiro-payment",
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
  }, [overview, searchParams]);

  const pricingHighlights = useMemo(() => {
    if (!overview) return [];
    return [
      {
        label: "Valor base",
        value: formatCurrency(overview.pricing.baseCycleAmount),
        note: overview.pricing.billingCycle === "ANNUAL" ? "ciclo anual" : "ciclo mensal",
      },
      {
        label: "Descontos ativos",
        value: formatCurrency(
          overview.pricing.annualDiscountValue +
            overview.pricing.manualDiscountValue +
            overview.pricing.referralDiscountValue,
        ),
        note: overview.pricing.referralDiscountValue > 0 ? "anual + manual + indicação" : "anual + manual",
      },
      {
        label: "Valor atual",
        value: formatCurrency(overview.pricing.finalCycleAmount),
        note: "cobrança prevista",
      },
      {
        label: "Pendências",
        value: String(overview.pricing.pendingCount),
        note: `${overview.pricing.failedCount} falha(s) • ${overview.pricing.refundCount} estorno(s)`,
      },
    ];
  }, [overview]);

  async function savePreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving("preferences");
    setError(null);
    try {
      await apiFetch("/financeiro/preferences", {
        method: "PATCH",
        body: JSON.stringify(preferences),
      });
      setMessage("Preferências do Financeiro atualizadas.");
      await loadOverview(true);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao salvar preferências.");
    } finally {
      setSaving(null);
    }
  }

  async function saveCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving("card");
    setError(null);
    try {
      await apiFetch("/financeiro/card", {
        method: "PUT",
        body: JSON.stringify({
          brand: cardForm.brand,
          last4: cardForm.last4,
          holderName: cardForm.holderName,
          expMonth: Number(cardForm.expMonth),
          expYear: Number(cardForm.expYear),
        }),
      });
      setMessage("Cartão salvo no Financeiro.");
      await loadOverview(true);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao salvar cartão.");
    } finally {
      setSaving(null);
    }
  }

  async function removeCard() {
    setSaving("remove-card");
    setError(null);
    try {
      await apiFetch("/financeiro/card", { method: "DELETE" });
      setMessage("Cartão removido do Financeiro.");
      await loadOverview(true);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha ao remover cartão.");
    } finally {
      setSaving(null);
    }
  }

  if (hasToken === null) {
    return (
      <DashboardScaffold title="Financeiro" description="Carregando visão financeira da conta.">
        <section className={styles.loadingCard}>Carregando...</section>
      </DashboardScaffold>
    );
  }

  if (!hasToken) return null;

  return (
    <DashboardScaffold
      title="Financeiro"
      description="Plano, pagamento, descontos e leitura clara da conta em um só lugar."
    >
      <div className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>HBX financeiro</span>
            <h1 className={styles.heroTitle}>Autoatendimento discreto, cobrança clara e sem ruído.</h1>
            <p className={styles.heroText}>
              Veja sua conta, acompanhe trial, escolha como prefere pagar e mantenha o Financeiro organizado sem cair em uma tela fria de billing.
            </p>
          </div>

          <div className={styles.heroPanel}>
            <span className={styles.statusPill}>{overview?.accountStatus.label || "Conta em leitura"}</span>
            <strong className={styles.heroValue}>
              {overview ? formatCurrency(overview.pricing.finalCycleAmount) : "R$ 0,00"}
            </strong>
            <small className={styles.heroHint}>
              {overview?.company.subscriptionStatus === "trialing"
                ? `Free trial • ${overview.company.trialRemainingDays ?? 0} dia(s) restantes`
                : `${subscriptionLabel(overview?.company.subscriptionStatus)} • ${paymentMethodLabel(overview?.company.paymentMethod)}`}
            </small>
          </div>

          <div className={styles.metricsGrid}>
            {pricingHighlights.map((metric) => (
              <article key={metric.label} className={styles.metricCard}>
                <span className={styles.metricLabel}>{metric.label}</span>
                <strong className={styles.metricValue}>{metric.value}</strong>
                <p className={styles.metricNote}>{metric.note}</p>
              </article>
            ))}
          </div>
        </section>

        {error ? <section className={styles.errorCard}>{error}</section> : null}
        {message ? <section className={styles.successCard}>{message}</section> : null}

        {loading || !overview ? (
          <section className={styles.loadingCard}>Carregando painel financeiro...</section>
        ) : (
          <>
            <section className={styles.grid}>
              <article id="financeiro-access" className={styles.panelCard}>
                <div className={styles.sectionHeader}>
                  <div>
                    <strong>Conta atual</strong>
                    <p className={styles.helperText}>Plano, status e módulos já liberados para operação.</p>
                  </div>
                </div>
                <div className={styles.infoGrid}>
                  <div><span>Plano atual</span><strong>{overview.company.plan?.name || "Sem plano"}</strong></div>
                  <div><span>Status</span><strong>{subscriptionLabel(overview.company.subscriptionStatus)}</strong></div>
                  <div><span>Forma atual</span><strong>{paymentMethodLabel(overview.company.paymentMethod)}</strong></div>
                  <div><span>Provider</span><strong>{overview.company.billingProvider || "manual"}</strong></div>
                  <div><span>Trial</span><strong>{overview.company.trialRemainingDays != null ? `${overview.company.trialRemainingDays} dia(s)` : "Não ativo"}</strong></div>
                  <div><span>Próximo marco</span><strong>{formatDate(overview.accountStatus.nextDueAt)}</strong></div>
                  <div><span>Origem</span><strong>{acquisitionSourceLabel(overview.company.acquisitionSource)}</strong></div>
                  <div><span>Indicação</span><strong>{overview.company.referralReferrerName || overview.company.referralCode || "Sem indicação"}</strong></div>
                </div>
                <div className={styles.moduleRail}>
                  {overview.modules.map((item) => (
                    <span key={item.key} className={styles.moduleChip}>{item.name}</span>
                  ))}
                </div>
              </article>

              <article className={styles.panelCard}>
                <div className={styles.sectionHeader}>
                  <div>
                    <strong>Descontos e ciclo</strong>
                    <p className={styles.helperText}>Leitura limpa do que está abatendo ou organizando a sua cobrança.</p>
                  </div>
                </div>
                <div className={styles.infoGrid}>
                  <div><span>Ciclo</span><strong>{overview.pricing.billingCycle === "ANNUAL" ? "Anual" : "Mensal"}</strong></div>
                  <div><span>Desconto anual</span><strong>{overview.pricing.annualPlanDiscountPercent}%</strong></div>
                  <div><span>Desconto manual</span><strong>{overview.pricing.manualDiscountPercent}%</strong></div>
                  <div><span>Desconto indicação</span><strong>{overview.pricing.referralDiscountPercent}%</strong></div>
                  <div><span>Meses grátis</span><strong>{overview.pricing.freeMonths}</strong></div>
                  <div><span>Estornos</span><strong>{overview.pricing.refundCount}</strong></div>
                  <div><span>Valor estornado</span><strong>{formatCurrency(overview.pricing.refundAmount)}</strong></div>
                  <div><span>Política de indicação</span><strong>{referralModeLabel(overview.pricing.referralDiscountMode)}</strong></div>
                  <div><span>Status da indicação</span><strong>{overview.pricing.isReferral ? "Elegível" : "Não aplicável"}</strong></div>
                </div>
                <div className={styles.summaryStack}>
                  <p>Base do ciclo: {formatCurrency(overview.pricing.baseCycleAmount)}</p>
                  <p>Desconto anual aplicado: {formatCurrency(overview.pricing.annualDiscountValue)}</p>
                  <p>Desconto manual aplicado: {formatCurrency(overview.pricing.manualDiscountValue)}</p>
                  <p>Desconto por indicação: {formatCurrency(overview.pricing.referralDiscountValue)}</p>
                  <p>
                    Origem comercial: {acquisitionSourceLabel(overview.pricing.acquisitionSource)}
                    {overview.pricing.acquisitionSourceDetail ? ` • ${overview.pricing.acquisitionSourceDetail}` : ""}
                  </p>
                  <p>
                    Quem indicou: {overview.pricing.referralReferrerName || overview.pricing.referralCode || "Não informado"}
                  </p>
                  {overview.pricing.isReferral ? (
                    <p>
                      Situação da indicação: {overview.pricing.referralDiscountAppliedNow
                        ? `abatimento atual de ${formatCurrency(overview.pricing.referralDiscountValue)}`
                        : overview.pricing.referralDiscountConsumedAt
                          ? `já consumido em ${formatDate(overview.pricing.referralDiscountConsumedAt)}`
                          : "pronto para entrar na próxima cobrança válida"}
                    </p>
                  ) : null}
                </div>
              </article>
            </section>

            <section className={styles.panelCard}>
              <div className={styles.sectionHeader}>
                <div>
                  <strong>Central de vínculo WhatsApp</strong>
                  <p className={styles.helperText}>
                    Escolha com clareza se a empresa quer um caminho rápido para testar ou a rota oficial para operar com estabilidade.
                  </p>
                </div>
                <Link href="/dashboard/whatsapp" className="btn btn-secondary btn-sm">
                  Abrir central
                </Link>
              </div>
              <div className={styles.infoGrid}>
                <div><span>Melhor para testar</span><strong>Conexão rápida / temporária</strong></div>
                <div><span>Melhor para crescer</span><strong>Conexão oficial / Meta</strong></div>
                <div><span>Próximo passo</span><strong>Escolher a trilha sem misturar os modos</strong></div>
              </div>
            </section>

            <section className={styles.grid}>
              <form id="financeiro-preferences" className={styles.panelCard} onSubmit={savePreferences}>
                <div className={styles.sectionHeader}>
                  <div>
                    <strong>Preferência de pagamento</strong>
                    <p className={styles.helperText}>Escolha o método preferido e o ciclo de cobrança da conta.</p>
                  </div>
                </div>
                <div className={styles.formGrid}>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Método</span>
                    <select
                      className={styles.fieldInput}
                      value={preferences.paymentMethod}
                      onChange={(event) => setPreferences((current) => ({ ...current, paymentMethod: event.target.value }))}
                    >
                      <option value="NONE">Sem método</option>
                      <option value="CARD">Cartão</option>
                      <option value="PIX">Pix</option>
                      <option value="BOLETO">Boleto</option>
                      <option value="MANUAL">Manual</option>
                    </select>
                  </label>

                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Ciclo</span>
                    <select
                      className={styles.fieldInput}
                      value={preferences.billingCycle}
                      onChange={(event) => setPreferences((current) => ({ ...current, billingCycle: event.target.value }))}
                    >
                      <option value="MONTHLY">Mensal</option>
                      <option value="ANNUAL">Anual</option>
                    </select>
                  </label>
                </div>
                <div className={styles.formActions}>
                  <button type="submit" className="btn btn-primary" disabled={saving === "preferences"}>
                    {saving === "preferences" ? "Salvando..." : "Salvar preferência"}
                  </button>
                </div>
              </form>

              <form className={styles.panelCard} onSubmit={saveCard}>
                <div className={styles.sectionHeader}>
                  <div>
                    <strong>Cartão cadastrado</strong>
                    <p className={styles.helperText}>Troque ou remova o cartão salvo sem pressão visual nem checkout pesado.</p>
                  </div>
                  {overview.paymentOptions.card.configured ? (
                    <span className={styles.statusPill}>
                      {overview.paymentOptions.card.brand || "Cartão"} • final {overview.paymentOptions.card.last4}
                    </span>
                  ) : (
                    <span className={styles.mutedPill}>Nenhum cartão salvo</span>
                  )}
                </div>

                <div className={styles.formGrid}>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Bandeira</span>
                    <input className={styles.fieldInput} value={cardForm.brand} onChange={(event) => setCardForm((current) => ({ ...current, brand: event.target.value }))} placeholder="Ex: Visa" />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Final</span>
                    <input className={styles.fieldInput} value={cardForm.last4} onChange={(event) => setCardForm((current) => ({ ...current, last4: event.target.value.replace(/\D/g, "").slice(-4) }))} placeholder="1234" />
                  </label>
                  <label className={styles.fieldWide}>
                    <span className={styles.fieldLabel}>Titular</span>
                    <input className={styles.fieldInput} value={cardForm.holderName} onChange={(event) => setCardForm((current) => ({ ...current, holderName: event.target.value }))} placeholder="Nome no cartão" />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Mês</span>
                    <input className={styles.fieldInput} value={cardForm.expMonth} onChange={(event) => setCardForm((current) => ({ ...current, expMonth: event.target.value.replace(/\D/g, "").slice(0, 2) }))} placeholder="08" />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Ano</span>
                    <input className={styles.fieldInput} value={cardForm.expYear} onChange={(event) => setCardForm((current) => ({ ...current, expYear: event.target.value.replace(/\D/g, "").slice(0, 4) }))} placeholder="2028" />
                  </label>
                </div>
                <div className={styles.formActions}>
                  <button type="submit" className="btn btn-primary" disabled={saving === "card"}>
                    {saving === "card" ? "Salvando..." : overview.paymentOptions.card.configured ? "Trocar cartão" : "Salvar cartão"}
                  </button>
                  <button type="button" className="btn btn-secondary" disabled={saving === "remove-card" || !overview.paymentOptions.card.configured} onClick={() => void removeCard()}>
                    {saving === "remove-card" ? "Removendo..." : "Remover cartão"}
                  </button>
                </div>
              </form>
            </section>

            <section className={styles.grid}>
              <article id="financeiro-payment" className={styles.panelCard}>
                <div className={styles.sectionHeader}>
                  <div>
                    <strong>Pagamento em tempo real</strong>
                    <p className={styles.helperText}>Gere PIX com QR Code/copia e cola ou abra o checkout seguro de cartão.</p>
                  </div>
                  <span className={overview.latestCharge?.status === "approved" ? styles.statusPill : styles.mutedPill}>
                    {overview.latestCharge ? chargeStatusLabel(overview.latestCharge.status) : "Sem cobrança ativa"}
                  </span>
                </div>
                <div className={styles.checkoutGrid}>
                  <article className={styles.checkoutCard}>
                    <div className={styles.checkoutHeader}>
                      <strong>PIX</strong>
                      <span className={overview.paymentOptions.pix.preferred ? styles.statusPill : styles.mutedPill}>
                        QR + copia e cola
                      </span>
                    </div>
                    <p className={styles.helperText}>
                      Ideal para pagar agora e ver o status virar automaticamente para aprovado no Financeiro e no MASTER.
                    </p>
                    <div className={styles.formActions}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={saving === "checkout-pix"}
                        onClick={() => void startCheckout("PIX")}
                      >
                        {saving === "checkout-pix" ? "Gerando PIX..." : "Gerar PIX"}
                      </button>
                    </div>
                  </article>

                  <article className={styles.checkoutCard}>
                    <div className={styles.checkoutHeader}>
                      <strong>Cartão</strong>
                      <span className={overview.paymentOptions.card.configured ? styles.statusPill : styles.mutedPill}>
                        {overview.paymentOptions.card.configured ? "Cartão salvo" : "Checkout seguro"}
                      </span>
                    </div>
                    <p className={styles.helperText}>
                      O checkout abre no Mercado Pago e, quando aprovado, a conta é liberada automaticamente.
                    </p>
                    <div className={styles.formActions}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={saving === "checkout-card"}
                        onClick={() => void startCheckout("CARD")}
                      >
                        {saving === "checkout-card" ? "Abrindo..." : "Pagar com cartão"}
                      </button>
                    </div>
                  </article>
                </div>

                {overview.latestCharge ? (
                  <div className={styles.chargePanel}>
                    <div className={styles.sectionHeader}>
                      <div>
                        <strong>Cobrança atual</strong>
                        <p className={styles.helperText}>
                          {overview.latestCharge.description} • {formatCurrency(overview.latestCharge.amount)}
                        </p>
                      </div>
                      <div className={styles.formActions}>
                        <span className={overview.latestCharge.status === "approved" ? styles.statusPill : styles.mutedPill}>
                          {chargeStatusLabel(overview.latestCharge.status)}
                        </span>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={saving === "refresh-charge"}
                          onClick={() => void refreshLatestCharge()}
                        >
                          {saving === "refresh-charge" ? "Atualizando..." : "Atualizar status"}
                        </button>
                      </div>
                    </div>

                    <div className={styles.infoGrid}>
                      <div><span>Método</span><strong>{paymentMethodLabel(overview.latestCharge.paymentMethod)}</strong></div>
                      <div><span>Status</span><strong>{chargeStatusLabel(overview.latestCharge.status)}</strong></div>
                      <div><span>Criada em</span><strong>{formatDateTime(overview.latestCharge.createdAt)}</strong></div>
                    </div>

                    {overview.latestCharge.paymentMethod === "PIX" && overview.latestCharge.status === "pending" ? (
                      <div className={styles.pixPanel}>
                        {overview.latestCharge.pixQrCodeBase64 ? (
                          <img
                            className={styles.qrImage}
                            src={`data:image/png;base64,${overview.latestCharge.pixQrCodeBase64}`}
                            alt="QR Code PIX"
                          />
                        ) : null}
                        <label className={styles.fieldWide}>
                          <span className={styles.fieldLabel}>Copia e cola</span>
                          <textarea
                            className={styles.fieldInput}
                            rows={4}
                            readOnly
                            value={overview.latestCharge.pixQrCode || ""}
                          />
                        </label>
                        <div className={styles.formActions}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => navigator.clipboard.writeText(overview.latestCharge?.pixQrCode || "")}
                          >
                            Copiar PIX
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {overview.latestCharge.paymentMethod === "CARD" && overview.latestCharge.paymentUrl ? (
                      <div className={styles.formActions}>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => window.open(overview.latestCharge?.paymentUrl || "", "_blank", "noopener,noreferrer")}
                        >
                          Abrir checkout novamente
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </article>

              <article className={styles.panelCard}>
                <div className={styles.sectionHeader}>
                  <div>
                    <strong>Histórico recente</strong>
                    <p className={styles.helperText}>Leitura rápida dos eventos mais recentes do ledger da sua conta.</p>
                  </div>
                </div>
                <div className={styles.historyList}>
                  {overview.history.length ? overview.history.slice(0, 8).map((entry) => (
                    <article key={entry.id} className={styles.historyItem}>
                      <div>
                        <strong>{entry.referenceLabel || entry.entryType}</strong>
                        <p>{entry.origin || "origem interna"} • {paymentMethodLabel(entry.paymentMethod)}</p>
                      </div>
                      <div className={styles.historyRight}>
                        <strong>{formatCurrency(entry.amount)}</strong>
                        <span>{entry.paidAt ? formatDateTime(entry.paidAt) : formatDate(entry.dueDate)}</span>
                      </div>
                    </article>
                  )) : (
                    <div className={styles.emptyState}>Ainda não há histórico financeiro para mostrar.</div>
                  )}
                </div>
              </article>
            </section>
          </>
        )}
      </div>
    </DashboardScaffold>
  );
}
