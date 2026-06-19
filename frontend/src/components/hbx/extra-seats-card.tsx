"use client";

// F6 — compra de assentos extras pelo ADMIN. Cobra-se AGORA só os dias que faltam
// do mês (paga-primeiro); no próximo mês entra o valor cheio por assento. O preview
// vem do backend (dryRun); a compra só sobe a capacidade (seatCap) com o pagamento
// confirmado. POST /financeiro/subscription/extra-seats.
// Lei 5 (design system): visual só por classe central (.sc-*, kv, btn-*).

import React, { useState } from "react";

import { apiFetch } from "@/lib/api";

type Preview = {
  seats: number; extraSeatMonthly: number; remainingDays: number; daysInMonth: number;
  chargeNow: number; nextCycleFullAmount: number; currentSeatCap: number; newSeatCap: number; isPaying: boolean;
};
type Resp = { ok?: boolean; dryRun?: boolean; code?: string; message?: string; preview?: Preview; newSeatCap?: number };

const brl = (v: number) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function ExtraSeatsCard({ onDone }: { onDone?: () => void }) {
  const [seats, setSeats] = useState(1);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function ajustar(delta: number) {
    setSeats(s => Math.min(50, Math.max(1, s + delta)));
    setPreview(null);
    setMsg(null);
  }

  async function calcular() {
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const res = await apiFetch<Resp>("/financeiro/subscription/extra-seats", {
        method: "POST", body: JSON.stringify({ seats, dryRun: true }),
      });
      setPreview(res?.preview || null);
      if (!res?.preview) setMsg(res?.message || "Não foi possível calcular.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao calcular.");
    } finally { setBusy(false); }
  }

  async function comprar() {
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const res = await apiFetch<Resp>("/financeiro/subscription/extra-seats", {
        method: "POST", body: JSON.stringify({ seats }),
      });
      if (res?.ok) {
        setMsg(`✓ ${seats} assento(s) adicionado(s). Capacidade agora: ${res.newSeatCap}.`);
        setPreview(null);
        onDone?.();
      } else if (res?.code === "LIVE_SEAT_CHARGE_TODO") {
        setMsg("A cobrança no cartão real ainda está em validação. Fale com o suporte para liberar.");
      } else if (res?.code === "NEEDS_CHECKOUT") {
        setMsg("Ative sua assinatura antes de comprar assentos extras.");
      } else {
        setMsg(res?.message || "Não foi possível concluir a compra.");
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha na compra.");
    } finally { setBusy(false); }
  }

  return (
    <div className="sc-quotas">
      <span className="field-label">Assentos extras</span>
      <span className="sc-hint">
        Precisa de mais acessos do que o plano inclui? Some assentos agora: cobramos só os dias que faltam do mês;
        no próximo mês entra o valor cheio por assento.
      </span>
      {msg && <div className={"sc-msg " + (msg.startsWith("✓") ? "is-ok" : "is-warn")}>{msg}</div>}
      <div className="sc-seats-row">
        <button className="btn-ghost" disabled={busy || seats <= 1} onClick={() => ajustar(-1)} aria-label="Menos um assento">−</button>
        <span className="sc-seats-n">{seats}</span>
        <button className="btn-ghost" disabled={busy || seats >= 50} onClick={() => ajustar(1)} aria-label="Mais um assento">+</button>
        <button className="btn-ghost" disabled={busy} onClick={calcular}>Calcular</button>
      </div>
      {preview && (
        <React.Fragment>
          <div className="kv">
            <div className="row"><span className="k">Cobrança agora ({preview.remainingDays}/{preview.daysInMonth} dias)</span><span className="v">{brl(preview.chargeNow)}</span></div>
            <div className="row"><span className="k">Próximo mês (cheio)</span><span className="v">{brl(preview.nextCycleFullAmount)}/mês</span></div>
            <div className="row"><span className="k">Capacidade de acessos</span><span className="v">{preview.currentSeatCap} → {preview.newSeatCap}</span></div>
          </div>
          <button className="btn-teal" disabled={busy} onClick={comprar}>
            {busy ? "Processando…" : `Comprar ${seats} assento(s) — ${brl(preview.chargeNow)} agora`}
          </button>
        </React.Fragment>
      )}
    </div>
  );
}
