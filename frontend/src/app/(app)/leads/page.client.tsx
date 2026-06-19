"use client";

// Tela RADAR — MODELO LIMPO (PR18062026046). Três camadas, uma história só:
//   LAGO NACIONAL  → número do Brasil (GET /night-factory/leads-bank), enche o olho.
//   PRATELEIRA     → disponíveis pra você, contato MASCARADO, listada e navegável
//                    (GET /webscraping/radar/leads?scope=vitrine). Buscar dispara o
//                    motor quando a prateleira está fina (POST .../search-runs + polling).
//   CARTEIRA       → o que você puxou, contato revelado (GET .../radar/leads sem scope).
// Regra de ouro: abundância na VISTA, escassez na AÇÃO. As ÚNICAS travas que sobrevivem
// são mascarar o contato + a cota (medidor único, GET /vendas/usage). Puxar = revela +
// debita: POST /webscraping/radar/leads/:id/send-to-vendas. Histórico negativo nunca é
// apagado (MOTOR.md). Visual 100% em classe/token central (5 Leis).

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Av, I, ICONS } from "@/components/hbx/shell";
import { CanalIcon } from "@/components/hbx/canal-icon";
import { apiFetch } from "@/lib/api";
import { BRAZIL_UF_OPTIONS, mergeBrazilCityOptions } from "@/lib/brazil-cities";
import { useIsMobile } from "@/lib/use-is-mobile";

type FilterOption = { value: string; label: string; count?: number };

type RadarLead = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  city: string | null;
  state: string | null;
  segment: string | null;
  businessCategory: string | null;
  opportunityScore: number;
  opportunityReason?: string | null;
  opportunitySignals?: string[] | null;
  fitScore?: number | null;
  hasPhone?: boolean;
  hasEmail?: boolean;
  hasWhatsapp?: boolean;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  website?: string | null;
};

type LeadsResponse = {
  items: RadarLead[];
  total: number;
  meta?: {
    available?: boolean;
    message?: string;
    totalAvailable?: number;
    limit?: number;
    filteredOut?: number;
    whatsappVerified?: number;
    availableFilters?: {
      states?: FilterOption[];
      segments?: FilterOption[];
      citiesByState?: Record<string, FilterOption[]>;
    };
    gemeosInsight?: {
      dominantSegment: string | null;
      gemeos: number;
      comSinal: number;
    } | null;
  };
};

type RunResponse = {
  id?: string;
  runId?: string;
  status?: string;
  message?: string;
  foundCount?: number;
  meta?: { progress?: number; terminal?: boolean };
} | null;

type BankResponse = { total?: number; deltaToday?: number; available?: boolean } | null;

type SellerActiveQuota = {
  seller?: boolean;
  paused?: boolean;
  activeCount?: number;
  effectiveLimit?: number;
  availableSlots?: number;
  code?: string | null;
} | null;

type UsageResponse = {
  cards?: { used?: number; limit?: number; remaining?: number };
  sellerActiveQuota?: SellerActiveQuota;
} | null;

type Tab = "shelf" | "carteira";

const TERMINAL_RUN = new Set(["completed", "completed_insufficient_results", "canceled", "failed", "error"]);

function mergeFilterOptions(primary: FilterOption[] | undefined, fallback: FilterOption[]) {
  const seen = new Set<string>();
  const merged: FilterOption[] = [];
  for (const option of [...(primary || []), ...fallback]) {
    const value = String(option.value || option.label || "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    merged.push({ ...option, value, label: option.label || value });
  }
  return merged;
}

function fmtInt(n: number | null | undefined) {
  return Number(n || 0).toLocaleString("pt-BR");
}

const SIGNAL_META: Record<string, { label: string; tone: "hot" | "warn" | "danger" }> = {
  recem_aberto: { label: "🆕 Abriu recente", tone: "hot" },
  contratando: { label: "📈 Contratando", tone: "hot" },
  sem_site: { label: "🌐 Sem site", tone: "warn" },
  instagram_parado: { label: "📵 Instagram parado", tone: "warn" },
  avaliacoes_em_queda: { label: "⭐ Nota caindo", tone: "warn" },
  poucas_avaliacoes_novo: { label: "🌱 Recente", tone: "hot" },
  cnpj_baixado: { label: "⚠️ CNPJ baixado", tone: "danger" },
};

type StandingOrder = {
  active: boolean;
  city: string;
  state: string;
  segment: string;
  alcance: string;
  quantos: number;
};

export function LeadsClient() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [filterOpen, setFilterOpen] = useState(false);

  // filtros (lago → prateleira)
  const [uf, setUf] = useState("");
  const [city, setCity] = useState("");
  const [segment, setSegment] = useState("");
  const [alcance, setAlcance] = useState("");
  const [quantos, setQuantos] = useState(5);

  // navegação
  const [tab, setTab] = useState<Tab>("shelf");
  const [page, setPage] = useState(1);
  const pageSize = 15;

  // dados
  const [bank, setBank] = useState<BankResponse>(null);
  const [usage, setUsage] = useState<UsageResponse>(null);
  const [data, setData] = useState<LeadsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [counts, setCounts] = useState<{ shelf: number | null; carteira: number | null }>({ shelf: null, carteira: null });

  // lead selecionado no painel de detalhe
  const [selLead, setSelLead] = useState<RadarLead | null>(null);

  // seleção (puxar em lote)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pullBusyId, setPullBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [pullMsg, setPullMsg] = useState<string | null>(null);

  // busca ao vivo (search-on-miss)
  const [run, setRun] = useState<RunResponse>(null);
  const [runBusy, setRunBusy] = useState(false);
  const [searchMsg, setSearchMsg] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Automático (standing order)
  const [standingOrder, setStandingOrder] = useState<StandingOrder | null>(null);
  const [autoBusy, setAutoBusy] = useState(false);

  const loadBank = useCallback(() => {
    apiFetch<BankResponse>("/night-factory/leads-bank").then(setBank).catch(() => setBank(null));
  }, []);

  const loadUsage = useCallback(() => {
    apiFetch<UsageResponse>("/vendas/usage")
      .then(res => {
        setUsage(res);
        const active = res?.sellerActiveQuota?.activeCount;
        if (typeof active === "number") setCounts(c => ({ ...c, carteira: active }));
      })
      .catch(() => setUsage(null));
  }, []);

  const loadList = useCallback((which: Tab, opts?: { page?: number; quantosOverride?: number }) => {
    const params = new URLSearchParams();
    params.set("page", String(opts?.page ?? 1));
    const limit = which === "shelf" ? (opts?.quantosOverride ?? quantos) : pageSize;
    params.set("limit", String(limit));
    if (which === "shelf") params.set("scope", "vitrine");
    if (segment) params.set("segment", segment);
    if (city) params.set("city", city);
    if (uf) params.set("state", uf);
    if (which === "shelf" && alcance) params.set("radius", alcance);
    return apiFetch<LeadsResponse>(`/webscraping/radar/leads?${params.toString()}`)
      .then(res => {
        setData(res);
        setLoadError(null);
        const badge = which === "shelf" ? (res?.meta?.totalAvailable ?? res?.total ?? 0) : (res?.total ?? 0);
        setCounts(c => ({ ...c, [which]: badge }));
      })
      .catch((err: unknown) => {
        setData(null);
        setLoadError(err instanceof Error ? err.message : "Falha ao carregar o Radar.");
      });
  }, [segment, city, uf, alcance, quantos]);

  useEffect(() => {
    loadBank();
    loadUsage();
    loadList("shelf", { page: 1 });
    apiFetch<RunResponse>("/webscraping/radar/search-runs/latest")
      .then(res => { if (res && (res.id || res.runId)) setRun(res); })
      .catch(() => { /* sem busca ativa */ });
    apiFetch<{ standingOrder: StandingOrder }>("/webscraping/radar/standing-order")
      .then(res => { if (res?.standingOrder) setStandingOrder(res.standingOrder); })
      .catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtersTouched = useRef(false);
  useEffect(() => {
    if (!filtersTouched.current) { filtersTouched.current = true; return; }
    const handle = setTimeout(() => { setPage(1); setSelected(new Set()); loadList(tab, { page: 1 }); }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segment, city, uf]);

  useEffect(() => {
    const runId = run?.id || run?.runId;
    const status = String(run?.status || "");
    if (!runId || TERMINAL_RUN.has(status)) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await apiFetch<RunResponse>(`/webscraping/radar/search-runs/${encodeURIComponent(runId)}`);
        setRun(res);
        if (TERMINAL_RUN.has(String(res?.status || "")) || res?.meta?.terminal) {
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
          loadList("shelf", { page: 1 });
          loadBank();
          setTab("shelf");
          setPage(1);
        }
      } catch {
        // mantém o último estado; a próxima volta tenta de novo
      }
    }, 4000);
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [run, loadList, loadBank]);

  function switchTab(next: Tab) {
    if (next === tab) return;
    setTab(next);
    setPage(1);
    setSelected(new Set());
    setPullMsg(null);
    setSelLead(null);
    loadList(next, { page: 1 });
  }

  function irParaPagina(p: number) {
    if (p < 1) return;
    setPage(p);
    loadList(tab, { page: p });
  }

  function toggleSel(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function toggleAutomatico() {
    if (autoBusy) return;
    setAutoBusy(true);
    const nextActive = !(standingOrder?.active ?? false);
    try {
      const res = await apiFetch<{ standingOrder: StandingOrder }>("/webscraping/radar/standing-order", {
        method: "PUT",
        body: JSON.stringify({
          active: nextActive,
          city: city || standingOrder?.city || "",
          state: uf || standingOrder?.state || "",
          segment: segment || standingOrder?.segment || "",
          alcance: alcance || standingOrder?.alcance || "",
          quantos,
        }),
      });
      if (res?.standingOrder) setStandingOrder(res.standingOrder);
    } catch {
      // silencia — o estado local já atualiza via setStandingOrder
    } finally {
      setAutoBusy(false);
    }
  }

  async function executarBusca() {
    if (runBusy || runActive) return;
    if (!city.trim()) { setSearchMsg("Me diz a cidade — o motor não varre sem ela."); return; }
    if (!segment.trim()) { setSearchMsg("Escolha um segmento pra eu varrer."); return; }
    setSearchMsg(null);
    setRunBusy(true);
    try {
      const res = await apiFetch<RunResponse>("/webscraping/radar/search-runs", {
        method: "POST",
        body: JSON.stringify({ city, state: uf || undefined, segment }),
      });
      setRun(res);
      if (res?.message) setSearchMsg(res.message);
    } catch (err) {
      setSearchMsg(err instanceof Error ? err.message : "Não consegui iniciar a busca.");
    } finally {
      setRunBusy(false);
    }
  }

  async function puxar(id: string) {
    if (pullBusyId || bulkBusy) return;
    setPullBusyId(id);
    setPullMsg(null);
    try {
      await apiFetch(`/webscraping/radar/leads/${encodeURIComponent(id)}/send-to-vendas`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
      if (selLead?.id === id) setSelLead(null);
      setPullMsg("✓ Puxado pra sua carteira (Vendas).");
      loadList("shelf", { page });
      loadUsage();
      loadBank();
    } catch (err) {
      setPullMsg(err instanceof Error ? err.message : "Não consegui puxar este lead.");
    } finally {
      setPullBusyId(null);
    }
  }

  async function puxarSelecionados() {
    if (bulkBusy || selected.size === 0) return;
    setBulkBusy(true);
    setPullMsg(null);
    let ok = 0;
    let stopMsg: string | null = null;
    for (const id of Array.from(selected)) {
      try {
        await apiFetch(`/webscraping/radar/leads/${encodeURIComponent(id)}/send-to-vendas`, {
          method: "POST",
          body: JSON.stringify({}),
        });
        ok += 1;
      } catch (err) {
        stopMsg = err instanceof Error ? err.message : "Cota atingida — parei aqui.";
        break;
      }
    }
    setSelected(new Set());
    setPullMsg(`${ok > 0 ? `✓ ${ok} puxado(s). ` : ""}${stopMsg || ""}`.trim() || "Nada puxado.");
    setBulkBusy(false);
    loadList("shelf", { page: 1 });
    loadUsage();
    loadBank();
    setPage(1);
  }

  const items = data?.items || [];
  const limit = data?.meta?.limit || pageSize;
  const filters = data?.meta?.availableFilters;
  const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, "pt-BR");
  const segOptions = (filters?.segments || []).sort(byLabel);
  const ufOptions = mergeFilterOptions(filters?.states, BRAZIL_UF_OPTIONS).sort(byLabel);
  const cityOptions = uf
    ? mergeBrazilCityOptions(uf, filters?.citiesByState?.[uf]).sort(byLabel)
    : [];

  const runActive = Boolean((run?.id || run?.runId) && !TERMINAL_RUN.has(String(run?.status || "")));
  const runProgress = run?.meta?.progress;

  const pageTotal = data?.total || 0;
  const lastPage = Math.max(1, Math.ceil(pageTotal / limit));

  const saq = usage?.sellerActiveQuota;
  const isSeller = Boolean(saq?.seller);
  const meterLabel = isSeller ? "Em mãos" : "Cota da empresa (mês)";
  const meterValue = isSeller
    ? `${fmtInt(saq?.activeCount)} / ${fmtInt(saq?.effectiveLimit)}`
    : usage?.cards
      ? `${fmtInt(usage.cards.used)} / ${fmtInt(usage.cards.limit)}`
      : "—";
  const meterBlocked = isSeller
    ? Boolean(saq?.paused) || Number(saq?.availableSlots ?? 1) <= 0
    : Boolean(usage?.cards) && Number(usage?.cards?.remaining ?? 1) <= 0;

  const emptyMsg = loadError
    ? loadError
    : data?.meta?.available === false
      ? data?.meta?.message || "Banco do Radar indisponível neste ambiente."
      : tab === "carteira"
        ? "Você ainda não puxou nenhum lead. Pegue um na aba Disponíveis."
        : city
          ? `Prateleira vazia pra ${city}. Clique Buscar — o motor varre e traz fresquinhos.`
          : "Escolha cidade + segmento e clique Buscar.";

  function contatoMascarado(row: RadarLead) {
    const has = row.hasWhatsapp || row.hasPhone || row.hasEmail
      || Boolean(row.instagramUrl) || Boolean(row.facebookUrl) || Boolean(row.website);
    return (
      <span className="radar2-locked">
        {row.hasWhatsapp && <CanalIcon canal="whatsapp" size="sm" />}
        {row.hasEmail && <CanalIcon canal="email" size="sm" />}
        {row.hasPhone && !row.hasWhatsapp && <CanalIcon canal="telefone" size="sm" />}
        {row.instagramUrl && <CanalIcon canal="instagram" size="sm" />}
        {row.facebookUrl && <CanalIcon canal="facebook" size="sm" />}
        {row.website && !row.instagramUrl && !row.facebookUrl && <CanalIcon canal="site" size="sm" />}
        <span>{has ? "revela no Puxar" : "sem contato"}</span>
      </span>
    );
  }

  return (
    <div className="content">
      <div className="work">
        {/* 4 KPIs do topo */}
        <section className="panel" style={{ padding: "14px 16px" }}>
          <div className="radar2-kpis">
            <div className="radar2-kpi">
              <span className="lbl">Total no Brasil</span>
              <span className="num">{bank ? fmtInt(bank.total) : "—"}</span>
              {bank && Number(bank.deltaToday || 0) > 0 && <span className="delta">+{fmtInt(bank.deltaToday)} hoje</span>}
            </div>
            <div className="radar2-kpi">
              <span className="lbl">Filtrados (removidos)</span>
              <span className="num">{data?.meta?.filteredOut != null ? fmtInt(data.meta.filteredOut) : "—"}</span>
              {data?.meta?.filteredOut == null && <span className="sub2">ligando o motor…</span>}
            </div>
            <div className="radar2-kpi">
              <span className="lbl">Com WhatsApp</span>
              <span className="num">{data?.meta?.whatsappVerified != null ? fmtInt(data.meta.whatsappVerified) : "—"}</span>
              {data?.meta?.whatsappVerified == null && <span className="sub2">ligando o motor…</span>}
            </div>
            <div className="radar2-kpi">
              <span className="lbl">Em atendimento</span>
              <span className="num">{usage?.sellerActiveQuota?.activeCount != null ? fmtInt(usage.sellerActiveQuota.activeCount) : "—"}</span>
            </div>
          </div>
        </section>

        {/* PRATELEIRA + CARTEIRA */}
        <section className="panel" style={{ padding: 0 }}>
          <div className="radar2-shell">
            {/* rail de filtros */}
            {isMobile && (
              <button
                className="radar2-filter-toggle"
                onClick={() => setFilterOpen(o => !o)}
                aria-expanded={filterOpen}
              >
                <I d={ICONS.filter} size={14} />
                {filterOpen ? "Ocultar filtros" : "Filtros e busca"}
              </button>
            )}
            <div className={"radar2-rail" + (isMobile ? (filterOpen ? " radar2-rail--open" : "") : "")}>
              <div className="f">
                <label htmlFor="radar2-uf">Estado</label>
                <select id="radar2-uf" className="select-dark" value={uf} onChange={e => { setCity(""); setAlcance(""); setUf(e.target.value); }}>
                  <option value="">Todos</option>
                  {ufOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="f">
                <label htmlFor="radar2-city">Cidade</label>
                <select id="radar2-city" className="select-dark" value={city} onChange={e => { setAlcance(""); setCity(e.target.value); }}>
                  <option value="">Cidade</option>
                  {cityOptions.map(o => <option key={o.value} value={o.label}>{o.label}</option>)}
                </select>
              </div>
              <div className="f">
                <label htmlFor="radar2-alcance">Alcance</label>
                <select id="radar2-alcance" className="select-dark" value={alcance} disabled={!city.trim()} onChange={e => setAlcance(e.target.value)}>
                  <option value="">Só a cidade</option>
                  <option value="25">+ 25 km</option>
                  <option value="50">+ 50 km</option>
                  <option value="100">+ 100 km</option>
                </select>
              </div>
              <div className="f">
                <label htmlFor="radar2-seg">Segmento</label>
                <select id="radar2-seg" className="select-dark" value={segment} onChange={e => setSegment(e.target.value)}>
                  <option value="">Ex.: Odontologia</option>
                  {segOptions.map(o => <option key={o.value} value={o.label}>{o.label}</option>)}
                </select>
              </div>
              <div className="f">
                <label htmlFor="radar2-quantos">Quantos</label>
                <select id="radar2-quantos" className="select-dark" value={quantos} onChange={e => setQuantos(Number(e.target.value))}>
                  {[1, 3, 5, 10, 20].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <button className="btn-teal" onClick={() => { setPage(1); setSelected(new Set()); loadList("shelf", { page: 1, quantosOverride: quantos }); }}>
                <I d={ICONS.search} size={14} /> Ver {quantos} leads disponíveis
              </button>
              <button className="btn-ghost btn-xs" onClick={executarBusca} disabled={runBusy || runActive}>
                {runActive ? "Varrendo…" : runBusy ? "Iniciando…" : "Buscar (motor)"}
              </button>
              <button
                className={"btn-teal radar2-auto" + (standingOrder?.active ? " radar2-auto--on" : "")}
                onClick={toggleAutomatico}
                disabled={autoBusy}
                aria-pressed={standingOrder?.active}
              >
                {standingOrder?.active ? "◉ Automático" : "◎ Automático"}
              </button>
              <p className="hint">Prateleira fina? Buscar (motor) varre a internet com cidade + segmento.</p>
              {searchMsg && <p className="hint">{searchMsg}</p>}
            </div>

            {/* prateleira / carteira */}
            <div className="radar2-main">
              <div className="tabs">
                <button className={"tab" + (tab === "shelf" ? " active" : "")} onClick={() => switchTab("shelf")}>
                  Disponíveis pra você <span className="n">{counts.shelf == null ? "—" : fmtInt(counts.shelf)}</span>
                </button>
                <button className={"tab" + (tab === "carteira" ? " active" : "")} onClick={() => switchTab("carteira")}>
                  Minha carteira <span className="n">{counts.carteira == null ? "—" : fmtInt(counts.carteira)}</span>
                </button>
              </div>

              {runActive && (
                <div className="radar2-live">
                  <span className="dot" /> Varrendo {city || "…"} · {fmtInt(run?.foundCount)} achados{runProgress != null ? ` · ${runProgress}%` : ""}
                </div>
              )}

              {tab === "shelf" && data?.meta?.gemeosInsight && (() => {
                const g = data.meta.gemeosInsight!;
                return (
                  <div className="radar2-gemeos">
                    Seus melhores clientes são <strong>{g.dominantSegment || "seu segmento"}</strong> — achei <strong>{fmtInt(g.gemeos)}</strong> gêmeos, <strong>{fmtInt(g.comSinal)}</strong> deram sinal.
                  </div>
                );
              })()}

              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      {tab === "shelf" && <th style={{ width: 34 }} aria-label="Selecionar" />}
                      <th>Empresa</th>
                      <th>Cidade</th>
                      <th>Contato</th>
                      <th style={{ width: 96 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 && (
                      <tr><td colSpan={tab === "shelf" ? 5 : 4}><div className="radar2-empty">{emptyMsg}</div></td></tr>
                    )}
                    {items.map(row => (
                      <tr
                        key={row.id}
                        className={selLead?.id === row.id ? "sel" : ""}
                        style={{ cursor: "pointer" }}
                        onClick={() => setSelLead(selLead?.id === row.id ? null : row)}
                      >
                        {tab === "shelf" && (
                          <td onClick={e => e.stopPropagation()}>
                            <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSel(row.id)} aria-label={`Selecionar ${row.name || "lead"}`} />
                          </td>
                        )}
                        <td>
                          <div className="co">
                            <strong>
                              {row.name || "—"}
                              {row.fitScore != null && row.fitScore > 0 && (
                                <span className={`radar2-fit${row.fitScore >= 60 ? " radar2-fit--hi" : ""}`}>Fit {row.fitScore}</span>
                              )}
                            </strong>
                            <span className="sub2">{row.segment || row.businessCategory || "—"}</span>
                            {row.opportunitySignals && row.opportunitySignals.length > 0 && (
                              <div className="radar2-signals">
                                {row.opportunitySignals.slice(0, 4).map(sig => {
                                  const m = SIGNAL_META[sig];
                                  if (!m) return null;
                                  return <span key={sig} className={`radar2-sig radar2-sig--${m.tone}`}>{m.label}</span>;
                                })}
                              </div>
                            )}
                            {row.opportunityReason && (
                              <span className="radar2-reason">{row.opportunityReason}</span>
                            )}
                          </div>
                        </td>
                        <td>{row.city ? `${row.city}${row.state ? "/" + row.state : ""}` : "—"}</td>
                        <td>
                          {tab === "shelf"
                            ? contatoMascarado(row)
                            : <span>{row.phone || row.email || "—"}</span>}
                        </td>
                        <td onClick={e => e.stopPropagation()}>
                          <div style={{ display: "flex", justifyContent: "flex-end" }}>
                            {tab === "shelf"
                              ? <button className="btn-teal btn-xs" onClick={() => puxar(row.id)} disabled={pullBusyId === row.id || bulkBusy || meterBlocked}>{pullBusyId === row.id ? "Puxando…" : "Puxar"}</button>
                              : <button className="btn-ghost btn-xs" onClick={() => router.push("/vendas")}>Abrir</button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {tab === "shelf" && (
                <>
                  <div className="radar2-sel-all">
                    <button
                      className="btn-ghost btn-xs"
                      onClick={() => {
                        if (selected.size === items.length && items.length > 0) {
                          setSelected(new Set());
                        } else {
                          setSelected(new Set(items.map(r => r.id)));
                        }
                      }}
                    >
                      {selected.size === items.length && items.length > 0 ? "Desmarcar todos" : "Selecionar todos"}
                    </button>
                  </div>
                  <div className={"radar2-meter" + (meterBlocked ? " blocked" : "")}>
                    <div className="radar2-meter-card">
                      <span className="radar2-meter-lbl">
                        <I d={ICONS.bolt} size={11} /> {meterLabel}
                      </span>
                      <span className="radar2-meter-val">{meterValue}</span>
                      <div className="radar2-bar">
                        <div className="radar2-bar-fill" style={{ width: `${Math.min(100, Math.round(isSeller ? ((saq?.activeCount ?? 0) / (saq?.effectiveLimit || 1)) * 100 : ((usage?.cards?.used ?? 0) / (usage?.cards?.limit || 1)) * 100))}%` }} />
                      </div>
                      {isSeller && <span className="radar2-quota-note">os 20 são compartilhados com o Vendas</span>}
                    </div>
                    <button className="btn-teal" onClick={puxarSelecionados} disabled={selected.size === 0 || meterBlocked || bulkBusy}>
                      <I d={ICONS.check} size={14} /> {bulkBusy ? "Puxando…" : `Puxar selecionados${selected.size ? ` (${selected.size})` : ""}`}
                    </button>
                  </div>
                </>
              )}
              {meterBlocked && isSeller && (
                <p className="radar2-cap--danger">
                  Carteira cheia — feche ou agende um retorno pra liberar vaga.
                </p>
              )}
              {pullMsg && <p className="radar2-pull-msg">{pullMsg}</p>}

              <div className="pager">
                <span style={{ marginLeft: "auto" }}>
                  {pageTotal > 0
                    ? `${fmtInt((page - 1) * limit + 1)}–${fmtInt(Math.min(page * limit, pageTotal))} de ${fmtInt(pageTotal)}`
                    : "0 de 0"}
                </span>
                <button className="pg" onClick={() => irParaPagina(page - 1)} disabled={page <= 1}>‹</button>
                {[page - 1, page, page + 1].filter(p => p >= 1 && p <= lastPage).map(p => (
                  <button key={p} className={"pg" + (p === page ? " on" : "")} onClick={() => irParaPagina(p)}>{p}</button>
                ))}
                <button className="pg" onClick={() => irParaPagina(page + 1)} disabled={page >= lastPage}>›</button>
              </div>
            </div>
          </div>
        </section>

        {!isSeller && (
          <p className="radar2-cap" style={{ padding: "0 4px" }}>
            Você vê o lago todo mascarado (admin). O vendedor vê a mesma tela — só muda quantos cabem na carteira dele.
          </p>
        )}
      </div>

      {selLead && (
        <aside className="ctx">
          <h3>Detalhes do lead <span className="x" onClick={() => setSelLead(null)}>✕</span></h3>
          <div key={selLead.id} className="ctx-body">
            {/* Hero */}
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <Av name={selLead.name || "—"} size={56} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span className="company">{selLead.name || "—"}</span>
                <div className="sub">{selLead.segment || selLead.businessCategory || "—"}</div>
                {selLead.city && (
                  <div className="sub" style={{ marginTop: 3, display: "inline-flex", gap: 4, alignItems: "center" }}>
                    <I d={ICONS.mapin} size={11} /> {selLead.city}{selLead.state ? `, ${selLead.state}` : ""}
                  </div>
                )}
                {selLead.fitScore != null && selLead.fitScore > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <span className={`radar2-fit${selLead.fitScore >= 60 ? " radar2-fit--hi" : ""}`}>Fit {selLead.fitScore}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Canais disponíveis */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", padding: "12px 0 4px", alignItems: "center" }}>
              {selLead.hasWhatsapp && (
                tab === "carteira" && selLead.phone
                  ? <a href={`https://wa.me/55${selLead.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp"><CanalIcon canal="whatsapp" size="xl" /></a>
                  : <CanalIcon canal="whatsapp" size="xl" />
              )}
              {selLead.hasPhone && !selLead.hasWhatsapp && (
                tab === "carteira" && selLead.phone
                  ? <a href={`tel:${selLead.phone.replace(/[^\d+]/g, "")}`} aria-label="Telefone"><CanalIcon canal="telefone" size="xl" /></a>
                  : <CanalIcon canal="telefone" size="xl" />
              )}
              {selLead.hasEmail && <CanalIcon canal="email" size="xl" />}
              {selLead.instagramUrl && (
                <a href={selLead.instagramUrl} target="_blank" rel="noopener noreferrer" aria-label="Instagram">
                  <CanalIcon canal="instagram" size="xl" />
                </a>
              )}
              {selLead.facebookUrl && (
                <a href={selLead.facebookUrl} target="_blank" rel="noopener noreferrer" aria-label="Facebook">
                  <CanalIcon canal="facebook" size="xl" />
                </a>
              )}
              {selLead.website && (
                <a href={selLead.website.startsWith("http") ? selLead.website : `https://${selLead.website}`} target="_blank" rel="noopener noreferrer" aria-label="Site">
                  <CanalIcon canal="site" size="xl" />
                </a>
              )}
            </div>

            {/* Contato principal */}
            {tab === "carteira" && selLead.phone ? (
              <a href={`tel:${selLead.phone.replace(/[^\d+]/g, "")}`} className="ctx-phone">
                <CanalIcon canal={selLead.hasWhatsapp ? "whatsapp" : "telefone"} /> {selLead.phone}
              </a>
            ) : tab === "shelf" ? (
              <div className="sub">Contato revelado ao puxar este lead.</div>
            ) : null}

            <div className="kv">
              {selLead.segment && <div className="row"><span className="k">Segmento</span><span className="v">{selLead.segment}</span></div>}
              {selLead.city && <div className="row"><span className="k">Cidade</span><span className="v">{selLead.city}{selLead.state ? `/${selLead.state}` : ""}</span></div>}
              {selLead.opportunityScore > 0 && (
                <div className="row"><span className="k">Score</span><span className="v hbx-mono">{selLead.opportunityScore}</span></div>
              )}
            </div>

            {selLead.opportunityReason && (
              <p style={{ margin: "8px 0 0", fontSize: "0.72rem", lineHeight: 1.5 }}>
                {selLead.opportunityReason}
              </p>
            )}

            {selLead.opportunitySignals && selLead.opportunitySignals.length > 0 && (
              <div className="radar2-signals" style={{ marginTop: 10 }}>
                {selLead.opportunitySignals.slice(0, 6).map(sig => {
                  const m = SIGNAL_META[sig];
                  if (!m) return null;
                  return <span key={sig} className={`radar2-sig radar2-sig--${m.tone}`}>{m.label}</span>;
                })}
              </div>
            )}

            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              {tab === "shelf" && (
                <button className="btn-teal"
                  onClick={() => puxar(selLead.id)}
                  disabled={pullBusyId === selLead.id || bulkBusy || meterBlocked}>
                  {pullBusyId === selLead.id ? "Puxando…" : "Puxar lead →"}
                </button>
              )}
              {tab === "carteira" && (
                <button className="btn-ghost" onClick={() => router.push("/vendas")}>
                  Ver em Vendas →
                </button>
              )}
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
