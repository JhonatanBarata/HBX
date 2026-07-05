"use client";

// Tela LEADS — redesenho 23/06/2026
// Painel direito (aside) tem 2 rostos:
//   IDLE (sem lead selecionado) → RADAR console: disco animado + filtros + Play/STOP + Automático
//   LEAD SELECIONADO → mini-radar no topo + DetalhesNegocio + botão voltar
// Lista engordou: sem KPIs (exceto Total no Brasil como linha fininha) e sem rail lateral.
// Filtro estilo CNPJ Biz (VENDAS-REFAB S4, 04/07): tem-site/tem-WhatsApp sobre a base
// (substituiu "Canais exigidos" — não existe na nova regra lista+web).
// operationalState do backend ("funcionando"|"pausado"|"parado") dirige a animação e o botão.
// Visual 100% em classe/token central (5 Leis). Zero hex/rgba inline.

import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import { Av, I, ICONS } from "@/components/hbx/shell";
import { CanalIcon } from "@/components/hbx/canal-icon";
import { DetalhesNegocio, type NegocioDetail } from "@/components/hbx/detalhes-negocio";
import { BotStatusIcon } from "@/components/hbx/bot-action";
import { LimiteAtingidoModal } from "@/components/hbx/limite-atingido-modal";
import {
  FILTRO_AVANCADO_VAZIO,
  FiltroAvancadoModal,
  type FiltroAvancadoState,
} from "@/components/hbx/filtro-avancado-modal";
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
  // enrichedBy/enrichmentEngines (03/07): quem só ENRIQUECEU (separado da descoberta). Opcionais.
  enrichedBy?: string[] | null;
  enrichmentEngines?: string[] | null;
  // HOT-07 (empresa recém-aberta): badge de urgência + prioridade na entrega. Opcional.
  isFreshCompany?: boolean | null;
  daysSinceOpened?: number | null;
};

type LeadsResponse = {
  items: RadarLead[];
  total: number;
  meta?: {
    available?: boolean;
    message?: string;
    totalAvailable?: number;
    // Contrato S3 (VENDAS-REFAB): contagem REAL da base 28M (CnpjPublicCompany) já
    // filtrada. baseAvailable=false = base não carregada neste ambiente → cai pro
    // totalAvailable/total (pool) no consumo.
    baseAvailable?: boolean;
    baseTotal?: number | null;
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

type BankResponse = {
  total?: number;
  deltaToday?: number;
  available?: boolean;
  // Contrato S3: mesmo par baseAvailable/baseTotal do /webscraping/radar/leads,
  // aqui sem filtro (visão global do banco).
  baseAvailable?: boolean;
  baseTotal?: number | null;
} | null;

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

// Redesenho "Buscar empresas" (05/07): o usuário NÃO pré-seta quantidade (modelo
// Mercado Livre — ninguém pergunta "quantos iPhones você quer ver"). A prateleira
// mostra um lote saudável (antes o "Quantos puxar" capava em 5) e a busca traz um
// lote fixo pro motor. Puxar = quantos você SELECIONA, não um número no filtro.
const SHELF_LIMIT = 24;
const SEARCH_BATCH = 12;

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

// sourceChain (P1, 02/07): quem DESCOBRIU o lead. Rótulos curtos p/ badge da lista
// (versão longa mora em detalhes-negocio.tsx). Opcional — card antigo sem chain
// não mostra nada (originBadge devolve null).
const ORIGIN_BADGE_META: Record<string, { label: string; cls: string }> = {
  web: { label: "Web", cls: "radar-origin-badge--web" },
  rfb: { label: "Receita", cls: "radar-origin-badge--rfb" },
  "rfb+web": { label: "Receita + Web", cls: "radar-origin-badge--fusion" },
};

function originBadge(chain?: string | null): { label: string; cls: string } | null {
  const key = String(chain || "").trim().toLowerCase();
  return ORIGIN_BADGE_META[key] || null;
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

// WORM-15 — pesquisa salva (recorte de filtros nomeado). filtro = subset dos
// filtros do Radar. O backend guarda o mesmo shape em filtroJson.
type SavedFiltro = Record<string, unknown>;
type SavedSearch = {
  id: string;
  nome: string;
  filtro: SavedFiltro;
  assignedSellerId: number | null;
  lastRunAt: string | null;
  lastCount: number | null;
};
type SavedSeller = { id: number; name: string };

// Snapshot dos filtros atuais da tela → objeto que o backend guarda. So manda o
// que esta preenchido (o resto o sanitizador do backend descarta de qualquer jeito).
function buildFiltroSnapshot(input: {
  uf: string;
  city: string;
  segment: string;
  alcance: string;
  quantos: number;
}): SavedFiltro {
  const f: SavedFiltro = {};
  if (input.city.trim()) f.city = input.city.trim();
  if (input.uf.trim()) f.state = input.uf.trim();
  if (input.segment.trim()) f.segment = input.segment.trim();
  if (input.alcance.trim()) f.alcance = input.alcance.trim();
  if (input.quantos > 0) f.quantos = input.quantos;
  return f;
}

// Resumo LEGIVEL do filtro salvo → frases (igual "deles"). Traduz o filtroJson em
// texto para o usuario saber exatamente o que pediu sem abrir nada. Sem valores R$.
// requiredChannels ("Canais exigidos") foi removido da UI (VENDAS-REFAB S4, 04/07) —
// a leitura aqui fica só pra descrever pesquisas SALVAS antigas com esse campo.
const CANAL_LABEL_PT: Record<string, string> = {
  whatsapp: "WhatsApp",
  email: "E-mail",
  telefone: "Telefone",
  instagram: "Instagram",
  facebook: "Facebook",
  site: "Site",
};
function describeFiltro(filtro: SavedFiltro): string {
  const parts: string[] = [];
  const seg = String(filtro?.segment || "").trim();
  if (seg) parts.push(seg);
  const city = String(filtro?.city || "").trim();
  const uf = String(filtro?.state || "").trim();
  if (city && uf) parts.push(`${city}/${uf}`);
  else if (city) parts.push(city);
  else if (uf) parts.push(uf);
  const alc = String(filtro?.alcance || "").trim();
  if (alc) parts.push(`+ ${alc} km`);
  const req = Array.isArray(filtro?.requiredChannels) ? (filtro.requiredChannels as string[]) : [];
  if (req.length) {
    parts.push(`com ${req.map((c) => CANAL_LABEL_PT[c] || c).join(", ")}`);
  }
  const quantos = Number(filtro?.quantos || 0);
  if (quantos > 0) parts.push(`${quantos} por vez`);
  return parts.length ? parts.join(" · ") : "Todos os leads";
}

// Extrai operationalState do run
function getOpState(run: RunResponse): "funcionando" | "pausado" | "parado" | null {
  if (!run) return null;
  const opState = String(run.meta?.operationalState || "").trim().toLowerCase();
  if (opState === "funcionando" || opState === "pausado" || opState === "parado") return opState;
  return null;
}

// Componente: disco de radar — PURO ENFEITE (VENDAS-REFAB item 2/8, 04/07).
// Antes reagia a operationalState (funcionando/pausado/parado) com textos tipo
// "Em pausa — volta sozinho"/"Pronto pra buscar". Isso foi removido: zero prop,
// zero lógica, zero estado por trás — é decoração fixa, sempre no visual mais
// "vivo" (a paleta que era "funcionando" virou só a cor padrão do sonar). O
// Play/Buscar real continua funcionando por baixo (runActive/runBusy), só não
// empresta mais o disco pra "atuar" o estado da busca.
function RadarDisc({ mini = false }: { mini?: boolean } = {}) {
  // posições dos blips (estáticas — efeito visual)
  const blips: Array<{ top: string; left: string }> = [
    { top: "28%", left: "62%" },
    { top: "58%", left: "44%" },
    { top: "42%", left: "74%" },
    { top: "70%", left: "34%" },
  ];

  return (
    <div className={"radar-disc-wrap radar-disc-wrap--funcionando" + (mini ? " radar-disc-wrap--mini" : "")}>
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

  // Filtro avançado (item 3b — popup ressuscitado do commit revertido): consulta
  // a base Receita (28M) via cnpj-base/query só como PRÉVIA; "Aplicar" traduz o
  // subconjunto compatível (UF/cidade/CNAE-ou-palavra/WhatsApp) pros filtros que
  // o Pipeline de pesquisa já usa (uf/city/segment/zapFiltro), sem trocar a lista.
  const [advOpen, setAdvOpen] = useState(false);
  const [advDraft, setAdvDraft] = useState<FiltroAvancadoState>(FILTRO_AVANCADO_VAZIO);

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
  // WORM-17: paywall de cota MENSAL do plano (empresa/admin) atingida.
  const [limiteOpen, setLimiteOpen] = useState(false);

  // busca ao vivo (search-on-miss)
  const [run, setRun] = useState<RunResponse>(null);
  const [runBusy, setRunBusy] = useState(false);
  const [searchMsg, setSearchMsg] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // P4: modal de campo faltando
  const [missingModal, setMissingModal] = useState<string[] | null>(null);

  // P5/EFEITO: toast (o fly-chips animado morreu com o standing-order/auto-feed;
  // sobrou só o aviso "N leads disponíveis pra puxar" na vitrine).
  const [flyToast, setFlyToast] = useState<string | null>(null);

  // WORM-15 — pesquisas salvas (recorte de filtros nomeado)
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [savedSellers, setSavedSellers] = useState<SavedSeller[]>([]);
  const [canAssignSaved, setCanAssignSaved] = useState(false);
  const [savedBar, setSavedBar] = useState(false); // accordion aberto/fechado
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveSeller, setSaveSeller] = useState<number | "">("");
  const [savedBusy, setSavedBusy] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

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

  // Filtro estilo CNPJ Biz sobre a base (VENDAS-REFAB S4, 04/07): tem-site e
  // tem-WhatsApp provável. Tri-estado (qualquer/sim/não) — mapeia direto pros
  // params que o GET /webscraping/radar/leads já aceita (noWebsite/withWebsite/
  // likelyWhatsapp). Substituiu "Canais exigidos" (removido — não existe na
  // nova regra lista+web).
  const [siteFiltro, setSiteFiltro] = useState<"qualquer" | "com" | "sem">("qualquer");
  const [zapFiltro, setZapFiltro] = useState<"qualquer" | "com">("qualquer");

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

  const loadList = useCallback((which: Tab, opts?: { page?: number; quantosOverride?: number }) => {
    const params = new URLSearchParams();
    params.set("page", String(opts?.page ?? 1));
    // Prateleira: lote saudável fixo (SHELF_LIMIT) — não mais capado pelo "Quantos
    // puxar" (removido). Carteira: paginação normal.
    const limit = which === "shelf" ? SHELF_LIMIT : pageSize;
    params.set("limit", String(limit));
    if (which === "shelf") params.set("scope", "vitrine");
    if (segment) params.set("segment", segment);
    if (city) params.set("city", city);
    if (uf) params.set("state", uf);
    if (which === "shelf" && alcance) params.set("radius", alcance);
    // Filtro estilo CNPJ Biz (tem-site/tem-WhatsApp) — só na prateleira (vitrine),
    // igual ao resto do bloco B3. Params já existem no DTO do backend
    // (noWebsite/withWebsite/likelyWhatsapp); só não estavam expostos na UI.
    if (which === "shelf" && siteFiltro === "com") params.set("withWebsite", "true");
    if (which === "shelf" && siteFiltro === "sem") params.set("noWebsite", "true");
    if (which === "shelf" && zapFiltro === "com") params.set("likelyWhatsapp", "true");
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
  }, [segment, city, uf, alcance, siteFiltro, zapFiltro]);

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
    // WORM-15 — carrega pesquisas salvas do usuario (+ vendedores, se admin/gerente)
    apiFetch<{ searches?: SavedSearch[]; sellers?: SavedSeller[]; canAssignSeller?: boolean }>("/saved-search")
      .then(res => {
        setSavedSearches(Array.isArray(res?.searches) ? res.searches : []);
        setSavedSellers(Array.isArray(res?.sellers) ? res.sellers : []);
        setCanAssignSaved(res?.canAssignSeller === true);
      })
      .catch(() => { setSavedSearches([]); setSavedSellers([]); setCanAssignSaved(false); });
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
  }, [segment, city, uf, siteFiltro, zapFiltro]);

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
          // P5/EFEITO: leads ficam na vitrine "Disponíveis"; mostra quantos achou pra
          // puxar (o standing-order/auto-feed morreu — não existe mais auto-import).
          type RunMetaExt = { progress?: number; terminal?: boolean; operationalState?: string; operationalReason?: string; operationalMessage?: string; importedCount?: number; totalAvailable?: number; deliveredCount?: number };
          const resMeta = res?.meta as RunMetaExt | undefined;
          setTab("shelf");
          setPage(1);
          // "Apreciar o resultado": anuncia quantos leads ficaram disponíveis pra puxar.
          const disponiveis = resMeta?.totalAvailable ?? res?.foundCount ?? 0;
          if (disponiveis > 0) {
            setFlyToast(`${disponiveis} lead${disponiveis > 1 ? "s" : ""} disponíve${disponiveis > 1 ? "is" : "l"} pra puxar`);
            setTimeout(() => setFlyToast(null), 3200);
          }
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
    setSiteFiltro("qualquer");
    setZapFiltro("qualquer");
    setPage(1);
    setTab("shelf");
    try { localStorage.removeItem("hbx:leads-filters"); } catch { /* sem storage */ }
    loadList("shelf", { page: 1, quantosOverride: 5 });
  }

  // Item 3b: "Aplicar filtro" do popup avançado — traduz o subconjunto compatível
  // (UF/cidade/CNAE-ou-palavra-chave/WhatsApp) pros filtros que o Pipeline de
  // pesquisa já entende. Campos só-RFB (capital, idade, sócio…) não têm onde
  // aterrissar no Pipeline hoje (RadarLeadPool não guarda essas colunas) — o
  // popup já avisa isso na prévia, então aqui só aplicamos o que é real.
  function aplicarFiltroAvancado(f: FiltroAvancadoState) {
    setAdvOpen(false);
    if (f.states[0]) setUf(f.states[0]);
    if (f.cities[0]) setCity(f.cities[0]);
    const seg = f.cnaes[0] || f.keyword.trim();
    if (seg) setSegment(seg);
    if (f.comCelular === true) setZapFiltro("com");
    setPage(1);
    setSelected(new Set());
    setTab("shelf");
    loadList("shelf", { page: 1 });
  }

  // ── WORM-15: pesquisas salvas ────────────────────────────────────────────
  async function reloadSavedSearches() {
    try {
      const res = await apiFetch<{ searches?: SavedSearch[]; sellers?: SavedSeller[]; canAssignSeller?: boolean }>("/saved-search");
      setSavedSearches(Array.isArray(res?.searches) ? res.searches : []);
      setSavedSellers(Array.isArray(res?.sellers) ? res.sellers : []);
      setCanAssignSaved(res?.canAssignSeller === true);
    } catch { /* mantem lista atual */ }
  }

  // Aplica um recorte salvo aos filtros da tela e recarrega a prateleira.
  // "Canais exigidos" foi removido (não existe na nova regra lista+web) — recorte
  // salvo antigo com requiredChannels simplesmente ignora esse campo, sem erro.
  function applySavedSearch(s: SavedSearch) {
    const f = s.filtro || {};
    const nextUf = String((f as SavedFiltro).state || "").trim();
    const nextCity = String((f as SavedFiltro).city || "").trim();
    const nextSeg = String((f as SavedFiltro).segment || "").trim();
    const nextAlc = String((f as SavedFiltro).alcance || "").trim();
    const nextQtd = Number((f as SavedFiltro).quantos || 0) || 5;
    setUf(nextUf);
    setCity(nextCity);
    setSegment(nextSeg);
    setAlcance(nextAlc);
    setQuantos(nextQtd);
    setPage(1);
    setTab("shelf");
    setSavedBar(false);
    setSavedMsg(`Pesquisa "${s.nome}" aplicada.`);
    loadList("shelf", { page: 1, quantosOverride: nextQtd });
  }

  function openSaveModal() {
    setSaveName("");
    setSaveSeller("");
    setSavedMsg(null);
    setSaveModalOpen(true);
  }

  // Salva o recorte atual (nome + filtros + vendedor opcional).
  async function saveCurrentFilter() {
    const nome = saveName.trim();
    if (!nome) { setSavedMsg("Dê um nome para a pesquisa."); return; }
    const filtro = buildFiltroSnapshot({ uf, city, segment, alcance, quantos });
    setSavedBusy(true);
    setSavedMsg(null);
    try {
      const body: Record<string, unknown> = { nome, filtro };
      if (canAssignSaved && saveSeller !== "") body.assignedSellerId = Number(saveSeller);
      await apiFetch("/saved-search", { method: "POST", body: JSON.stringify(body) });
      setSaveModalOpen(false);
      setSavedMsg(`Pesquisa "${nome}" salva.`);
      setSavedBar(true);
      await reloadSavedSearches();
    } catch (e) {
      setSavedMsg(e instanceof Error ? e.message : "Não foi possível salvar a pesquisa.");
    } finally {
      setSavedBusy(false);
    }
  }

  async function deleteSavedSearch(id: string) {
    setSavedBusy(true);
    try {
      await apiFetch(`/saved-search/${encodeURIComponent(id)}`, { method: "DELETE" });
      setSavedSearches(prev => prev.filter(s => s.id !== id));
    } catch { /* mantem */ }
    finally { setSavedBusy(false); }
  }

  // operationalState atual (do run mais recente)
  const opState = getOpState(run);

  // runActive = há uma busca acontecendo AGORA (só isso importa: dita o botão
  // Buscar↔Parar e a linha de progresso "Varrendo…"). Item 8: sem estado de
  // pausa/expansão no front — o painel não narra mais "em pausa"/"volta sozinho".
  const runActive = Boolean(
    (run?.id || run?.runId) &&
    !TERMINAL_RUN.has(String(run?.status || "")) &&
    opState === "funcionando"
  );
  const runProgress = run?.meta?.progress;

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
      // P1/P8a: inclui quantity no body (DTO exige; antes ficava de fora → 400).
      // Lote fixo (SEARCH_BATCH) — o usuário não escolhe mais "quantos" (removido).
      const body: Record<string, unknown> = { city, state: uf || undefined, segment: effSegment, quantity: SEARCH_BATCH };
      if (effRadius > 0) body.radiusKm = effRadius;
      if (geo) { body.originLat = geo.lat; body.originLng = geo.lng; }
      // Filtro estilo CNPJ Biz (mesmo DTO do GET /radar/leads — RadarPullDto estende
      // RadarDatabaseQueryDto): reflete tem-site/tem-WhatsApp na busca ao vivo também.
      if (siteFiltro === "com") body.withWebsite = true;
      if (siteFiltro === "sem") body.noWebsite = true;
      if (zapFiltro === "com") body.likelyWhatsapp = true;
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

  const items = data?.items || [];

  // Resumo de origem da vitrine (só usado na aba "Disponíveis"): quantos cards
  // vieram de cada fonte de DESCOBERTA. Card antigo sem sourceChain cai em "Sem origem".
  const originCounts = items.reduce(
    (acc, row) => {
      const key = String(row.sourceChain || "").trim().toLowerCase();
      if (key === "web") acc.web += 1;
      else if (key === "rfb") acc.rfb += 1;
      else if (key === "rfb+web") acc.fusion += 1;
      else acc.none += 1;
      return acc;
    },
    { web: 0, rfb: 0, fusion: 0, none: 0 },
  );

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

  // "Total no Brasil" (contrato S3, VENDAS-REFAB): a base 28M (CnpjPublicCompany)
  // quando carregada no ambiente; cai pro pool antigo (bank.total) só quando
  // baseAvailable===false (ex.: local, sem a carga da RFB). Nunca inventa 28M fixo.
  const totalBrasilReal = bank?.baseAvailable ? (bank?.baseTotal ?? null) : (bank?.total ?? null);

  // Embutido no Vendas: espelha os 3 números pro topo da casca única. setState do
  // pai é estável (não dispara loop). 29/06.
  useEffect(() => {
    onEmbedStats?.({
      totalBrasil: totalBrasilReal,
      disponiveis: counts.shelf,
      cotaLabel: meterLabel,
      cotaValue: meterValue,
      cotaPct: meterPct,
    });
  }, [onEmbedStats, totalBrasilReal, counts.shelf, meterLabel, meterValue, meterPct]);

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
      isFreshCompany: lead.isFreshCompany ?? null,
      daysSinceOpened: lead.daysSinceOpened ?? null,
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
    // FIX-ENRICHMENT-STATUS-SHELF (05/07): sinal agora vem do GET /webscraping/radar/leads
    // (e do detalhe :id), já normalizado pending|completed|failed — queued/running da fila
    // do banco (RadarLeadEnrichment.enrichmentStatus) viram "pending" na API.
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

  // ── Barra de comando (desktop): os INPUTS da busca — antes um paredão vertical
  // no aside direito ("caos" apontado pelo dono). Agora uma barra horizontal no
  // topo dos resultados: busca grande (o que você procura) + refino (Estado/Cidade/
  // Alcance/site/WhatsApp) + ações. Zero "Quantos puxar" (modelo Mercado Livre).
  function renderCommandBar() {
    return (
      <div className="be-cmdbar" data-tut="leads-filtros">
        <div className="be-cmdbar__primary">
          <div className="be-search" data-tut="leads-busca-criativa">
            <I d={ICONS.search} size={16} />
            <input
              className="be-search__input"
              placeholder="O que você procura? Ex.: restaurantes em São Paulo com WhatsApp"
              value={segment}
              onChange={e => setSegment(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !runBusy && !runActive) executarBusca(); }}
              list="rc-seg-options"
            />
            <datalist id="rc-seg-options">
              {segOptions.map(o => <option key={o.value} value={o.label} />)}
            </datalist>
          </div>
          {runActive ? (
            <button className="btn-ghost be-cmdbar__go" onClick={pararBusca}>◼ Parar</button>
          ) : (
            <button className="btn-teal be-cmdbar__go" data-tut="leads-buscar" onClick={() => executarBusca()} disabled={runBusy}>
              {runBusy ? "Iniciando…" : "Buscar"}
            </button>
          )}
        </div>

        <div className="be-cmdbar__refine">
          <div className="be-cmdbar__field">
            <label htmlFor="cb-uf">Estado</label>
            <select id="cb-uf" className="select-dark" value={uf} onChange={e => { setCity(""); setAlcance(""); setUf(e.target.value); }}>
              <option value="">Todos</option>
              {ufOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="be-cmdbar__field">
            <label htmlFor="cb-city">Cidade</label>
            <select id="cb-city" className="select-dark" value={city} onChange={e => { setAlcance(""); setCity(e.target.value); }}>
              <option value="">Cidade</option>
              {cityOptions.map(o => <option key={o.value} value={o.label}>{o.label}</option>)}
            </select>
          </div>
          <div className="be-cmdbar__field">
            <label htmlFor="cb-alcance">Alcance</label>
            <select id="cb-alcance" className="select-dark" value={alcance} disabled={!city.trim()} onChange={e => setAlcance(e.target.value)}>
              <option value="">Só a cidade</option>
              <option value="25">+ 25 km</option>
              <option value="50">+ 50 km</option>
              <option value="100">+ 100 km</option>
            </select>
          </div>
          <div className="be-cmdbar__group">
            <span className="be-cmdbar__group-lbl">Tem site</span>
            <div role="group" aria-label="Filtrar por site" className="radar-canais__tristate">
              {([
                { key: "qualquer", label: "Qualquer" },
                { key: "com", label: "Com" },
                { key: "sem", label: "Sem" },
              ] as const).map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  className={"radar-canais__switch" + (siteFiltro === opt.key ? " radar-canais__switch--on" : "")}
                  onClick={() => setSiteFiltro(opt.key)}
                  aria-pressed={siteFiltro === opt.key}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="be-cmdbar__group">
            <span className="be-cmdbar__group-lbl">Tem WhatsApp</span>
            <div role="group" aria-label="Filtrar por WhatsApp" className="radar-canais__tristate">
              {([
                { key: "qualquer", label: "Qualquer" },
                { key: "com", label: "Com" },
              ] as const).map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  className={"radar-canais__switch" + (zapFiltro === opt.key ? " radar-canais__switch--on" : "")}
                  onClick={() => setZapFiltro(opt.key)}
                  aria-pressed={zapFiltro === opt.key}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="be-cmdbar__spacer" />
          <div className="be-cmdbar__actions">
            <button
              type="button"
              className="btn-ghost btn-xs"
              data-tut="leads-filtro-avancado"
              onClick={() => { setAdvDraft(FILTRO_AVANCADO_VAZIO); setAdvOpen(true); }}
            >
              <I d={ICONS.filter} size={13} /> Filtro avançado
            </button>
            <button type="button" className="btn-ghost btn-xs" onClick={limparFiltros} title="Limpar todos os filtros e pesquisas">
              Limpar
            </button>
            <button
              type="button"
              className="btn-ghost btn-xs"
              onClick={openSaveModal}
              disabled={!segment.trim() && !city.trim() && !uf.trim()}
              title="Salvar este filtro como pesquisa"
            >
              Salvar filtro
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Radar console: o disco + controles quando nenhum lead está selecionado ──
  function renderRadarConsole(mini: boolean) {
    // Item 8: sem cálculo de estado de pausa/parada aqui — o painel não renderiza
    // mais UI de estado. Só existe "buscando agora" (runActive) pro botão Parar.
    if (mini) {
      return (
        <div className="radar-mini-bar">
          <div style={{ flexShrink: 0, width: 56, height: 56 }}>
            <RadarDisc mini />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="radar-mini-bar__title">Buscando empresas</div>
            <div className="radar-mini-bar__sub">{[city, uf].filter(Boolean).join("/") || "Todo o Brasil"}{segment ? ` · ${segment}` : ""}</div>
          </div>
          <button className="btn-ghost btn-xs radar-mini-bar__back" onClick={() => setSelLead(null)} style={{ marginLeft: "auto" }}>
            ← Voltar
          </button>
        </div>
      );
    }

    // Espelho legível dos filtros ativos pro show-off do aside (não é input —
    // quem busca é a barra de comando no topo dos resultados).
    const activeSummary = [
      segment.trim(),
      [city, uf].filter(Boolean).join("/"),
      alcance ? `+ ${alcance} km` : "",
      siteFiltro === "com" ? "Com site" : siteFiltro === "sem" ? "Sem site" : "",
      zapFiltro === "com" ? "Com WhatsApp" : "",
    ].filter(Boolean);

    return (
      <div className="radar-console radar-showoff">
        {/* Show-off do Radar: disco-sonar protagonista (puro enfeite) + ESPELHO dos
            filtros ativos + status ao vivo. Os INPUTS saíram daqui pra barra de
            comando no topo dos resultados (redesenho 05/07) — o aside deixou de ser
            um paredão de campos e virou a vitrine do que o Radar está varrendo. */}
        <div className="radar-hero">
          <div className="radar-hero__disc">
            <RadarDisc />
          </div>
          <div className="radar-hero__copy">
            <span className="radar-hero__eyebrow">Radar HBX</span>
            <h2 className="radar-hero__title">Buscar empresas</h2>
          </div>
        </div>

        {/* Espelho dos filtros ativos — mostra o que a barra de comando vai varrer */}
        <div className="radar-showoff__mirror">
          <span className="radar-showoff__mirror-lbl">Varrendo por</span>
          {activeSummary.length > 0 ? (
            <div className="radar-showoff__chips">
              {activeSummary.map((t, i) => <span key={i} className="radar-showoff__chip">{t}</span>)}
            </div>
          ) : (
            <p className="radar-showoff__empty">Escolha segmento e cidade na barra acima e clique em Buscar.</p>
          )}
        </div>

        {/* Status REAL de uma busca em andamento (feedback de operação async — não
            é o disco decorativo narrando estado). */}
        {runActive && (
          <div className="radar2-live radar2-live--funcionando">
            <span className="dot" /> Varrendo {city || "…"} · {fmtInt(run?.foundCount)} achados{runProgress != null ? ` · ${runProgress}%` : ""}
          </div>
        )}
        {savedMsg && <p className="hint" style={{ margin: 0 }}>{savedMsg}</p>}
        {searchMsg && <p className="hint" style={{ margin: 0 }}>{searchMsg}</p>}

        {/* WORM-15: Minhas pesquisas salvas — accordion ABAIXO dos filtros */}
        <div className="radar-saved">
          <button
            type="button"
            className="radar-saved__head"
            onClick={() => setSavedBar(v => !v)}
            aria-expanded={savedBar}
          >
            <span className="radar-saved__title">
              Minhas pesquisas salvas
              {savedSearches.length > 0 && <span className="radar-saved__count">{savedSearches.length}</span>}
            </span>
            <span className="radar-saved__chev" aria-hidden>{savedBar ? "▾" : "▸"}</span>
          </button>
          {savedBar && (
            <div className="radar-saved__body">
              {savedSearches.length === 0 ? (
                <p className="radar-saved__empty">Nenhuma pesquisa salva ainda. Monte um filtro e clique em “Salvar filtro”.</p>
              ) : (
                <ul className="radar-saved__list">
                  {savedSearches.map(s => (
                    <li key={s.id} className="radar-saved__item">
                      <button
                        type="button"
                        className="radar-saved__apply"
                        onClick={() => applySavedSearch(s)}
                        title="Aplicar este recorte aos filtros"
                      >
                        <span className="radar-saved__name">{s.nome}</span>
                        <span className="radar-saved__desc">{describeFiltro(s.filtro)}</span>
                        {s.lastCount != null && (
                          <span className="radar-saved__meta">{s.lastCount} leads na última busca</span>
                        )}
                      </button>
                      <button
                        type="button"
                        className="btn-ghost btn-xs radar-saved__del"
                        onClick={() => deleteSavedSearch(s.id)}
                        disabled={savedBusy}
                        title="Remover pesquisa salva"
                        aria-label={`Remover ${s.nome}`}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
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
  // Origem do lead na lista: badge de quem DESCOBRIU (sourceChain) + chip de quem
  // só ENRIQUECEU. Card antigo sem esses campos → devolve null (renderiza idêntico a hoje).
  function renderOriginBadge(row: RadarLead) {
    const ob = originBadge(row.sourceChain);
    const hasEnriched = Boolean(row.enrichedBy && row.enrichedBy.length);
    if (!ob && !hasEnriched) return null;
    return (
      <div className="radar-origin">
        {ob && <span className={`radar-origin-badge ${ob.cls}`}>{ob.label}</span>}
        {hasEnriched && (
          <span className="radar-origin-enriched">enriquecido: {row.enrichedBy!.join(", ")}</span>
        )}
      </div>
    );
  }

  // Paywall "momento de desejo" (WORM-17): cota MENSAL de cards do plano estourada.
  // Só empresa/admin — vendedor de carteira cheia NÃO é paywall (não compra plano).
  // Reusa .radar-expand (mesmo card do banner de oferta esgotada) — zero CSS novo.
  function renderQuotaPaywall() {
    if (!meterBlocked || isSeller) return null;
    const waiting = pageTotal || counts.shelf || 0;
    const limitTxt = fmtInt(usage?.cards?.limit);
    return (
      <div className="radar-expand" role="status">
        <div className="radar-expand__head">
          <span className="radar-expand__icon" aria-hidden>🔒</span>
          <p className="radar-expand__headline">
            {waiting > 0
              ? <>Mais <strong>{fmtInt(waiting)}</strong> leads esperando — você usou os {limitTxt} cards do seu plano este mês.</>
              : <>Você usou os {limitTxt} cards do seu plano este mês.</>}
          </p>
        </div>
        <div className="radar-expand__actions">
          <button type="button" className="btn-teal radar-expand__btn" onClick={() => setLimiteOpen(true)}>
            Aumentar meu plano
          </button>
        </div>
      </div>
    );
  }

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
                {renderOriginBadge(row)}
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

        {renderQuotaPaywall()}
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
            <span className="leads-bank-strip__num">{totalBrasilReal != null ? fmtInt(totalBrasilReal) : "—"}</span>
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
              {/* Barra de comando horizontal (desktop) — os filtros saíram do aside
                  paredão pra cá. Mobile mantém o radar2-rail via toggle. */}
              {!isMobile && renderCommandBar()}
              <div className="tabs" data-tut="leads-abas">
                <button className={"tab" + (tab === "shelf" ? " active" : "")} onClick={() => switchTab("shelf")}>
                  Disponíveis <span className="n">{counts.shelf == null ? "—" : fmtInt(counts.shelf)}</span>
                </button>
                {/* "Minha carteira" = o FUNIL. Embutido no Vendas a aba some (redundante);
                    o que você puxa aparece no "Meu funil" do slide. 27/06. */}
                {!embedded && (
                  <button
                    className={"tab" + (tab === "carteira" ? " active" : "")}
                    onClick={() => switchTab("carteira")}
                  >
                    Minha carteira <span className="n">{counts.carteira == null ? "—" : fmtInt(counts.carteira)}</span>
                  </button>
                )}
              </div>

              {/* Progresso REAL de uma busca em andamento (não é o radar decorativo
                  narrando estado — é feedback de uma operação assíncrona de verdade).
                  O texto de IDLE "Em pausa — volta sozinho" saiu daqui (item 2). */}
              {runActive && (
                <div className="radar2-live radar2-live--funcionando">
                  <span className="dot" /> Varrendo {city || "…"} · {fmtInt(run?.foundCount)} achados{runProgress != null ? ` · ${runProgress}%` : ""}
                </div>
              )}

              {/* Item 8: banner "oferta esgotou → amplie o raio / inclua segmentos
                  vizinhos" REMOVIDO — era auto-expandir de estado. O usuário muda o
                  filtro na mão pelo painel. */}

              {tab === "shelf" && data?.meta?.gemeosInsight && (() => {
                const g = data.meta.gemeosInsight!;
                return (
                  <div className="radar2-gemeos">
                    Seus melhores clientes são <strong>{g.dominantSegment || "seu segmento"}</strong> — achei <strong>{fmtInt(g.gemeos)}</strong> gêmeos, <strong>{fmtInt(g.comSinal)}</strong> deram sinal.
                  </div>
                );
              })()}

              {/* Resumo de origem da vitrine — de onde vieram os cards desta lista */}
              {tab === "shelf" && items.length > 0 && (
                <div className="radar-origin-summary" role="status" aria-label="Origem dos leads">
                  <span className="radar-origin-summary__item"><strong>{fmtInt(originCounts.web)}</strong> Web</span>
                  <span className="radar-origin-summary__item"><strong>{fmtInt(originCounts.rfb)}</strong> Receita</span>
                  <span className="radar-origin-summary__item"><strong>{fmtInt(originCounts.fusion)}</strong> Fusão</span>
                  <span className="radar-origin-summary__item radar-origin-summary__item--muted"><strong>{fmtInt(originCounts.none)}</strong> Sem origem</span>
                </div>
              )}

              {/* Branch mobile/desktop */}
              {isMobile ? (
                renderListMobile()
              ) : (
                <>
                  {/* Grade de cards (redesenho Buscar 05/07) — substitui a tabela
                      densa. 1 card = 1 empresa/oportunidade real. Mesma seleção
                      (checkbox → puxar em lote), badges de origem, sinais e contato
                      mascarado; clique no card abre o detalhe no aside. */}
                  <div className="tbl-wrap be-grid-wrap">
                    {items.length === 0 ? (
                      <div className="be-grid__empty radar2-empty">{emptyMsg}</div>
                    ) : (
                      <div className="be-grid">
                        {items.map(row => {
                          const isSel = selLead?.id === row.id;
                          const checked = selected.has(row.id);
                          return (
                            <article
                              key={row.id}
                              className={"be-card" + (isSel ? " be-card--sel" : "") + (checked ? " be-card--checked" : "")}
                              onClick={() => setSelLead(isSel ? null : row)}
                            >
                              {tab === "shelf" && (
                                <label className="be-card__pick" onClick={e => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleSel(row.id)}
                                    aria-label={`Selecionar ${row.name || "lead"}`}
                                  />
                                </label>
                              )}
                              <div className="be-card__head">
                                <Av name={row.name || "—"} size={40} />
                                <div className="be-card__id">
                                  <strong className="be-card__name">
                                    {row.name || "—"}
                                    {row.fitScore != null && row.fitScore > 0 && (
                                      <span className={`radar2-fit${row.fitScore >= 60 ? " radar2-fit--hi" : ""}`}>Fit {row.fitScore}</span>
                                    )}
                                  </strong>
                                  <span className="be-card__seg">{row.segment || row.businessCategory || "—"}</span>
                                  <span className="be-card__loc">
                                    <I d={ICONS.mapin} size={11} />
                                    {row.city ? `${row.city}${row.state ? "/" + row.state : ""}` : "Brasil"}
                                  </span>
                                </div>
                              </div>

                              {renderOriginBadge(row)}

                              {row.opportunitySignals && row.opportunitySignals.length > 0 && (
                                <div className="radar2-signals">
                                  {row.opportunitySignals.slice(0, 3).map(sig => {
                                    const m = SIGNAL_META[sig];
                                    if (!m) return null;
                                    return <span key={sig} className={`radar2-sig radar2-sig--${m.tone}`}>{m.label}</span>;
                                  })}
                                </div>
                              )}
                              {row.opportunityReason && (
                                <span className="be-card__reason">{row.opportunityReason}</span>
                              )}

                              <div className="be-card__foot">
                                <div className="be-card__contact">
                                  {tab === "shelf"
                                    ? contatoMascarado(row)
                                    : <span>{row.phone || row.email || "—"}</span>}
                                </div>
                                <div onClick={e => e.stopPropagation()}>
                                  {tab === "shelf"
                                    ? <button className="btn-teal btn-xs" onClick={() => puxar(row.id)} disabled={pullBusyId === row.id || bulkBusy || meterBlocked}>{pullBusyId === row.id ? "Puxando…" : "Puxar"}</button>
                                    : <button className="btn-ghost btn-xs" onClick={() => router.push("/vendas")}>Abrir</button>}
                                </div>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}
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
                  {renderQuotaPaywall()}
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

      {/* Item 3b: popup "Filtro avançado" ressuscitado — todas as colunas reais
          do RFB (CONTRATO-FILTRO.md), prévia ao vivo contra a base 28M. */}
      {advOpen && (
        <FiltroAvancadoModal
          draft={advDraft}
          onChange={setAdvDraft}
          onClose={() => setAdvOpen(false)}
          onApply={aplicarFiltroAvancado}
        />
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

      {/* WORM-15: Modal "Salvar filtro" — nome + (admin) atribuir a vendedor */}
      {saveModalOpen && (
        <div className="hbx-veil" onClick={() => setSaveModalOpen(false)}>
          <div className="hbx-modal" style={{ width: "min(420px, 92vw)" }} onClick={e => e.stopPropagation()}>
            <div className="radar-save-modal">
              <h3>Salvar pesquisa</h3>
              <p className="radar-save-modal__desc">{describeFiltro(buildFiltroSnapshot({ uf, city, segment, alcance, quantos }))}</p>
              <div className="f">
                <label htmlFor="save-name">Nome da pesquisa</label>
                <input
                  id="save-name"
                  className="field-dark"
                  value={saveName}
                  maxLength={120}
                  placeholder="Ex.: Arquitetos de SP"
                  onChange={e => setSaveName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !savedBusy) saveCurrentFilter(); }}
                  autoFocus
                />
              </div>
              {canAssignSaved && savedSellers.length > 0 && (
                <div className="f">
                  <label htmlFor="save-seller">Atribuir a um vendedor (opcional)</label>
                  <select
                    id="save-seller"
                    className="select-dark"
                    value={saveSeller === "" ? "" : String(saveSeller)}
                    onChange={e => setSaveSeller(e.target.value === "" ? "" : Number(e.target.value))}
                  >
                    <option value="">Ninguém (só minha)</option>
                    {savedSellers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <p className="hint" style={{ margin: "2px 0 0" }}>O vendedor passa a receber este recorte como fonte preferencial.</p>
                </div>
              )}
              {savedMsg && <p className="radar-save-modal__err">{savedMsg}</p>}
              <div className="radar-save-modal__actions">
                <button className="btn-ghost" onClick={() => setSaveModalOpen(false)} disabled={savedBusy}>Cancelar</button>
                <button className="btn-teal" onClick={saveCurrentFilter} disabled={savedBusy || !saveName.trim()}>
                  {savedBusy ? "Salvando…" : "Salvar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {flyToast && (
        <div className="radar-fly-toast" aria-live="polite">
          ✓ {flyToast}
        </div>
      )}

      {limiteOpen && (
        <LimiteAtingidoModal
          title="Cota de leads do plano atingida"
          scope="do plano"
          renewsLabel="no início do próximo mês"
          reason={<>Você usou os <strong>{fmtInt(usage?.cards?.limit)}</strong> cards do seu plano neste mês.{pageTotal > 0 ? <> Há <strong>{fmtInt(pageTotal)}</strong> leads no Radar prontos assim que você aumentar o plano.</> : null}</>}
          waMessage="Olá! Bati a cota de leads do meu plano no HBX e quero aumentar."
          onClose={() => setLimiteOpen(false)}
        />
      )}
    </div>
  );
}
