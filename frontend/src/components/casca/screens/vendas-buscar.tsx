"use client";

// MOBILE-CASCA/W2 — modo BUSCAR (mockup aprovado 1). Campo 36px + ícone filtro
// (filtros em CascaSheet) + stats 1 linha 11px + faixa fina viva de busca
// (pulso + contador "n novos" + × que para) + resultados entrando NA lista com
// transição — SEM painel flutuante, SEM botão Voltar. Consome os MESMOS
// endpoints que leads/page.client.tsx (GET /webscraping/radar/leads, POST/GET/
// cancel /webscraping/radar/search-runs, GET /night-factory/leads-bank, GET
// /vendas/usage) — zero backend novo.

import React, { useCallback, useEffect, useRef, useState } from "react";

import { Av, I, ICONS } from "@/components/hbx/shell";
import { buildNegocioDetailFromLead, type RadarLead } from "@/app/(app)/leads/page.client";
import { apiFetch } from "@/lib/api";

import { CascaLoading } from "../loading";
import { CascaSheet } from "../transitions";
import { NegocioSheet } from "./negocio-sheet";
import { ModoSegment, type Modo } from "./vendas";

type LeadsResponse = {
  items: RadarLead[];
  total: number;
  meta?: { available?: boolean; message?: string; totalAvailable?: number; baseAvailable?: boolean; baseTotal?: number | null };
};

type RunResponse = {
  id?: string;
  runId?: string;
  status?: string;
  foundCount?: number;
  meta?: { progress?: number; terminal?: boolean; operationalState?: string };
} | null;

type BankResponse = { total?: number; available?: boolean; baseAvailable?: boolean; baseTotal?: number | null } | null;
type UsageResponse = {
  cards?: { used?: number; limit?: number };
  sellerActiveQuota?: { seller?: boolean; activeCount?: number; effectiveLimit?: number } | null;
} | null;

const TERMINAL_RUN = new Set(["completed", "completed_insufficient_results", "canceled", "failed", "partial_error"]);
const SHELF_LIMIT = 24;
const SEARCH_BATCH = 12;

function fmtInt(n: number | null | undefined): string {
  return Number(n || 0).toLocaleString("pt-BR");
}

function getOpState(run: RunResponse): string | null {
  if (!run) return null;
  const s = String(run.meta?.operationalState || "").trim().toLowerCase();
  return s || null;
}

export function VendasBuscarMobile({ modo, onModoChange }: { modo: Modo; onModoChange: (m: Modo) => void }) {
  const [city, setCity] = useState("");
  const [segment, setSegment] = useState("");
  const [filtrosOpen, setFiltrosOpen] = useState(false);

  const [items, setItems] = useState<RadarLead[]>([]);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [bank, setBank] = useState<BankResponse>(null);
  const [usage, setUsage] = useState<UsageResponse>(null);
  const [run, setRun] = useState<RunResponse>(null);
  const [runBusy, setRunBusy] = useState(false);
  const [searchMsg, setSearchMsg] = useState<string | null>(null);
  const [foundNow, setFoundNow] = useState(0);

  const [sel, setSel] = useState<RadarLead | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadList = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("page", "1");
    params.set("limit", String(SHELF_LIMIT));
    params.set("scope", "vitrine");
    if (segment) params.set("segment", segment);
    if (city) params.set("city", city);
    try {
      const res = await apiFetch<LeadsResponse>(`/webscraping/radar/leads?${params.toString()}`);
      setItems(res?.items || []);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Falha ao carregar o Radar.");
    } finally {
      setLoading(false);
    }
  }, [segment, city]);

  const loadBank = useCallback(() => {
    apiFetch<BankResponse>("/night-factory/leads-bank").then(setBank).catch(() => setBank(null));
  }, []);
  const loadUsage = useCallback(() => {
    apiFetch<UsageResponse>("/vendas/usage").then(setUsage).catch(() => setUsage(null));
  }, []);

  useEffect(() => {
    // IIFE async: mantém loadList() FORA do corpo síncrono do efeito
    // (react-hooks/set-state-in-effect) — mesmo padrão de leads/[id]/page.client.tsx.
    void (async () => { await loadList(); })();
    loadBank();
    loadUsage();
    apiFetch<RunResponse>("/webscraping/radar/search-runs/latest")
      .then(res => {
        if (!res || !(res.id || res.runId)) return;
        const opState = getOpState(res);
        const isTerminal = TERMINAL_RUN.has(String(res?.status || "")) || res?.meta?.terminal;
        if (!isTerminal || opState === "funcionando" || opState === "pausado") setRun(res);
      })
      .catch(() => { /* sem busca ativa */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const opState = getOpState(run);
  const runActive = Boolean(
    (run?.id || run?.runId) &&
    !TERMINAL_RUN.has(String(run?.status || "")) &&
    opState === "funcionando"
  );

  // polling do run ativo (mesma cadência do desktop: 4s)
  useEffect(() => {
    const runId = run?.id || run?.runId;
    const status = String(run?.status || "");
    const isTerminal = TERMINAL_RUN.has(status) || run?.meta?.terminal;
    if (!runId || (isTerminal && opState !== "funcionando" && opState !== "pausado")) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await apiFetch<RunResponse>(`/webscraping/radar/search-runs/${encodeURIComponent(runId)}`);
        setRun(res);
        const resStatus = String(res?.status || "");
        const resOpState = getOpState(res);
        const resTerminal = TERMINAL_RUN.has(resStatus) || res?.meta?.terminal;
        setFoundNow(res?.foundCount ?? 0);
        if (resTerminal && resOpState !== "funcionando" && resOpState !== "pausado") {
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
          const prevIds = new Set(items.map(i => i.id));
          const prevList = await apiFetch<LeadsResponse>(
            `/webscraping/radar/leads?page=1&limit=${SHELF_LIMIT}&scope=vitrine${segment ? `&segment=${encodeURIComponent(segment)}` : ""}${city ? `&city=${encodeURIComponent(city)}` : ""}`,
          );
          const freshItems = prevList?.items || [];
          setNewIds(new Set(freshItems.filter(i => !prevIds.has(i.id)).map(i => i.id)));
          setItems(freshItems);
          loadBank();
          loadUsage();
          setFoundNow(0);
          setTimeout(() => setNewIds(new Set()), 4000);
        }
      } catch { /* mantém o último estado */ }
    }, 4000);
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  async function executarBusca() {
    if (runBusy || runActive) return;
    if (!city.trim() || !segment.trim()) {
      setSearchMsg("Preencha cidade e segmento pra buscar.");
      setFiltrosOpen(true);
      return;
    }
    setSearchMsg(null);
    setRunBusy(true);
    try {
      const res = await apiFetch<RunResponse>("/webscraping/radar/search-runs", {
        method: "POST",
        body: JSON.stringify({ city, segment, quantity: SEARCH_BATCH }),
      });
      setRun(res);
      setFoundNow(0);
    } catch (err) {
      setSearchMsg(err instanceof Error ? err.message : "Não consegui iniciar a busca.");
    } finally {
      setRunBusy(false);
    }
  }

  async function pararBusca() {
    const runId = run?.id || run?.runId;
    if (!runId || !runActive) return;
    try {
      await apiFetch(`/webscraping/radar/search-runs/${encodeURIComponent(runId)}/cancel`, { method: "POST", body: JSON.stringify({}) });
      const res = await apiFetch<RunResponse>(`/webscraping/radar/search-runs/${encodeURIComponent(runId)}`);
      setRun(res);
    } catch { /* silencia — o poll pegaria, mas já parou */ }
  }

  const saq = usage?.sellerActiveQuota;
  const isSeller = Boolean(saq?.seller);
  const cotaLabel = isSeller ? "Em mãos" : "Mês";
  const cotaValue = isSeller
    ? `${fmtInt(saq?.activeCount)}/${fmtInt(saq?.effectiveLimit)}`
    : usage?.cards
      ? `${fmtInt(usage.cards.used)}/${fmtInt(usage.cards.limit)}`
      : "—";
  const totalBrasil = bank?.baseAvailable ? (bank?.baseTotal ?? null) : (bank?.total ?? null);

  if (loading) return <CascaLoading caption="Carregando Radar…" />;

  return (
    <div className="vnd-m__body">
      <div className="vnd-m__searchbar">
        <ModoSegment modo={modo} onChange={onModoChange} />
        <div className="vnd-m__searchfield">
          <I d={ICONS.search} size={15} />
          <input
            className="vnd-m__searchinput"
            placeholder="Cidade, segmento…"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </div>
        <button type="button" className="vnd-m__tool-btn" onClick={() => setFiltrosOpen(true)} aria-label="Filtros">
          <I d={ICONS.filter} size={16} />
        </button>
      </div>

      {runActive ? (
        <div className="vnd-m__live">
          <span className="vnd-m__live-dot" aria-hidden="true" />
          <span className="vnd-m__live-text">
            Buscando — {city || "…"} · {segment || "…"}
            {foundNow > 0 ? ` · ${foundNow} novos` : ""}
          </span>
          <button type="button" className="vnd-m__live-stop" onClick={pararBusca} aria-label="Parar busca">
            <I d={ICONS.x} size={13} />
          </button>
        </div>
      ) : (
        <div className="vnd-m__statsrow">
          <span className="vnd-m__stats">
            Brasil {fmtInt(totalBrasil)} · Disponíveis {fmtInt(items.length)} · {cotaLabel} {cotaValue}
          </span>
          <button type="button" className="vnd-m__searchcta" onClick={executarBusca} disabled={runBusy}>
            <I d={ICONS.bolt} size={14} /> {runBusy ? "Iniciando…" : "Buscar"}
          </button>
        </div>
      )}

      {searchMsg ? <p className="vnd-m__sheet-msg">{searchMsg}</p> : null}
      {loadError ? <p className="vnd-m__sheet-msg">{loadError}</p> : null}

      {items.length === 0 ? (
        <div className="vnd-m__empty">
          <I d={ICONS.search} size={28} />
          <p>Nenhuma empresa disponível ainda. Preencha cidade e segmento e toque em Buscar.</p>
        </div>
      ) : (
        <div className="vnd-m__list">
          {items.map(lead => (
            <button
              type="button"
              key={lead.id}
              className={"vnd-m__row" + (newIds.has(lead.id) ? " is-new" : "")}
              onClick={() => setSel(lead)}
            >
              <Av name={lead.name || "?"} size={30} />
              <span className="vnd-m__row-main">
                <span className="vnd-m__row-name">
                  {lead.name || "Sem nome"}
                  {newIds.has(lead.id) ? <span className="vnd-m__row-tag">novo</span> : null}
                </span>
                <span className="vnd-m__row-sub">{lead.segment || "—"} · {lead.city || "—"}{lead.state ? `/${lead.state}` : ""}</span>
              </span>
              <I d={ICONS.arrow} size={16} />
            </button>
          ))}
        </div>
      )}

      <NegocioSheet
        open={Boolean(sel)}
        detail={sel ? buildNegocioDetailFromLead(sel, { revealed: Boolean(sel.ownershipStatus ? sel.ownershipStatus === "mine" : sel.phone) }) : null}
        onClose={() => setSel(null)}
        showPuxar={Boolean(sel && sel.ownershipStatus !== "mine")}
        onPulled={() => { setSel(null); void loadList(); }}
      />

      <CascaSheet
        open={filtrosOpen}
        title="Filtros"
        onClose={() => { setFiltrosOpen(false); void loadList(); }}
      >
        <div className="vnd-m__filters">
          <label className="vnd-m__filter-label">Cidade</label>
          <input className="field-dark" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ex.: Curitiba" />
          <label className="vnd-m__filter-label">Segmento</label>
          <input className="field-dark" value={segment} onChange={(e) => setSegment(e.target.value)} placeholder="Ex.: Clínica odontológica" />
          <button
            type="button"
            className="btn-teal vnd-m__filter-apply"
            onClick={() => { setFiltrosOpen(false); void loadList(); }}
          >
            Aplicar
          </button>
        </div>
      </CascaSheet>
    </div>
  );
}
