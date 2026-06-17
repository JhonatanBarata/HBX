"use client";

// Tela RADAR — MODELO LIMPO (PR17062026046). Três camadas, uma história só:
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

import { I, ICONS } from "@/components/hbx/shell";
import { CanalIcon } from "@/components/hbx/canal-icon";
import { apiFetch } from "@/lib/api";
import { BRAZIL_UF_OPTIONS, mergeBrazilCityOptions } from "@/lib/brazil-cities";

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
  hasPhone?: boolean;
  hasEmail?: boolean;
  hasWhatsapp?: boolean;
};

type LeadsResponse = {
  items: RadarLead[];
  total: number;
  meta?: {
    available?: boolean;
    message?: string;
    totalAvailable?: number;
    limit?: number;
    availableFilters?: {
      states?: FilterOption[];
      segments?: FilterOption[];
      citiesByState?: Record<string, FilterOption[]>;
    };
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

export function WebscrapingClient() {
  const router = useRouter();

  // filtros (lago → prateleira)
  const [uf, setUf] = useState("");
  const [city, setCity] = useState("");
  const [segment, setSegment] = useState("");

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

  const loadList = useCallback((which: Tab, opts?: { page?: number }) => {
    const params = new URLSearchParams();
    params.set("page", String(opts?.page ?? 1));
    params.set("limit", String(pageSize));
    // PRATELEIRA = lago mascarado (scope=vitrine, todos veem). CARTEIRA = sem scope
    // (o vendedor vê o que puxou, contato revelado). Mesma estrutura, muda o que se pode.
    if (which === "shelf") params.set("scope", "vitrine");
    if (segment) params.set("segment", segment);
    if (city) params.set("city", city);
    if (uf) params.set("state", uf);
    return apiFetch<LeadsResponse>(`/webscraping/radar/leads?${params.toString()}`)
      .then(res => {
        setData(res);
        setLoadError(null);
        // badge = contagem REAL (totalAvailable, sem teto) na prateleira; carteira usa o total lido.
        const badge = which === "shelf" ? (res?.meta?.totalAvailable ?? res?.total ?? 0) : (res?.total ?? 0);
        setCounts(c => ({ ...c, [which]: badge }));
      })
      .catch((err: unknown) => {
        setData(null);
        setLoadError(err instanceof Error ? err.message : "Falha ao carregar o Radar.");
      });
  }, [segment, city, uf]);

  // carga inicial: número nacional + cota + prateleira + retomar busca ativa
  useEffect(() => {
    loadBank();
    loadUsage();
    loadList("shelf", { page: 1 });
    apiFetch<RunResponse>("/webscraping/radar/search-runs/latest")
      .then(res => { if (res && (res.id || res.runId)) setRun(res); })
      .catch(() => { /* sem busca ativa */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // troca de filtros recarrega a aba atual (debounce 300ms; pula o 1º render)
  const filtersTouched = useRef(false);
  useEffect(() => {
    if (!filtersTouched.current) { filtersTouched.current = true; return; }
    const handle = setTimeout(() => { setPage(1); setSelected(new Set()); loadList(tab, { page: 1 }); }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segment, city, uf]);

  // polling da busca ao vivo
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
  const segOptions = filters?.segments || [];
  const ufOptions = mergeFilterOptions(filters?.states, BRAZIL_UF_OPTIONS);
  const cityOptions = uf
    ? mergeBrazilCityOptions(uf, filters?.citiesByState?.[uf])
    : Object.values(filters?.citiesByState || {}).flat();

  const runActive = Boolean((run?.id || run?.runId) && !TERMINAL_RUN.has(String(run?.status || "")));
  const runProgress = run?.meta?.progress;

  // Paginador usa o total LIDO (capado) pra nunca oferecer página vazia; o badge da aba
  // mostra a contagem real (totalAvailable). Os dois podem divergir: "X disponíveis · página dos lidos".
  const pageTotal = data?.total || 0;
  const lastPage = Math.max(1, Math.ceil(pageTotal / limit));

  // medidor único de cota (regra #6 colapsada): vendedor vê "em mãos"; admin vê o pote da empresa.
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
    const has = row.hasWhatsapp || row.hasPhone || row.hasEmail;
    return (
      <span className="radar2-locked">
        {row.hasWhatsapp && <CanalIcon canal="whatsapp" size="sm" />}
        {row.hasEmail && <CanalIcon canal="email" size="sm" />}
        {row.hasPhone && !row.hasWhatsapp && <CanalIcon canal="telefone" size="sm" />}
        <span>{has ? "revela no Puxar" : "sem contato"}</span>
      </span>
    );
  }

  return (
    <div className="content">
      <div className="work">
        {/* LAGO NACIONAL — enche o olho, não promete puxar tudo */}
        <section className="panel" style={{ padding: "14px 16px" }}>
          <div className="radar2-bank">
            <span className="ttl"><I d={ICONS.search} size={18} /> Radar</span>
            <span className="nat">
              <span className="num">{bank ? fmtInt(bank.total) : "—"}</span>
              <span className="lbl">empresas no Brasil</span>
              {bank && Number(bank.deltaToday || 0) > 0 && <span className="delta">+{fmtInt(bank.deltaToday)} hoje</span>}
            </span>
          </div>
          <p className="radar2-cap">Número nacional — o que existe no Brasil. O que você pode puxar agora é o de baixo.</p>
        </section>

        {/* PRATELEIRA + CARTEIRA */}
        <section className="panel" style={{ padding: 0 }}>
          <div className="radar2-shell">
            {/* rail de filtros + Buscar (search-on-miss) */}
            <div className="radar2-rail">
              <div className="f">
                <label htmlFor="radar2-uf">Estado</label>
                <select id="radar2-uf" className="field-dark" value={uf} onChange={e => { setCity(""); setUf(e.target.value); }}>
                  <option value="">Todos</option>
                  {ufOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="f">
                <label htmlFor="radar2-city">Cidade</label>
                <input id="radar2-city" className="field-dark" list="radar2-cities" value={city} placeholder="Cidade" onChange={e => setCity(e.target.value)} />
                <datalist id="radar2-cities">{cityOptions.map(o => <option key={o.value} value={o.label} />)}</datalist>
              </div>
              <div className="f">
                <label htmlFor="radar2-seg">Segmento</label>
                <input id="radar2-seg" className="field-dark" list="radar2-segs" value={segment} placeholder="Ex.: Odontologia" onChange={e => setSegment(e.target.value)} />
                <datalist id="radar2-segs">{segOptions.map(o => <option key={o.value} value={o.label} />)}</datalist>
              </div>
              <button className="btn-teal" onClick={executarBusca} disabled={runBusy || runActive}>
                <I d={ICONS.search} size={14} /> {runActive ? "Varrendo…" : runBusy ? "Iniciando…" : "Buscar"}
              </button>
              <p className="hint">Prateleira fina? Com cidade + segmento, o Buscar varre o motor e traz fresquinhos.</p>
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
                      <tr key={row.id}>
                        {tab === "shelf" && (
                          <td><input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSel(row.id)} aria-label={`Selecionar ${row.name || "lead"}`} /></td>
                        )}
                        <td>
                          <div className="co">
                            <strong>{row.name || "—"}</strong>
                            <span className="sub2">{row.segment || row.businessCategory || "—"}</span>
                          </div>
                        </td>
                        <td>{row.city ? `${row.city}${row.state ? "/" + row.state : ""}` : "—"}</td>
                        <td>
                          {tab === "shelf"
                            ? contatoMascarado(row)
                            : <span>{row.phone || row.email || "—"}</span>}
                        </td>
                        <td>
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
                <div className={"radar2-meter" + (meterBlocked ? " blocked" : "")}>
                  <span className="side"><I d={ICONS.bolt} size={15} /> {meterLabel} <span className="lvl">{meterValue}</span></span>
                  <button className="btn-teal" onClick={puxarSelecionados} disabled={selected.size === 0 || meterBlocked || bulkBusy}>
                    <I d={ICONS.check} size={14} /> {bulkBusy ? "Puxando…" : `Puxar selecionados${selected.size ? ` (${selected.size})` : ""}`}
                  </button>
                </div>
              )}
              {pullMsg && <p className="radar2-cap" style={{ margin: "0 16px 10px" }}>{pullMsg}</p>}

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
    </div>
  );
}
