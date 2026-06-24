"use client";

// Tela LEADS — redesenho 23/06/2026
// Painel direito (aside) tem 2 rostos:
//   IDLE (sem lead selecionado) → RADAR console: disco animado + filtros + Play/STOP + Automático
//   LEAD SELECIONADO → mini-radar no topo + DetalhesNegocio + botão voltar
// Lista engordou: sem KPIs (exceto Total no Brasil como linha fininha) e sem rail lateral.
// Barra de 6 ícones de canal: modo "Filtrar resultado" (client-side) e "Forçar na busca".
// operationalState do backend ("funcionando"|"pausado"|"parado") dirige a animação e o botão.
// Visual 100% em classe/token central (5 Leis). Zero hex/rgba inline.

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Av, I, ICONS } from "@/components/hbx/shell";
import { CanalIcon } from "@/components/hbx/canal-icon";
import { DetalhesNegocio, type NegocioDetail } from "@/components/hbx/detalhes-negocio";
import { BotStatusIcon } from "@/components/hbx/bot-action";
import { apiFetch } from "@/lib/api";
import { BRAZIL_CITIES_BY_UF, BRAZIL_UF_OPTIONS, mergeBrazilCityOptions } from "@/lib/brazil-cities";
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
  rating?: number | null;
  reviews?: number | null;
  enrichmentScore?: number | null;
  lastEnrichedAt?: string | null;
  vendasStatus?: string | null;
  vendasReturnAt?: string | null;
  vendasAttemptCount?: number | null;
  vendasShortNote?: string | null;
  vendasLastResult?: string | null;
  vendasSaleStatus?: string | null;
  vendasSaleValue?: number | null;
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

// operationalState vem dentro de meta no run
type RunResponse = {
  id?: string;
  runId?: string;
  status?: string;
  message?: string;
  foundCount?: number;
  meta?: {
    progress?: number;
    terminal?: boolean;
    operationalState?: string;
    operationalReason?: string;
    operationalMessage?: string;
  };
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

// B0: statuses realmente terminais — removeu "error" fantasma, adicionou partial_error
const TERMINAL_RUN = new Set(["completed", "completed_insufficient_results", "canceled", "failed", "partial_error"]);

// Tipos de canal pra barra de 6 ícones
type CanalKey = "whatsapp" | "email" | "telefone" | "instagram" | "facebook" | "site";
const ALL_CANAIS: CanalKey[] = ["whatsapp", "email", "telefone", "instagram", "facebook", "site"];

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

// Extrai operationalState do run
function getOpState(run: RunResponse): "funcionando" | "pausado" | "parado" | null {
  if (!run) return null;
  const opState = String(run.meta?.operationalState || "").trim().toLowerCase();
  if (opState === "funcionando" || opState === "pausado" || opState === "parado") return opState;
  return null;
}

// Componente: disco de radar animado (reutilizável: tamanho controlado pelo wrapper)
function RadarDisc({ opState }: { opState: "funcionando" | "pausado" | "parado" | null }) {
  const state = opState ?? "parado";
  const modClass = state === "funcionando" ? "radar-disc-wrap--funcionando"
    : state === "pausado" ? "radar-disc-wrap--pausado"
    : "radar-disc-wrap--parado";

  // posições dos blips (estáticas — efeito visual)
  const blips: Array<{ top: string; left: string }> = [
    { top: "28%", left: "62%" },
    { top: "58%", left: "44%" },
    { top: "42%", left: "74%" },
    { top: "70%", left: "34%" },
  ];

  return (
    <div className={`radar-disc-wrap ${modClass}`}>
      {/* Disco interno */}
      <div className="radarMotionDisc">
        {/* Eixos */}
        <i className="radarMotionAxis" data-axis="vertical" />
        <i className="radarMotionAxis" data-axis="horizontal" />
        {/* Anéis */}
        <i className="radarMotionCircle" data-ring="outer" />
        <i className="radarMotionCircle" data-ring="one" />
        <i className="radarMotionCircle" data-ring="two" />
        <i className="radarMotionCircle" data-ring="three" />
        <i className="radarMotionCircle" data-ring="four" />
        {/* Sweep */}
        <div className="radarMotionSweep">
          <i className="radarMotionTrail" />
          <i className="radarMotionCore" />
        </div>
        {/* Anéis girando */}
        <i className="radarMotionRing" />
        <i className="radarMotionRingReverse" />
        {/* Blips */}
        {blips.map((b, i) => (
          <div key={i} className="radarMotionBlip" style={{ top: b.top, left: b.left }}>
            <i />
          </div>
        ))}
        {/* Centro */}
        <i className="radarMotionGlow" />
      </div>
    </div>
  );
}

// Mapa nome-do-estado → sigla (para reverse geocode via Nominatim)
const STATE_NAME_TO_UF: Record<string, string> = {
  "Acre":"AC","Alagoas":"AL","Amapá":"AP","Amazonas":"AM","Bahia":"BA","Ceará":"CE",
  "Distrito Federal":"DF","Espírito Santo":"ES","Goiás":"GO","Maranhão":"MA",
  "Mato Grosso":"MT","Mato Grosso do Sul":"MS","Minas Gerais":"MG","Pará":"PA",
  "Paraíba":"PB","Paraná":"PR","Pernambuco":"PE","Piauí":"PI","Rio de Janeiro":"RJ",
  "Rio Grande do Norte":"RN","Rio Grande do Sul":"RS","Rondônia":"RO","Roraima":"RR",
  "Santa Catarina":"SC","São Paulo":"SP","Sergipe":"SE","Tocantins":"TO",
};

function normCity(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

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

  // WhatsApp action: sessão QR + acesso ao Atendimento
  const [waQrActive, setWaQrActive] = useState(false);
  const [canAtendimento, setCanAtendimento] = useState(false);
  const [canBot, setCanBot] = useState(false);
  const [waStartBusy, setWaStartBusy] = useState(false);
  const [waStartError, setWaStartError] = useState<string | null>(null);

  // Mobile v2: lista + card-overlay com swipe
  const [cardIdx, setCardIdx] = useState(0);
  const [cardOpen, setCardOpen] = useState(false);
  const dragRef = useRef<{ startX: number; dx: number; active: boolean }>({ startX: 0, dx: 0, active: false });
  const [dragDx, setDragDx] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Barra de canais
  const [canalAtivos, setCanalAtivos] = useState<Set<CanalKey>>(new Set());
  const [forcarCanais, setForcarCanais] = useState(false);

  // Geolocalização — sincroniza com o botão do Topbar via localStorage + evento
  const [geoBusy, setGeoBusy] = useState(false);
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = localStorage.getItem("hbx:geo");
      if (stored) { const p = JSON.parse(stored); if (p?.lat && p?.lng) return p; }
    } catch { /* sem storage */ }
    return null;
  });
  useEffect(() => {
    function onGeo(e: Event) {
      const detail = (e as CustomEvent<{ lat: number; lng: number } | null>).detail;
      setGeo(detail ?? null);
    }
    window.addEventListener("hbx:geo-updated", onGeo);
    return () => window.removeEventListener("hbx:geo-updated", onGeo);
  }, []);

  async function pullGeoLocation() {
    if (!geo || geoBusy) return;
    setGeoBusy(true);
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${geo.lat}&lon=${geo.lng}&format=json`,
        { headers: { "Accept-Language": "pt-BR" } },
      );
      const data = await resp.json();
      const addr = data.address || {};
      // Estado: preferir BR-XX do ISO3166-2-lvl4, senão mapear pelo nome completo
      const iso = String(data["ISO3166-2-lvl4"] || "");
      const ufFromISO = iso.startsWith("BR-") ? iso.slice(3) : "";
      const resolvedUf = ufFromISO || STATE_NAME_TO_UF[addr.state || ""] || "";
      // Cidade: tentar city → town → municipality → county
      const cityRaw = String(addr.city || addr.town || addr.municipality || addr.county || "").trim();
      if (resolvedUf) {
        setUf(resolvedUf);
        if (cityRaw) {
          const cities = BRAZIL_CITIES_BY_UF[resolvedUf] || [];
          const match = cities.find(c => normCity(c) === normCity(cityRaw));
          setCity(match || cityRaw);
          setAlcance("");
        }
      }
    } catch { /* silently ignore */ }
    finally { setGeoBusy(false); }
  }

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

  const loadList = useCallback((which: Tab, opts?: { page?: number; quantosOverride?: number; canaisForcar?: Set<CanalKey> }) => {
    const params = new URLSearchParams();
    params.set("page", String(opts?.page ?? 1));
    const limit = which === "shelf" ? (opts?.quantosOverride ?? quantos) : pageSize;
    params.set("limit", String(limit));
    if (which === "shelf") params.set("scope", "vitrine");
    if (segment) params.set("segment", segment);
    if (city) params.set("city", city);
    if (uf) params.set("state", uf);
    if (which === "shelf" && alcance) params.set("radius", alcance);
    // Modo "Forçar na busca": tenta passar canais como restrição query.
    // O endpoint /radar/leads NÃO aceita filtro de canal (confirmado na análise de loadList).
    // O "Forçar" age na URL do search-run (POST), não aqui — ver executarBusca().
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
    apiFetch<{ whatsappSession?: { accessible?: boolean } }>("/inbox/whatsapp-session")
      .then(res => setWaQrActive(res?.whatsappSession?.accessible === true))
      .catch(() => setWaQrActive(false));
    apiFetch<Array<{ key: string; accessible?: boolean }>>("/modules/me")
      .then(list => {
        const mods = Array.isArray(list) ? list : [];
        const atend = mods.find(m => String(m.key || "").trim().toLowerCase() === "atendimento");
        const bot = mods.find(m => String(m.key || "").trim().toLowerCase() === "bot");
        setCanAtendimento(atend?.accessible === true);
        setCanBot(bot?.accessible === true);
      })
      .catch(() => { setCanAtendimento(false); setCanBot(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtersTouched = useRef(false);
  useEffect(() => {
    if (!filtersTouched.current) { filtersTouched.current = true; return; }
    const handle = setTimeout(() => { setPage(1); setSelected(new Set()); loadList(tab, { page: 1 }); }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segment, city, uf]);

  // B0: polling por operationalState do backend (não por status fantasma)
  useEffect(() => {
    const runId = run?.id || run?.runId;
    const opState = getOpState(run);
    const status = String(run?.status || "");
    // Só para o poll se terminou E o operationalState diz "parado"
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
        const resOpState = getOpState(res);
        const resStatus = String(res?.status || "");
        const resTerminal = TERMINAL_RUN.has(resStatus) || res?.meta?.terminal;
        if (resTerminal && resOpState !== "funcionando" && resOpState !== "pausado") {
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
          loadList("shelf", { page: 1 });
          loadBank();
          setTab("shelf");
          setPage(1);
        }
      } catch {
        // mantém o último estado
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
    setCardIdx(0);
    setCardOpen(false);
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

  // B5: Automático — repõe a lista do Vendas sozinho
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
      // silencia
    } finally {
      setAutoBusy(false);
    }
  }

  // operationalState atual (do run mais recente)
  const opState = getOpState(run);

  // B0: runActive agora usa operationalState + TERMINAL_RUN corrigido
  // "pausado" (descansando) NÃO desabilita o Play — retoma sozinho
  const runActive = Boolean(
    (run?.id || run?.runId) &&
    !TERMINAL_RUN.has(String(run?.status || "")) &&
    opState === "funcionando"
  );
  const runPaused = opState === "pausado"; // descansando — não bloqueia Play
  const runProgress = run?.meta?.progress;

  async function executarBusca() {
    // "pausado" não bloqueia — pode iniciar nova busca
    if (runBusy || runActive) return;
    if (!city.trim() && !geo) { setSearchMsg("Me diz a cidade — ou ative a localização no topo."); return; }
    if (!segment.trim()) { setSearchMsg("Escolha um segmento pra eu varrer."); return; }
    setSearchMsg(null);
    setRunBusy(true);
    try {
      const body: Record<string, unknown> = { city, state: uf || undefined, segment };
      if (geo) { body.originLat = geo.lat; body.originLng = geo.lng; }
      if (forcarCanais && canalAtivos.size > 0) {
        body.requiredChannels = Array.from(canalAtivos);
        body.channelMatchMode = "any";
      }
      const res = await apiFetch<RunResponse>("/webscraping/radar/search-runs", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setRun(res);
      if (res?.message) setSearchMsg(res.message);
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
      // atualiza run
      const res = await apiFetch<RunResponse>(`/webscraping/radar/search-runs/${encodeURIComponent(runId)}`);
      setRun(res);
    } catch {
      // silencia — o poll vai pegar o estado real
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

  // Canal toggle
  function toggleCanal(c: CanalKey) {
    setCanalAtivos(prev => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
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
          ? `Prateleira vazia pra ${city}. Use o Radar → Buscar no painel ao lado.`
          : "Escolha cidade + segmento no painel ao lado e busque leads.";

  const meterPct = Math.min(100, Math.round(
    isSeller
      ? ((saq?.activeCount ?? 0) / (saq?.effectiveLimit || 1)) * 100
      : ((usage?.cards?.used ?? 0) / (usage?.cards?.limit || 1)) * 100
  ));

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

  function abrirWhatsAppExterno(phone: string | null | undefined) {
    if (!phone) return;
    const digits = phone.replace(/\D/g, "");
    const target = digits.length >= 12 ? digits : `55${digits}`;
    window.open(`https://wa.me/${target}`, "_blank", "noopener");
  }

  async function abrirWhatsAppInterno(lead: { phone: string | null; name: string | null }) {
    if (!lead.phone || waStartBusy) return;
    setWaStartBusy(true);
    setWaStartError(null);
    try {
      const res = await apiFetch<{ id?: number | string }>("/inbox/conversations/start", {
        method: "POST",
        body: JSON.stringify({
          phone: lead.phone.trim(),
          ...(lead.name ? { name: lead.name.trim() } : {}),
        }),
      });
      if (res?.id != null) {
        try { sessionStorage.setItem("hbx:abrir-conversa", String(res.id)); } catch { /* sem storage */ }
        router.push("/atendimento");
      }
    } catch (err) {
      setWaStartError(err instanceof Error ? err.message : "Não foi possível abrir a conversa.");
    } finally {
      setWaStartBusy(false);
    }
  }

  function fmtVendasStatusLabel(status: string | null | undefined) {
    switch (String(status || "").trim().toLowerCase()) {
      case "contato": return "Em contato";
      case "retorno": return "Retorno";
      case "qualificado": return "Qualificado";
      case "encerrado": return "Encerrado";
      default: return "Novo lead";
    }
  }

  function fmtSaleStatusLabel(status: string | null | undefined) {
    switch (String(status || "").trim().toLowerCase()) {
      case "activation_pending": return "Aguardando ativação";
      case "trial_started": return "Trial iniciado";
      case "sale_confirmed": return "Venda confirmada";
      case "inactive": return "Inativo";
      case "canceled": return "Cancelado";
      default: return null;
    }
  }

  function fmtMoney(value: number | null | undefined) {
    if (value == null || value <= 0) return null;
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function buildNegocioDetail(lead: RadarLead): NegocioDetail {
    const revealed = tab === "carteira" && Boolean(lead.phone);
    const hasVendas = revealed && lead.vendasStatus != null;
    const saleStatus = hasVendas ? lead.vendasSaleStatus : null;
    const saleStatusLabel = fmtSaleStatusLabel(saleStatus);
    return {
      id: lead.id,
      enriched: Boolean(lead.lastEnrichedAt) || Number(lead.enrichmentScore) > 0,
      name: lead.name,
      city: lead.city,
      state: lead.state,
      segment: lead.segment || lead.businessCategory || null,
      opportunityScore: lead.opportunityScore > 0 ? lead.opportunityScore : null,
      rating: lead.rating ?? null,
      reviews: lead.reviews ?? null,
      phone: revealed ? lead.phone : null,
      email: revealed ? (lead.email ?? null) : null,
      website: revealed ? (lead.website ?? null) : null,
      leadIntelligence: {
        whatsappStatus: lead.hasWhatsapp ? "confirmed" : null,
        emailStatus: lead.hasEmail ? "confirmed" : null,
        instagramUrl: revealed ? (lead.instagramUrl ?? null) : null,
        facebookUrl: revealed ? (lead.facebookUrl ?? null) : null,
      },
      statusLabel: hasVendas ? fmtVendasStatusLabel(lead.vendasStatus) : undefined,
      returnAt: hasVendas ? (lead.vendasReturnAt ?? undefined) : undefined,
      attemptCount: hasVendas ? (lead.vendasAttemptCount ?? undefined) : undefined,
      shortNote: hasVendas ? (lead.vendasShortNote ?? null) : undefined,
      lastResult: hasVendas ? (lead.vendasLastResult ?? null) : undefined,
      sale: saleStatusLabel && saleStatus && saleStatus !== "none"
        ? {
            status: saleStatus,
            statusLabel: saleStatusLabel,
            valueLabel: fmtMoney(lead.vendasSaleValue) ?? undefined,
          }
        : undefined,
    };
  }

  function renderLeadDetail(lead: RadarLead, opts?: { title?: string; onClose?: () => void }) {
    const detail = buildNegocioDetail(lead);
    const revealed = tab === "carteira" && Boolean(lead.phone);
    return (
      <DetalhesNegocio
        key={lead.id}
        detail={detail}
        title={opts?.title ?? "Detalhes do lead"}
        onClose={opts?.onClose}
        heroAction={revealed ? <BotStatusIcon accessible={canBot} /> : null}
        onWaOpenExternal={revealed ? () => abrirWhatsAppExterno(lead.phone) : undefined}
        onWaOpenInternal={revealed ? () => abrirWhatsAppInterno({ phone: lead.phone, name: lead.name }) : undefined}
        waQrActive={waQrActive}
        waCanInternal={canAtendimento}
        kvExtra={
          <>
            {!revealed && tab === "shelf" && (
              <div className="sub" style={{ marginTop: 4 }}>Contato revelado ao puxar este lead.</div>
            )}
            {lead.opportunityReason && (
              <p style={{ margin: "8px 0 0", fontSize: "0.72rem", lineHeight: 1.5 }}>
                {lead.opportunityReason}
              </p>
            )}
            {lead.opportunitySignals && lead.opportunitySignals.length > 0 && (
              <div className="radar2-signals" style={{ marginTop: 10 }}>
                {lead.opportunitySignals.slice(0, 6).map(sig => {
                  const m = SIGNAL_META[sig];
                  if (!m) return null;
                  return <span key={sig} className={`radar2-sig radar2-sig--${m.tone}`}>{m.label}</span>;
                })}
              </div>
            )}
            {lead.fitScore != null && lead.fitScore > 0 && (
              <div style={{ marginTop: 8 }}>
                <span className={`radar2-fit${lead.fitScore >= 60 ? " radar2-fit--hi" : ""}`}>Fit {lead.fitScore}</span>
              </div>
            )}
            {waStartError && <p style={{ marginTop: 8, fontSize: "0.7rem", color: "var(--hbx-danger)" }}>{waStartError}</p>}
          </>
        }
        actions={
          <div style={{ display: "grid", gap: 8 }}>
            {tab === "shelf" && (
              <button className="btn-teal"
                onClick={() => puxar(lead.id)}
                disabled={pullBusyId === lead.id || bulkBusy || meterBlocked}>
                {pullBusyId === lead.id ? "Puxando…" : "Puxar lead →"}
              </button>
            )}
            {tab === "carteira" && (
              <button className="btn-ghost" onClick={() => router.push("/vendas")}>
                Ver em Vendas →
              </button>
            )}
          </div>
        }
      />
    );
  }

  // ── Radar console: o disco + controles quando nenhum lead está selecionado ──
  function renderRadarConsole(mini: boolean) {
    const stateLabel = runActive
      ? "Varrendo agora"
      : runPaused
        ? "Descansando — retoma sozinho"
        : "Pronto pra buscar";
    const stateClass = runActive ? "radar-state-label--funcionando"
      : runPaused ? "radar-state-label--pausado"
      : "radar-state-label--parado";
    const opMsg = run?.meta?.operationalMessage || null;

    if (mini) {
      return (
        <div className="radar-mini-bar">
          <div style={{ flexShrink: 0, width: 56, height: 56 }}>
            <RadarDisc opState={opState} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className={`radar-state-label ${stateClass}`} style={{ textAlign: "left", margin: 0 }}>{stateLabel}</div>
            {opMsg && <div className="radar-state-msg" style={{ textAlign: "left", margin: "2px 0 0" }}>{opMsg}</div>}
          </div>
          <button className="btn-ghost btn-xs radar-mini-bar__back" onClick={() => setSelLead(null)} style={{ marginLeft: "auto" }}>
            ← Voltar
          </button>
        </div>
      );
    }

    return (
      <div className="radar-console">
        <RadarDisc opState={opState} />

        <div className={`radar-state-label ${stateClass}`}>{stateLabel}</div>
        {opMsg && <div className="radar-state-msg">{opMsg}</div>}

        {/* Canais — forçar na busca (liga/desliga), logo antes de Estado. Sem filtro
            pós-resultado: o canal não nasce na busca (só enriquecido depois) — "forçar"
            pede ao motor pra já trazer só quem tem o canal escolhido. */}
        <div className="radar-canais">
          <div className="radar-canais__head">
            <span className="radar-canais__lbl">Canais</span>
            <button
              type="button"
              className={"radar-canais__switch" + (forcarCanais ? " radar-canais__switch--on" : "")}
              onClick={() => setForcarCanais(v => !v)}
              aria-pressed={forcarCanais}
              title="Forçar a busca a trazer só leads com os canais escolhidos"
            >
              {forcarCanais ? "Forçar: Ligado" : "Forçar: Desligado"}
            </button>
          </div>
          <div className="radar-canais__chips">
            {ALL_CANAIS.map(c => (
              <button
                key={c}
                type="button"
                className={"radar-canal-toggle" + (canalAtivos.has(c) ? " radar-canal-toggle--active" : "")}
                onClick={() => toggleCanal(c)}
                disabled={!forcarCanais}
                title={c.charAt(0).toUpperCase() + c.slice(1)}
                aria-pressed={canalAtivos.has(c)}
              >
                <CanalIcon canal={c} size="sm" />
                <span>{c === "instagram" ? "IG" : c === "facebook" ? "FB" : c.charAt(0).toUpperCase() + c.slice(1)}</span>
              </button>
            ))}
          </div>
          {forcarCanais && (
            <p className="radar-canais__warn">
              Forçar canais deixa a busca mais lenta e pode trazer menos resultados — o motor tem que verificar WhatsApp/site/redes de cada lead na hora, e às vezes falha.
            </p>
          )}
        </div>

        {/* Localização do vendedor — aparece quando geo está ativo no Topbar */}
        {geo && (
          <div className="radar-geo-chip">
            <I d={ICONS.mapin} size={13} />
            <span className="radar-geo-chip__lbl">Minha localização</span>
            <button
              type="button"
              className="btn-teal btn-xs"
              onClick={pullGeoLocation}
              disabled={geoBusy}
            >
              {geoBusy ? "…" : "Preencher"}
            </button>
          </div>
        )}

        {/* Filtros compactos */}
        <div className="radar-controls">
          <div className="f">
            <label htmlFor="rc-uf">Estado</label>
            <select id="rc-uf" className="select-dark" value={uf} onChange={e => { setCity(""); setAlcance(""); setUf(e.target.value); }}>
              <option value="">Todos</option>
              {ufOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="f">
            <label htmlFor="rc-city">Cidade</label>
            <select id="rc-city" className="select-dark" value={city} onChange={e => { setAlcance(""); setCity(e.target.value); }}>
              <option value="">Cidade</option>
              {cityOptions.map(o => <option key={o.value} value={o.label}>{o.label}</option>)}
            </select>
          </div>
          <div className="f">
            <label htmlFor="rc-seg">Segmento</label>
            <select id="rc-seg" className="select-dark" value={segment} onChange={e => setSegment(e.target.value)}>
              <option value="">Ex.: Odontologia</option>
              {segOptions.map(o => <option key={o.value} value={o.label}>{o.label}</option>)}
            </select>
          </div>
          <div className="f">
            <label htmlFor="rc-alcance">Alcance</label>
            <select id="rc-alcance" className="select-dark" value={alcance} disabled={!city.trim()} onChange={e => setAlcance(e.target.value)}>
              <option value="">Só a cidade</option>
              <option value="25">+ 25 km</option>
              <option value="50">+ 50 km</option>
              <option value="100">+ 100 km</option>
            </select>
          </div>
          <div className="f">
            <label htmlFor="rc-quantos">Quantos</label>
            <select id="rc-quantos" className="select-dark" value={quantos} onChange={e => setQuantos(Number(e.target.value))}>
              {[1, 3, 5, 10, 20].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>

        {/* Ações: Play/STOP + Automático */}
        <div className="radar-actions">
          {runActive ? (
            <button className="btn-ghost" onClick={pararBusca}>
              ◼ STOP
            </button>
          ) : (
            <button className="btn-teal" onClick={executarBusca} disabled={runBusy || runActive}>
              {runBusy ? "Iniciando…" : runPaused ? "▶ Retomar" : "▶ Buscar"}
            </button>
          )}
          <button
            className={"btn-ghost radar-auto" + (standingOrder?.active ? " radar-auto--on" : "")}
            onClick={toggleAutomatico}
            disabled={autoBusy}
            aria-pressed={standingOrder?.active}
            title="Automático — repõe sua lista de Vendas sozinho"
          >
            {standingOrder?.active ? "◉ Auto" : "◎ Auto"}
          </button>
        </div>

        {/* Ver N leads disponíveis */}
        <button className="btn-ghost btn-xs" onClick={() => { setPage(1); setSelected(new Set()); loadList("shelf", { page: 1, quantosOverride: quantos }); }}>
          <I d={ICONS.search} size={12} /> Ver {quantos} leads disponíveis
        </button>

        {searchMsg && <p className="hint" style={{ margin: "4px 0 0" }}>{searchMsg}</p>}
      </div>
    );
  }

  // ── Swipe handlers (card-overlay mobile) ─────────────────────────────────
  function onPointerDown(e: React.PointerEvent) {
    dragRef.current = { startX: e.clientX, dx: 0, active: true };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setIsDragging(true);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.startX;
    dragRef.current.dx = dx;
    setDragDx(dx);
  }

  function onPointerUp() {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    setIsDragging(false);
    const dx = dragRef.current.dx;
    setDragDx(0);
    if (Math.abs(dx) > 80) {
      if (dx < 0) cardGo(1);
      else cardGo(-1);
    }
  }

  const isCardHandoff = cardIdx >= items.length;
  const activeCard = !isCardHandoff ? items[cardIdx] : null;

  function cardGo(dir: 1 | -1) {
    setCardIdx(prev => {
      const next = prev + dir;
      if (next < 0) return 0;
      if (next >= items.length) {
        router.push("/vendas");
        return items.length;
      }
      return next;
    });
  }

  function openCard(idx: number) {
    setCardIdx(idx);
    setCardOpen(true);
    setDragDx(0);
    dragRef.current = { startX: 0, dx: 0, active: false };
  }

  function closeCard() {
    setCardOpen(false);
  }

  // ── Vista mobile: lista vertical ──────────────────────────────────────────
  function renderListMobile() {
    return (
      <>
        <div className="lead-list">
          {items.length === 0 && (
            <div className="lead-list__empty">
              <div className="radar2-empty">{emptyMsg}</div>
            </div>
          )}
          {items.map((row, i) => (
            <button
              key={row.id}
              className="lead-list-row"
              onClick={() => openCard(i)}
              aria-label={`Abrir detalhes de ${row.name || "lead"}`}
            >
              <Av name={row.name || "—"} size={42} />
              <div className="lead-list-row__body">
                <span className="lead-list-row__name">{row.name || "—"}</span>
                <span className="lead-list-row__sub">
                  {row.segment || row.businessCategory || "—"}
                  {row.city ? ` · ${row.city}${row.state ? `/${row.state}` : ""}` : ""}
                </span>
                {row.opportunitySignals && row.opportunitySignals.length > 0 && (
                  <div className="lead-list-row__pills">
                    {row.opportunitySignals.slice(0, 2).map(sig => {
                      const m = SIGNAL_META[sig];
                      if (!m) return null;
                      return <span key={sig} className={`radar2-sig radar2-sig--${m.tone}`}>{m.label}</span>;
                    })}
                    {row.fitScore != null && row.fitScore > 0 && (
                      <span className={`radar2-fit${row.fitScore >= 60 ? " radar2-fit--hi" : ""}`}>
                        Fit {row.fitScore}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <span className="lead-list-row__chev" aria-hidden>›</span>
            </button>
          ))}
        </div>

        {tab === "shelf" && (
          <div className={"lead-list__meter" + (meterBlocked ? " blocked" : "")}>
            <div className="lead-list__meter-row">
              <span className="lead-list__meter-lbl">
                <I d={ICONS.bolt} size={10} /> {meterLabel}
              </span>
              <span className="lead-list__meter-val">{meterValue}</span>
            </div>
            <div className="radar2-bar">
              <div className="radar2-bar-fill" style={{ width: `${meterPct}%` }} />
            </div>
          </div>
        )}

        {pullMsg && <p className="radar2-pull-msg" style={{ padding: "0 14px" }}>{pullMsg}</p>}
      </>
    );
  }

  // ── Card overlay mobile (swipe Tinder) ────────────────────────────────────
  function renderCardOverlay() {
    if (!cardOpen) return null;
    return (
      <div className="hbx-veil" onClick={closeCard}>
        <div className="lead-card-modal" onClick={e => e.stopPropagation()}>
          <div className="lead-card-modal__nav">
            <button className="lead-card-modal__arrow" onClick={() => cardGo(-1)} disabled={cardIdx === 0} aria-label="Anterior">‹</button>
            <div className="lead-card-modal__dots">
              {items.slice(0, Math.min(items.length, 10)).map((_, i) => (
                <span key={i} className={"lead-card-modal__dot" + (i === cardIdx ? " lead-card-modal__dot--active" : "")} />
              ))}
            </div>
            <span className="lead-card-modal__progress">
              {isCardHandoff ? `${items.length}/${items.length}` : `${cardIdx + 1}/${items.length}`}
            </span>
            <button className="lead-card-modal__arrow" onClick={() => { if (isCardHandoff) router.push("/vendas"); else cardGo(1); }} aria-label="Próximo">›</button>
            <button className="lead-card-modal__close" onClick={closeCard} aria-label="Fechar">✕</button>
          </div>

          <div className="lead-card-modal__body">
            {isCardHandoff ? (
              <div className="lead-card lead-card--handoff" onClick={() => router.push("/vendas")}>
                <div className="lead-handoff__icon">🏆</div>
                <div className="lead-handoff__title">Acabou a prateleira</div>
                <div className="lead-handoff__sub">Seus leads viram negócios — toque pra abrir o Vendas</div>
                <button className="btn-teal" onClick={() => router.push("/vendas")}>Abrir Vendas →</button>
              </div>
            ) : activeCard && (
              <div
                className="lead-card"
                style={{
                  transform: isDragging ? `translateX(${dragDx}px) rotate(${dragDx * 0.03}deg)` : "translateX(0) rotate(0deg)",
                  opacity: isDragging ? Math.max(0.75, 1 - Math.abs(dragDx) / 500) : 1,
                  transition: isDragging ? "none" : "transform 0.22s ease, opacity 0.22s ease",
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                <div className="lead-card__hero">
                  <Av name={activeCard.name || "—"} size={48} />
                  <div className="lead-card__hero-body">
                    <span className="lead-card__name">{activeCard.name || "—"}</span>
                    <span className="lead-card__sub">{activeCard.segment || activeCard.businessCategory || "—"}</span>
                    {activeCard.city && (
                      <span className="lead-card__loc">
                        <I d={ICONS.mapin} size={11} />
                        {activeCard.city}{activeCard.state ? `/${activeCard.state}` : ""}
                      </span>
                    )}
                    <div className="lead-card__badges">
                      {activeCard.fitScore != null && activeCard.fitScore > 0 && (
                        <span className={`radar2-fit${activeCard.fitScore >= 60 ? " radar2-fit--hi" : ""}`}>
                          Fit {activeCard.fitScore}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="lead-card__body">
                  {renderLeadDetail(activeCard)}
                </div>
              </div>
            )}
          </div>

          <p className="lead-card-modal__hint">← Arraste o card para navegar →</p>
        </div>
      </div>
    );
  }

  return (
    <div className="content leads-page">
      <div className="work">
        {/* B1: linha fininha Total no Brasil (substituiu os 4 KPIs) */}
        <section className="panel" style={{ padding: 0 }}>
          <div className="leads-bank-strip">
            <span>{isMobile ? "Brasil:" : "Total no Brasil:"}</span>
            <span className="leads-bank-strip__num">{bank ? fmtInt(bank.total) : "—"}</span>
            {bank && Number(bank.deltaToday || 0) > 0 && (
              <span className="leads-bank-strip__delta">+{fmtInt(bank.deltaToday)} hoje</span>
            )}
          </div>
        </section>

        {/* PRATELEIRA + CARTEIRA */}
        <section className="panel leads-shelf" style={{ padding: 0 }}>
          <div className="radar2-shell">
            {/* Mobile: filtro toggle */}
            {isMobile && (
              <button
                className="radar2-filter-toggle"
                onClick={() => setFilterOpen(o => !o)}
                aria-expanded={filterOpen}
              >
                <I d={ICONS.search} size={16} />
                <span>{filterOpen ? "Ocultar filtros" : "Buscar leads — cidade, segmento…"}</span>
                <I d={ICONS.filter} size={14} />
              </button>
            )}

            {/* Mobile: rail de filtros (ainda existe no mobile via toggle) */}
            {isMobile && (
              <div className={"radar2-rail" + (filterOpen ? " radar2-rail--open" : "")}>
                <div className="f">
                  <label>Estado</label>
                  <select className="select-dark" value={uf} onChange={e => { setCity(""); setAlcance(""); setUf(e.target.value); }}>
                    <option value="">Todos</option>
                    {ufOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="f">
                  <label>Cidade</label>
                  <select className="select-dark" value={city} onChange={e => { setAlcance(""); setCity(e.target.value); }}>
                    <option value="">Cidade</option>
                    {cityOptions.map(o => <option key={o.value} value={o.label}>{o.label}</option>)}
                  </select>
                </div>
                <div className="f">
                  <label>Segmento</label>
                  <select className="select-dark" value={segment} onChange={e => setSegment(e.target.value)}>
                    <option value="">Ex.: Odontologia</option>
                    {segOptions.map(o => <option key={o.value} value={o.label}>{o.label}</option>)}
                  </select>
                </div>
                <button className="btn-teal" onClick={executarBusca} disabled={runBusy || runActive}>
                  {runActive ? "Varrendo…" : "Buscar (motor)"}
                </button>
                <button
                  className={"btn-teal radar2-auto" + (standingOrder?.active ? " radar2-auto--on" : "")}
                  onClick={toggleAutomatico}
                  disabled={autoBusy}
                  aria-pressed={standingOrder?.active}
                >
                  {standingOrder?.active ? "◉ Automático" : "◎ Automático"}
                </button>
                {searchMsg && <p className="hint">{searchMsg}</p>}
              </div>
            )}

            {/* Área principal da lista */}
            <div className="radar2-main">
              <div className="tabs" data-tut="leads-abas">
                <button className={"tab" + (tab === "shelf" ? " active" : "")} onClick={() => switchTab("shelf")}>
                  Disponíveis <span className="n">{counts.shelf == null ? "—" : fmtInt(counts.shelf)}</span>
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
              {runPaused && (
                <div className="radar2-live" style={{ background: "color-mix(in srgb, var(--hbx-warning) 12%, transparent)", color: "var(--hbx-warning)" }}>
                  <span className="dot" style={{ background: "var(--hbx-warning)" }} /> Descansando — retoma sozinho
                  {run?.meta?.operationalMessage ? ` · ${run.meta.operationalMessage}` : ""}
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

              {/* Branch mobile/desktop */}
              {isMobile ? (
                renderListMobile()
              ) : (
                <>
                  <div className="tbl-wrap">
                    <table className="tbl">
                      <thead>
                        <tr>
                          {tab === "shelf" && <th style={{ width: 34 }} aria-label="Selecionar" />}
                          <th>Empresa</th>
                          <th className="tbl-col-city">Cidade</th>
                          <th className="tbl-col-contact">Contato</th>
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
                            <td className="tbl-col-city">{row.city ? `${row.city}${row.state ? "/" + row.state : ""}` : "—"}</td>
                            <td className="tbl-col-contact">
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
                        <div className="radar2-meter-card" data-tut="leads-cota">
                          <span className="radar2-meter-lbl">
                            <I d={ICONS.bolt} size={11} /> {meterLabel}
                          </span>
                          <span className="radar2-meter-val">{meterValue}</span>
                          <div className="radar2-bar">
                            <div className="radar2-bar-fill" style={{ width: `${meterPct}%` }} />
                          </div>
                          {isSeller && <span className="radar2-quota-note">os 20 são compartilhados com o Vendas</span>}
                        </div>
                        <button className="btn-teal" data-tut="leads-puxar" onClick={puxarSelecionados} disabled={selected.size === 0 || meterBlocked || bulkBusy}>
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
                </>
              )}
            </div>
          </div>
        </section>

        {!isSeller && (
          <p className="radar2-cap" style={{ padding: "0 4px" }}>
            Você vê o lago todo mascarado (admin). O vendedor vê a mesma tela — só muda quantos cabem na carteira dele.
          </p>
        )}
      </div>

      {/* B4: Desktop: aside lateral com 2 estados */}
      {!isMobile && (
        <aside className="ctx">
          {!selLead ? (
            /* Idle: radar console completo */
            renderRadarConsole(false)
          ) : (
            /* Lead selecionado: mini-radar no topo + detalhe */
            <>
              <div className="radar-console--mini">
                {renderRadarConsole(true)}
              </div>
              {renderLeadDetail(selLead, { title: "Detalhes do lead", onClose: () => setSelLead(null) })}
            </>
          )}
        </aside>
      )}

      {/* Mobile: radar hero no topo (sempre visível) + card-overlay com swipe */}
      {isMobile && (
        <>
          {/* Hero radar no topo mobile */}
          <div style={{ padding: "10px 14px 0" }}>
            {renderRadarConsole(true)}
          </div>
          {renderCardOverlay()}
        </>
      )}
    </div>
  );
}
