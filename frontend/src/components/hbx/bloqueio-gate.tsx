"use client";

// Portão de BLOQUEIO (paywall mansa) — montado no AuthGate, sobrepõe o app quando
// a empresa não pode operar (accessPaused = pending_checkout / overdue / suspended).
// Papel-aware: ADMIN em pending_checkout vê "Ativar agora" que abre o checkout
// inline (sem navegar para /configuracoes — o beco antigo); demais estados de
// cobrança vêem "Ver planos"; VENDEDOR vê aviso NEUTRO (sem valor/cobrança —
// PAGAMENTOS.md). Enforcement real continua no backend; isto é só UX (FRONTEND.md).
// Lei 5: todo visual reusa as classes .bv-* (mesmo gate das boas-vindas). Zero CSS novo.

import { usePathname, useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";

import { fetchPlanMeCached, useCurrentUser } from "@/components/hbx/shell";
import { SubscribeCardModal } from "@/components/hbx/subscribe-card-modal";
import { apiFetch, clearToken, getToken } from "@/lib/api";

type PlanLite = { key: string; title: string; monthlyPrice?: number | null };
type GateState = {
  loaded: boolean;
  paused: boolean;
  accessState: string | null;
  trialEnded: boolean;
  plan: PlanLite | null;
};

export function BloqueioGate() {
  const router = useRouter();
  const pathname = usePathname();
  const user = useCurrentUser();
  const [state, setState] = useState<GateState>({
    loaded: false, paused: false, accessState: null, trialEnded: false, plan: null,
  });
  const [saindo, setSaindo] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!getToken()) return;
    fetchPlanMeCached().then(res => {
      if (!alive) return;
      const cur = res?.current || {};
      const ts = cur.trialEndsAt ? new Date(cur.trialEndsAt).getTime() : 0;
      // selectedPlanKey = plano escolhido mas checkout não concluído (pending_checkout).
      const pendingKey = cur.selectedPlanKey || cur.planKey;
      const planEntry = pendingKey && Array.isArray(res?.plans)
        ? res!.plans.find(p => p.key === pendingKey)
        : null;
      setState({
        loaded: true,
        paused: Boolean(cur.accessPaused),
        accessState: cur.accessState || null,
        trialEnded: cur.accessState === "suspended" && ts > 0 && ts < Date.now(),
        plan: planEntry
          ? { key: planEntry.key, title: planEntry.title || planEntry.key, monthlyPrice: planEntry.monthlyPrice ?? null }
          : null,
      });
    });
    return () => { alive = false; };
  }, []);

  // Master nunca é bloqueado; sem dados ou empresa operante → sem portão.
  if (!user || user.isSystemMaster) return null;
  if (!state.loaded || !state.paused) return null;
  // Deixa o ADMIN chegar em Configurações → Plano e cobrança para resolver.
  if (pathname && pathname.startsWith("/configuracoes")) return null;

  // O backend só manda accessState para audiência de cobrança (admin/gerente);
  // vendedor vem com accessState nulo → cai no aviso neutro.
  const billingView = state.accessState != null;
  const trialEnded = state.trialEnded;
  const isPendingCheckout = state.accessState === "pending_checkout";

  // Checkout inline: substitui o gate por completo (sem aninhamento de bv-veil).
  // onDone recarrega a página — backend já atualizou o acesso sincrono.
  if (showCheckout && state.plan) {
    return (
      <SubscribeCardModal
        plan={state.plan}
        onClose={() => setShowCheckout(false)}
        onDone={() => { window.location.reload(); }}
      />
    );
  }

  async function sair() {
    if (saindo) return;
    setSaindo(true);
    try { await apiFetch("/auth/logout", { method: "POST" }); } catch { /* sessão já inválida */ }
    clearToken();
    router.replace("/login");
  }

  function verPlanos() {
    try { sessionStorage.setItem("hbx:config-sec", "Plano e cobrança"); } catch { /* sem storage */ }
    router.push("/configuracoes");
  }

  let kicker = "Acesso";
  let title = "Acesso pausado";
  let body = "O acesso da sua empresa está pausado no momento. Fale com o administrador da empresa para regularizar.";
  if (billingView) {
    if (isPendingCheckout) {
      kicker = "Plano"; title = "Ative seu plano HBX";
      body = "Complete o pagamento para liberar o acesso da sua operação.";
    } else if (trialEnded) {
      kicker = "Teste grátis"; title = "Seu teste terminou";
      body = "Escolha um plano para continuar de onde você parou.";
    } else if (state.accessState === "overdue") {
      kicker = "Pagamento"; title = "Pagamento em atraso";
      body = "Regularize o pagamento para manter o acesso da sua operação ativo.";
    } else if (state.accessState === "suspended") {
      kicker = "Acesso"; title = "Acesso suspenso";
      body = "O acesso da sua empresa está suspenso. Escolha um plano ou fale com a HBX para reativar.";
    } else {
      title = "Acesso pausado"; body = "Escolha um plano para reativar o acesso da sua operação.";
    }
  }

  // "Ativar agora" só aparece se temos o plano carregado (precisa do key pro checkout).
  const canActivateInline = isPendingCheckout && Boolean(state.plan);

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
            {billingView && (
              <>
                {canActivateInline && (
                  <button type="button" className="btn-teal" onClick={() => setShowCheckout(true)}>
                    Ativar agora →
                  </button>
                )}
                <button
                  type="button"
                  className={canActivateInline ? "bv-link" : "btn-teal"}
                  onClick={verPlanos}
                >
                  Ver planos →
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
