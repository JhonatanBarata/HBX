"use client";

// Card único "Puxar leads" do vendedor (PR16062026020 — repaginação 16/06).
// Funde a antiga "Minha preferência" aqui dentro: o vendedor escolhe o tipo de
// cliente + cidade/UF + quantidade e os cards caem DIRETO na carteira em Vendas
// (POST /webscraping/radar/pull-to-vendas). A "preferência" virou plumbing
// invisível — ao puxar com sucesso gravamos o segmento (rememberOnPull) via
// PATCH /profile/preferred-segments, que alimenta o boost de ordenação da lista.
// Linguagem de vendedora: "Tipo de cliente" / "Quantos" / "Puxar N leads".
// Só classes centrais do kit (5 Leis): panel, filters, f, field-dark,
// select-dark, btn-teal, btn-ghost, tag, chip-row. Sem visual inline próprio.

import { useRouter } from "next/navigation";
import { useState } from "react";

import { I, ICONS } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";
import { BRAZIL_UF_OPTIONS, brazilCityOptionsForUf } from "@/lib/brazil-cities";
import { RADAR_SEGMENTS_FLAT, categoryOfSegment } from "@/lib/radar-segments";

type PullResult = {
  ok?: boolean;
  pulledCount?: number;
  allowedCount?: number;
  failedCount?: number;
  dailyRemainingAfter?: number | null;
  message?: string;
} | null;

export function PuxarLeadsPanel({
  onPulled,
  defaultSegment = "",
  poolDisponivel = null,
  rememberOnPull = false,
}: {
  onPulled?: () => void;
  defaultSegment?: string;
  // Quantos leads a lagoa tem agora — vira convite dentro do próprio card.
  poolDisponivel?: number | null;
  // Vendedor: ao puxar, lembra o tipo de cliente como preferência (boost da lista).
  rememberOnPull?: boolean;
}) {
  const router = useRouter();
  const [segment, setSegment] = useState(defaultSegment);
  const [city, setCity] = useState("");
  const [uf, setUf] = useState("");
  const [radiusKm, setRadiusKm] = useState(0);
  const [quantity, setQuantity] = useState(5);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PullResult>(null);
  const [error, setError] = useState<string | null>(null);
  const cityOptions = brazilCityOptionsForUf(uf);

  async function puxar() {
    if (busy) return;
    if (!segment.trim()) { setError("Escolha o tipo de cliente que você quer."); return; }
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
          // Alcance (B5): raio só faz sentido com cidade; o backend resolve as
          // cidades vizinhas e a lagoa transborda pra elas (cidade primeiro).
          radiusKm: city.trim() && radiusKm > 0 ? radiusKm : undefined,
          quantity,
        }),
      });
      setResult(res);
      if (res?.pulledCount && res.pulledCount > 0) {
        onPulled?.();
        // Preferência invisível: lembra o tipo de cliente puxado (alimenta o
        // boost de ordenação). Fire-and-forget — nunca atrapalha o puxar.
        if (rememberOnPull) {
          apiFetch("/profile/preferred-segments", {
            method: "PATCH",
            body: JSON.stringify({ segments: [segment.trim()] }),
          }).catch(() => { /* preferência é só boost; falha aqui é silenciosa */ });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível puxar leads agora.");
    } finally {
      setBusy(false);
    }
  }

  const podeColher = poolDisponivel != null && poolDisponivel > 0;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2><I d={ICONS.plus} size={14} /> Puxar leads pra minha carteira</h2>
        <div className="meta">
          {podeColher
            ? <span className="tag teal">{poolDisponivel!.toLocaleString("pt-BR")} esperando na lagoa</span>
            : <small>Escolha o tipo de cliente e quantos você quer — eles caem direto no seu Vendas.</small>}
        </div>
      </div>
      <div className="filters">
        <div className="f">
          <label>Tipo de cliente</label>
          <input className="field-dark" list="puxar-segmentos" placeholder="Ex.: dentistas, oficinas, pizzarias" value={segment}
            onChange={e => setSegment(e.target.value)} onKeyDown={e => e.key === "Enter" && puxar()} />
          <datalist id="puxar-segmentos">
            {RADAR_SEGMENTS_FLAT.map(s => <option key={s} value={s}>{categoryOfSegment(s) || ""}</option>)}
          </datalist>
        </div>
        <div className="f">
          <label>Cidade (opcional)</label>
          <input className="field-dark" list="puxar-cidades" placeholder={uf ? `Digite uma cidade de ${uf}` : "Todas"} value={city} onChange={e => setCity(e.target.value)} />
          <datalist id="puxar-cidades">
            {cityOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </datalist>
        </div>
        <div className="f">
          <label>Estado (opcional)</label>
          <select className="select-dark" value={uf} onChange={e => { setUf(e.target.value); setCity(""); }}>
            <option value="">Todos</option>
            {BRAZIL_UF_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="f">
          <label>Alcance</label>
          <select className="select-dark" value={radiusKm} onChange={e => setRadiusKm(Number(e.target.value))}
            disabled={!city.trim()} title={city.trim() ? "Inclui cidades vizinhas no raio" : "Informe uma cidade para usar o alcance"}>
            <option value={0}>Só a cidade</option>
            <option value={25}>+ 25 km</option>
            <option value={50}>+ 50 km</option>
            <option value={100}>+ 100 km</option>
          </select>
        </div>
        <div className="f">
          <label>Quantos</label>
          <select className="select-dark" value={quantity} onChange={e => setQuantity(Number(e.target.value))}>
            {[1, 3, 5, 10, 20].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <button className="btn-teal" onClick={puxar} disabled={busy}>
          {busy ? "Puxando…" : `Puxar ${quantity} ${quantity === 1 ? "lead" : "leads"}`}
        </button>
      </div>
      {(error || result) && (
        <div className="chip-row">
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
