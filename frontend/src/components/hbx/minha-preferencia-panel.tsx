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

type SaveResult = {
  ok?: boolean;
  preferredSegments?: string[];
  preferredCityRegion?: string | null;
} | null;

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
  const [cityRegion, setCityRegion] = useState(initialCityRegion);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      const res = await apiFetch<SaveResult>("/profile/preferred-segments", {
        method: "PATCH",
        body: JSON.stringify({ segments, cityRegion: cityRegion.trim() || null }),
      });
      const savedSegments = res?.preferredSegments ?? segments;
      const savedCity = res?.preferredCityRegion ?? "";
      setSegments(savedSegments);
      setCityRegion(savedCity);
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
          <input className="field-dark" placeholder="Ex.: dentista, oficina" value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addSegment(); } }} />
        </div>
        <button className="btn-ghost" onClick={addSegment} disabled={!draft.trim()}>
          <I d={ICONS.plus} size={13} /> Adicionar
        </button>
        <div className="f">
          <label>Cidade/região preferida (opcional)</label>
          <input className="field-dark" placeholder="Ex.: Campinas, SP" value={cityRegion}
            onChange={e => setCityRegion(e.target.value)}
            onKeyDown={e => e.key === "Enter" && salvar()} />
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
