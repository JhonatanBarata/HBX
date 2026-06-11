"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import HbxAppShell from "@/components/corporate/HbxAppShell";
import PlanSelectionExperience, { type PlanSelectionCard } from "@/components/PlanSelectionExperience";
import {
  commercialPlanByKey,
  getCommercialPlanTitle,
  type CommercialPlansPayload,
} from "@/lib/commercial-plans";
import { apiFetch } from "@/app/_lib/api";
import { toMobileRoute } from "@/app/_lib/mobileRoutes";
import { useRequireAuth } from "@/app/_lib/useRequireAuth";
import { HbxModal, HbxPersistentNotice } from "@/components/ui";
import {
  HbxCorporatePanel,
  HbxCorporateTag,
  hbxCorporateStyles as cs,
} from "@/components/corporate/HbxCorporateShell";

type NoticeState = {
  tone: "success" | "error" | "info";
  text: string;
};

type BillingCycle = "MONTHLY" | "ANNUAL";
type PlanKey = PlanSelectionCard["key"];
type TrialFormState = {
  contactName: string;
  cpf: string;
  phone: string;
  acceptedTerms: boolean;
};

// Taxonomia canônica de planos (vocabulário, não preço): preços, quotas e
// features vêm SÓ de /commercial-plans/me — catálogo hardcoded morreu no
// PR-010 R2.3. Sem payload, a tela mostra estado vazio com retry.
const PLAN_ORDER: PlanKey[] = ["hbx_lite", "hbx_padrao", "hbx_melhor"];
const HBX_SUPPORT_PHONE = "5519997024884";
const HBX_FULL_SUPPORT_MESSAGE = "Olá, quero falar com a HBX sobre implantação assistida do HBX Full.";

function planLabel(payload: CommercialPlansPayload | null, key: PlanKey) {
  return commercialPlanByKey(payload, key)?.title || getCommercialPlanTitle(key) || key;
}

function openHbxFullSupport() {
  if (typeof window === "undefined") return;
  window.open(
    `https://wa.me/${HBX_SUPPORT_PHONE}?text=${encodeURIComponent(HBX_FULL_SUPPORT_MESSAGE)}`,
    "_blank",
    "noopener,noreferrer",
  );
}

// Estado único (DROP): as leituras de plano projetam de current.accessState
// (paying | manual | exempt | grace | trial | trial_ending | overdue |
// pending_checkout | suspended). Sem campos crus de cobrança.
function accessStateOf(payload: CommercialPlansPayload | null) {
  return String(payload?.current.accessState || "").trim().toLowerCase();
}

function isPendingCheckout(payload: CommercialPlansPayload | null) {
  return accessStateOf(payload) === "pending_checkout";
}

function isImplementationAccess(payload: CommercialPlansPayload | null) {
  const assistedSetupRequired = Boolean(payload?.current.assistedSetup?.required);
  if (payload?.current.isTrial) return false;
  const state = accessStateOf(payload);
  return assistedSetupRequired || state === "manual" || state === "exempt";
}

function currentPlanKey(payload: CommercialPlansPayload | null): PlanKey | null {
  if (isImplementationAccess(payload)) return null;
  const key = payload?.current.planKey || payload?.current.selectedPlanKey || null;
  return PLAN_ORDER.includes(key as PlanKey) ? (key as PlanKey) : null;
}

function isPaidOrActive(payload: CommercialPlansPayload | null) {
  const state = accessStateOf(payload);
  if (state === "paying" || state === "manual" || state === "exempt" || state === "grace") return true;
  return Boolean(payload?.current.entitlements.vendas && !payload?.current.isTrial);
}

function canStartPadraoTrial(payload: CommercialPlansPayload | null) {
  if (!payload) return false;
  if (payload.current.isTrial || payload.current.trialEndsAt) return false;
  return !isPaidOrActive(payload);
}

function promotedPlanFor(current: PlanKey | null, intent: string): PlanKey | null {
  if (intent === "lead") return current === "hbx_padrao" ? null : "hbx_padrao";
  if (intent === "bot_ia") return "hbx_melhor";
  if (current === "hbx_lite") return "hbx_padrao";
  if (current === "hbx_padrao") return "hbx_melhor";
  if (!current) return "hbx_padrao";
  return null;
}

function planBadge(planKey: PlanKey, current: PlanKey | null, promoted: PlanKey | null) {
  if (planKey === current) return "Plano atual";
  if (planKey === promoted) return "Recomendado";
  if (planKey === "hbx_lite") return "Vendas";
  if (planKey === "hbx_padrao") return "Mais escolhido";
  return "Mais completo";
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function hasRepeatedDigits(digits: string) {
  return /^(\d)\1+$/.test(digits);
}

function isValidCpf(value: string) {
  const digits = onlyDigits(value);
  if (digits.length !== 11 || hasRepeatedDigits(digits)) return false;
  const calculate = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(digits[index]) * (length + 1 - index);
    }
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  return calculate(9) === Number(digits[9]) && calculate(10) === Number(digits[10]);
}

function formatCpf(value: string) {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatBrazilPhone(value: string) {
  const rawDigits = onlyDigits(value).slice(0, 13);
  const digits = rawDigits.startsWith("55") && rawDigits.length > 11 ? rawDigits.slice(2, 13) : rawDigits.slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : "";
  const ddd = digits.slice(0, 2);
  const number = digits.slice(2);
  if (number.length <= 1) return `(${ddd})${number}`;
  if (number.length <= 5) return `(${ddd})${number.slice(0, 1)} ${number.slice(1)}`;
  if (number.length === 8) return `(${ddd}) ${number.slice(0, 4)}-${number.slice(4)}`;
  return `(${ddd})${number.slice(0, 1)} ${number.slice(1, 5)}-${number.slice(5, 9)}`;
}

function normalizeBrazilPhone(value: string) {
  const digits = onlyDigits(value);
  return digits.startsWith("55") && digits.length > 11 ? digits.slice(2, 13) : digits.slice(0, 11);
}

function safeInternalPath(value: string | null) {
  const path = String(value || "").trim();
  if (!path.startsWith("/") || path.startsWith("//")) return "";
  return path;
}

export default function PlanosClientPage({ mobileRoute = false }: { mobileRoute?: boolean } = {}) {
  const hasToken = useRequireAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [savingPlan, setSavingPlan] = useState<PlanKey | null>(null);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("MONTHLY");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [payload, setPayload] = useState<CommercialPlansPayload | null>(null);
  const [trialModalOpen, setTrialModalOpen] = useState(false);
  const [trialForm, setTrialForm] = useState<TrialFormState>({
    contactName: "",
    cpf: "",
    phone: "",
    acceptedTerms: false,
  });

  const intent = String(searchParams.get("intent") || "").trim();
  const from = String(searchParams.get("from") || "").trim();
  const explicitReturnTo = safeInternalPath(searchParams.get("returnTo"));
  const closeFallbackBase =
    explicitReturnTo ||
    (from === "vendas_automacao" || intent === "bot_ia"
      ? "/atendimento/automacao"
      : intent === "lead"
        ? "/vendas"
        : "/boasvindas");
  const closeFallback = mobileRoute ? toMobileRoute(closeFallbackBase) : closeFallbackBase;
  const canSelectPlan = Boolean(payload?.permissions?.canSelectPlan);
  const adminDeniedMessage =
    payload?.permissions?.selectPlanDeniedMessage || "USER não pode fazer upgrade. Contate seu ADMIN ou o suporte da empresa.";
  const pendingCheckout = isPendingCheckout(payload);
  const implementationAccess = isImplementationAccess(payload);
  const selectedPlanKey = currentPlanKey(payload);
  const promotedPlanKey = implementationAccess ? null : promotedPlanFor(selectedPlanKey, intent);
  const padraoTrialAvailable = canStartPadraoTrial(payload);
  const trialPhoneDigits = normalizeBrazilPhone(trialForm.phone);
  const trialCpfDigits = onlyDigits(trialForm.cpf);
  const trialFormReady =
    trialForm.contactName.trim().length >= 3 &&
    isValidCpf(trialCpfDigits) &&
    trialPhoneDigits.length >= 10 &&
    trialForm.acceptedTerms;

  const planDisplayOrder = useMemo(
    () => (intent === "lead" ? PLAN_ORDER.filter((key) => key !== "hbx_melhor") : PLAN_ORDER),
    [intent],
  );

  // Catálogo SÓ da API: plano que não veio no payload não é exibido.
  const plans = useMemo(
    () =>
      planDisplayOrder
        .map((key) => commercialPlanByKey(payload, key))
        .filter((plan): plan is NonNullable<typeof plan> => Boolean(plan)),
    [payload, planDisplayOrder],
  );

  const planCards = useMemo<PlanSelectionCard[]>(
    () =>
      plans.map((plan) => {
        const key = plan.key as PlanKey;
        const isPadrao = key === "hbx_padrao";
        const isCurrent = key === selectedPlanKey;
        const hasFreeTrial = isPadrao && padraoTrialAvailable;
        const trialDays = Math.max(0, Math.trunc(Number(plan.trialDays || 0)));
        return {
          key,
          name: planLabel(payload, key),
          badge: planBadge(key, selectedPlanKey, promotedPlanKey),
          monthlyPrice: plan.monthlyPrice,
          promoPrice: hasFreeTrial ? 0 : undefined,
          promoLabel:
            hasFreeTrial && plan.monthlyPrice != null
              ? `Após ${trialDays || 14} dias R$ ${Number(plan.monthlyPrice).toFixed(2).replace(".", ",")}/mês`
              : undefined,
          detail: plan.headline || plan.description || "",
          cta: key === "hbx_melhor" ? "Falar com HBX" : isCurrent ? "Plano atual" : key === promotedPlanKey ? "Subir de plano" : "Escolher plano",
          available: plan.status !== "unavailable",
          featured: key === promotedPlanKey || (!selectedPlanKey && Boolean(plan.recommended)),
          features: plan.features || [],
          note: key === "hbx_melhor"
            ? "Implantação assistida"
            : hasFreeTrial
              ? `${trialDays || 14} dias grátis`
              : plan.legalCopy || undefined,
          trialCopy: hasFreeTrial ? `${trialDays || 14} dias grátis` : undefined,
        };
      }),
    [padraoTrialAvailable, payload, plans, promotedPlanKey, selectedPlanKey],
  );

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

  function closePlansPage() {
    if (typeof window !== "undefined") {
      const referrer = document.referrer;
      const sameOriginReferrer = Boolean(referrer && referrer.startsWith(window.location.origin));
      if (sameOriginReferrer && window.history.length > 1) {
        router.back();
        return;
      }
    }
    router.push(closeFallback);
  }

  async function selectPlan(planKey: PlanKey) {
    if (planKey === "hbx_melhor") {
      setNotice({
        tone: "info",
        text: "HBX Full — implantação assistida. Bot, automação e atendimento completo exigem configuração com a HBX.",
      });
      setTrialModalOpen(false);
      setError(null);
      openHbxFullSupport();
      return;
    }

    if (!canSelectPlan) {
      setNotice({ tone: "info", text: adminDeniedMessage });
      return;
    }

    if (selectedPlanKey === planKey) {
      setNotice({ tone: "info", text: "Este é seu plano atual." });
      setTrialModalOpen(false);
      setError(null);
      return;
    }

    if (planKey === "hbx_padrao" && padraoTrialAvailable) {
      setTrialModalOpen(true);
      setNotice(null);
      setError(null);
      return;
    }

    setSavingPlan(planKey);
    setError(null);
    setNotice({ tone: "info", text: "Preparando a troca de plano." });
    try {
      await apiFetch("/financeiro/preferences", {
        method: "PATCH",
        body: JSON.stringify({ billingCycle }),
      }).catch(() => null);
      const next = await apiFetch<CommercialPlansPayload>("/commercial-plans/select", {
        method: "POST",
        body: JSON.stringify({ planKey }),
      });
      setPayload(next);
      if (planKey === "hbx_padrao" && next.current.isTrial) {
        setNotice({ tone: "success", text: "Trial do HBX Lead Plus iniciado por 14 dias. Não haverá cobrança automática." });
        window.setTimeout(() => {
          router.push(mobileRoute ? toMobileRoute("/boasvindas") : "/boasvindas");
        }, 500);
        return;
      }
      router.push("/pagamento?focus=payment");
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : "Falha ao contratar o plano.";
      setError(message);
      setNotice({ tone: "error", text: message });
    } finally {
      setSavingPlan(null);
    }
  }

  async function submitTrial() {
    if (!trialFormReady) {
      setNotice({ tone: "error", text: "Informe nome, CPF válido, telefone de contato e aceite os termos para iniciar o trial." });
      return;
    }

    setSavingPlan("hbx_padrao");
    setError(null);
    setNotice({ tone: "info", text: "Validando telefone e ativando o trial do HBX Lead Plus." });
    try {
      const next = await apiFetch<CommercialPlansPayload>("/commercial-plans/select", {
        method: "POST",
        body: JSON.stringify({
          planKey: "hbx_padrao",
          trialContactName: trialForm.contactName.trim(),
          trialTaxDocument: trialCpfDigits,
          trialContactPhone: trialPhoneDigits,
          acceptedTerms: trialForm.acceptedTerms,
        }),
      });
      setPayload(next);
      setTrialModalOpen(false);
      setNotice({ tone: "success", text: "Trial do HBX Lead Plus iniciado por 14 dias. Não haverá cobrança automática." });
      window.setTimeout(() => {
        router.push(mobileRoute ? toMobileRoute("/boasvindas") : "/boasvindas");
      }, 500);
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : "Falha ao iniciar o trial.";
      setError(message);
      setNotice({ tone: "error", text: message });
    } finally {
      setSavingPlan(null);
    }
  }

  if (hasToken !== true) return null;

  const currentLabel = implementationAccess
    ? "Implantação HBX"
    : selectedPlanKey
      ? planLabel(payload, selectedPlanKey)
      : "nenhum";

  const content = (
    <>
      <HbxCorporatePanel
        title="Compare os planos sem bloquear sua operação"
        meta={
          <>
            <HbxCorporateTag tone="teal">Atual: {currentLabel}</HbxCorporateTag>
            <button type="button" className={cs.ghostButton} onClick={closePlansPage}>
              Voltar
            </button>
          </>
        }
      >
        <div role="tablist" aria-label="Ciclo de cobrança" style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className={billingCycle === "MONTHLY" ? cs.tealButton : cs.ghostButton}
            onClick={() => setBillingCycle("MONTHLY")}
          >
            Mensal
          </button>
          <button
            type="button"
            className={billingCycle === "ANNUAL" ? cs.tealButton : cs.ghostButton}
            onClick={() => setBillingCycle("ANNUAL")}
          >
            Anual (20% OFF)
          </button>
        </div>

        {pendingCheckout ? (
          <HbxPersistentNotice
            tone="info"
            title="Checkout pendente"
            description="Você pode trocar o plano ou finalizar o pagamento."
            action={
              <Link className={cs.tealButton} style={{ textDecoration: "none" }} href="/pagamento?focus=payment&reason=pending_checkout">
                Finalizar pagamento
              </Link>
            }
          />
        ) : null}

        {intent === "bot_ia" ? (
          <HbxPersistentNotice tone="info" title="Bot IA disponível no plano HBX Full — Bot e IA." />
        ) : null}

        {notice ? (
          <HbxPersistentNotice
            tone={notice.tone === "error" ? "danger" : notice.tone}
            title={notice.text}
            onDismiss={() => setNotice(null)}
          />
        ) : null}
        {error ? <HbxPersistentNotice tone="danger" title={error} /> : null}

        {loading ? (
          <p className={cs.muted} aria-live="polite">Carregando catálogo comercial...</p>
        ) : plans.length === 0 ? (
          <div className={cs.miniCard}>
            <strong>Catálogo comercial indisponível</strong>
            <p className={cs.muted}>Não foi possível carregar os planos da API. Tente novamente.</p>
            <button type="button" className={cs.tealButton} onClick={() => void loadPlans()}>
              Recarregar
            </button>
          </div>
        ) : (
          <PlanSelectionExperience
            plans={planCards}
            selectedPlanKey={selectedPlanKey}
            billingCycle={billingCycle === "ANNUAL" ? "annual" : "monthly"}
            mode="plans"
            canSelect={canSelectPlan}
            hidePrices={!canSelectPlan}
            highlightPlanKey={promotedPlanKey}
            busyPlanKey={savingPlan}
            deniedMessage={adminDeniedMessage}
            onSelect={(planKey) => void selectPlan(planKey)}
          />
        )}

        <footer style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <small className={cs.muted}>ADMIN altera planos.</small>
          <small className={cs.muted}>Trial conforme elegibilidade.</small>
          <small className={cs.muted}>Checkout pelo Mercado Pago.</small>
        </footer>
      </HbxCorporatePanel>

      <HbxModal
        open={trialModalOpen}
        title="Liberar trial — HBX Lead Plus"
        description="Confirme o responsável para ativar os 14 dias. Sem cobrança automática; pagamento só no checkout."
        onClose={() => setTrialModalOpen(false)}
        footer={
          <>
            <button type="button" className={cs.ghostButton} onClick={() => setTrialModalOpen(false)}>
              Voltar
            </button>
            <button
              type="button"
              className={cs.tealButton}
              disabled={!trialFormReady || savingPlan === "hbx_padrao"}
              onClick={() => void submitTrial()}
            >
              {savingPlan === "hbx_padrao" ? "Ativando trial..." : "Iniciar 14 dias grátis"}
            </button>
          </>
        }
      >
        <div className={cs.miniGrid}>
          <label className={cs.miniCard}>
            <span className={cs.muted}>Nome completo</span>
            <input
              className={cs.field}
              autoComplete="name"
              value={trialForm.contactName}
              onChange={(event) => setTrialForm((current) => ({ ...current, contactName: event.target.value }))}
              placeholder="Como gostaria de ser chamado"
            />
          </label>
          <label className={cs.miniCard}>
            <span className={cs.muted}>CPF</span>
            <input
              className={cs.field}
              inputMode="numeric"
              autoComplete="off"
              value={trialForm.cpf}
              onChange={(event) => setTrialForm((current) => ({ ...current, cpf: formatCpf(event.target.value) }))}
              placeholder="000.000.000-00"
            />
          </label>
          <label className={cs.miniCard}>
            <span className={cs.muted}>Telefone de contato</span>
            <input
              className={cs.field}
              inputMode="tel"
              autoComplete="tel"
              value={trialForm.phone}
              onChange={(event) => setTrialForm((current) => ({ ...current, phone: formatBrazilPhone(event.target.value) }))}
              placeholder="(19)9 9702-4884"
            />
          </label>
        </div>
        <label htmlFor="trial-terms" style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <input
            id="trial-terms"
            type="checkbox"
            checked={trialForm.acceptedTerms}
            onChange={(event) => setTrialForm((current) => ({ ...current, acceptedTerms: event.target.checked }))}
          />
          <span>
            Aceito iniciar o trial gratuito de 14 dias do HBX Lead Plus, sem cobrança automática agora, e autorizo o
            uso do CPF, Nome Completo e Telefone informado para contato, validação de elegibilidade e vínculo do
            WhatsApp do trial. Para trocar o telefone será necessário acionar o suporte.
          </span>
        </label>
      </HbxModal>
    </>
  );

  if (mobileRoute) {
    return (
      <main className="hbx-mobile-page" style={{ display: "grid", gap: 14, padding: 16 }}>
        {content}
      </main>
    );
  }

  return (
    <HbxAppShell title="Planos" breadcrumb="Home › Planos">
      {content}
    </HbxAppShell>
  );
}
