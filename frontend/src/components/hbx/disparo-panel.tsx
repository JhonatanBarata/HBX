"use client";

// ALERTA DE LEAD QUENTE (dono, 30/07/2026 — cartão cortado em 01/08/2026)
//
// Aqui morava também o PAINEL DE DISPAROS da barra lateral: um cartão com
// contador, relógio e barrinha, e uma central de regras que abria no clique.
// O dono cortou o cartão em 01/08 ("ficou de bad taste" na sidebar) — e a
// central foi junto, porque o cartão era a ÚNICA porta dela.
//
// Ficou o que o cartão guardava de valioso: quando um lead demonstra interesse,
// o sistema inteiro respira uma cor por 1s e um aviso sobe no topo da tela.
// Clicar abre o cliente com o Detalhes aberto (reusa o contrato sessionStorage
// "hbx:vendas-focus-lead" que a Agenda já usa). O aviso não é de vendas: ele
// precisa chegar onde o vendedor estiver, então o componente fica montado em
// TODA tela.
//
// Dados: GET /vendas/automation/live-status (o MESMO contrato da tela
// /automacao — nenhum endpoint novo). Guardado por BotArmedGuard no backend:
// 402/403 aqui significa "bot não ativo" → não existe alerta nenhum.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { apiFetch, getToken } from "@/lib/api";
import { type ProspLive } from "@/lib/use-prospecting-config";
import { I, ICONS } from "@/components/hbx/shell";

type ColdGateSnapshot = {
  enabled: boolean;
  maxPerDay: number;
  minSpacingMinutes: number;
  similarityPct: number;
  sentToday: number;
  remainingToday: number;
  nextAllowedColdAt: string | null;
  lastBlock: { reason: string; at: string } | null;
};

type HotLead = { leadId: string; leadName: string | null; at: string };

/** O que /vendas/automation/live-status devolve além do contrato da /automacao. */
export type DisparoLive = ProspLive & {
  hotLead?: HotLead | null;
  coldGate?: ColdGateSnapshot | null;
  // S4 (B11): disparos com hora marcada — existem com ou sem campanha.
  agendadosFuturos?: number;
  proximoAgendadoAt?: string | null;
};

const HOT_SEEN_KEY = "hbx:hotlead-seen";
const POLL_ACTIVE_MS = 10_000;
const POLL_IDLE_MS = 60_000;

function useDisparoLive() {
  const [live, setLive] = useState<DisparoLive | null>(null);

  useEffect(() => {
    if (!getToken()) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = () => {
      apiFetch<DisparoLive>("/vendas/automation/live-status")
        .then((res) => {
          if (!alive) return;
          setLive(res ?? null);
          timer = setTimeout(tick, POLL_ACTIVE_MS);
        })
        .catch(() => {
          // 402/403/404 = bot não ativo pra esta conta; qualquer outro erro é
          // rede. Nos dois casos não há lead quente pra avisar — espaça e tenta
          // de novo, calado.
          if (!alive) return;
          setLive(null);
          timer = setTimeout(tick, POLL_IDLE_MS);
        });
    };
    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return live;
}

// ── Alerta de lead quente ────────────────────────────────────────────────────

function readHotSeen(): number {
  try {
    return new Date(localStorage.getItem(HOT_SEEN_KEY) || 0).getTime() || 0;
  } catch {
    return 0;
  }
}

function markHotSeen(at: string) {
  try {
    localStorage.setItem(HOT_SEEN_KEY, at);
  } catch { /* sem storage */ }
}

function HotLeadToast({ hot, onOpen, onDismiss }: { hot: HotLead; onOpen: () => void; onDismiss: () => void }) {
  return (
    <div className="hot-toast" role="alert">
      <button type="button" className="hot-toast__body" onClick={onOpen}>
        <span className="hot-toast__flame"><I d={ICONS.automacao} size={16} /></span>
        <span className="hot-toast__text">
          <strong>{hot.leadName || "Lead"}</strong>
          <small>respondeu — abrir agora</small>
        </span>
        <I d={ICONS.arrow} size={15} />
      </button>
      <button type="button" className="hot-toast__x" onClick={onDismiss} aria-label="Dispensar aviso">
        <I d={ICONS.plus} size={12} />
      </button>
    </div>
  );
}

export function AlertaLeadQuente() {
  const router = useRouter();
  const live = useDisparoLive();
  const [hot, setHot] = useState<HotLead | null>(null);

  // Lead quente novo (mais recente que o último visto) → dispara o ritual:
  // respiro de cor no sistema inteiro (1s) + aviso no topo. Não depende de
  // campanha rodando (correção S4/B11): o modo do dono é MANUAL, e a cena
  // Tagliágua — lead perguntou "como que funciona ?" e ninguém viu — aconteceu
  // com a campanha parada.
  // setState dentro do rAF (não no corpo do effect) — regra dura de lint do repo.
  useEffect(() => {
    const candidate = live?.hotLead;
    if (!candidate?.leadId || !candidate.at) return;
    if (new Date(candidate.at).getTime() <= readHotSeen()) return;
    const id = requestAnimationFrame(() => setHot(candidate));
    return () => cancelAnimationFrame(id);
  }, [live?.hotLead?.at, live?.hotLead]);

  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hot) return;
    const root = document.documentElement;
    root.classList.add("hbx-hot-flash");
    flashTimer.current = setTimeout(() => root.classList.remove("hbx-hot-flash"), 1_000);
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
      root.classList.remove("hbx-hot-flash");
    };
  }, [hot?.at, hot]);

  const openHotLead = useCallback(() => {
    if (!hot) return;
    markHotSeen(hot.at);
    try {
      sessionStorage.setItem("hbx:vendas-focus-lead", hot.leadId);
    } catch { /* sem storage */ }
    setHot(null);
    router.push("/vendas");
  }, [hot, router]);

  const dismissHot = useCallback(() => {
    if (hot) markHotSeen(hot.at);
    setHot(null);
  }, [hot]);

  if (!hot) return null;

  return <HotLeadToast hot={hot} onOpen={openHotLead} onDismiss={dismissHot} />;
}
