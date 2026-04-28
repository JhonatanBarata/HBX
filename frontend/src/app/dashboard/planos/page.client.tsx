"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import DashboardScaffold from "@/components/DashboardScaffold";
import {
  commercialPlanByKey,
  hasBotAi,
  hasVendas,
  type CommercialPlanKey,
  type CommercialPlansPayload,
} from "@/lib/commercial-plans";
import { apiFetch } from "../_lib/api";
import { useRequireAuth } from "../_lib/useRequireAuth";
import styles from "./page.module.css";

type NoticeState = {
  tone: "success" | "error" | "info";
  text: string;
};

function trialLabel(payload: CommercialPlansPayload | null) {
  if (!payload?.current.isTrial) return null;
  const days = payload.current.trialRemainingDays;
  if (typeof days === "number") return `Trial ativo: ${days} dia(s) restantes`;
  return "Trial ativo";
}

export default function PlanosClientPage() {
  const hasToken = useRequireAuth();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [savingPlan, setSavingPlan] = useState<CommercialPlanKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [payload, setPayload] = useState<CommercialPlansPayload | null>(null);

  const intent = String(searchParams.get("intent") || "").trim();
  const canSelectPlan = Boolean(payload?.permissions?.canSelectPlan);
  const adminDeniedMessage =
    payload?.permissions?.selectPlanDeniedMessage || "Peça para um administrador ativar este plano.";
  const vendasActive = hasVendas(payload);
  const botActive = hasBotAi(payload);
  const currentTrialLabel = trialLabel(payload);

  const plans = useMemo(() => ({
    vendas: commercialPlanByKey(payload, "hbx_vendas"),
    combo: commercialPlanByKey(payload, "hbx_vendas_ia"),
    recovery: commercialPlanByKey(payload, "hbx_recovery"),
  }), [payload]);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<CommercialPlansPayload>("/commercial-plans/me");
      setPayload(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar os planos HBX.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasToken !== true) return;
    void loadPlans();
  }, [hasToken, loadPlans]);

  async function selectPlan(planKey: CommercialPlanKey) {
    if (!canSelectPlan) {
      setNotice({ tone: "info", text: adminDeniedMessage });
      return;
    }

    setSavingPlan(planKey);
    setError(null);
    setNotice(null);
    try {
      const next = await apiFetch<CommercialPlansPayload>("/commercial-plans/select", {
        method: "POST",
        body: JSON.stringify({ planKey }),
      });
      setPayload(next);
      setNotice({
        tone: "success",
        text: planKey === "hbx_vendas_ia" ? "HBX Vendas + IA ativado." : "HBX Vendas ativado.",
      });
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : "Falha ao ativar o plano.";
      setError(message);
      setNotice({ tone: "error", text: message });
    } finally {
      setSavingPlan(null);
    }
  }

  if (hasToken === null) {
    return (
      <DashboardScaffold title="Planos" description="Carregando planos HBX." hideHeader={true}>
        <section className={styles.loadingCard}>Carregando planos HBX...</section>
      </DashboardScaffold>
    );
  }

  if (!hasToken) return null;

  return (
    <DashboardScaffold title="Planos" hideHeader={true}>
      <main className={styles.page}>
        <section className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>Plano interno</span>
            <h1>Escolha seu plano HBX</h1>
            <p>Seu acesso começa pelo Vendas. O BOT Inteligente só é ativado quando o plano mostra o valor antes.</p>
          </div>
          <div className={styles.statusPanel}>
            <span>Status atual</span>
            <strong>{payload?.current.planKey === "hbx_vendas_ia" ? "HBX Vendas + IA" : payload?.current.planKey === "hbx_vendas" ? "HBX Vendas" : "Sem plano comercial"}</strong>
            {currentTrialLabel ? <small>{currentTrialLabel}</small> : null}
          </div>
        </section>

        {intent === "bot_ia" ? (
          <section className={styles.intentCard}>
            <strong>O BOT Inteligente faz parte do HBX Vendas + IA</strong>
            <p>Para configurar ou ativar o bot, escolha o plano que mostra o valor antes da ativação.</p>
          </section>
        ) : null}

        {intent === "trial_phone_used" ? (
          <section className={styles.intentCard} data-tone="danger">
            <strong>Este WhatsApp já utilizou o trial</strong>
            <p>Para continuar usando o HBX com este número, escolha um plano.</p>
          </section>
        ) : null}

        {notice ? <section className={styles.notice} data-tone={notice.tone}>{notice.text}</section> : null}
        {error ? <section className={styles.notice} data-tone="error">{error}</section> : null}

        {loading ? (
          <section className={styles.loadingCard}>Carregando catálogo comercial...</section>
        ) : (
          <section className={styles.planGrid} aria-label="Planos HBX">
            <article className={styles.planCard}>
              <div className={styles.planHeader}>
                <span>HBX Vendas</span>
                {vendasActive && !botActive ? <small>Plano atual</small> : null}
              </div>
              <strong className={styles.price}>HBX Vendas: R$ 89,90/mês</strong>
              <p>{plans.vendas?.headline || "Vendas com WhatsApp embutido"}</p>
              <ul>
                <li>Free trial 30 dias</li>
                <li>WhatsApp embutido</li>
                <li>Vendas + agenda comercial + atendimento base</li>
              </ul>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={vendasActive || savingPlan === "hbx_vendas"}
                onClick={() => void selectPlan("hbx_vendas")}
              >
                {vendasActive ? "Plano atual" : savingPlan === "hbx_vendas" ? "Ativando..." : "Ativar HBX Vendas"}
              </button>
              {!canSelectPlan && !vendasActive ? <small className={styles.adminHint}>{adminDeniedMessage}</small> : null}
            </article>

            <article className={styles.planCard} data-featured="true">
              <div className={styles.planHeader}>
                <span>HBX Vendas + IA</span>
                <small>Mais completo</small>
              </div>
              <strong className={styles.price}>Primeiras 3 mensalidades com 50% de desconto no BOT: R$ 109,85/mês</strong>
              <p>Depois das 3 primeiras mensalidades: R$ 129,80/mês</p>
              <div className={styles.breakdown}>
                <div><span>HBX Vendas</span><strong>R$ 89,90/mês</strong></div>
                <div><span>BOT Inteligente</span><strong>R$ 39,90/mês</strong></div>
                <div><span>Desconto</span><strong>50% no BOT por 3 mensalidades</strong></div>
              </div>
              <p className={styles.legal}>O desconto vale somente nas 3 primeiras mensalidades. Depois, o valor total passa para R$ 129,80/mês.</p>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={botActive || savingPlan === "hbx_vendas_ia"}
                onClick={() => void selectPlan("hbx_vendas_ia")}
              >
                {botActive
                  ? "IA ativa"
                  : savingPlan === "hbx_vendas_ia"
                    ? "Ativando..."
                    : vendasActive
                      ? "Ativar BOT Inteligente"
                      : "Ativar Vendas + IA"}
              </button>
              {!canSelectPlan && !botActive ? <small className={styles.adminHint}>{adminDeniedMessage}</small> : null}
            </article>

            <article className={styles.planCard} data-disabled="true">
              <div className={styles.planHeader}>
                <span>HBX Recovery</span>
                <small>Indisponível</small>
              </div>
              <strong className={styles.price}>HBX Recovery: indisponível</strong>
              <p>Ainda não disponível para contratação.</p>
              <button type="button" className={styles.disabledButton} disabled>
                Indisponível
              </button>
              {plans.recovery?.disabledReason ? <small className={styles.adminHint}>{plans.recovery.disabledReason}</small> : null}
            </article>
          </section>
        )}
      </main>
    </DashboardScaffold>
  );
}
