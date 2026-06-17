"use client";

// Card "Puxar leads" do vendedor — dois passos (PR17062026041):
// 1) Formulário → GET /webscraping/radar/pull-preview → lista bonita c/ checkbox
// 2) Vendedora marca o que quer → POST /webscraping/radar/pull-to-vendas com leadIds
// Contato permanece mascarado na prévia; revela ao importar.
// Radar VIVO (PR17062026042): id para scroll-into-view; celebração ao importar.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Av, I, ICONS, fetchPlanMeCached } from "@/components/hbx/shell";
import { CanalIcon } from "@/components/hbx/canal-icon";
import { apiFetch } from "@/lib/api";
import { BRAZIL_UF_OPTIONS, brazilCityOptionsForUf } from "@/lib/brazil-cities";
import { RADAR_SEGMENTS_FLAT, categoryOfSegment } from "@/lib/radar-segments";

const TERMINAL_RUN = new Set(["completed", "completed_insufficient_results", "canceled", "failed", "error"]);

type PreviewLead = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  segment: string | null;
  opportunityScore: number;
  hasPhone: boolean;
  hasEmail: boolean;
  hasWhatsapp: boolean;
};

type PreviewResult = {
  ok: boolean;
  canPull: number;
  dailyRemaining?: number;
  leads: PreviewLead[];
  code?: string;
  message?: string;
} | null;

type ImportResult = {
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
  id,
}: {
  onPulled?: (count: number) => void;
  defaultSegment?: string;
  poolDisponivel?: number | null;
  id?: string;
}) {
  const router = useRouter();

  const [segment, setSegment] = useState(defaultSegment);
  const [city, setCity] = useState("");
  const [uf, setUf] = useState("");
  const [radiusKm, setRadiusKm] = useState(0);
  const [quantity, setQuantity] = useState(5);

  const [step, setStep] = useState<"form" | "preview" | "done">("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResult>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importResult, setImportResult] = useState<ImportResult>(null);
  const [celebrating, setCelebrating] = useState(false);
  const celebrateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Search-on-miss (A — PR046): prateleira vazia + cidade → varre o motor (search-runs) + polling vivo.
  const [runId, setRunId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [runFound, setRunFound] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!runId) { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } return; }
    pollRef.current = setInterval(async () => {
      try {
        const res = await apiFetch<{ status?: string; foundCount?: number; meta?: { terminal?: boolean } }>(`/webscraping/radar/search-runs/${encodeURIComponent(runId)}`);
        setRunFound(Number(res?.foundCount || 0));
        if (TERMINAL_RUN.has(String(res?.status || "")) || res?.meta?.terminal) {
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
          setRunId(null);
          setSearching(false);
          verLeads();
        }
      } catch { /* mantém o estado; a próxima volta tenta de novo */ }
    }, 4000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const cityOptions = brazilCityOptionsForUf(uf);

  async function verLeads() {
    if (busy) return;
    if (!segment.trim()) { setError("Escolha o tipo de cliente que você quer."); return; }
    // Gate: pending_checkout → abre checkout inline em vez de chamar a API (B1 de 040).
    const planData = await fetchPlanMeCached().catch(() => null);
    if (planData?.current?.accessState === "pending_checkout") {
      window.dispatchEvent(new Event("hbx:need-checkout"));
      return;
    }
    setBusy(true);
    setError(null);
    setPreview(null);
    try {
      const params = new URLSearchParams({ segment: segment.trim(), quantity: String(quantity) });
      if (city.trim()) params.set("city", city.trim());
      if (uf.trim()) params.set("state", uf.trim());
      if (city.trim() && radiusKm > 0) params.set("radiusKm", String(radiusKm));
      const res = await apiFetch<PreviewResult>(`/webscraping/radar/pull-preview?${params}`);
      setPreview(res);
      if (res?.ok && res.leads?.length) {
        setSelected(new Set(res.leads.map((l) => l.id)));
        setStep("preview");
      } else {
        setError(res?.message || "Sem leads disponíveis para esses filtros agora.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar leads agora.");
    } finally {
      setBusy(false);
    }
  }

  // Search-on-miss (A): a prateleira veio vazia → em vez de beco, varre o motor de verdade.
  async function buscarNoMotor() {
    if (searching) return;
    if (!segment.trim()) { setError("Escolha o tipo de cliente."); return; }
    if (!city.trim()) { setError("Pra varrer o motor eu preciso da cidade."); return; }
    setSearching(true);
    setError(null);
    setRunFound(0);
    try {
      const res = await apiFetch<{ id?: string; runId?: string; foundCount?: number; message?: string }>(
        "/webscraping/radar/search-runs",
        { method: "POST", body: JSON.stringify({ segment: segment.trim(), city: city.trim(), state: uf.trim() || undefined }) },
      );
      setRunFound(Number(res?.foundCount || 0));
      const rid = res?.id || res?.runId || null;
      if (rid) {
        setRunId(String(rid));
      } else {
        setSearching(false);
        if (res?.message) setError(res.message);
      }
    } catch (err) {
      setSearching(false);
      setError(err instanceof Error ? err.message : "Não consegui iniciar a busca no motor.");
    }
  }

  async function importarSelecionados() {
    if (busy) return;
    if (!selected.size) { setError("Marque pelo menos um lead para importar."); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<ImportResult>("/webscraping/radar/pull-to-vendas", {
        method: "POST",
        body: JSON.stringify({
          segment: segment.trim(),
          city: city.trim() || undefined,
          state: uf.trim() || undefined,
          radiusKm: city.trim() && radiusKm > 0 ? radiusKm : undefined,
          quantity,
          leadIds: Array.from(selected),
        }),
      });
      setImportResult(res);
      setStep("done");
      if (res?.pulledCount && res.pulledCount > 0) {
        onPulled?.(res.pulledCount);
        // Micro-celebração (B2): "+N leads" flutua por 2.5s.
        if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
        setCelebrating(true);
        celebrateTimer.current = setTimeout(() => setCelebrating(false), 2600);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível importar leads agora.");
    } finally {
      setBusy(false);
    }
  }

  function toggleLead(lid: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(lid)) next.delete(lid); else next.add(lid);
      return next;
    });
  }

  function toggleAll() {
    if (!preview?.leads) return;
    if (selected.size === preview.leads.length) setSelected(new Set());
    else setSelected(new Set(preview.leads.map((l) => l.id)));
  }

  function voltarParaForm() {
    setStep("form");
    setPreview(null);
    setSelected(new Set());
    setError(null);
  }

  const podeColher = poolDisponivel != null && poolDisponivel > 0;

  // ── Passo 1: Formulário ───────────────────────────────────────────────────
  if (step === "form") return (
    <section className="panel" id={id}>
      <div className="panel-head">
        <h2><I d={ICONS.plus} size={14} /> Puxar leads pra minha carteira</h2>
        <div className="meta">
          {podeColher
            ? <span className="tag teal">{poolDisponivel!.toLocaleString("pt-BR")} disponíveis</span>
            : <small>Escolha o tipo de cliente — você vai ver a lista antes de importar.</small>}
        </div>
      </div>
      <div className="filters">
        <div className="f">
          <label>Tipo de cliente</label>
          <input className="field-dark" list="puxar-segmentos" placeholder="Ex.: dentistas, oficinas, pizzarias"
            value={segment} onChange={e => setSegment(e.target.value)} onKeyDown={e => e.key === "Enter" && verLeads()} />
          <datalist id="puxar-segmentos">
            {RADAR_SEGMENTS_FLAT.map(s => <option key={s} value={s}>{categoryOfSegment(s) || ""}</option>)}
          </datalist>
        </div>
        <div className="f">
          <label>Cidade (opcional)</label>
          <input className="field-dark" list="puxar-cidades" placeholder={uf ? `Digite uma cidade de ${uf}` : "Todas"}
            value={city} onChange={e => setCity(e.target.value)} />
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
        <button className="btn-teal" onClick={verLeads} disabled={busy || searching}>
          {busy ? "Buscando…" : `Ver ${quantity} ${quantity === 1 ? "lead" : "leads"} disponíveis`}
        </button>
      </div>
      {searching && (
        <div className="chip-row">
          <span className="tag teal">Varrendo {city || "o motor"}… {runFound > 0 ? `${runFound} ${runFound === 1 ? "achado" : "achados"}` : "aguarde"}</span>
        </div>
      )}
      {error && !searching && (
        <div className="chip-row">
          <span className="tag warn">{error}</span>
          {segment.trim() && city.trim() && (
            <button className="btn-teal btn-xs" onClick={buscarNoMotor}>
              <I d={ICONS.search} size={12} /> Buscar no motor em {city}
            </button>
          )}
          {segment.trim() && !city.trim() && (
            <span className="tag">Quer que eu vá atrás no motor? Informe a cidade.</span>
          )}
        </div>
      )}
    </section>
  );

  // ── Passo 2: Preview com checkboxes ──────────────────────────────────────
  if (step === "preview" && preview) return (
    <section className="panel" id={id}>
      <div className="panel-head">
        <h2><I d={ICONS.plus} size={14} /> Escolha o que importar</h2>
        <div className="meta">
          <small>
            {preview.leads.length} lead{preview.leads.length !== 1 ? "s" : ""} encontrado{preview.leads.length !== 1 ? "s" : ""} para{" "}
            <strong>{segment}</strong>{city ? ` · ${city}` : ""}{uf ? `/${uf}` : ""}
            {preview.dailyRemaining != null ? ` · até ${preview.dailyRemaining} hoje` : ""}
          </small>
        </div>
      </div>

      <div className="chip-row" style={{ marginBottom: 12 }}>
        <button className="btn-ghost" onClick={toggleAll} style={{ fontSize: "0.72rem" }}>
          {selected.size === preview.leads.length ? "Desmarcar todos" : "Selecionar todos"}
        </button>
        <span className="tag" style={{ marginLeft: "auto" }}>
          {selected.size} selecionado{selected.size !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="vlead-grid">
        {preview.leads.map((lead) => {
          const on = selected.has(lead.id);
          return (
            <div key={lead.id} role="button" tabIndex={0} className={"vlead" + (on ? " on" : "")}
              onClick={() => toggleLead(lead.id)}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleLead(lead.id); } }}>
              <div className="vlead-top">
                <input type="checkbox" checked={on} readOnly style={{ flexShrink: 0, cursor: "pointer" }} />
                <Av name={lead.name || "—"} size={34} />
                <div className="vlead-id">
                  <strong>{lead.name || "—"}</strong>
                  <span>{lead.segment || "—"}{lead.city ? ` · ${lead.city}${lead.state ? "/" + lead.state : ""}` : ""}</span>
                </div>
                <span className={"vlead-score " + (lead.opportunityScore >= 75 ? "hi" : "mid")}>
                  {lead.opportunityScore}
                </span>
              </div>
              <div className="vlead-sig">
                {lead.hasWhatsapp && <span className="sig ok"><CanalIcon canal="whatsapp" size="sm" /> WhatsApp</span>}
                {lead.hasEmail && <span className="sig ok"><CanalIcon canal="email" size="sm" /> E-mail</span>}
                {lead.hasPhone && !lead.hasWhatsapp && <span className="sig"><CanalIcon canal="telefone" size="sm" /> Telefone</span>}
                {!lead.hasWhatsapp && !lead.hasEmail && !lead.hasPhone && <span className="sig">Sem contato</span>}
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="chip-row" style={{ marginTop: 12 }}>
          <span className="tag warn">{error}</span>
        </div>
      )}

      <div className="chip-row" style={{ marginTop: 16 }}>
        <button className="btn-ghost" onClick={voltarParaForm} disabled={busy}>
          ← Voltar
        </button>
        <button className="btn-teal" onClick={importarSelecionados} disabled={busy || !selected.size}
          style={{ marginLeft: "auto" }}>
          {busy ? "Importando…" : `Importar ${selected.size} selecionado${selected.size !== 1 ? "s" : ""} pro Vendas`}
        </button>
      </div>
    </section>
  );

  // ── Passo 3: Resultado + celebração (B2) ─────────────────────────────────
  return (
    <section className="panel" id={id}>
      <div className="panel-head">
        <h2><I d={ICONS.plus} size={14} /> Puxar leads pra minha carteira</h2>
      </div>
      <div className="chip-row" style={{ position: "relative" }}>
        {celebrating && importResult?.pulledCount ? (
          <span className="hbx-celebrate" aria-live="polite">
            +{importResult.pulledCount} {importResult.pulledCount === 1 ? "lead" : "leads"} no seu Vendas!
          </span>
        ) : null}
        {importResult && (
          <span className={importResult.pulledCount ? "tag teal" : "tag"}>
            {importResult.message}
            {importResult.dailyRemainingAfter != null ? ` · restam ${importResult.dailyRemainingAfter} hoje` : ""}
          </span>
        )}
        {importResult?.pulledCount ? (
          <button className="btn-ghost" onClick={() => router.push("/vendas")}>
            <I d={ICONS.arrow} size={13} /> Ir para Vendas
          </button>
        ) : null}
        <button className="btn-ghost" onClick={() => {
          setStep("form"); setImportResult(null); setError(null); setPreview(null); setSelected(new Set());
        }}>
          Puxar mais
        </button>
      </div>
    </section>
  );
}
