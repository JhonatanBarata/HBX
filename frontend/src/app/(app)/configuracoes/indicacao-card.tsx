"use client";

// S5 INDICAÇÃO — card "Indique e ganhe" (Configurações → Créditos, audiência de
// cobrança). Feature DORMENTE: renderiza SÓ se GET /credits/indicacao/me responder
// 200 (HBX_INDICACAO_ENABLED OFF ⇒ 404 ⇒ null, zero UI). Link com copiar + quantas
// indicações converteram (bônus dos dois lados sai na 1ª recarga paga da indicada).

import React, { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";

type IndicacaoMe = {
  code: string;
  link: string;
  bonusCredits: number;
  indicadas: number;
  convertidas: number;
};

export function IndicacaoCard() {
  const [me, setMe] = useState<IndicacaoMe | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    let alive = true;
    apiFetch<IndicacaoMe>("/credits/indicacao/me")
      .then(res => { if (alive && res?.link) setMe(res); })
      .catch(() => { /* 404 = programa desligado → sem card */ });
    return () => { alive = false; };
  }, []);

  if (!me) return null;

  async function copiar() {
    if (!me) return;
    try {
      await navigator.clipboard.writeText(me.link);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch { /* clipboard bloqueado — o campo continua selecionável */ }
  }

  return (
    <section className="panel cfg-section">
      <div className="panel-head"><h2>Indique e ganhe</h2></div>
      <div style={{ padding: 18, display: "grid", gap: 10 }}>
        <p style={{ margin: 0, fontSize: "0.74rem", lineHeight: 1.5, color: "var(--text-muted)" }}>
          Compartilhe seu link. Quando a empresa indicada fizer a primeira recarga, vocês dois ganham <strong>{me.bonusCredits} créditos</strong>.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            className="field-dark"
            value={me.link}
            readOnly
            style={{ flex: 1, minWidth: 220 }}
            onFocus={e => e.currentTarget.select()}
            aria-label="Link de indicação"
          />
          <button className="btn-teal" type="button" onClick={copiar} style={{ minHeight: 34, fontSize: "0.72rem" }}>
            {copiado ? "✓ Copiado" : "Copiar link"}
          </button>
        </div>
        <p style={{ margin: 0, fontSize: "0.7rem", color: "var(--text-muted)" }}>
          {me.convertidas} de {me.indicadas} indicações converteram.
        </p>
      </div>
    </section>
  );
}
