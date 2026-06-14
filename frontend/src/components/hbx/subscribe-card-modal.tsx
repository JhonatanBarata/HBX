"use client";

// Assinatura recorrente (cartão) — consome o motor que JÁ existe:
//   GET  /financeiro/payments-config     → { mode: 'mock'|'live', publicKey }
//   POST /financeiro/subscription/create  { planKey, billingCycle:'MONTHLY', cardTokenId }
// LIVE: renderiza o Card Brick do Mercado Pago (SDK v2) com a chave PÚBLICA; o
//   cartão é tokenizado no navegador (o nº NUNCA passa pelo HBX) e só o token vai
//   pro backend. A assinatura é autorizada na hora (sem esperar liquidar).
// MOCK (dev): assina sem SDK, pra testar o fluxo tela-a-tela.
// Lei 5: visual reusa .bv-*/.btn-* (zero CSS/estilo visual novo).

import React, { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

type PlanLite = { key: string; title: string; monthlyPrice?: number | null };
type Mode = "mock" | "live";

// Tipos mínimos do SDK do Mercado Pago (a lib não traz tipos) — evita `any`.
type MpBrickController = { unmount?: () => void };
type MpCardSubmitData = { token?: string };
type MpInstance = {
  bricks: () => {
    create: (type: string, containerId: string, settings: unknown) => Promise<MpBrickController>;
  };
};
type MpConstructor = new (publicKey: string, options: { locale: string }) => MpInstance;

function fmt(v?: number | null) {
  return v != null && Number.isFinite(v) ? `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/mês` : "";
}

// Carrega o SDK v2 do Mercado Pago uma única vez.
function loadMpSdk(): Promise<MpConstructor> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as { MercadoPago?: MpConstructor };
    if (w.MercadoPago) { resolve(w.MercadoPago); return; }
    const ID = "mp-sdk-v2";
    const done = () => {
      const ctor = (window as unknown as { MercadoPago?: MpConstructor }).MercadoPago;
      if (ctor) resolve(ctor); else reject(new Error("sdk_load_failed"));
    };
    const existing = document.getElementById(ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", done);
      existing.addEventListener("error", () => reject(new Error("sdk_load_failed")));
      return;
    }
    const s = document.createElement("script");
    s.id = ID;
    s.src = "https://sdk.mercadopago.com/js/v2";
    s.async = true;
    s.onload = done;
    s.onerror = () => reject(new Error("sdk_load_failed"));
    document.body.appendChild(s);
  });
}

export function SubscribeCardModal({ plan, onClose, onDone }: {
  plan: PlanLite;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<Mode>("mock");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const brickMounted = useRef(false);

  // 1) Descobre o modo + chave pública.
  useEffect(() => {
    let alive = true;
    apiFetch<{ mode?: Mode; publicKey?: string | null }>("/financeiro/payments-config")
      .then(cfg => {
        if (!alive) return;
        setMode(cfg?.mode === "live" ? "live" : "mock");
        setPublicKey(cfg?.publicKey || null);
        setLoaded(true);
      })
      .catch(() => { if (alive) { setErr("Não foi possível carregar o checkout."); setLoaded(true); } });
    return () => { alive = false; };
  }, []);

  async function criarAssinatura(cardTokenId: string) {
    return apiFetch<{ ok?: boolean }>("/financeiro/subscription/create", {
      method: "POST",
      body: JSON.stringify({ planKey: plan.key, billingCycle: "MONTHLY", cardTokenId }),
    });
  }

  // 2) LIVE: monta o Card Brick quando o SDK + a chave estiverem prontos.
  useEffect(() => {
    if (!loaded || mode !== "live" || !publicKey || brickMounted.current) return;
    brickMounted.current = true;
    let controller: { unmount?: () => void } | null = null;
    loadMpSdk()
      .then((MP) => {
        const mp = new MP(publicKey, { locale: "pt-BR" });
        return mp.bricks().create("cardPayment", "hbx-card-brick", {
          initialization: { amount: Number(plan.monthlyPrice || 0) || 1 },
          customization: { visual: { hideFormTitle: true } },
          callbacks: {
            onReady: () => { /* pronto */ },
            onError: () => setErr("Erro ao carregar o formulário de cartão. Tente novamente."),
            onSubmit: async (formData: MpCardSubmitData) => {
              setErr(null);
              setBusy(true);
              try {
                const token = String(formData?.token || "").trim();
                if (!token) throw new Error("Cartão não tokenizado.");
                await criarAssinatura(token);
                onDone("✓ Assinatura ativa! Seu acesso está liberado.");
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Não foi possível concluir a assinatura.");
                setBusy(false);
              }
            },
          },
        });
      })
      .then(c => { controller = c; })
      .catch(() => setErr("Não foi possível carregar o Mercado Pago. Verifique a conexão."));
    return () => { try { controller?.unmount?.(); } catch { /* ok */ } brickMounted.current = false; };
  }, [loaded, mode, publicKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // MOCK (dev): assina sem SDK.
  function assinarMock() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    criarAssinatura("MOCK-DEV-TOKEN")
      .then(() => onDone("✓ Assinatura ativa (modo teste). Acesso liberado."))
      .catch(e => { setErr(e instanceof Error ? e.message : "Falha ao assinar."); setBusy(false); });
  }

  return (
    <div className="bv-veil" onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="bv-card">
        <div className="bv-hero">
          <span className="orb" />
          <span className="kicker">Assinatura</span>
          <h2>Assinar {plan.title}</h2>
          <p>{fmt(plan.monthlyPrice)} · cobrança mensal recorrente no cartão. O acesso libera assim que o cartão é autorizado.</p>
        </div>
        <div className="bv-body">
          {!loaded && <div className="bv-hint">Carregando checkout…</div>}

          {loaded && mode === "live" && <div id="hbx-card-brick" />}

          {loaded && mode === "mock" && (
            <React.Fragment>
              <div className="bv-hint">Ambiente de teste (mock): nenhum cartão real é cobrado. Use para validar o fluxo.</div>
              <button type="button" className="btn-teal" disabled={busy} onClick={assinarMock}>
                {busy ? "Assinando…" : "Assinar (modo teste)"}
              </button>
            </React.Fragment>
          )}

          {err && <div className="bv-msg bad">{err}</div>}

          <div className="bv-foot">
            <button type="button" className="bv-link" disabled={busy} onClick={onClose}>Fechar</button>
            <span className="grow" />
          </div>
        </div>
      </div>
    </div>
  );
}
