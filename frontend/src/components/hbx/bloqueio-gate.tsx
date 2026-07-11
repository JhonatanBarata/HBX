"use client";

// Portão de BLOQUEIO (paywall mansa) — montado no AuthGate, sobrepõe o app quando
// a empresa não pode operar (accessPaused). MODELO CRÉDITO (W3/PR10072026): a UI
// de assinatura legada ("Ative seu plano HBX", checkout inline) morreu — quem tem
// audiência de cobrança (admin) é apontado pra Configurações → Créditos (recarga);
// vendedor vê aviso NEUTRO (sem valor/cobrança — PAGAMENTOS.md). Enforcement real
// continua no backend; isto é só UX (FRONTEND.md).
// Lei 5: todo visual reusa as classes .bv-* (mesmo gate das boas-vindas).

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { clearPlanMeCache, fetchPlanMeCached, peekPlanMeCache, useCurrentUser } from "@/components/hbx/shell";
import { apiFetch, getToken } from "@/lib/api";
import { useHbxShell } from "@/lib/hbx-shell";
import { logout } from "@/lib/logout";

type GateState = {
  loaded: boolean;
  paused: boolean;
  accessState: string | null;
};

const EMPTY_STATE: GateState = { loaded: false, paused: false, accessState: null };

function deriveGateState(res: Awaited<ReturnType<typeof fetchPlanMeCached>>): GateState {
  const cur = res?.current || {};
  return {
    loaded: true,
    paused: Boolean(cur.accessPaused),
    accessState: cur.accessState || null,
  };
}

export function BloqueioGate() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useCurrentUser();
  // MODO-SHELL (Play billing): na casca Android o CTA de recarga/pagamento não
  // pode existir — anti-steering pega até texto apontando compra. Copy neutra.
  const shellMode = useHbxShell();
  // Init SÍNCRONO do cache: em navegação client já monta bloqueado, sem flash.
  const [state, setState] = useState<GateState>(() => {
    const cached = peekPlanMeCache();
    return cached !== undefined ? deriveGateState(cached) : EMPTY_STATE;
  });
  const [saindo, setSaindo] = useState(false);
  const syncedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    if (!getToken() || !user || user.isSystemMaster) return;
    fetchPlanMeCached().then(res => {
      if (!alive) return;
      setState(deriveGateState(res));
    });
    return () => { alive = false; };
  }, [user]);

  // Re-sync 1x ao abrir o bloqueio (no lugar de poll de fundo): pega webhook
  // perdido e libera na hora se o gateway já confirmou o pagamento. Só pra quem
  // tem cobrança ativa; vendedor (accessState nulo) pula.
  useEffect(() => {
    if (syncedRef.current) return;
    if (!getToken() || !user || user.isSystemMaster) return;
    if (!state.loaded || !state.paused) return;
    if (state.accessState == null || state.accessState === "pending_checkout") return;
    syncedRef.current = true;
    let alive = true;
    apiFetch("/financeiro/subscription/sync", { method: "POST" })
      .then(() => { clearPlanMeCache(); return fetchPlanMeCached(); })
      .then(res => { if (alive) setState(deriveGateState(res)); })
      .catch(() => { /* silencioso; o webhook ainda resolve */ });
    return () => { alive = false; };
  }, [state.loaded, state.paused, state.accessState, user]);

  // Master nunca é bloqueado; sem dados ou empresa operante → sem portão.
  if (!user || user.isSystemMaster) return null;
  if (!state.loaded || !state.paused) return null;
  // Deixa o ADMIN chegar em Configurações → Créditos para resolver (recarga).
  if (pathname && pathname.startsWith("/configuracoes")) return null;

  // O backend só manda accessState para audiência de cobrança (admin/gerente);
  // vendedor vem com accessState nulo → cai no aviso neutro.
  const billingView = state.accessState != null;

  async function sair() {
    if (saindo) return;
    setSaindo(true);
    // Helper único (lib/logout.ts): POST best-effort + limpeza + transição de
    // saída + landing.
    await logout();
  }

  function verCreditos() {
    try { sessionStorage.setItem("hbx:config-sec", "Créditos"); } catch { /* sem storage */ }
    router.push("/configuracoes");
  }

  const kicker = billingView && !shellMode ? "Créditos" : "Acesso";
  const title = "Acesso pausado";
  // No shell, a visão de cobrança vira aviso neutro (sem apontar recarga/compra).
  const body = billingView
    ? (shellMode
      ? "Fale com o suporte para regularizar o acesso."
      : "Recarregue seus créditos para liberar sua operação.")
    : "O acesso da sua empresa está pausado no momento. Fale com o administrador da empresa para regularizar.";

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
            {billingView && !shellMode && (
              <button type="button" className="btn-teal" onClick={verCreditos}>
                Ver créditos →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
