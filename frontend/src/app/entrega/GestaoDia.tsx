"use client";

// ================================================================
// LOGÍSTICA-MOBILE A4 — faixa de GESTÃO DO DIA no topo da aba Rota (home).
// O que no dashboard é o card ERP (ResumoDiaCard) vira, no app:
//   · ação grande "Gerar entregas de hoje" (POST /gerar-dia, com feedback do
//     nº criadas) — some o feedback sozinho depois de alguns segundos;
//   · resumo do dia como 3 STATS do app (Entregues · Recebido · A receber) —
//     SEM travessão (B2 morto): 0 / R$ 0,00 sempre. Só aparece quando carrega
//     (aditivo: se o GET falhar, não polui a tela).
// Enxuto: não polui quando vazio, ZERO texto explicativo (Lei do plano).
// Toda cor/forma vive em entrega.css (.ent-gestao/.ent-stats — 5 Leis).
// ================================================================

import { useCallback, useEffect, useState } from "react";

import { type ResumoDia, fmtMoney, gerarDia, getResumoDia } from "./gestao-api";

export function GestaoDia({ onGerou }: { onGerou: () => void }) {
  const [resumo, setResumo] = useState<ResumoDia | null>(null);
  const [gerando, setGerando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const carregarResumo = useCallback(async () => {
    try {
      setResumo(await getResumoDia());
    } catch {
      /* resumo é aditivo: falhou, não mostra os stats (não polui) */
    }
  }, []);

  useEffect(() => {
    void carregarResumo();
  }, [carregarResumo]);

  const onGerar = useCallback(async () => {
    setGerando(true);
    setMsg(null);
    try {
      const r = await gerarDia();
      setMsg(
        r.criadas > 0
          ? `${r.criadas} entrega${r.criadas === 1 ? "" : "s"} gerada${r.criadas === 1 ? "" : "s"}`
          : r.candidatos > 0
            ? "Já estava tudo gerado"
            : "Nada recorrente para hoje",
      );
      onGerou();
      await carregarResumo();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao gerar");
    } finally {
      setGerando(false);
    }
  }, [onGerou, carregarResumo]);

  // Some o feedback do "gerar" sozinho depois de um tempo (não vira ERP).
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 4000);
    return () => clearTimeout(t);
  }, [msg]);

  return (
    <section className="ent-gestao" aria-label="Gestão do dia">
      <button type="button" className="ent-btn ent-btn--secondary ent-gestao-gerar" onClick={() => void onGerar()} disabled={gerando}>
        {gerando ? "Gerando…" : "Gerar entregas de hoje"}
      </button>
      {msg ? <div className="ent-gestao-msg" role="status">{msg}</div> : null}

      {resumo ? (
        <div className="ent-stats">
          <div className="ent-stat">
            <span className="ent-stat-num">{resumo.entregues}</span>
            <span className="ent-stat-lbl">Entregues</span>
          </div>
          <div className="ent-stat">
            <span className="ent-stat-num is-ok">{fmtMoney(resumo.recebidoHoje)}</span>
            <span className="ent-stat-lbl">Recebido</span>
          </div>
          <div className="ent-stat">
            <span className="ent-stat-num is-due">{fmtMoney(resumo.aReceber)}</span>
            <span className="ent-stat-lbl">A receber</span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
