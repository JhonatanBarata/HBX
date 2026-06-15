"use client";

// Painel "Minha preferência" do vendedor (self-service, PR14062026014 §2.3).
// O vendedor vê/edita o(s) segmento(s) e a cidade/região que prefere — isso
// vira o DEFAULT do "Puxar leads". Antes só o admin gravava no cadastro.
// PATCH /profile/preferred-segments { segments, cityRegion }.
// Só classes centrais do kit (5 Leis): panel, panel-head, filters, f,
// field-dark, btn-teal, btn-ghost, tag. Sem cor/borda/sombra própria no TSX.

import { useState } from "react";

import { I, ICONS } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";
import { BRAZIL_UF_OPTIONS, brazilCityOptionsForUf } from "@/lib/brazil-cities";
import { RADAR_SEGMENTS_FLAT, categoryOfSegment } from "@/lib/radar-segments";

type SaveResult = {
  ok?: boolean;
  preferredSegments?: string[];
  preferredCityRegion?: string | null;
} | null;

// "Campinas, SP" → { city: "Campinas", uf: "SP" }. Tolerante (só cidade, ou vazio).
function parseCityRegion(value: string): { city: string; uf: string } {
  const m = String(value || "").trim().match(/^(.*?)[,\s]+([A-Za-z]{2})$/);
  if (m) return { city: m[1].trim(), uf: m[2].toUpperCase() };
  return { city: String(value || "").trim(), uf: "" };
}

export function MinhaPreferenciaPanel({
  initialSegments = [],
  initialCityRegion = "",
  onSaved,
}: {
  initialSegments?: string[];
  initialCityRegion?: string;
  onSaved?: (segments: string[], cityRegion: string) => void;
}) {
  const [segments, setSegments] = useState<string[]>(initialSegments);
  const [draft, setDraft] = useState("");
  const [prefCity, setPrefCity] = useState(() => parseCityRegion(initialCityRegion).city);
  const [prefUf, setPrefUf] = useState(() => parseCityRegion(initialCityRegion).uf);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cityOptions = brazilCityOptionsForUf(prefUf);

  function addSegment() {
    const value = draft.trim().replace(/\s+/g, " ");
    if (!value) return;
    setSegments(prev => (prev.some(s => s.toLowerCase() === value.toLowerCase()) ? prev : [...prev, value].slice(0, 12)));
    setDraft("");
    setMsg(null);
  }

  function removeSegment(value: string) {
    setSegments(prev => prev.filter(s => s !== value));
    setMsg(null);
  }

  async function salvar() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const cityRegion = [prefCity.trim(), prefUf.trim()].filter(Boolean).join(", ");
      const res = await apiFetch<SaveResult>("/profile/preferred-segments", {
        method: "PATCH",
        body: JSON.stringify({ segments, cityRegion: cityRegion || null }),
      });
      const savedSegments = res?.preferredSegments ?? segments;
      const savedCity = res?.preferredCityRegion ?? "";
      setSegments(savedSegments);
      const parsed = parseCityRegion(savedCity);
      setPrefCity(parsed.city);
      setPrefUf(parsed.uf);
      setMsg(savedSegments.length ? "Preferência salva." : "Preferência limpa — usando o ramo da empresa.");
      onSaved?.(savedSegments, savedCity);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar sua preferência agora.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2><I d={ICONS.users} size={14} /> Minha preferência de leads</h2>
        <div className="meta"><small>Define o segmento que já vem preenchido quando você puxa leads da lagoa.</small></div>
      </div>
      <div className="filters">
        <div className="f">
          <label>Adicionar segmento</label>
          <input className="field-dark" list="pref-segmentos" placeholder="Escolha ou digite (ex.: dentistas)" value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addSegment(); } }} />
          <datalist id="pref-segmentos">
            {RADAR_SEGMENTS_FLAT.map(s => <option key={s} value={s}>{categoryOfSegment(s) || ""}</option>)}
          </datalist>
        </div>
        <button className="btn-ghost" onClick={addSegment} disabled={!draft.trim()}>
          <I d={ICONS.plus} size={13} /> Adicionar
        </button>
        <div className="f">
          <label>Estado (opcional)</label>
          <select className="select-dark" value={prefUf} onChange={e => { setPrefUf(e.target.value); setPrefCity(""); }}>
            <option value="">Todos</option>
            {BRAZIL_UF_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="f">
          <label>Cidade (opcional)</label>
          <input className="field-dark" list="pref-cidades" placeholder={prefUf ? `Cidade de ${prefUf}` : "Selecione o estado"} value={prefCity}
            onChange={e => setPrefCity(e.target.value)} onKeyDown={e => e.key === "Enter" && salvar()} />
          <datalist id="pref-cidades">
            {cityOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </datalist>
        </div>
        <button className="btn-teal" onClick={salvar} disabled={busy}>
          {busy ? "Salvando…" : "Salvar preferência"}
        </button>
      </div>
      <div className="chip-row">
        {segments.length === 0
          ? <small className="text-ink-muted">Sem segmento preferido — o padrão cai no ramo da empresa.</small>
          : segments.map(seg => (
              <span key={seg} className="tag teal">
                {seg}
                <span role="button" aria-label={`Remover ${seg}`} title="Remover" className="chip-x" onClick={() => removeSegment(seg)}>✕</span>
              </span>
            ))}
        {error && <span className="tag warn">{error}</span>}
        {msg && <span className="tag teal">{msg}</span>}
      </div>
    </section>
  );
}
