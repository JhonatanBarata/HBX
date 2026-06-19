"use client";

// PRÉVIA DEV (não é tela de produto): mostra o cartão mock preenchendo ao digitar
// + o "momento da aprovação" (verde/vermelho) SEM backend e SEM andar o funil.
// Serve pro dono acompanhar o visual (ordem 19/06). Removível — é só um harness,
// igual ao /dev/pele. O funil real renderiza o mesmo CheckoutPanel sem demoOutcome.

import { useState } from "react";

import { CheckoutPanel } from "@/components/hbx/checkout-panel";

export default function DevCheckoutPreview() {
  const [outcome, setOutcome] = useState<"approved" | "declined">("approved");
  const [round, setRound] = useState(0);
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, gap: 16 }}>
      <div style={{ display: "grid", gap: 14, width: "min(460px, 100%)" }}>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          <button type="button" className={outcome === "approved" ? "btn-teal" : "btn-ghost"} style={{ minHeight: 36, fontSize: "0.74rem", padding: "0 12px" }} onClick={() => setOutcome("approved")}>Próximo: aprovado</button>
          <button type="button" className={outcome === "declined" ? "btn-teal" : "btn-ghost"} style={{ minHeight: 36, fontSize: "0.74rem", padding: "0 12px" }} onClick={() => setOutcome("declined")}>Próximo: recusado</button>
          <button type="button" className="btn-ghost" style={{ minHeight: 36, fontSize: "0.74rem", padding: "0 12px" }} onClick={() => setRound((r) => r + 1)}>Resetar</button>
        </div>
        <p className="sub" style={{ textAlign: "center", margin: 0 }}>
          Digite um cartão (número qualquer) pra ver o mock preencher; clique em <b>Pagar</b> pra ver o efeito.
        </p>
        <CheckoutPanel
          key={round}
          planKey="hbx_padrao"
          email="demo@hbx.com.br"
          name="Demo HBX"
          demoOutcome={outcome}
          onSuccess={() => setRound((r) => r + 1)}
        />
      </div>
    </main>
  );
}
