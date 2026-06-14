"use client";

// Painel "Puxar leads" do vendedor (B1-front, PR14062026008).
// O vendedor puxa cards da lagoa compartilhada pela preferência dele
// (segmento obrigatório + cidade/UF opcionais + quantidade) e eles caem
// DIRETO na carteira em Vendas. POST /webscraping/radar/pull-to-vendas.
// Componente isolado de propósito (baixo acoplamento com a tela /leads).
// Só classes centrais do kit (5 Leis): panel, filters, f, field-dark,
// select-dark, btn-teal, btn-ghost, tag. Sem visual inline próprio.

import { useRouter } from "next/navigation";
import { useState } from "react";

import { I, ICONS } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";

type PullResult = {
  ok?: boolean;
  pulledCount?: number;
  allowedCount?: number;
  failedCount?: number;
  dailyRemainingAfter?: number | null;
  message?: string;
} | null;

export function PuxarLeadsPanel({ onPulled, defaultSegment = "" }: { onPulled?: () => void; defaultSegment?: string }) {
  const router = useRouter();
  const [segment, setSegment] = useState(defaultSegment);
  const [city, setCity] = useState("");
  const [uf, setUf] = useState("");
  const [quantity, setQuantity] = useState(5);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PullResult>(null);
  const [error, setError] = useState<string | null>(null);

  async function puxar() {
    if (busy) return;
    if (!segment.trim()) { setError("Escolha um segmento para puxar."); return; }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiFetch<PullResult>("/webscraping/radar/pull-to-vendas", {
        method: "POST",
        body: JSON.stringify({
          segment: segment.trim(),
          city: city.trim() || undefined,
          state: uf.trim() || undefined,
          quantity,
        }),
      });
      setResult(res);
      if (res?.pulledCount && res.pulledCount > 0) onPulled?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível puxar leads agora.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2><I d={ICONS.plus} size={14} /> Puxar leads da lagoa</h2>
        <div className="meta"><small>Os leads que você puxar vão direto para a sua carteira em Vendas.</small></div>
      </div>
      <div className="filters">
        <div className="f">
          <label>Segmento</label>
          <input className="field-dark" placeholder="Ex.: dentista, oficina" value={segment}
            onChange={e => setSegment(e.target.value)} onKeyDown={e => e.key === "Enter" && puxar()} />
        </div>
        <div className="f">
          <label>Cidade (opcional)</label>
          <input className="field-dark" placeholder="Todas" value={city} onChange={e => setCity(e.target.value)} />
        </div>
        <div className="f">
          <label>UF (opcional)</label>
          <input className="field-dark" placeholder="SP" maxLength={2} value={uf}
            onChange={e => setUf(e.target.value.toUpperCase())} />
        </div>
        <div className="f">
          <label>Quantidade</label>
          <select className="select-dark" value={quantity} onChange={e => setQuantity(Number(e.target.value))}>
            {[1, 3, 5, 10, 20].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <button className="btn-teal" onClick={puxar} disabled={busy}>
          {busy ? "Puxando…" : "Puxar leads"}
        </button>
      </div>
      {(error || result) && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "0 16px 12px" }}>
          {error && <span className="tag warn">{error}</span>}
          {result && (
            <span className={result.pulledCount ? "tag teal" : "tag"}>
              {result.message}
              {result.dailyRemainingAfter != null ? ` · restam ${result.dailyRemainingAfter} hoje` : ""}
            </span>
          )}
          {result?.pulledCount ? (
            <button className="btn-ghost" onClick={() => router.push("/vendas")}>
              <I d={ICONS.arrow} size={13} /> Ir para Vendas
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}
