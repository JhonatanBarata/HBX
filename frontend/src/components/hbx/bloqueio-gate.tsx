"use client";

// Portão de BLOQUEIO (paywall mansa) — montado no AuthGate, sobrepõe o app quando
// a empresa não pode operar (accessPaused = pending_checkout / overdue / suspended).
// Papel-aware: ADMIN vê o checkout HBX inline (mesmo CheckoutPanel do cadastro —
// sem segundo checkout/Brick); VENDEDOR vê aviso NEUTRO (sem valor/cobrança —
// PAGAMENTOS.md). Enforcement real continua no backend; isto é só UX (FRONTEND.md).
// Dois recados de cobrança (ordem do dono 23/06): SEM cartão (pending_checkout) =
// "Termine seu cadastro"; COM cartão/inadimplente (overdue/suspended/trial vencido) =
// "Ative seu plano". "Ver planos" foi REMOVIDO (mandava pra dentro do sistema).
// Lei 5: todo visual reusa as classes .bv-*/.reg-form (mesmo gate das boas-vindas).

import { usePathname, useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";

import { CheckoutPanel } from "@/components/hbx/checkout-panel";
import { fetchPlanMeCached, peekPlanMeCache, useCurrentUser } from "@/components/hbx/shell";
import { apiFetch, clearToken, getToken } from "@/lib/api";

type PlanLite = { key: string; title: string; monthlyPrice?: number | null };
type GateState = {
  loaded: boolean;
  paused: boolean;
  accessState: string | null;
  trialEnded: boolean;
  plan: PlanLite | null;
};

const EMPTY_STATE: GateState = {
  loaded: false, paused: false, accessState: null, trialEnded: false, plan: null,
};

function deriveGateState(res: Awaited<ReturnType<typeof fetchPlanMeCached>>): GateState {
  const cur = res?.current || {};
  const ts = cur.trialEndsAt ? new Date(cur.trialEndsAt).getTime() : 0;
  // selectedPlanKey = plano escolhido mas checkout não concluído (pending_checkout).
  const pendingKey = cur.selectedPlanKey || cur.planKey;
  const planEntry = pendingKey && Array.isArray(res?.plans)
    ? res!.plans.find(p => p.key === pendingKey)
    : null;
  return {
    loaded: true,
    paused: Boolean(cur.accessPaused),
    accessState: cur.accessState || null,
    trialEnded: cur.accessState === "suspended" && ts > 0 && ts < Date.now(),
    plan: planEntry
      ? { key: planEntry.key, title: planEntry.title || planEntry.key, monthlyPrice: planEntry.monthlyPrice ?? null }
      : null,
  };
}

export function BloqueioGate() {
  const router = useRouter();
  const pathname = usePathname();
  const user = useCurrentUser();
  // Init SÍNCRONO do cache: em navegação client já monta bloqueado, sem flash.
  const [state, setState] = useState<GateState>(() => {
    const cached = peekPlanMeCache();
    return cached !== undefined ? deriveGateState(cached) : EMPTY_STATE;
  });
  const [saindo, setSaindo] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!getToken() || !user || user.isSystemMaster) return;
    fetchPlanMeCached().then(res => {
      if (!alive) return;
      setState(deriveGateState(res));
    });
    return () => { alive = false; };
  }, [user]);

  // Master nunca é bloqueado; sem dados ou empresa operante → sem portão.
  if (!user || user.isSystemMaster) return null;
  if (!state.loaded || !state.paused) return null;
  // Deixa o ADMIN chegar em Configurações → Plano e cobrança para resolver.
  if (pathname && pathname.startsWith("/configuracoes")) return null;

  // O backend só manda accessState para audiência de cobrança (admin/gerente);
  // vendedor vem com accessState nulo → cai no aviso neutro.
  const billingView = state.accessState != null;
  const isPendingCheckout = state.accessState === "pending_checkout";
  // Tem cartão na empresa? pending_checkout = nunca pagou (sem cartão);
  // demais estados de cobrança = já teve cartão e está inadimplente.
  const semCartao = isPendingCheckout;

  // Checkout HBX inline (mesmo do cadastro). Reativação não mostra moldura de trial.
  if (showCheckout && state.plan) {
    return (
      <div className="bv-veil" role="dialog" aria-modal="true">
        <div className="reg-form">
          <CheckoutPanel
            planKey={state.plan.key}
            phone={user.company?.contactPhone || ""}
            email={user.email || ""}
            name={user.name || user.company?.name || ""}
            reactivation={!semCartao}
            onSuccess={() => { window.location.reload(); }}
          />
          <button type="button" className="bv-link" onClick={() => setShowCheckout(false)}>
            ← Voltar
          </button>
        </div>
      </div>
    );
  }

  async function sair() {
    if (saindo) return;
    setSaindo(true);
    try { await apiFetch("/auth/logout", { method: "POST" }); } catch { /* sessão já inválida */ }
    clearToken();
    router.replace("/login");
  }

  let kicker = "Acesso";
  let title = "Acesso pausado";
  let body = "O acesso da sua empresa está pausado no momento. Fale com o administrador da empresa para regularizar.";
  if (billingView) {
    if (semCartao) {
      kicker = "Cadastro"; title = "Termine seu cadastro HBX!";
      body = "Complete seu cadastro conosco, para liberar seu acesso.";
    } else {
      kicker = "Plano"; title = "Ative seu plano HBX";
      body = "Complete o pagamento para liberar o acesso da sua operação:";
    }
  }

  // O botão de ação (Cadastrar/Ativar agora) só abre se temos o plano carregado.
  const canActivateInline = billingView && Boolean(state.plan);

  return (
    <div className="bv-veil" role="dialog" aria-modal="true">
      <div className="bv-card">
        <div className="bv-hero">
          <span className="orb" />
          <span className="kicker">{kicker}</span>
          <h2>{title}</h2>
          <p>{body}</p>
        </div>
        <div className="bv-body">
          <div className="bv-foot">
            <button type="button" className="bv-link" onClick={sair} disabled={saindo}>
              {saindo ? "Saindo…" : "Sair"}
            </button>
            <span className="grow" />
            {canActivateInline && (
              <button type="button" className="btn-teal" onClick={() => setShowCheckout(true)}>
                {semCartao ? "Cadastrar →" : "Ativar agora →"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
