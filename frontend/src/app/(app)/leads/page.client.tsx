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
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import { Av, I, ICONS } from "@/components/hbx/shell";
import { CanalIcon } from "@/components/hbx/canal-icon";
import { DetalhesNegocio, type NegocioDetail } from "@/components/hbx/detalhes-negocio";
import { BotStatusIcon } from "@/components/hbx/bot-action";
import { apiFetch } from "@/lib/api";
import { BRAZIL_CITIES_BY_UF, BRAZIL_UF_OPTIONS, mergeBrazilCityOptions } from "@/lib/brazil-cities";
import { stampOnboardingEvent } from "@/lib/onboarding";
import { useIsMobile } from "@/lib/use-is-mobile";
import { buildWaLink, buildWaMessage } from "@/lib/wa-link";

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
  // Empresa + dono (L4 CNPJ→qsa) e multi-contatos do scraper — captura-e-acumula.
  cnpj?: string | null;
  cnae?: string | null;
  razaoSocial?: string | null;
  ownerName?: string | null;
  ownerNames?: string[] | null;
  ownerPhone?: string | null;
  ownerInstagram?: string | null;
  ownerFacebook?: string | null;
  companySituation?: string | null;
  emails?: string[] | null;
  phones?: string[] | null;
  phonesWhatsapp?: Record<string, boolean> | null;
  enrichmentScore?: number | null;
  lastEnrichedAt?: string | null;
  // Estado do pipeline de enriquecimento (enum backend RadarPipelineEnrichmentStatus).
  // Enquanto a API não o envia fica undefined → card NÃO mostra "enriquecendo"
  // (idêntico a hoje). Quando o backend surfacer 'pending'/'partial', o selo +
  // shimmer por campo acendem sozinhos no card.
  enrichmentStatus?: string | null;
  vendasStatus?: string | null;
  vendasReturnAt?: string | null;
  vendasAttemptCount?: number | null;
  vendasShortNote?: string | null;
  vendasLastResult?: string | null;
  vendasSaleStatus?: string | null;
  vendasSaleValue?: number | null;
  // sourceChain (P1, 02/07 — cutover ordem fixa): "rfb" | "web" | "rfb+web". Opcional.
  sourceChain?: string | null;
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

// Sugestão de expansão quando a oferta esgota (cidade/segmento secaram, não cota).
type ExpansionSuggestion = {
  city: string;
  state: string | null;
  segment: string;
  deliveredCount: number;
  requestedQuantity: number;
  currentRadiusKm: number;
  nextRadiusKm: number | null;
  neighborSegments: string[];
  headline: string;
  widenReachLabel: string | null;
  widenSegmentLabel: string | null;
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
    expansionSuggestion?: ExpansionSuggestion | null;
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

function getStoredFilters() {
  if (typeof window === "undefined") return { uf: "", city: "", segment: "", alcance: "", quantos: 5 };
  try {
    const s = localStorage.getItem("hbx:leads-filters");
    if (s) {
      const p = JSON.parse(s) as Record<string, unknown>;
      return {
        uf: typeof p.uf === "string" ? p.uf : "",
        city: typeof p.city === "string" ? p.city : "",
        segment: typeof p.segment === "string" ? p.segment : "",
        alcance: typeof p.alcance === "string" ? p.alcance : "",
        quantos: typeof p.quantos === "number" && p.quantos > 0 ? p.quantos : 5,
      };
    }
  } catch { /* sem storage */ }
  return { uf: "", city: "", segment: "", alcance: "", quantos: 5 };
}

// embedded: render DENTRO do Vendas (modo "Buscar empresas" do slide), sem a aba
// "Minha carteira" (carteira = funil) nem o "Voltar pro funil". onLeadPulled avisa
// o Vendas que um lead entrou no funil — focus=true desliza pro funil. 27/06.
export function LeadsClient({ embedded = false, onLeadPulled, onEmbedStats, embedTitle }: { embedded?: boolean; onLeadPulled?: (focus?: boolean) => void; onEmbedStats?: (s: { totalBrasil: number | null; disponiveis: number | null; cotaLabel: string; cotaValue: string; cotaPct: number }) => void; embedTitle?: ReactNode } = {}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [filterOpen, setFilterOpen] = useState(false);

  // filtros (lago → prateleira) — persiste em localStorage
  const [uf, setUf] = useState(() => getStoredFilters().uf);
  const [city, setCity] = useState(() => getStoredFilters().city);
  const [segment, setSegment] = useState(() => getStoredFilters().segment);
  const [alcance, setAlcance] = useState(() => getStoredFilters().alcance);
  const [quantos, setQuantos] = useState(() => getStoredFilters().quantos);

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

  // P4: modal de campo faltando
  const [missingModal, setMissingModal] = useState<string[] | null>(null);

  // P5/EFEITO: chips voando e toast
  const [flyChips, setFlyChips] = useState<Array<{ id: number; name: string; x0: number; y0: number; x1: number; y1: number; dur: number }>>([]);
  const [flyToast, setFlyToast] = useState<string | null>(null);
  const [tabCarteiraPop, setTabCarteiraPop] = useState(false);
  const discRef = useRef<HTMLDivElement | null>(null);
  const tabCarteiraRef = useRef<HTMLButtonElement | null>(null);
  const flyIdRef = useRef(0);

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
    // P8b: só aceita run do mount se operationalState = funcionando|pausado
    // (run terminal antigo no banco engoliria o 1º clique via runActive=true)
    apiFetch<RunResponse>("/webscraping/radar/search-runs/latest")
      .then(res => {
        if (!res || !(res.id || res.runId)) return;
        const opState = getOpState(res);
        const isTerminal = TERMINAL_RUN.has(String(res?.status || "")) || res?.meta?.terminal;
        // Só carrega se está visivelmente ativo (não terminal ou operacional ativo)
        if (!isTerminal || opState === "funcionando" || opState === "pausado") {
          setRun(res);
        }
      })
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

  useEffect(() => {
    try { localStorage.setItem("hbx:leads-filters", JSON.stringify({ uf, city, segment, alcance, quantos })); } catch { /* sem storage */ }
  }, [uf, city, segment, alcance, quantos]);

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
          loadUsage();
          // P5/EFEITO: destino depende do "Auto" (standing order).
          // Auto ON + importou → voa chips pra carteira (foi auto-importado).
          // Auto OFF → leads ficam na vitrine "Disponíveis"; mostra quantos achou pra puxar.
          type RunMetaExt = { progress?: number; terminal?: boolean; operationalState?: string; operationalReason?: string; operationalMessage?: string; importedCount?: number; totalAvailable?: number; deliveredCount?: number };
          const resMeta = res?.meta as RunMetaExt | undefined;
          const importedCount = resMeta?.importedCount ?? 0;
          const autoOn = Boolean(standingOrder?.active);
          if (autoOn && importedCount > 0) {
            triggerFlyEffect(importedCount, res);
          } else {
            setTab("shelf");
            setPage(1);
            // "Apreciar o resultado": anuncia quantos leads ficaram disponíveis pra puxar.
            const disponiveis = resMeta?.totalAvailable ?? res?.foundCount ?? 0;
            if (disponiveis > 0) {
              setFlyToast(`${disponiveis} lead${disponiveis > 1 ? "s" : ""} disponíve${disponiveis > 1 ? "is" : "l"} pra puxar`);
              setTimeout(() => setFlyToast(null), 3200);
            }
          }
        }
      } catch {
        // mantém o último estado
      }
    }, 4000);
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [run, loadList, loadBank, standingOrder?.active]);

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

  function limparFiltros() {
    setUf("");
    setCity("");
    setSegment("");
    setAlcance("");
    setQuantos(5);
    setRun(null);
    setSearchMsg(null);
    setPullMsg(null);
    setSelected(new Set());
    setSelLead(null);
    setCanalAtivos(new Set());
    setForcarCanais(false);
    setPage(1);
    setTab("shelf");
    try { localStorage.removeItem("hbx:leads-filters"); } catch { /* sem storage */ }
    loadList("shelf", { page: 1, quantosOverride: 5 });
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
  // "Achou 12, tchau brigado" → o backend manda a sugestão quando a oferta esgota (não cota).
  // Só aparece em "parado" e quando há alguma expansão possível.
  const runExpansion = (!runActive && opState === "parado")
    ? (run?.meta?.expansionSuggestion ?? null)
    : null;

  // P5/EFEITO: anima chips saindo do disco do radar e voando pra aba Minha carteira
  function triggerFlyEffect(importedCount: number, _run: RunResponse) {
    void _run;
    // Embutido no Vendas: não existe aba carteira pra onde voar — só avisa o funil
    // pra recarregar (sem deslizar; é auto-pull em segundo plano).
    if (embedded) { onLeadPulled?.(false); return; }
    const cap = Math.min(importedCount, 5);
    const discEl = discRef.current;
    const tabEl = tabCarteiraRef.current;

    if (!discEl || !tabEl || typeof window === "undefined") {
      // sem elemento de referência: só troca aba
      setTimeout(() => { setTab("carteira"); setPage(1); loadList("carteira", { page: 1 }); }, 200);
      return;
    }

    const discRect = discEl.getBoundingClientRect();
    const tabRect = tabEl.getBoundingClientRect();
    const srcX = discRect.left + discRect.width / 2;
    const srcY = discRect.top + discRect.height / 2;
    const dstX = tabRect.left + tabRect.width / 2;
    const dstY = tabRect.top + tabRect.height / 2;

    const chips: typeof flyChips = [];
    const names = ["Lead", "Empresa", "Contato", "Negócio", "Cliente"];
    for (let i = 0; i < cap; i++) {
      chips.push({
        id: ++flyIdRef.current,
        name: names[i % names.length],
        x0: srcX,
        y0: srcY,
        x1: dstX - srcX,
        y1: dstY - srcY,
        dur: 0.62 + i * 0.12,
      });
    }
    setFlyChips(chips);

    // Badge pop na aba
    setTimeout(() => {
      setTabCarteiraPop(true);
      setTimeout(() => setTabCarteiraPop(false), 500);
    }, 400);

    // Toast
    const total = importedCount;
    setTimeout(() => {
      setFlyToast(`${total} lead${total > 1 ? "s" : ""} na sua carteira`);
      setTimeout(() => setFlyToast(null), 3200);
    }, 600);

    // Limpar chips e trocar aba depois do voo
    setTimeout(() => {
      setFlyChips([]);
      setTab("carteira");
      setPage(1);
      loadList("carteira", { page: 1 });
    }, 1100 + cap * 120);
  }

  // P4: valida campos e abre popup se faltando — usado em 3 gatilhos
  function validarCamposOuPopup(effSegment?: string): boolean {
    const segToCheck = effSegment != null ? effSegment : segment;
    const faltando: string[] = [];
    if (!city.trim() && !geo) faltando.push("Cidade");
    if (!segToCheck.trim()) faltando.push("Segmento");
    if (faltando.length > 0) {
      setMissingModal(faltando);
      return false;
    }
    return true;
  }

  // override: re-disparo da MESMA busca já expandida (ampliar alcance / incluir segmentos).
  // Quando vem override, os filtros visíveis também sobem (segment/alcance) pra refletir.
  async function executarBusca(override?: { segment?: string; radiusKm?: number }) {
    // P8b: "pausado" não bloqueia — pode iniciar nova busca; só bloqueia se funcionando AGORA
    if (runBusy || runActive) return;
    const effSegment = override?.segment != null ? override.segment : segment;
    const effRadius = override?.radiusKm != null ? override.radiusKm : (alcance ? Number(alcance) : 0);
    // P4: valida e abre popup se faltando (usa o segmento efetivo)
    if (!validarCamposOuPopup(effSegment)) return;
    setSearchMsg(null);
    setRunBusy(true);
    try {
      // P1/P8a: inclui quantity no body (DTO exige; antes ficava de fora → 400)
      const body: Record<string, unknown> = { city, state: uf || undefined, segment: effSegment, quantity: quantos };
      if (effRadius > 0) body.radiusKm = effRadius;
      if (geo) { body.originLat = geo.lat; body.originLng = geo.lng; }
      if (forcarCanais && canalAtivos.size > 0) {
        body.requiredChannels = Array.from(canalAtivos);
        body.channelMatchMode = "any";
      }
      const res = await apiFetch<RunResponse>("/webscraping/radar/search-runs", {
        method: "POST",
        body: JSON.stringify(body),
      });
      // Reflete a expansão nos filtros visíveis (sem mexer quando é busca normal).
      if (override?.segment != null) setSegment(effSegment);
      if (override?.radiusKm != null) setAlcance(String(override.radiusKm));
      setRun(res);
      if (res?.message) setSearchMsg(res.message);
    } catch (err) {
      setSearchMsg(err instanceof Error ? err.message : "Não consegui iniciar a busca.");
    } finally {
      setRunBusy(false);
    }
  }

  // Botões da sugestão de expansão (1 toque): re-dispara a busca já ampliada.
  function ampliarAlcance(sug: ExpansionSuggestion) {
    if (!sug.nextRadiusKm) return;
    void executarBusca({ radiusKm: sug.nextRadiusKm });
  }
  function incluirSegmentosVizinhos(sug: ExpansionSuggestion) {
    if (!sug.neighborSegments.length) return;
    // junta o pedido original + vizinhos numa string com vírgula (o motor já separa por vírgula).
    const combined = [sug.segment, ...sug.neighborSegments]
      .map((s) => String(s || "").trim())
      .filter(Boolean)
      .join(", ");
    void executarBusca({ segment: combined });
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
      void stampOnboardingEvent("lead_pulled"); // marco: vitória #1 (Camada 1)
      loadList("shelf", { page });
      loadUsage();
      loadBank();
      if (embedded) onLeadPulled?.(true);
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
    if (ok > 0) void stampOnboardingEvent("lead_pulled"); // marco: vitória #1 (Camada 1)
    setBulkBusy(false);
    loadList("shelf", { page: 1 });
    loadUsage();
    loadBank();
    setPage(1);
    if (embedded && ok > 0) onLeadPulled?.(true);
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
          ? `Nenhuma empresa disponível em ${city} ainda. Use o Radar ao lado para buscar.`
          : isMobile
            ? "Toque em Filtrar para escolher cidade + segmento e buscar leads."
            : "Escolha cidade + segmento no painel ao lado e busque leads.";

  const meterPct = Math.min(100, Math.round(
    isSeller
      ? ((saq?.activeCount ?? 0) / (saq?.effectiveLimit || 1)) * 100
      : ((usage?.cards?.used ?? 0) / (usage?.cards?.limit || 1)) * 100
  ));

  // Embutido no Vendas: espelha os 3 números pro topo da casca única. setState do
  // pai é estável (não dispara loop). 29/06.
  useEffect(() => {
    onEmbedStats?.({
      totalBrasil: bank?.total ?? null,
      disponiveis: counts.shelf,
      cotaLabel: meterLabel,
      cotaValue: meterValue,
      cotaPct: meterPct,
    });
  }, [onEmbedStats, bank, counts.shelf, meterLabel, meterValue, meterPct]);

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

  function abrirWhatsAppExterno(phone: string | null | undefined, text?: string) {
    const link = buildWaLink(phone, { text });
    if (link) window.open(link, "_blank", "noopener");
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
      // Multi-contatos e empresa/dono — revelados junto do contato; o card ainda
      // aplica o cadeado por tier (canSeeCompany) sobre os dados pessoais do dono.
      emails: revealed ? (lead.emails ?? null) : null,
      phones: revealed ? (lead.phones ?? null) : null,
      phonesWhatsapp: revealed ? (lead.phonesWhatsapp ?? null) : null,
      cnpj: revealed ? (lead.cnpj ?? null) : null,
      cnae: revealed ? (lead.cnae ?? null) : null,
      razaoSocial: revealed ? (lead.razaoSocial ?? null) : null,
      ownerName: revealed ? (lead.ownerName ?? null) : null,
      ownerNames: revealed ? (lead.ownerNames ?? null) : null,
      ownerPhone: revealed ? (lead.ownerPhone ?? null) : null,
      ownerInstagram: revealed ? (lead.ownerInstagram ?? null) : null,
      ownerFacebook: revealed ? (lead.ownerFacebook ?? null) : null,
      companySituation: revealed ? (lead.companySituation ?? null) : null,
      sourceChain: lead.sourceChain ?? null,
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
    // "Enriquecendo agora" = pipeline em pending/partial e ainda não enriquecido.
    // Sinal ainda não vem da API → fica false hoje (comportamento idêntico).
    const enrichStatus = String(lead.enrichmentStatus || "").toLowerCase();
    const enriching = (enrichStatus === "pending" || enrichStatus === "partial") && !detail.enriched;
    return (
      <DetalhesNegocio
        key={lead.id}
        detail={detail}
        title={opts?.title ?? "Detalhes"}
        enriching={enriching}
        onClose={opts?.onClose}
        heroAction={revealed ? <BotStatusIcon accessible={canBot} /> : null}
        onWaOpenExternal={revealed ? () => abrirWhatsAppExterno(lead.phone, buildWaMessage({ name: lead.name, segment: lead.segment, city: lead.city })) : undefined}
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
        ? "Em pausa — volta sozinho"
        : "Pronto pra buscar";
    const stateClass = runActive ? "radar-state-label--funcionando"
      : runPaused ? "radar-state-label--pausado"
      : "radar-state-label--parado";
    const opMsg = run?.meta?.operationalMessage || null;

    // P5 avisos de parada clicáveis
    const runStatus = String(run?.status || "");
    const isPausadoCarteira = runPaused && !runActive;
    const isParadoFiltro = !runActive && !runPaused && (runStatus === "completed_insufficient_results" || runStatus === "failed");
    const foundCount = run?.foundCount ?? 0;

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
        {/* P5/EFEITO: ref no wrapper do disco para pegar posição */}
        <div ref={discRef}>
          <RadarDisc opState={opState} />
        </div>

        <div className={`radar-state-label ${stateClass}`}>{stateLabel}</div>

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

        {/* BLOCO B1: Onde buscar */}
        <div className="radar-box" data-tut="leads-filtros">
          <div className="radar-box__grid2">
            <div className="f">
              <label htmlFor="rc-uf">
                Estado{!uf && <span className="radar-field-arrow" aria-hidden>›</span>}
              </label>
              <select id="rc-uf" className="select-dark" value={uf} onChange={e => { setCity(""); setAlcance(""); setUf(e.target.value); }}>
                <option value="">Todos</option>
                {ufOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="f">
              <label htmlFor="rc-city">
                Cidade{!city.trim() && <span className="radar-field-arrow" aria-hidden>›</span>}
              </label>
              <select id="rc-city" className="select-dark" value={city} onChange={e => { setAlcance(""); setCity(e.target.value); }}>
                <option value="">Cidade</option>
                {cityOptions.map(o => <option key={o.value} value={o.label}>{o.label}</option>)}
              </select>
            </div>
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
        </div>

        {/* BLOCO B2: O que buscar */}
        <div className="radar-box">
          <div className="f">
            <label htmlFor="rc-seg">
              Segmento{!segment.trim() && <span className="radar-field-arrow" aria-hidden>›</span>}
            </label>
            <select
              id="rc-seg"
              className="select-dark"
              value={segment}
              onChange={e => setSegment(e.target.value)}
            >
              <option value="">Escolha um segmento</option>
              {segOptions.map(o => <option key={o.value} value={o.label}>{o.label}</option>)}
              {segment && !segOptions.some(o => o.label === segment) && (
                <option value={segment}>{segment}</option>
              )}
            </select>
          </div>
          <div className="f">
            <label htmlFor="rc-quantos">Quantos puxar</label>
            <select id="rc-quantos" className="select-dark" value={quantos} onChange={e => setQuantos(Number(e.target.value))}>
              {[1, 3, 5, 10, 20].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>

        {/* BLOCO B3: Canais — forçar na busca */}
        <div className="radar-box">
          <div className="radar-canais">
            <div className="radar-canais__head">
              <span className="radar-canais__lbl">Canais exigidos</span>
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
                  <CanalIcon canal={c} size="lg" />
                </button>
              ))}
            </div>
            {forcarCanais && (
              <p className="radar-canais__warn">
                Forçar canais deixa a busca mais lenta e pode trazer menos resultados — o motor tem que verificar WhatsApp/site/redes de cada lead na hora, e às vezes falha.
              </p>
            )}
          </div>
        </div>

        {/* Ações: Play/STOP + Limpar */}
        <div className="radar-actions">
          {runActive ? (
            <button className="btn-ghost" onClick={pararBusca}>
              ◼ STOP
            </button>
          ) : (
            <button className="btn-teal" data-tut="leads-buscar" onClick={() => executarBusca()} disabled={runBusy || runActive}>
              {runBusy ? "Iniciando…" : runPaused ? "▶ Retomar" : "▶ Buscar"}
            </button>
          )}
          <button
            className="btn-ghost"
            onClick={limparFiltros}
            title="Limpar todos os filtros e pesquisas"
          >
            Limpar
          </button>
        </div>

        {/* P5: avisos de parada com atalhos clicáveis */}
        {isPausadoCarteira && (
          <div className="radar-stop-warn radar-stop-warn--pausado">
            <span>Sua carteira está cheia ({foundCount} encontrado{foundCount !== 1 ? "s" : ""}). O Radar volta a buscar sozinho quando abrir espaço.</span>
            <button className="btn-ghost btn-xs" onClick={() => setAlcance("50")}>+50 km</button>
          </div>
        )}
        {isParadoFiltro && foundCount === 0 && (
          <div className="radar-stop-warn radar-stop-warn--parado">
            <span>Varri tudo aqui e não achei nada — mude o filtro.</span>
            <button className="btn-ghost btn-xs" onClick={() => setAlcance("50")}>+50 km</button>
            <button className="btn-ghost btn-xs" onClick={() => setSegment("")}>Trocar segmento</button>
          </div>
        )}

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
    <div className={"content leads-page" + (embedded ? " leads-embedded" : "")}>
      <div className="work">
        {/* Voltar pro funil — só no modo TELA SEPARADA. Embutido no Vendas, quem volta
            é o toggle do slide (não renderiza o botão → grid vira auto/1fr). 27/06. */}
        {!embedded && (
          <button className="btn-ghost leads-back" onClick={() => router.push("/vendas")} title="Voltar pro funil de Vendas">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            Voltar pro funil
          </button>
        )}
        {/* B1: linha fininha Total no Brasil. Embutido no Vendas (casca única) ela
            some — o número já vive no card do topo. 29/06. */}
        {!embedded && (
        <section className="panel" style={{ padding: 0 }}>
          <div className="leads-bank-strip" data-tut="leads-kpis">
            <span>{isMobile ? "Brasil:" : "Total no Brasil:"}</span>
            <span className="leads-bank-strip__num">{bank ? fmtInt(bank.total) : "—"}</span>
            {bank && Number(bank.deltaToday || 0) > 0 && (
              <span className="leads-bank-strip__delta">+{fmtInt(bank.deltaToday)} hoje</span>
            )}
          </div>
        </section>
        )}

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
                {/* P2 mobile: segmento — select igual desktop */}
                <div className="f">
                  <label>Segmento{!segment.trim() && <span className="radar-field-arrow" aria-hidden>›</span>}</label>
                  <select
                    className="select-dark"
                    value={segment}
                    onChange={e => setSegment(e.target.value)}
                  >
                    <option value="">Escolha um segmento</option>
                    {segOptions.map(o => <option key={o.value} value={o.label}>{o.label}</option>)}
                    {segment && !segOptions.some(o => o.label === segment) && (
                      <option value={segment}>{segment}</option>
                    )}
                  </select>
                </div>
                {/* P4 mobile: botão Buscar usa validação com popup */}
                <button className="btn-teal" onClick={() => executarBusca()} disabled={runBusy || runActive}>
                  {runActive ? "Varrendo…" : "Buscar (motor)"}
                </button>
                <button
                  className="btn-ghost"
                  onClick={limparFiltros}
                >
                  Limpar
                </button>
                {searchMsg && <p className="hint">{searchMsg}</p>}
              </div>
            )}

            {/* Área principal da lista */}
            <div className="radar2-main">
              {/* Embutido no Vendas (casca única): título "Pipeline de pesquisa" DENTRO
                  do painel — mesmo tratamento do "Pipeline de vendas" do funil. 29/06. */}
              {embedded && embedTitle && (
                <div className="panel-head leads-embed-head">
                  <h2>{embedTitle}</h2>
                </div>
              )}
              <div className="tabs" data-tut="leads-abas">
                <button className={"tab" + (tab === "shelf" ? " active" : "")} onClick={() => switchTab("shelf")}>
                  Disponíveis <span className="n">{counts.shelf == null ? "—" : fmtInt(counts.shelf)}</span>
                </button>
                {/* "Minha carteira" = o FUNIL. Embutido no Vendas a aba some (redundante);
                    o que você puxa aparece no "Meu funil" do slide. 27/06. */}
                {!embedded && (
                  <button
                    ref={tabCarteiraRef}
                    className={"tab" + (tab === "carteira" ? " active" : "") + (tabCarteiraPop ? " tab--pop" : "")}
                    onClick={() => switchTab("carteira")}
                  >
                    Minha carteira <span className="n">{counts.carteira == null ? "—" : fmtInt(counts.carteira)}</span>
                  </button>
                )}
              </div>

              {runActive && (
                <div className="radar2-live radar2-live--funcionando">
                  <span className="dot" /> Varrendo {city || "…"} · {fmtInt(run?.foundCount)} achados{runProgress != null ? ` · ${runProgress}%` : ""}
                </div>
              )}
              {runPaused && (
                <div className="radar2-live radar2-live--pausado">
                  <span className="dot" /> Em pausa — volta sozinho
                </div>
              )}

              {/* Oferta esgotou (não cota): sugere expandir em 1 toque */}
              {runExpansion && (runExpansion.nextRadiusKm || runExpansion.neighborSegments.length > 0) && (
                <div className="radar-expand" role="status">
                  <div className="radar-expand__head">
                    <span className="radar-expand__icon" aria-hidden>🔎</span>
                    <p className="radar-expand__headline">{runExpansion.headline}</p>
                  </div>
                  <div className="radar-expand__actions">
                    {runExpansion.nextRadiusKm && runExpansion.widenReachLabel && (
                      <button
                        type="button"
                        className="btn-teal radar-expand__btn"
                        onClick={() => ampliarAlcance(runExpansion)}
                        disabled={runBusy || runActive}
                      >
                        {runExpansion.widenReachLabel}
                      </button>
                    )}
                    {runExpansion.neighborSegments.length > 0 && runExpansion.widenSegmentLabel && (
                      <button
                        type="button"
                        className="btn-ghost radar-expand__btn"
                        onClick={() => incluirSegmentosVizinhos(runExpansion)}
                        disabled={runBusy || runActive}
                      >
                        {runExpansion.widenSegmentLabel}
                      </button>
                    )}
                  </div>
                  {runExpansion.neighborSegments.length > 0 && (
                    <p className="radar-expand__hint">
                      Parecidos: {runExpansion.neighborSegments.join(" · ")}
                    </p>
                  )}
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

      {/* P4: Modal de campo faltando — usa .hbx-veil + .hbx-modal (centralizados pela classe) */}
      {missingModal && (
        <div className="hbx-veil" onClick={() => setMissingModal(null)}>
          <div className="hbx-modal" style={{ width: "min(340px, 92vw)" }} onClick={e => e.stopPropagation()}>
            <div className="radar-missing-modal">
              <h3>Falta preencher</h3>
              <ul>
                {missingModal.map(f => <li key={f}>{f}</li>)}
              </ul>
              <p>Preencha os campos acima antes de buscar.</p>
              <button className="btn-teal" onClick={() => setMissingModal(null)}>Entendi</button>
            </div>
          </div>
        </div>
      )}

      {/* P5/EFEITO: chips voando do disco pra aba Minha carteira */}
      {flyChips.length > 0 && (
        <div className="radar-fly-layer" aria-hidden>
          {flyChips.map(chip => (
            <div
              key={chip.id}
              className="radar-fly-chip"
              style={{
                left: chip.x0,
                top: chip.y0,
                "--fly-x0": "0px",
                "--fly-y0": "0px",
                "--fly-x1": `${chip.x1}px`,
                "--fly-y1": `${chip.y1}px`,
                "--fly-dur": `${chip.dur}s`,
              } as React.CSSProperties}
            >
              <span className="radar-fly-chip__av">L</span>
              {chip.name}
            </div>
          ))}
        </div>
      )}
      {flyToast && (
        <div className="radar-fly-toast" aria-live="polite">
          ✓ {flyToast}
        </div>
      )}
    </div>
  );
}
