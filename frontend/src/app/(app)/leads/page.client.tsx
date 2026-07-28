"use client";

// Tela LEADS — redesenho 23/06/2026
// Painel direito (aside) tem 2 rostos:
//   IDLE (sem lead selecionado) → RADAR console: disco animado + filtros + Play/STOP + Automático
//   LEAD SELECIONADO → mini-radar no topo + DetalhesNegocio + botão voltar
// Lista engordou: sem KPIs (exceto Total no Brasil como linha fininha) e sem rail lateral.
// Filtros avançados usam apenas o contrato real do Radar: canais obrigatórios,
// reputação mínima e território explícito.
// operationalState do backend ("funcionando"|"pausado"|"parado") dirige a animação e o botão.
// Visual 100% em classe/token central (5 Leis). Zero hex/rgba inline.

import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { Av, I, ICONS } from "@/components/hbx/shell";
import { CanalIcon } from "@/components/hbx/canal-icon";
import { DetalhesNegocio, type NegocioDetail } from "@/components/hbx/detalhes-negocio";
import { BotStatusIcon } from "@/components/hbx/bot-action";
import { GlassPill, useGlassPill } from "@/components/hbx/glass-pill";
import { RadarAiBadge } from "@/components/hbx/radar-ai-badge";
import { RadarDisc } from "@/components/hbx/radar-disc";
import { apiFetch } from "@/lib/api";
import { BRAZIL_CITIES_BY_UF, BRAZIL_UF_OPTIONS, mergeBrazilCityOptions } from "@/lib/brazil-cities";
import { stampOnboardingEvent } from "@/lib/onboarding";
import { useRadarAiStatusPoll } from "@/lib/radar-ai-status";
import {
  RADAR_CHANNEL_ORDER,
  resolveRadarChannelPresence,
  type ChannelPresence,
} from "@/lib/radar-channel-presence";
import { buildWaLink, buildWaMessage } from "@/lib/wa-link";

type FilterOption = { value: string; label: string; count?: number };

// Exportado (LEADS-FINAL/02): a página /leads/[id] reusa o MESMO tipo — o GET
// /webscraping/radar/leads/:id devolve o mesmo shape de item da listagem
// (buildRadarLeadPublic é a mesma função nos dois endpoints do backend).
export type RadarLead = {
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
  // Motivo de inclusão (S2 LEAD-CENTRICO, 25/07): por que o card entrou — códigos como
  // "cnae_compativel"/"nome_combina_segmento"/"cidade_uf_ok" (ver INCLUSION_REASON_LABELS).
  // Opcional: card antigo sem o campo não mostra o badge (idêntico a hoje).
  inclusionReasons?: string[] | null;
  fitScore?: number | null;
  hasPhone?: boolean;
  hasEmail?: boolean;
  hasWhatsapp?: boolean;
  channelPresence?: Partial<ChannelPresence> | null;
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
  // WORM-16: pessoas estruturadas (sócio da Receita etc.) — mesmo campo opcional
  // que NegocioDetail.people (detalhes-negocio.tsx). Ausente em leads antigos.
  people?: Array<{ name: string; role?: string | null; source?: string | null; phoneDigits?: string | null }> | null;
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
  // Posse do lead (LEADS-FINAL/02): 'mine' = a empresa já puxou (contato revelado
  // pelo backend); 'available'/'in_attendance'/'negative' = ainda não. A página
  // /leads/[id] usa isto (com fallback em Boolean(phone)) pra decidir entre a
  // página cheia e o aside mascarado + CTA "Puxar".
  ownershipStatus?: "mine" | "available" | "in_attendance" | "negative" | null;
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
  items?: RadarLead[];
  total?: number;
  foundCount?: number;
  meta?: {
    progress?: number;
    deliveredCount?: number;
    terminal?: boolean;
    operationalState?: string;
    operationalReason?: string;
    operationalMessage?: string;
    expansionSuggestion?: ExpansionSuggestion | null;
  };
} | null;

// REFUNDAÇÃO F2 (28/07): a fila multi-cidade saiu do navegador — a sessão vive no
// servidor e esta tela é ESPECTADORA. 1 GET re-hidrata tudo ao voltar pra tela.
type SessionCityEntry = {
  city: string;
  state?: string | null;
  status: string;
  runId?: string | null;
  foundCount?: number;
};
type SessionResponse = {
  id?: string;
  status?: string;
  pauseReason?: string | null;
  message?: string | null;
  segment?: string;
  cities?: SessionCityEntry[];
  cityCount?: number;
  cursorIndex?: number;
  currentCity?: { city: string; state?: string | null } | null;
  targetTotal?: number;
  pauseAfterLeads?: number;
  foundTotal?: number;
  foundSinceResume?: number;
  currentRunId?: string | null;
  currentRun?: RunResponse;
} | null;
const SESSION_ACTIVE = new Set(["running", "paused"]);

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
type GeoMode = "cities" | "radius" | "ddd" | "nearby";
type RadarRequiredChannel = "whatsapp" | "phone" | "email" | "website";
type DddLookupResponse = { state?: string; cities?: string[] };
type GeoTarget = { city: string; state: string };
type GeoModeDirection = "forward" | "back";
type RadarUiState = "funcionando" | "pausado" | "parado" | "erro";

// B0: statuses realmente terminais — removeu "error" fantasma, adicionou partial_error
const TERMINAL_RUN = new Set(["completed", "completed_insufficient_results", "canceled", "failed", "partial_error"]);
const RADAR_STATE_LABEL: Record<RadarUiState, string> = {
  funcionando: "Funcionando",
  pausado: "Pausado",
  parado: "Parado",
  erro: "Erro",
};

// Redesenho "Buscar empresas" (05/07): o usuário NÃO pré-seta quantidade (modelo
// Mercado Livre — ninguém pergunta "quantos iPhones você quer ver"). A prateleira
// mostra um lote saudável (antes o "Quantos puxar" capava em 5) e a busca traz um
// lote fixo pro motor. Puxar = quantos você SELECIONA, não um número no filtro.
// Pool máximo por busca = 100, exibido em 4 páginas de 25 ("1 de 4"). Regra do dono 23/07.
const SHELF_LIMIT = 25;
const SEARCH_BATCH = 100;
// REFUNDAÇÃO F2: com a fila server-side (1 cidade por vez, sobrevive a tudo), o teto de
// 5 alvos do incidente 28/07 pôde subir — o backend segura o resto (cap 100 + runs/min).
const MAX_CITY_TARGETS = 20;
const SEARCH_POLL_MS = 4000;

const VALID_DDDS = new Set([
  "11", "12", "13", "14", "15", "16", "17", "18", "19",
  "21", "22", "24", "27", "28",
  "31", "32", "33", "34", "35", "37", "38",
  "41", "42", "43", "44", "45", "46", "47", "48", "49",
  "51", "53", "54", "55",
  "61", "62", "63", "64", "65", "66", "67", "68", "69",
  "71", "73", "74", "75", "77", "79",
  "81", "82", "83", "84", "85", "86", "87", "88", "89",
  "91", "92", "93", "94", "95", "96", "97", "98", "99",
]);

const GEO_MODE_META: Array<{
  key: GeoMode;
  label: string;
  eyebrow: string;
  description: string;
  icon: string[];
}> = [
  {
    key: "cities",
    label: "Avulsas",
    eyebrow: "Até 20 cidades",
    description: "Escolha alvos pontuais. O Radar executa uma cidade por vez, mesmo com a tela fechada.",
    icon: ICONS.mapin,
  },
  {
    key: "radius",
    label: "Região",
    eyebrow: "1 cidade-base",
    description: "Expanda em um raio controlado com uma única execução.",
    icon: ICONS.scrape,
  },
  {
    key: "ddd",
    label: "Por DDD",
    eyebrow: "",
    description: "",
    icon: ICONS.phone,
  },
  {
    key: "nearby",
    label: "Perto de mim",
    eyebrow: "Sua localização",
    description: "Use sua posição como ponto de partida para a região.",
    icon: ICONS.leads,
  },
];

const CHANNEL_META: Array<{ key: RadarRequiredChannel; label: string; description: string; icon: string[] }> = [
  { key: "whatsapp", label: "WhatsApp", description: "Número com sinal de WhatsApp", icon: ICONS.msg },
  { key: "phone", label: "Telefone", description: "Contato telefônico válido", icon: ICONS.phone },
  { key: "email", label: "E-mail", description: "E-mail público encontrado", icon: ICONS.mail },
  { key: "website", label: "Site", description: "Site próprio identificado", icon: ICONS.website },
];

function geoTargetsFor(mode: GeoMode, uf: string, cities: string[]): GeoTarget[] {
  const limit = mode === "radius" || mode === "nearby" ? 1 : MAX_CITY_TARGETS;
  const state = uf.trim().toUpperCase();
  if (!state) return [];
  const seen = new Set<string>();
  return cities
    .map(city => city.trim())
    .filter(city => {
      const key = normCity(city);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit)
    .map(city => ({ city, state }));
}

function radarLeadMergeKey(lead: RadarLead) {
  const cnpj = String(lead.cnpj || "").replace(/\D/g, "");
  if (cnpj) return `cnpj:${cnpj}`;
  const phone = String(lead.phone || "").replace(/\D/g, "");
  if (phone.length >= 10) return `phone:${phone.slice(-11)}`;
  return [
    "place",
    String(lead.name || "").trim().toLowerCase(),
    String(lead.city || "").trim().toLowerCase(),
    String(lead.state || "").trim().toUpperCase(),
  ].join(":");
}

function mergeRadarLeads(...groups: Array<RadarLead[] | null | undefined>) {
  const merged = new Map<string, RadarLead>();
  for (const lead of groups.flatMap(group => group || [])) {
    merged.set(radarLeadMergeKey(lead), lead);
  }
  return Array.from(merged.values());
}

function filterRadarLeadsByReputation(leads: RadarLead[], minRating: string, minReviews: string) {
  const ratingFloor = Number(minRating || 0);
  const reviewsFloor = Number(minReviews || 0);
  return leads.filter(lead =>
    (!ratingFloor || Number(lead.rating || 0) >= ratingFloor) &&
    (!reviewsFloor || Number(lead.reviews || 0) >= reviewsFloor),
  );
}

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

function GeoModeTransition({
  mode,
  direction,
  children,
}: {
  mode: GeoMode;
  direction: GeoModeDirection;
  children: ReactNode;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const heightRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const content = contentRef.current;
    if (!stage || !content) return;

    const nextHeight = Math.ceil(content.scrollHeight);
    const previousHeight = heightRef.current;
    if (previousHeight == null) {
      stage.style.height = `${nextHeight}px`;
      heightRef.current = nextHeight;
      return;
    }

    stage.style.height = `${previousHeight}px`;
    if (frameRef.current != null) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = window.requestAnimationFrame(() => {
      stage.style.height = `${nextHeight}px`;
      heightRef.current = nextHeight;
      frameRef.current = null;
    });
  }, [mode]);

  useEffect(() => {
    const stage = stageRef.current;
    const content = contentRef.current;
    if (!stage || !content || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(entries => {
      const nextHeight = Math.ceil(entries[0]?.contentRect.height || content.scrollHeight);
      if (!nextHeight || nextHeight === heightRef.current) return;
      stage.style.height = `${nextHeight}px`;
      heightRef.current = nextHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [mode]);

  useEffect(() => () => {
    if (frameRef.current != null) window.cancelAnimationFrame(frameRef.current);
  }, []);

  return (
    <div ref={stageRef} className="be-geo-stage">
      <div
        key={mode}
        ref={contentRef}
        className="be-geo-stage__content"
        data-direction={direction}
      >
        {children}
      </div>
    </div>
  );
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

// Motivo de inclusão (S2 LEAD-CENTRICO, 25/07): rótulo curto PT-BR por código — mesmo
// vocabulário gravado no backend (radar-inclusion-reasons.util.ts). Código sem rótulo aqui
// (card futuro com motivo novo) cai no próprio código cru, nunca quebra o badge.
const INCLUSION_REASON_LABELS: Record<string, string> = {
  cnae_compativel: "CNAE compatível com o segmento",
  nome_combina_segmento: "Nome combina com o segmento pedido",
  sem_segmento_pedido: "Sem segmento pedido (não filtrado)",
  cidade_uf_ok: "Cidade/UF batem com o pedido",
  telefone_presente: "Telefone presente",
  whatsapp_confirmado: "WhatsApp confirmado",
  website_proprio: "Site próprio",
  multiplas_fontes: "Confirmado por mais de uma fonte",
};

function inclusionReasonLabel(code: string): string {
  return INCLUSION_REASON_LABELS[code] || code;
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
  geoMode: GeoMode;
  ddd: string;
  minRating: string;
  minReviews: string;
  requiredChannels: RadarRequiredChannel[];
  channelMatchMode: "any_required" | "all_required";
}): SavedFiltro {
  const f: SavedFiltro = {};
  if (input.city.trim()) f.city = input.city.trim();
  if (input.uf.trim()) f.state = input.uf.trim();
  if (input.segment.trim()) f.segment = input.segment.trim();
  if ((input.geoMode === "radius" || input.geoMode === "nearby") && input.alcance.trim()) {
    f.radiusKm = Number(input.alcance);
  }
  if (input.geoMode === "ddd" && input.ddd.trim()) f.ddd = input.ddd.trim();
  if (input.minRating.trim()) f.minRating = Number(input.minRating);
  if (input.minReviews.trim()) f.minReviews = Number(input.minReviews);
  if (input.requiredChannels.length) {
    f.requiredChannels = input.requiredChannels;
    f.channelMatchMode = input.channelMatchMode;
  }
  return f;
}

// Resumo legível do filtro salvo: traduz exatamente o recorte persistido.
const CANAL_LABEL_PT: Record<string, string> = {
  whatsapp: "WhatsApp",
  email: "E-mail",
  phone: "Telefone",
  telefone: "Telefone",
  instagram: "Instagram",
  facebook: "Facebook",
  website: "Site",
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
  const radius = String(filtro?.radiusKm || alc).trim();
  if (radius) parts.push(`raio de ${radius} km`);
  const ddd = String(filtro?.ddd || "").trim();
  if (ddd) parts.push(`DDD ${ddd}`);
  const req = Array.isArray(filtro?.requiredChannels) ? (filtro.requiredChannels as string[]) : [];
  if (req.length) {
    const mode = String(filtro?.channelMatchMode || "all_required");
    parts.push(`${mode === "any_required" ? "com algum de" : "com"} ${req.map((c) => CANAL_LABEL_PT[c] || c).join(", ")}`);
  }
  const minRating = Number(filtro?.minRating || 0);
  if (minRating > 0) parts.push(`nota ${minRating.toLocaleString("pt-BR", { minimumFractionDigits: 1 })}+`);
  const minReviews = Number(filtro?.minReviews || 0);
  if (minReviews > 0) parts.push(`${fmtInt(minReviews)}+ avaliações`);
  return parts.length ? parts.join(" · ") : "Todos os leads";
}

// Extrai operationalState do run
function getOpState(run: RunResponse): "funcionando" | "pausado" | "parado" | null {
  if (!run) return null;
  const opState = String(run.meta?.operationalState || "").trim().toLowerCase();
  if (opState === "funcionando" || opState === "pausado" || opState === "parado") return opState;
  return null;
}

// Disco de radar (PURO ENFEITE): extraído pra components/hbx/radar-disc.tsx
// no W1 (PR10072026) — a landing usa a MESMA tela real. Comportamento aqui
// permanece idêntico (só mudou o endereço do componente).

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

type StoredLeadFilters = {
  uf: string;
  cities: string[];
  segment: string;
  alcance: string;
  geoMode: GeoMode;
  ddd: string;
  minRating: string;
  minReviews: string;
  requiredChannels: RadarRequiredChannel[];
  channelMatchMode: "any_required" | "all_required";
  pauseAfter: string;
};

const EMPTY_STORED_FILTERS: StoredLeadFilters = {
  uf: "",
  cities: [],
  segment: "",
  alcance: "",
  geoMode: "cities",
  ddd: "",
  minRating: "",
  minReviews: "",
  requiredChannels: [],
  channelMatchMode: "all_required",
  pauseAfter: "50",
};

function getStoredFilters(): StoredLeadFilters {
  if (typeof window === "undefined") return EMPTY_STORED_FILTERS;
  try {
    const s = localStorage.getItem("hbx:leads-filters");
    if (s) {
      const p = JSON.parse(s) as Record<string, unknown>;
      // Migração: formato antigo guardava `city` (string única) → vira array de 1.
      const cities = Array.isArray(p.cities)
        ? p.cities.filter((c): c is string => typeof c === "string" && c.trim().length > 0)
        : (typeof p.city === "string" && p.city.trim() ? [p.city] : []);
      const storedMode = String(p.geoMode || "");
      const geoMode: GeoMode = storedMode === "radius" || storedMode === "ddd" || storedMode === "nearby"
        ? storedMode
        : "cities";
      const allowedChannels = new Set<RadarRequiredChannel>(["whatsapp", "phone", "email", "website"]);
      const requiredChannels = Array.isArray(p.requiredChannels)
        ? p.requiredChannels.filter((channel): channel is RadarRequiredChannel =>
            typeof channel === "string" && allowedChannels.has(channel as RadarRequiredChannel))
        : [];
      const cityLimit = geoMode === "radius" || geoMode === "nearby" ? 1 : MAX_CITY_TARGETS;
      return {
        uf: typeof p.uf === "string" ? p.uf : "",
        cities: cities.slice(0, cityLimit),
        segment: typeof p.segment === "string" ? p.segment : "",
        alcance: typeof p.alcance === "string" ? p.alcance : "",
        geoMode,
        ddd: typeof p.ddd === "string" ? p.ddd.replace(/\D/g, "").slice(0, 2) : "",
        minRating: typeof p.minRating === "string" || typeof p.minRating === "number" ? String(p.minRating) : "",
        minReviews: typeof p.minReviews === "string" || typeof p.minReviews === "number" ? String(p.minReviews) : "",
        requiredChannels,
        channelMatchMode: p.channelMatchMode === "any_required" ? "any_required" : "all_required",
        pauseAfter: typeof p.pauseAfter === "string" || typeof p.pauseAfter === "number"
          ? String(p.pauseAfter)
          : "50",
      };
    }
  } catch { /* sem storage */ }
  return EMPTY_STORED_FILTERS;
}

// embedded: render DENTRO do Vendas (modo "Buscar empresas" do slide), sem a aba
// "Minha carteira" (carteira = funil) nem o "Voltar pro funil". onLeadPulled avisa
// o Vendas que um lead entrou no funil — focus=true desliza pro funil. 27/06.
// Lista densa (LEADS-FINAL/02, 06/07): toggle Linhas|Cards no cabeçalho —
// default LINHAS (alvo ≥9 leads em 1080p). Estado por usuário em localStorage
// — não é filtro (não recarrega a lista).
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

// Exportado (LEADS-FINAL/02): tradutor RadarLead → NegocioDetail puro — recebe
// `revealed` como parâmetro em vez de ler `tab` do closure da tela de listagem,
// pra a página /leads/[id] poder chamar a MESMA função com seu próprio critério
// de posse (ownershipStatus === 'mine', sem conceito de "aba"). Nenhuma lógica
// de mapeamento duplicada entre lista e página.
export function buildNegocioDetailFromLead(lead: RadarLead, opts: { revealed: boolean }): NegocioDetail {
  const revealed = opts.revealed;
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
    channelPresence: resolveRadarChannelPresence(lead),
    // Multi-contatos e empresa/dono — revelados junto do contato; o card ainda
    // aplica o cadeado por tier (canSeeCompany) sobre os dados pessoais do dono.
    people: revealed ? (lead.people ?? null) : null,
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

type ViewMode = "linhas" | "cards";
function getStoredViewMode(): ViewMode {
  if (typeof window === "undefined") return "linhas";
  try {
    const s = localStorage.getItem("hbx:leads-view-mode");
    return s === "cards" ? "cards" : "linhas";
  } catch { return "linhas"; }
}

export function LeadsClient({ embedded = false, onLeadPulled, onEmbedStats, embedTitle }: {
  embedded?: boolean;
  onLeadPulled?: (focus?: boolean) => void;
  onEmbedStats?: (s: {
    totalBrasil: number | null;
    disponiveis: number | null;
    cotaLabel: string;
    cotaValue: string;
    cotaPct: number;
    radarState: RadarUiState;
  }) => void;
  embedTitle?: ReactNode;
} = {}) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>(getStoredViewMode);
  const viewPill = useGlassPill<HTMLButtonElement>(viewMode);
  useEffect(() => {
    try { localStorage.setItem("hbx:leads-view-mode", viewMode); } catch { /* sem storage */ }
  }, [viewMode]);

  // O Avançado mora dentro do seletor territorial para manter uma única
  // superfície de configuração da busca.
  const [advancedInlineOpen, setAdvancedInlineOpen] = useState(false);

  // filtros (lago → prateleira) — persiste em localStorage. INICIALIZADOR
  // ESTÁTICO (não ler localStorage aqui): o inicializador roda no SSR e no 1º
  // render do cliente; se o servidor devolve "" e o cliente lê o filtro salvo,
  // os <select> value= divergem → hydration React 418. O valor salvo entra só
  // PÓS-montagem (efeito de restauração abaixo), mesmo padrão SSR-safe já usado
  // no geoState do Topbar e no collapsed do ActivationChecklist.
  const [uf, setUf] = useState("");
  const [geoMode, setGeoMode] = useState<GeoMode>("cities");
  const [geoModeDirection, setGeoModeDirection] = useState<GeoModeDirection>("forward");
  const geoModePill = useGlassPill<HTMLButtonElement>(geoMode);
  // `cities` é sempre limitado no estado. Região/Perto usam só a primeira;
  // Avulsas/DDD aceitam no máximo cinco alvos explícitos.
  const [cities, setCities] = useState<string[]>([]);
  const city = cities[0] || "";
  const [citiesModalOpen, setCitiesModalOpen] = useState(false);
  const citiesModalRef = useRef<HTMLDivElement | null>(null);
  const citiesTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [citiesQuery, setCitiesQuery] = useState("");
  const [citiesLimitMsg, setCitiesLimitMsg] = useState<string | null>(null);
  const [segment, setSegment] = useState("");
  const [alcance, setAlcance] = useState("");
  const [ddd, setDdd] = useState("");
  const [dddOptions, setDddOptions] = useState<string[]>([]);
  const [dddBusy, setDddBusy] = useState(false);
  const [dddError, setDddError] = useState<string | null>(null);
  const dddLookupTokenRef = useRef(0);
  const geoLookupTokenRef = useRef(0);
  const [minRating, setMinRating] = useState("");
  const [minReviews, setMinReviews] = useState("");
  const minRatingRef = useRef("");
  const minReviewsRef = useRef("");
  minRatingRef.current = minRating;
  minReviewsRef.current = minReviews;
  const [requiredChannels, setRequiredChannels] = useState<RadarRequiredChannel[]>([]);
  const [channelMatchMode, setChannelMatchMode] = useState<"any_required" | "all_required">("all_required");
  const filtersRestored = useRef(false);

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
  // APPROVED-COMPANY-SEARCH-UX: histórico e resultado são estados distintos.
  const [hasSearched, setHasSearched] = useState(false);
  const [historyHidden, setHistoryHidden] = useState(false);

  // lead selecionado no painel de detalhe
  const [selLead, setSelLead] = useState<RadarLead | null>(null);

  // seleção (puxar em lote)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pullBusyId, setPullBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [pullMsg, setPullMsg] = useState<string | null>(null);

  // busca ao vivo (search-on-miss)
  const [run, setRun] = useState<RunResponse>(null);
  // O status do run já devolve apenas os cards realmente persistidos/exibíveis.
  // Mantê-los separados da prateleira evita esperar o término da busca e também
  // impede que candidatos provisórios (`foundCount`) apareçam como leads.
  const [liveRunItems, setLiveRunItems] = useState<RadarLead[] | null>(null);
  const [runBusy, setRunBusy] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);
  const [searchMsg, setSearchMsg] = useState<string | null>(null);
  const [searchQueue, setSearchQueue] = useState<{ current: number; total: number; label: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const queueTokenRef = useRef(0);
  // REFUNDAÇÃO F2: a sessão server-side substituiu a fila do navegador (queueActiveRef/
  // queueRunIdRef mortos). A tela acompanha por poll e re-hidrata com 1 GET ao montar.
  const [session, setSession] = useState<SessionResponse>(null);
  const sessionRef = useRef<SessionResponse>(null);
  const sessionItemsRef = useRef<{ id: string | null; leads: RadarLead[] }>({ id: null, leads: [] });
  const sessionPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionSettledRef = useRef<string | null>(null);
  // Pausa automática ("não sair procurando igual retardado"): o Radar para depois de N
  // leads e espera o vendedor. Persistido junto com os filtros.
  const [pauseAfter, setPauseAfter] = useState<string>("50");

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

  // Combobox próprio do segmento (05/07) — o <datalist> nativo do Chrome só
  // mostrava, pela seta, o que casa com o texto já digitado. Aqui a seta abre a
  // lista INTEIRA sempre; digitar só prioriza (matches no topo/realçados).
  const [segMenuOpen, setSegMenuOpen] = useState(false);
  const segBoxRef = useRef<HTMLDivElement | null>(null);

  // "Minhas pesquisas" mora no acordeão Avançado do seletor unificado.
  const savedMenuRef = useRef<HTMLDivElement | null>(null);

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

  const closeCitiesModal = useCallback(() => {
    dddLookupTokenRef.current += 1;
    geoLookupTokenRef.current += 1;
    setDddBusy(false);
    setGeoBusy(false);
    setAdvancedInlineOpen(false);
    setCitiesModalOpen(false);
  }, []);
  useEffect(() => {
    function onGeo(e: Event) {
      const detail = (e as CustomEvent<{ lat: number; lng: number } | null>).detail;
      setGeo(detail ?? null);
    }
    window.addEventListener("hbx:geo-updated", onGeo);
    return () => window.removeEventListener("hbx:geo-updated", onGeo);
  }, []);

  // Fecha o combobox de segmento ao clicar fora ou apertar Escape.
  useEffect(() => {
    if (!segMenuOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (segBoxRef.current && !segBoxRef.current.contains(e.target as Node)) {
        setSegMenuOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setSegMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [segMenuOpen]);

  // Fecha o dropdown "Minhas pesquisas" ao clicar fora ou apertar Escape — mesmo
  // padrão do combobox de segmento acima.
  useEffect(() => {
    if (!savedBar) return;
    function onPointerDown(e: PointerEvent) {
      if (savedMenuRef.current && !savedMenuRef.current.contains(e.target as Node)) {
        setSavedBar(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setSavedBar(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [savedBar]);

  useEffect(() => {
    if (!citiesModalOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => {
      const modal = citiesModalRef.current;
      const preferred = modal?.querySelector<HTMLElement>("[data-advanced-autofocus]:not(:disabled)")
        || modal?.querySelector<HTMLElement>("[data-geo-autofocus]:not(:disabled)");
      const first = modal?.querySelector<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
      );
      (preferred || first)?.focus();
    });
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeCitiesModal();
        return;
      }
      if (e.key !== "Tab") return;
      const modal = citiesModalRef.current;
      const focusable = Array.from(modal?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ) || []);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      if (previousFocus && document.contains(previousFocus)) previousFocus.focus();
      else citiesTriggerRef.current?.focus();
    };
  }, [citiesModalOpen, closeCitiesModal]);

  useEffect(() => {
    return () => {
      queueTokenRef.current += 1;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (sessionPollRef.current) {
        clearInterval(sessionPollRef.current);
        sessionPollRef.current = null;
      }
    };
  }, []);

  // REFUNDAÇÃO F2: adota o snapshot da sessão server-side como verdade da tela.
  // Acumula os itens por sessão (o currentRun troca a cada cidade) e espelha o
  // progresso no chip "cidade X/Y". É o que faz sair-e-voltar ser indolor.
  const adoptSession = useCallback((s: NonNullable<SessionResponse>) => {
    setSession(s);
    sessionRef.current = s;
    if ((s.id || null) !== sessionItemsRef.current.id) {
      sessionItemsRef.current = { id: s.id || null, leads: [] };
    }
    const runItems = Array.isArray(s.currentRun?.items) ? s.currentRun.items : [];
    sessionItemsRef.current.leads = mergeRadarLeads(sessionItemsRef.current.leads, runItems);
    setRun(s.currentRun || null);
    setLiveRunItems(filterRadarLeadsByReputation(
      sessionItemsRef.current.leads,
      minRatingRef.current,
      minReviewsRef.current,
    ));
    const active = SESSION_ACTIVE.has(String(s.status || ""));
    setSearchQueue(active && (s.cityCount || 0) > 1 ? {
      current: Math.min((s.cursorIndex || 0) + 1, s.cityCount || 1),
      total: s.cityCount || 1,
      label: s.currentCity ? `${s.currentCity.city}${s.currentCity.state ? `/${s.currentCity.state}` : ""}` : "",
    } : null);
    if (s.message) setSearchMsg(s.message);
  }, []);

  async function pullGeoLocation() {
    if (!geo || geoBusy) return;
    const lookupToken = geoLookupTokenRef.current + 1;
    geoLookupTokenRef.current = lookupToken;
    markFiltersDirty();
    setGeoMode("nearby");
    setDdd("");
    setDddOptions([]);
    setDddError(null);
    setGeoBusy(true);
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${geo.lat}&lon=${geo.lng}&format=json`,
        { headers: { "Accept-Language": "pt-BR" } },
      );
      const data = await resp.json();
      if (geoLookupTokenRef.current !== lookupToken) return;
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
          const ufCities = BRAZIL_CITIES_BY_UF[resolvedUf] || [];
          const match = ufCities.find(c => normCity(c) === normCity(cityRaw));
          setCities([match || cityRaw]);
          setAlcance(current => current || "25");
        }
      }
    } catch { /* silently ignore */ }
    finally {
      if (geoLookupTokenRef.current === lookupToken) setGeoBusy(false);
    }
  }

  async function consultarDdd() {
    const digits = ddd.replace(/\D/g, "").slice(0, 2);
    if (!VALID_DDDS.has(digits)) {
      setDddError("Informe um DDD brasileiro válido.");
      setDddOptions([]);
      setCities([]);
      return;
    }
    const lookupToken = dddLookupTokenRef.current + 1;
    dddLookupTokenRef.current = lookupToken;
    markFiltersDirty();
    setDddBusy(true);
    setDddError(null);
    setCities([]);
    try {
      const response = await fetch(`https://brasilapi.com.br/api/ddd/v1/${encodeURIComponent(digits)}`);
      if (!response.ok) throw new Error("DDD não encontrado.");
      const result = await response.json() as DddLookupResponse;
      if (dddLookupTokenRef.current !== lookupToken) return;
      const resolvedUf = String(result?.state || "").trim().toUpperCase();
      const ufCities = BRAZIL_CITIES_BY_UF[resolvedUf] || [];
      const resolvedCities = Array.from(new Set(
        (Array.isArray(result?.cities) ? result.cities : [])
          .map(raw => {
            const label = String(raw || "").trim();
            return ufCities.find(cityName => normCity(cityName) === normCity(label)) || label;
          })
          .filter(Boolean),
      )).sort((left, right) => left.localeCompare(right, "pt-BR"));
      if (!resolvedUf || resolvedCities.length === 0) throw new Error("Não encontrei cidades para este DDD.");
      setGeoMode("ddd");
      setUf(resolvedUf);
      setDdd(digits);
      setDddOptions(resolvedCities);
      setCitiesQuery("");
      setAlcance("");
    } catch (error) {
      if (dddLookupTokenRef.current !== lookupToken) return;
      setDddOptions([]);
      setDddError(error instanceof Error ? error.message : "Não foi possível consultar este DDD.");
    } finally {
      if (dddLookupTokenRef.current === lookupToken) setDddBusy(false);
    }
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

  const loadList = useCallback((which: Tab, opts?: { page?: number }) => {
    const limit = which === "shelf" ? SHELF_LIMIT : pageSize;
    const requestedPage = opts?.page ?? 1;
    const selectedTargets = geoTargetsFor(geoMode, uf, cities);
    // A prateleira pode representar até cinco alvos explícitos. Cada consulta
    // continua sendo estritamente uma cidade, sem alterar o contrato do Radar.
    const requestTargets: Array<GeoTarget | null> = which === "shelf" && selectedTargets.length > 0
      ? selectedTargets
      : [selectedTargets[0] || null];
    const aggregateTargets = requestTargets.length > 1;
    // A apresentação do backend normaliza uma consulta em no máximo 300 itens.
    // Mantemos a paginação agregada dentro desse teto para nunca anunciar
    // páginas que a API não consegue devolver.
    const aggregateTargetCap = 300;
    const fetchLimit = aggregateTargets ? Math.min(aggregateTargetCap, requestedPage * limit) : limit;

    const requests = requestTargets.map(target => {
      const params = new URLSearchParams();
      params.set("page", String(aggregateTargets ? 1 : requestedPage));
      params.set("limit", String(fetchLimit));
      if (which === "shelf") params.set("scope", "vitrine");
      if (segment) params.set("segment", segment);
      if (target?.city) params.set("city", target.city);
      if (target?.state) params.set("state", target.state);
      if (which === "shelf" && (geoMode === "radius" || geoMode === "nearby") && alcance) {
        params.set("radiusKm", alcance);
      }
      if (which === "shelf" && geoMode === "nearby" && geo) {
        params.set("originLat", String(geo.lat));
        params.set("originLng", String(geo.lng));
      }
      if (which === "shelf" && minRating) params.set("minRating", minRating);
      if (which === "shelf" && minReviews) params.set("minReviews", minReviews);
      if (which === "shelf" && requiredChannels.length > 0) {
        requiredChannels.forEach(channel => params.append("requiredChannels", channel));
        params.set("channelMatchMode", channelMatchMode);
      }
      return apiFetch<LeadsResponse>(`/webscraping/radar/leads?${params.toString()}`);
    });

    return Promise.all(requests)
      .then(responses => {
        const first = responses[0] || { items: [], total: 0 };
        if (responses.length === 1) {
          setData(first);
          setLoadError(null);
          const badge = which === "shelf" ? (first?.meta?.totalAvailable ?? first?.total ?? 0) : (first?.total ?? 0);
          setCounts(current => ({ ...current, [which]: badge }));
          return;
        }

        // Intercala as cidades para nenhuma delas dominar a primeira página e
        // remove duplicados que eventualmente apareçam em recortes próximos.
        const interleaved: RadarLead[] = [];
        const maxItems = Math.max(0, ...responses.map(response => response.items?.length || 0));
        for (let itemIndex = 0; itemIndex < maxItems; itemIndex += 1) {
          for (const response of responses) {
            const item = response.items?.[itemIndex];
            if (item) interleaved.push(item);
          }
        }
        const pageOffset = (requestedPage - 1) * limit;
        const items = mergeRadarLeads(interleaved).slice(pageOffset, pageOffset + limit);
        const total = responses.reduce(
          (sum, response) => sum + Math.min(aggregateTargetCap, Number(response.total || 0)),
          0,
        );
        const totalAvailable = responses.reduce(
          (sum, response) => sum + Number(response.meta?.totalAvailable ?? response.total ?? 0),
          0,
        );
        const result: LeadsResponse = {
          ...first,
          items,
          total,
          meta: { ...(first.meta || {}), totalAvailable, limit },
        };
        setData(result);
        setLoadError(null);
        setCounts(current => ({ ...current, [which]: totalAvailable }));
      })
      .catch((err: unknown) => {
        setData(null);
        setLoadError(err instanceof Error ? err.message : "Falha ao carregar o Radar.");
      });
  }, [segment, geoMode, uf, cities, alcance, geo, minRating, minReviews, requiredChannels, channelMatchMode]);

  const refreshRadarLead = useCallback(async (radarLeadId: string) => {
    try {
      const response = await apiFetch<{ item?: RadarLead }>(`/webscraping/radar/leads/${encodeURIComponent(radarLeadId)}`);
      if (!response?.item) return;
      const updated = response.item;
      setData(previous => previous
        ? { ...previous, items: (previous.items || []).map(item => item.id === radarLeadId ? updated : item) }
        : previous);
      setLiveRunItems(previous => previous?.map(item => item.id === radarLeadId ? updated : item) ?? previous);
      setSelLead(previous => previous?.id === radarLeadId ? updated : previous);
    } catch {
      await loadList(tab, { page });
    }
  }, [loadList, page, tab]);

  useEffect(() => {
    const latestRequestToken = queueTokenRef.current;
    loadBank();
    loadUsage();
    loadList("shelf", { page: 1 });
    // REFUNDAÇÃO F2: a re-hidratação é 1 GET na SESSÃO server-side — voltar pra tela
    // encontra a busca viva (ou o resultado recente) exatamente onde parou. O run
    // avulso do /webscraping/radar/search-runs/latest fica de fallback (casca mobile).
    apiFetch<SessionResponse>("/webscraping/radar/sessions/active")
      .then(res => {
        if (queueTokenRef.current !== latestRequestToken) return;
        if (res?.id && SESSION_ACTIVE.has(String(res.status || ""))) {
          setHasSearched(true);
          setHistoryHidden(false);
          adoptSession(res);
          return;
        }
        return apiFetch<RunResponse>("/webscraping/radar/search-runs/latest")
          .then(latest => {
            if (sessionRef.current || queueTokenRef.current !== latestRequestToken) return;
            if (!latest || !(latest.id || latest.runId)) return;
            const opState = getOpState(latest);
            const isTerminal = TERMINAL_RUN.has(String(latest?.status || "")) || latest?.meta?.terminal;
            // Só carrega se está visivelmente ativo (não terminal ou operacional ativo)
            if (!isTerminal || opState === "funcionando" || opState === "pausado") {
              setRun(latest);
              setLiveRunItems(filterRadarLeadsByReputation(
                Array.isArray(latest.items) ? latest.items : [],
                minRatingRef.current,
                minReviewsRef.current,
              ));
            }
          });
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
    // Não persistir antes de restaurar: no mount os filtros nascem vazios
    // (defaults estáticos SSR-safe) — gravar aqui apagaria o que estava salvo.
    if (!filtersRestored.current) return;
    try {
      localStorage.setItem("hbx:leads-filters", JSON.stringify({
        uf,
        cities,
        segment,
        alcance,
        geoMode,
        ddd,
        minRating,
        minReviews,
        requiredChannels,
        channelMatchMode,
        pauseAfter,
      }));
    } catch { /* sem storage */ }
  }, [uf, cities, segment, alcance, geoMode, ddd, minRating, minReviews, requiredChannels, channelMatchMode, pauseAfter]);

  // Restaura os filtros salvos SÓ pós-montagem (setState em rAF → respeita
  // react-hooks/set-state-in-effect). Roda depois do efeito de persistência
  // acima, que fica travado por filtersRestored até aqui — o localStorage é
  // lido intacto (nunca sobrescrito com os defaults do 1º render).
  useEffect(() => {
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      if (cancelled) return;
      const f = getStoredFilters();
      filtersRestored.current = true;
      setUf(f.uf);
      setCities(f.cities);
      setSegment(f.segment);
      setAlcance(f.alcance);
      setGeoMode(f.geoMode);
      setDdd(f.ddd);
      setMinRating(f.minRating);
      setMinReviews(f.minReviews);
      setRequiredChannels(f.requiredChannels);
      setChannelMatchMode(f.channelMatchMode);
      setPauseAfter(f.pauseAfter);
      if (f.segment || f.uf || f.cities.length > 0 || f.minRating || f.minReviews || f.requiredChannels.length > 0) {
        setHistoryHidden(true);
      }
    });
    return () => { cancelled = true; cancelAnimationFrame(id); };
  }, []);

  // Filtros não consultam o Radar automaticamente. A busca filtrada só começa
  // depois de uma ação explícita no botão Buscar.

  // REFUNDAÇÃO F2: poll da SESSÃO server-side. A tela só assiste — o servidor é quem
  // trabalha. Erro de rede/502 de deploy NÃO derruba o estado (o publish de 13:45
  // virou "parou sozinho" na cara do dono; nunca mais): mantém o último snapshot e
  // avisa que o servidor está atualizando.
  useEffect(() => {
    const active = Boolean(session?.id && SESSION_ACTIVE.has(String(session.status || "")));
    if (!active) {
      if (sessionPollRef.current) { clearInterval(sessionPollRef.current); sessionPollRef.current = null; }
      return;
    }
    if (sessionPollRef.current) return;
    sessionPollRef.current = setInterval(async () => {
      try {
        const res = await apiFetch<SessionResponse>("/webscraping/radar/sessions/active");
        if (!res || !res.id) {
          setSession(null);
          sessionRef.current = null;
          setSearchQueue(null);
          return;
        }
        adoptSession(res);
        const terminal = !SESSION_ACTIVE.has(String(res.status || ""));
        if (terminal && sessionSettledRef.current !== res.id) {
          sessionSettledRef.current = res.id || null;
          setSearchQueue(null);
          loadBank();
          loadUsage();
          setTab("shelf");
          setPage(1);
          void loadList("shelf", { page: 1 }).finally(() => setLiveRunItems(null));
          const total = Number(res.foundTotal || 0);
          if (res.status === "completed" && total > 0) {
            setFlyToast(`${total} lead${total > 1 ? "s" : ""} encontrad${total > 1 ? "os" : "o"} — disponíve${total > 1 ? "is" : "l"} pra puxar`);
            window.setTimeout(() => setFlyToast(null), 3200);
          }
        }
      } catch {
        // Servidor atualizando (deploy/rede): estado fica; a sessão vive no banco.
        setSearchMsg("Servidor atualizando… a busca continua no servidor.");
      }
    }, SEARCH_POLL_MS);
    return () => {
      if (sessionPollRef.current) { clearInterval(sessionPollRef.current); sessionPollRef.current = null; }
    };
  }, [session?.id, session?.status, adoptSession, loadBank, loadUsage, loadList]);

  // B0: polling por operationalState do backend (não por status fantasma)
  useEffect(() => {
    // A sessão server-side tem poll próprio acima. O intervalo legado só acompanha
    // uma busca isolada retomada do backend (ex.: run criado pela casca mobile).
    if (session?.id) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
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
    const pollingToken = queueTokenRef.current;
    pollRef.current = setInterval(async () => {
      try {
        const res = await apiFetch<RunResponse>(`/webscraping/radar/search-runs/${encodeURIComponent(runId)}`);
        if (sessionRef.current || queueTokenRef.current !== pollingToken) return;
        setRun(res);
        setLiveRunItems(filterRadarLeadsByReputation(
          Array.isArray(res?.items) ? res.items : [],
          minRatingRef.current,
          minReviewsRef.current,
        ));
        const resOpState = getOpState(res);
        const resStatus = String(res?.status || "");
        const resTerminal = TERMINAL_RUN.has(resStatus) || res?.meta?.terminal;
        if (resTerminal && resOpState !== "funcionando" && resOpState !== "pausado") {
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
          void loadList("shelf", { page: 1 }).finally(() => setLiveRunItems(null));
          loadBank();
          loadUsage();
          // P5/EFEITO: leads ficam na vitrine "Disponíveis"; mostra quantos achou pra
          // puxar (o standing-order/auto-feed morreu — não existe mais auto-import).
          type RunMetaExt = { progress?: number; terminal?: boolean; operationalState?: string; operationalReason?: string; operationalMessage?: string; importedCount?: number; deliveredCount?: number };
          const resMeta = res?.meta as RunMetaExt | undefined;
          setTab("shelf");
          setPage(1);
          // "Apreciar o resultado": anuncia quantos leads ficaram disponíveis pra puxar.
          const disponiveis = resMeta?.deliveredCount ?? res?.items?.length ?? 0;
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
  }, [run, session?.id, loadList, loadBank]);

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

  function markFiltersDirty() {
    setHasSearched(false);
    setHistoryHidden(true);
    setLiveRunItems(null);
    setSearchMsg(null);
    setSelected(new Set());
    setSelLead(null);
  }

  // Liga/desliga uma cidade na seleção múltipla (painel central). markFiltersDirty
  // zera o resultado anterior — mudar o recorte não pode mostrar leads de outro.
  function toggleCity(label: string) {
    markFiltersDirty();
    if (cities.includes(label)) {
      setCities(cities.filter(current => current !== label));
      setCitiesLimitMsg(null);
      return;
    }
    const limit = geoMode === "radius" || geoMode === "nearby" ? 1 : MAX_CITY_TARGETS;
    if (cities.length >= limit) {
      setCitiesLimitMsg(
        limit === 1
          ? "Este modo usa uma única cidade-base."
          : "Limite seguro: até 5 cidades por busca.",
      );
      return;
    }
    const next = [...cities, label].slice(0, limit);
    setCities(next);
    setCitiesLimitMsg(
      next.length === limit
        ? limit === 1
          ? "Cidade-base definida para esta região."
          : "Limite seguro atingido: 5 cidades."
        : null,
    );
  }

  function selectGeoMode(nextMode: GeoMode) {
    if (nextMode === geoMode) return;
    const currentIndex = GEO_MODE_META.findIndex(mode => mode.key === geoMode);
    const nextIndex = GEO_MODE_META.findIndex(mode => mode.key === nextMode);
    setGeoModeDirection(nextIndex >= currentIndex ? "forward" : "back");
    dddLookupTokenRef.current += 1;
    geoLookupTokenRef.current += 1;
    setDddBusy(false);
    setGeoBusy(false);
    markFiltersDirty();
    setGeoMode(nextMode);
    setCitiesQuery("");
    setCitiesLimitMsg(null);
    setDddError(null);
    if (nextMode === "cities") {
      setCities(previous => previous.slice(0, MAX_CITY_TARGETS));
      setAlcance("");
      setDdd("");
      setDddOptions([]);
      return;
    }
    if (nextMode === "radius") {
      setCities(previous => previous.slice(0, 1));
      setAlcance(previous => previous || "50");
      setDdd("");
      setDddOptions([]);
      return;
    }
    if (nextMode === "ddd") {
      setUf("");
      setCities([]);
      setAlcance("");
      setDdd("");
      setDddOptions([]);
      return;
    }
    setUf("");
    setCities([]);
    setAlcance(previous => previous || "25");
    setDdd("");
    setDddOptions([]);
  }

  function limparFiltros() {
    setUf("");
    setCities([]);
    setCitiesQuery("");
    closeCitiesModal();
    setSegment("");
    setAlcance("");
    setGeoMode("cities");
    setDdd("");
    setDddOptions([]);
    setDddError(null);
    setCitiesLimitMsg(null);
    setMinRating("");
    setMinReviews("");
    setRequiredChannels([]);
    setChannelMatchMode("all_required");
    setRun(null);
    setSearchMsg(null);
    setPullMsg(null);
    setSelected(new Set());
    setSelLead(null);
    setPage(1);
    setTab("shelf");
    setHasSearched(false);
    setHistoryHidden(true);
    setLiveRunItems(null);
    try { localStorage.removeItem("hbx:leads-filters"); } catch { /* sem storage */ }
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

  // Aplica somente campos que a busca real entende. Pesquisa salva continua
  // representando um único alvo porque esse é o contrato persistido no backend.
  function applySavedSearch(s: SavedSearch) {
    const f = s.filtro || {};
    const nextUf = String((f as SavedFiltro).state || "").trim();
    const nextCity = String((f as SavedFiltro).city || "").trim();
    const nextSeg = String((f as SavedFiltro).segment || "").trim();
    const nextAlc = String((f as SavedFiltro).radiusKm || (f as SavedFiltro).alcance || "").trim();
    const nextDdd = String((f as SavedFiltro).ddd || "").replace(/\D/g, "").slice(0, 2);
    const nextMinRating = String((f as SavedFiltro).minRating || "").trim();
    const nextMinReviews = String((f as SavedFiltro).minReviews || "").trim();
    const allowedChannels = new Set<RadarRequiredChannel>(["whatsapp", "phone", "email", "website"]);
    const nextChannels = Array.isArray((f as SavedFiltro).requiredChannels)
      ? ((f as SavedFiltro).requiredChannels as unknown[]).filter(
          (channel): channel is RadarRequiredChannel =>
            typeof channel === "string" && allowedChannels.has(channel as RadarRequiredChannel),
        )
      : [];
    const nextMode: GeoMode = nextDdd ? "ddd" : nextAlc ? "radius" : "cities";
    setUf(nextUf);
    setCities(nextCity ? [nextCity] : []);
    setSegment(nextSeg);
    setAlcance(nextAlc);
    setGeoMode(nextMode);
    setDdd(nextDdd);
    setDddOptions(nextMode === "ddd" && nextCity ? [nextCity] : []);
    setMinRating(nextMinRating);
    setMinReviews(nextMinReviews);
    setRequiredChannels(nextChannels);
    setChannelMatchMode((f as SavedFiltro).channelMatchMode === "any_required" ? "any_required" : "all_required");
    setPage(1);
    setTab("shelf");
    setSavedBar(false);
    setSavedMsg(`Pesquisa "${s.nome}" aplicada.`);
    setHasSearched(false);
    setHistoryHidden(true);
    setLiveRunItems(null);
    setSearchMsg(null);
    setSelected(new Set());
  }

  function openSaveModal() {
    if (geoMode === "nearby") {
      setSavedMsg("O modo Perto de mim depende da sua posição atual e não pode ser salvo.");
      return;
    }
    if (geoTargetsFor(geoMode, uf, cities).length !== 1) {
      setSavedMsg("Para salvar, deixe um único alvo territorial selecionado.");
      return;
    }
    setSaveName("");
    setSaveSeller("");
    setSavedMsg(null);
    setSaveModalOpen(true);
  }

  // Salva o recorte atual (nome + filtros + vendedor opcional).
  async function saveCurrentFilter() {
    const nome = saveName.trim();
    if (!nome) { setSavedMsg("Dê um nome para a pesquisa."); return; }
    const filtro = buildFiltroSnapshot({
      uf,
      city,
      segment,
      alcance,
      geoMode,
      ddd,
      minRating,
      minReviews,
      requiredChannels,
      channelMatchMode,
    });
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

  // A interação cobre POST em voo, sessão ativa e run pausado ainda não terminal.
  const sessionActive = Boolean(session?.id && SESSION_ACTIVE.has(String(session?.status || "")));
  const sessionPaused = session?.status === "paused";
  const runPending = Boolean(
    !sessionActive &&
    (run?.id || run?.runId) &&
    !(TERMINAL_RUN.has(String(run?.status || "")) || run?.meta?.terminal)
  );
  const searchInProgress = runBusy || sessionActive || runPending;
  const runProgress = run?.meta?.progress;
  const runVisibleCount = liveRunItems
    ? filterRadarLeadsByReputation(liveRunItems, minRating, minReviews).length
    : run?.meta?.deliveredCount ?? 0;

  // REFUNDAÇÃO F2: o aviso de beforeunload morreu — fechar/trocar de tela é SEGURO,
  // a sessão vive no servidor e a tela re-hidrata ao voltar.

  // A resposta do backend é a fonte de verdade. `runBusy` só cobre o intervalo
  // entre o clique em Iniciar e a primeira resposta; ao pedir Parar, o visual
  // congela imediatamente enquanto o cancelamento é confirmado.
  const runStatus = String(run?.status || "").trim().toLowerCase();
  const radarState: RadarUiState =
    stopRequested
      ? "parado"
      : sessionActive
        ? (sessionPaused ? "pausado" : "funcionando")
        : runStatus === "failed" || runStatus === "partial_error"
          ? "erro"
          : opState === "pausado"
            ? "pausado"
            : opState === "parado"
              ? "parado"
              : opState === "funcionando" || runBusy
                ? "funcionando"
                : "parado";
  const discState: "funcionando" | "pausado" | "parado" =
    radarState === "erro" ? "parado" : radarState;

  // P4: valida campos e abre popup se faltando — usado em 3 gatilhos
  function validarCamposOuPopup(effSegment?: string): boolean {
    const segToCheck = effSegment != null ? effSegment : segment;
    const faltando: string[] = [];
    if (!segToCheck.trim()) faltando.push("Segmento");
    if (!uf.trim() || geoTargetsFor(geoMode, uf, cities).length === 0) faltando.push("Território");
    if ((geoMode === "radius" || geoMode === "nearby") && !(Number(alcance) > 0)) faltando.push("Raio");
    if (geoMode === "ddd" && !VALID_DDDS.has(ddd)) faltando.push("DDD");
    if (geoMode === "nearby" && !geo) faltando.push("Localização atual");
    if (faltando.length > 0) {
      setMissingModal(faltando);
      return false;
    }
    return true;
  }

  // override: re-disparo da MESMA busca já expandida (ampliar alcance / incluir segmentos).
  // Quando vem override, os filtros visíveis também sobem (segment/alcance) pra refletir.
  // REFUNDAÇÃO F2: 1 POST cria a SESSÃO no servidor (todas as cidades de uma vez) e o
  // poll acompanha. O loop de fila que morava aqui — e morria com a aba — foi demolido.
  async function executarBusca(override?: { segment?: string; radiusKm?: number }) {
    if (searchInProgress) return;
    const effSegment = override?.segment != null ? override.segment : segment;
    const effRadius = override?.radiusKm != null ? override.radiusKm : (alcance ? Number(alcance) : 0);
    if (!validarCamposOuPopup(effSegment)) return;
    const targets = geoTargetsFor(geoMode, uf, cities);
    setStopRequested(false);
    queueTokenRef.current += 1;
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setHasSearched(true);
    setHistoryHidden(false);
    setSearchMsg(null);
    setLoadError(null);
    setLiveRunItems([]);
    setRun(null);
    sessionItemsRef.current = { id: null, leads: [] };
    sessionSettledRef.current = null;
    setData(prev => prev ? { ...prev, items: [], total: 0 } : prev);
    setRunBusy(true);
    try {
      const body: Record<string, unknown> = {
        cities: targets.map(target => ({ city: target.city, state: target.state })),
        segment: effSegment,
        quantity: SEARCH_BATCH,
        pauseAfterLeads: Math.max(0, Number(pauseAfter) || 0),
      };
      if ((geoMode === "radius" || geoMode === "nearby") && effRadius > 0) body.radiusKm = effRadius;
      if (geoMode === "nearby" && geo) {
        body.originLat = geo.lat;
        body.originLng = geo.lng;
      }
      if (requiredChannels.length > 0) {
        body.requiredChannels = requiredChannels;
        body.channelMatchMode = channelMatchMode;
      }
      const res = await apiFetch<SessionResponse>("/webscraping/radar/sessions", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res || !res.id) throw new Error("O Radar não confirmou a busca. Tente novamente.");
      adoptSession(res);
      if (override?.segment != null) setSegment(effSegment);
      if (override?.radiusKm != null) setAlcance(String(override.radiusKm));
      setTab("shelf");
      setPage(1);
      setSelected(new Set());
    } catch (err) {
      setSearchMsg(err instanceof Error ? err.message : "Não consegui iniciar a busca no Radar.");
    } finally {
      setRunBusy(false);
    }
  }

  // Pausar/Continuar: a sessão espera no servidor — o vendedor trabalha os leads e
  // retoma de onde parou (cursor de cidade preservado).
  async function pausarBusca() {
    const active = sessionRef.current;
    if (!active?.id) return;
    try {
      const res = await apiFetch<SessionResponse>(`/webscraping/radar/sessions/${encodeURIComponent(active.id)}/pause`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (res) adoptSession(res);
    } catch { /* poll pega o estado real */ }
  }

  async function continuarBusca() {
    const active = sessionRef.current;
    if (!active?.id) return;
    try {
      const res = await apiFetch<SessionResponse>(`/webscraping/radar/sessions/${encodeURIComponent(active.id)}/resume`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (res) adoptSession(res);
    } catch { /* poll pega o estado real */ }
  }

  async function pararBusca() {
    setStopRequested(true);
    try {
      const active = sessionRef.current;
      if (active?.id && SESSION_ACTIVE.has(String(active.status || ""))) {
        const res = await apiFetch<SessionResponse>(`/webscraping/radar/sessions/${encodeURIComponent(active.id)}/cancel`, {
          method: "POST",
          body: JSON.stringify({}),
        });
        if (res) adoptSession(res);
        setSearchQueue(null);
        void loadList("shelf", { page: 1 }).finally(() => setLiveRunItems(null));
        return;
      }
      // Fallback: run avulso sem sessão (ex.: iniciado pela casca mobile).
      const runId = run?.id || run?.runId;
      if (!runId) {
        setRunBusy(false);
        return;
      }
      await apiFetch(`/webscraping/radar/search-runs/${encodeURIComponent(runId)}/cancel`, { method: "POST", body: JSON.stringify({}) });
      const res = await apiFetch<RunResponse>(`/webscraping/radar/search-runs/${encodeURIComponent(runId)}`);
      setRun(res);
      setLiveRunItems(filterRadarLeadsByReputation(
        Array.isArray(res?.items) ? res.items : [],
        minRatingRef.current,
        minReviewsRef.current,
      ));
      void loadList("shelf", { page: 1 }).finally(() => setLiveRunItems(null));
    } catch {
      // O poll observa o estado real; nada a desfazer aqui.
    } finally {
      setStopRequested(false);
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

  const showingLiveRun = tab === "shelf" && liveRunItems !== null;
  const historyItems = data?.items || [];
  const hideHistory = tab === "shelf" && !hasSearched && historyHidden;
  const filteredLiveRunItems = filterRadarLeadsByReputation(liveRunItems || [], minRating, minReviews);
  const items = showingLiveRun ? filteredLiveRunItems : (hideHistory ? [] : historyItems);
  const hasHistory = tab === "shelf" && !hasSearched && !historyHidden && historyItems.length > 0;

  const aiStatusMap = useRadarAiStatusPoll(items.map(row => row.id), {
    onTerminal: (radarLeadId) => { void refreshRadarLead(radarLeadId); },
  });

  const limit = data?.meta?.limit || pageSize;
  const filters = data?.meta?.availableFilters;
  const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, "pt-BR");
  const segOptions = (filters?.segments || []).sort(byLabel);
  const ufOptions = mergeFilterOptions(filters?.states, BRAZIL_UF_OPTIONS).sort(byLabel);
  const ufCityOptions = uf
    ? mergeBrazilCityOptions(uf, filters?.citiesByState?.[uf]).sort(byLabel)
    : [];
  const cityOptions = geoMode === "ddd"
    ? mergeFilterOptions(
        [...cities, ...dddOptions].map(label => ({ value: label, label })),
        [],
      ).sort(byLabel)
    : ufCityOptions;
  const geoTargets = geoTargetsFor(geoMode, uf, cities);
  const geoModeInfo = GEO_MODE_META.find(mode => mode.key === geoMode) || GEO_MODE_META[0];
  const geoSummary = geoTargets.length === 0
    ? "Escolher território"
    : geoMode === "ddd"
      ? `DDD ${ddd} · ${geoTargets.length} cidade${geoTargets.length > 1 ? "s" : ""}`
      : geoMode === "radius"
        ? `${geoTargets[0].city}/${geoTargets[0].state} · ${alcance || "—"} km`
        : geoMode === "nearby"
          ? `Perto de ${geoTargets[0].city} · ${alcance || "—"} km`
          : geoTargets.length === 1
            ? `${geoTargets[0].city}/${geoTargets[0].state}`
            : `${geoTargets.length} cidades em ${geoTargets[0].state}`;
  const canSearch = Boolean(
    segment.trim() &&
    uf.trim() &&
    geoTargets.length > 0 &&
    (!(geoMode === "radius" || geoMode === "nearby") || Number(alcance) > 0) &&
    (geoMode !== "ddd" || VALID_DDDS.has(ddd)) &&
    (geoMode !== "nearby" || geo),
  );
  const localLabel = geoSummary === "Escolher território" ? "" : geoSummary;
  const advancedCount = requiredChannels.length + Number(Boolean(minRating)) + Number(Boolean(minReviews));
  const canSaveCurrentFilter = geoTargets.length === 1 && geoMode !== "nearby";

  const pageTotal = showingLiveRun ? filteredLiveRunItems.length : (hideHistory ? 0 : (data?.total || 0));
  const lastPage = Math.max(1, Math.ceil(pageTotal / limit));

  // CRÉDITOS FASE 2 (R5): a cota MENSAL de cards por plano (usage.cards) deixou
  // de bloquear no backend (CommercialUsageLimitsService — telemetria, não gate).
  // O teto real agora é o saldo de crédito (débito no puxar, backend fail-closed
  // sem saldo) — o front não replica mais o bloqueio por contagem de plano aqui.
  // O teto de vendedor (saq/RBAC — "carteira cheia") continua bloqueando: isso
  // não é paywall de tier, é limite operacional por cargo.
  const saq = usage?.sellerActiveQuota;
  const isSeller = Boolean(saq?.seller);
  const meterLabel = isSeller ? "Em mãos" : "Cards puxados (mês)";
  const meterValue = isSeller
    ? `${fmtInt(saq?.activeCount)} / ${fmtInt(saq?.effectiveLimit)}`
    : usage?.cards
      ? `${fmtInt(usage.cards.used)} / ${fmtInt(usage.cards.limit)}`
      : "—";
  const meterBlocked = isSeller
    ? Boolean(saq?.paused) || Number(saq?.availableSlots ?? 1) <= 0
    : false;

  const emptyMsg = loadError
    ? loadError
    : searchInProgress && radarState === "pausado" && tab === "shelf"
      ? run?.meta?.operationalMessage || "Radar pausado. A busca será retomada quando o motor estiver disponível."
    : searchInProgress && tab === "shelf"
      ? `Procurando empresas em ${localLabel || "sua região"}…`
    : data?.meta?.available === false
      ? data?.meta?.message || "Banco do Radar indisponível neste ambiente."
      : tab === "carteira"
        ? "Você ainda não puxou nenhum lead. Pegue um na aba Disponíveis."
        : hasSearched
          ? `Nenhuma empresa encontrada para ${segment || "este segmento"} em ${localLabel || "esta cidade"}${uf ? `/${uf}` : ""}.`
          : "Preencha os filtros para começar.";

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
      radarState,
    });
  }, [onEmbedStats, totalBrasilReal, counts.shelf, meterLabel, meterValue, meterPct, radarState]);

  function contatoMascarado(row: RadarLead) {
    const channelPresence = resolveRadarChannelPresence(row);
    const visibleChannels = RADAR_CHANNEL_ORDER.filter(canal => channelPresence[canal]);
    return (
      <span className="radar2-locked" aria-label="Canais encontrados">
        {visibleChannels.map(canal => <CanalIcon key={canal} canal={canal} size="sm" />)}
        <span>{visibleChannels.length > 0 ? "revela no Puxar" : "sem contato"}</span>
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

  function buildNegocioDetail(lead: RadarLead): NegocioDetail {
    const revealed = tab === "carteira" && Boolean(lead.phone);
    return buildNegocioDetailFromLead(lead, { revealed });
  }

  function renderLeadDetail(lead: RadarLead, opts?: { title?: string; onClose?: () => void }) {
    const detail = buildNegocioDetail(lead);
    const revealed = tab === "carteira" && Boolean(lead.phone);
    const localEnrichmentStatus = aiStatusMap[lead.id];
    const hasLocalEnrichmentStatus = Boolean(localEnrichmentStatus && localEnrichmentStatus.state !== "none");
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
        enriching={hasLocalEnrichmentStatus ? false : enriching}
        onClose={opts?.onClose}
        crownSlot={<RadarAiBadge status={localEnrichmentStatus} />}
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
            {/* "Ver mais" abre a página cheia /leads/[id] — SÓ pra lead já POSSUÍDO
                (regra dura do plano: card ainda não puxado nunca vê a página cheia,
                fica no aside mascarado + CTA Puxar, que é exatamente o que já
                acontece acima quando tab==="shelf"). revealed usa o mesmo critério
                de buildNegocioDetail (tab==="carteira" && Boolean(phone)). */}
            {revealed && (
              <button className="btn-ghost" onClick={() => router.push(`/leads/${encodeURIComponent(lead.id)}`)}>
                Ver mais →
              </button>
            )}
          </div>
        }
      />
    );
  }

  function toggleRequiredChannel(channel: RadarRequiredChannel) {
    markFiltersDirty();
    setRequiredChannels(previous =>
      previous.includes(channel)
        ? previous.filter(current => current !== channel)
        : [...previous, channel],
    );
  }

  // Somente parâmetros existentes nos DTOs de listagem e execução do Radar.
  // O território já está imediatamente acima e não é repetido aqui.
  function renderAdvancedFilters() {
    const chips = activeChips();
    return (
      <div className="be-adv-stack">
        <section className="be-adv-section">
          <div className="be-adv-section__head">
            <div>
              <span className="be-adv-section__eyebrow">Contato</span>
              <h3>Canais obrigatórios</h3>
              <p>Selecione somente o que precisa existir no resultado.</p>
            </div>
          </div>
          <div className="be-adv-channel-grid" role="group" aria-label="Canais obrigatórios">
            {CHANNEL_META.map(channel => {
              const selected = requiredChannels.includes(channel.key);
              return (
                <button
                  key={channel.key}
                  type="button"
                  className={"be-adv-channel" + (selected ? " be-adv-channel--active" : "")}
                  onClick={() => toggleRequiredChannel(channel.key)}
                  aria-pressed={selected}
                >
                  <span className="be-adv-channel__icon"><I d={channel.icon} size={17} /></span>
                  <span>
                    <strong>{channel.label}</strong>
                    <small>{channel.description}</small>
                  </span>
                  <span className="be-adv-channel__check" aria-hidden>{selected ? "✓" : ""}</span>
                </button>
              );
            })}
          </div>
          {requiredChannels.length > 1 && (
            <div className="be-adv-match" role="group" aria-label="Regra entre canais">
              <span>Quando houver vários canais:</span>
              <button
                type="button"
                className={channelMatchMode === "all_required" ? "active" : ""}
                onClick={() => { markFiltersDirty(); setChannelMatchMode("all_required"); }}
                aria-pressed={channelMatchMode === "all_required"}
              >
                exigir todos
              </button>
              <button
                type="button"
                className={channelMatchMode === "any_required" ? "active" : ""}
                onClick={() => { markFiltersDirty(); setChannelMatchMode("any_required"); }}
                aria-pressed={channelMatchMode === "any_required"}
              >
                aceitar qualquer um
              </button>
            </div>
          )}
        </section>

        <section className="be-adv-section">
          <div className="be-adv-section__head">
            <div>
              <span className="be-adv-section__eyebrow">Reputação</span>
              <h3>Sinais mínimos</h3>
              <p>Refinam a vitrine durante e depois da busca, sem criar novas execuções.</p>
            </div>
          </div>
          <div className="be-adv-reputation">
            <label className="f" htmlFor="radar-min-rating">
              <span>Nota mínima</span>
              <select
                id="radar-min-rating"
                className="select-dark"
                value={minRating}
                onChange={event => { markFiltersDirty(); setMinRating(event.target.value); }}
              >
                <option value="">Qualquer nota</option>
                <option value="3.5">3,5 ou mais</option>
                <option value="4">4,0 ou mais</option>
                <option value="4.5">4,5 ou mais</option>
              </select>
            </label>
            <label className="f" htmlFor="radar-min-reviews">
              <span>Avaliações mínimas</span>
              <select
                id="radar-min-reviews"
                className="select-dark"
                value={minReviews}
                onChange={event => { markFiltersDirty(); setMinReviews(event.target.value); }}
              >
                <option value="">Qualquer volume</option>
                <option value="5">5 ou mais</option>
                <option value="10">10 ou mais</option>
                <option value="25">25 ou mais</option>
                <option value="50">50 ou mais</option>
                <option value="100">100 ou mais</option>
              </select>
            </label>
          </div>
        </section>

        {chips.length > 0 && (
          <div className="be-adv-active">
            <span className="be-adv-active__label">Ativos nesta busca</span>
            <div className="be-adv-active__chips">
              {chips.map(chip => (
                <span key={chip.key} className="be-chip-active">
                  {chip.label}
                  <button type="button" onClick={chip.onRemove} aria-label={`Remover filtro ${chip.label}`}>
                    <I d={ICONS.x} size={11} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="be-adv-searches" ref={savedMenuRef}>
          <div className="be-adv-searches__head">
            <div className="be-adv-searches__copy">
              <strong>Pesquisas salvas</strong>
              <span>Guarde ou reaplique um recorte sem ocupar a barra principal.</span>
            </div>
            <div className="be-adv-searches__actions">
              <button
                type="button"
                className="btn-ghost btn-xs"
                onClick={openSaveModal}
                disabled={!segment.trim() || !canSaveCurrentFilter}
                title={!canSaveCurrentFilter
                  ? geoMode === "nearby"
                    ? "Perto de mim depende da sua posição atual e não pode ser salvo."
                    : "Pesquisas salvas aceitam um único alvo territorial."
                  : undefined}
              >
                Salvar atual
              </button>
              <button
                type="button"
                className="btn-ghost btn-xs"
                onClick={() => setSavedBar(v => !v)}
                aria-expanded={savedBar}
              >
                Minhas pesquisas{savedSearches.length > 0 ? ` (${savedSearches.length})` : ""} <I d={ICONS.chevronDown} size={13} />
              </button>
            </div>
          </div>

          {savedBar && (
            <div className="be-adv-searches__panel">
              {savedSearches.length === 0 ? (
                <p className="radar-saved__empty">Nenhuma pesquisa salva ainda. Monte o recorte e clique em &quot;Salvar atual&quot;.</p>
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
                        <I d={ICONS.x} size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        {savedMsg && <p className="be-adv-message" aria-live="polite">{savedMsg}</p>}
      </div>
    );
  }

  // Chips dos filtros avançados. Território e segmento ficam sempre visíveis.
  type ActiveChip = { key: string; label: string; onRemove: () => void };
  function activeChips(): ActiveChip[] {
    const chips: ActiveChip[] = [];
    for (const channel of requiredChannels) {
      chips.push({
        key: `channel-${channel}`,
        label: CANAL_LABEL_PT[channel] || channel,
        onRemove: () => toggleRequiredChannel(channel),
      });
    }
    if (minRating) {
      chips.push({
        key: "rating",
        label: `Nota ${Number(minRating).toLocaleString("pt-BR", { minimumFractionDigits: 1 })}+`,
        onRemove: () => { markFiltersDirty(); setMinRating(""); },
      });
    }
    if (minReviews) {
      chips.push({
        key: "reviews",
        label: `${fmtInt(Number(minReviews))}+ avaliações`,
        onRemove: () => { markFiltersDirty(); setMinReviews(""); },
      });
    }
    return chips;
  }

  // ── Barra de comando: uma linha no desktop, com somente o que é necessário
  // para executar a busca — segmento, UF/cidade e Buscar. Todo o restante
  // fica atrás de Avançado.
  function renderCommandBar() {
    const targetLimit = geoMode === "radius" || geoMode === "nearby" ? 1 : MAX_CITY_TARGETS;
    const hasAnyFilter = Boolean(
      segment.trim() ||
      uf.trim() ||
      cities.length ||
      alcance ||
      ddd ||
      advancedCount,
    );
    return (
      <div className="be-cmdbar be-cmdbar--required" data-tut="leads-filtros">
        <div className="be-search be-required-segment" data-tut="leads-busca-criativa" ref={segBoxRef}>
          <I d={ICONS.search} size={16} />
          <input
            className="be-search__input"
            placeholder="Segmento ou tipo de empresa"
            value={segment}
            disabled={searchInProgress}
            onChange={e => {
              markFiltersDirty();
              setSegment(e.target.value);
              if (segOptions.length) setSegMenuOpen(true);
            }}
            onKeyDown={e => {
              if (e.key === "Enter" && canSearch && !searchInProgress) { setSegMenuOpen(false); executarBusca(); }
              else if (e.key === "ArrowDown" && segOptions.length) { setSegMenuOpen(true); }
            }}
            role="combobox"
            aria-label="Segmento obrigatório"
            aria-required="true"
            aria-expanded={segMenuOpen}
            aria-controls="rc-seg-menu"
            aria-autocomplete="list"
          />
          <button
            type="button"
            className={"be-search__chevron" + (segMenuOpen ? " be-search__chevron--open" : "")}
            onClick={() => setSegMenuOpen(o => !o)}
            disabled={searchInProgress}
            aria-label={segMenuOpen ? "Fechar lista de segmentos" : "Abrir lista de segmentos"}
            tabIndex={-1}
          >
            <I d={ICONS.chevronDown} size={16} />
          </button>
          {segMenuOpen && (
            <div className="be-search__menu" id="rc-seg-menu" role="listbox">
              {segOptions.length === 0 ? (
                <div className="be-search__opt be-search__opt--empty" aria-disabled>
                  Digite pra buscar
                </div>
              ) : (
                [...segOptions]
                  .sort((a, b) => {
                    const q = segment.trim().toLowerCase();
                    if (!q) return 0;
                    const am = a.label.toLowerCase().includes(q) ? 0 : 1;
                    const bm = b.label.toLowerCase().includes(q) ? 0 : 1;
                    return am - bm;
                  })
                  .map(o => {
                    const q = segment.trim().toLowerCase();
                    const match = q.length > 0 && o.label.toLowerCase().includes(q);
                    const selected = o.label === segment;
                    return (
                      <button
                        key={o.value}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={
                          "be-search__opt"
                          + (match ? " be-search__opt--match" : "")
                          + (selected ? " be-search__opt--active" : "")
                        }
                        onClick={() => { markFiltersDirty(); setSegment(o.label); setSegMenuOpen(false); }}
                      >
                        <span>{o.label}</span>
                        {typeof o.count === "number" && (
                          <span className="be-search__opt-count">{o.count}</span>
                        )}
                      </button>
                    );
                  })
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          ref={citiesTriggerRef}
          className={"be-required-location be-geo-trigger" + (geoTargets.length > 0 ? " be-geo-trigger--ready" : "")}
          onClick={() => {
            setCitiesQuery("");
            setCitiesLimitMsg(null);
            setAdvancedInlineOpen(false);
            setCitiesModalOpen(true);
          }}
          disabled={searchInProgress}
          aria-haspopup="dialog"
          aria-label={`Filtros geográficos: ${geoSummary}`}
          title="Editar filtros geográficos"
        >
          <span className="be-geo-trigger__icon"><I d={geoModeInfo.icon} size={17} /></span>
          <span className="be-geo-trigger__copy">
            {geoModeInfo.eyebrow && <small>{geoModeInfo.eyebrow}</small>}
            <strong>{geoSummary}</strong>
          </span>
          <span className="be-geo-trigger__limit">
            {geoTargets.length}/{targetLimit}
          </span>
          <span className="be-geo-trigger__chevron">
            <I d={ICONS.chevronDown} size={15} />
          </span>
        </button>

        <button
          type="button"
          className="btn-ghost btn-xs be-cmdbar__advanced be-cmdbar__clear"
          onClick={limparFiltros}
          disabled={!hasAnyFilter || searchInProgress}
          title="Limpar toda a busca"
        >
          <I d={ICONS.x} size={13} /> Limpar
        </button>

        {/* REFUNDAÇÃO F2: freio do trabalho — o Radar pausa sozinho depois de N leads
            e espera o vendedor (Continuar retoma do ponto). 0 = corrida completa. */}
        <label className="be-cmdbar__pause" title="Pausa automática: o Radar para depois de N leads e espera você continuar">
          <span>Pausa a cada</span>
          <select
            value={pauseAfter}
            onChange={e => setPauseAfter(e.target.value)}
            disabled={searchInProgress}
            aria-label="Pausa automática após quantos leads"
          >
            <option value="0">Sem pausa</option>
            <option value="25">25 leads</option>
            <option value="50">50 leads</option>
            <option value="100">100 leads</option>
          </select>
        </label>

        {searchInProgress ? (
          <span className="be-cmdbar__runctl">
            {sessionActive && (sessionPaused ? (
              <button
                className="btn-teal be-cmdbar__go"
                onClick={continuarBusca}
                title="Retomar a busca de onde parou"
              >
                <span aria-hidden>▶</span> Continuar
              </button>
            ) : (
              <button
                className="btn-ghost be-cmdbar__go"
                onClick={pausarBusca}
                title="Pausar a busca — o Radar guarda o ponto e espera você"
              >
                <span aria-hidden>❚❚</span> Pausar
              </button>
            ))}
            <button className="btn-ghost be-cmdbar__go" onClick={pararBusca} disabled={stopRequested}>
              <span aria-hidden>◼</span>
              {stopRequested ? "Parando…" : searchQueue ? `Parar ${searchQueue.current}/${searchQueue.total}` : "Parar"}
            </button>
          </span>
        ) : (
          <button
            className="btn-teal be-cmdbar__go"
            data-tut="leads-buscar"
            onClick={() => executarBusca()}
            disabled={!canSearch}
            title={!canSearch ? "Defina o segmento e um território válido" : undefined}
          >
            Buscar
          </button>
        )}

        <button
          type="button"
          className="btn-ghost btn-xs be-cmdbar__advanced"
          data-tut="leads-filtro-avancado"
          onClick={() => {
            setCitiesQuery("");
            setCitiesLimitMsg(null);
            setAdvancedInlineOpen(true);
            setCitiesModalOpen(true);
          }}
          disabled={searchInProgress}
          title="Canais, reputação e pesquisas salvas"
        >
          <I d={ICONS.filter} size={13} /> Avançado
          {advancedCount > 0 && <span className="be-cmdbar__advanced-count">{advancedCount}</span>}
        </button>
      </div>
    );
  }

  // ── Radar console: o disco + controles quando nenhum lead está selecionado ──
  function renderRadarConsole(mini: boolean) {
    if (mini) {
      return (
        <div className="radar-mini-bar">
          <div style={{ flexShrink: 0, width: 56, height: 56 }}>
            <RadarDisc mini state={discState} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="radar-mini-bar__title">Radar HBX</div>
            <div className="radar-mini-bar__sub">{localLabel || "Território não definido"}{segment ? ` · ${segment}` : ""}</div>
          </div>
          <button className="btn-ghost btn-xs radar-mini-bar__back" onClick={() => setSelLead(null)} style={{ marginLeft: "auto" }}>
            ← Voltar
          </button>
        </div>
      );
    }

    // Viewer enxuto: um estado, uma frase curta e somente os chips do recorte.
    // O histórico continua na área de resultados; o Radar não repete a narrativa.
    const activeSummary = [
      segment.trim(),
      localLabel,
      ...activeChips().map(chip => chip.label),
    ].filter(Boolean);
    // A mensagem da SESSÃO (server-side) vence a do run — é ela que explica o
    // trabalho inteiro ("cidade 3 de 8", "pausa automática após 50 leads"...).
    const radarBackendMessage = session?.message || run?.meta?.operationalMessage || run?.message || "";
    const radarTitle = radarState === "funcionando"
      ? "Radar funcionando"
      : radarState === "pausado"
        ? "Radar pausado"
        : radarState === "erro"
          ? "Erro no radar"
          : "Radar parado";
    const radarStatus = radarState === "funcionando"
      ? searchQueue
        ? `${searchQueue.current} de ${searchQueue.total} · ${searchQueue.label}${runProgress != null ? ` · ${runProgress}%` : ""}`
        : radarBackendMessage || `Preparando ${localLabel || "sua região"}…`
      : radarState === "pausado"
        ? radarBackendMessage || (sessionPaused
          ? "Busca pausada — o ponto está guardado. Aperte Continuar quando quiser."
          : "A busca está pausada e será retomada automaticamente.")
        : radarState === "erro"
          ? searchMsg || radarBackendMessage || "Não foi possível concluir a busca. Você pode iniciar novamente."
          : radarBackendMessage
            || (hasSearched
              ? (items.length > 0
                ? `${fmtInt(items.length)} empresa${items.length === 1 ? " encontrada" : "s encontradas"}`
                : "A busca foi encerrada. Ajuste os filtros e inicie novamente.")
              : canSearch
                ? "Tudo pronto. Inicie quando quiser."
                : "Preencha os filtros para iniciar.");

    return (
      <div className="radar-console radar-showoff radar-viewer" data-radar-state={radarState}>
        <div className="radar-hero" role="status" aria-live="polite">
          <span className="radar-hero__state" aria-label={`Status do Radar: ${RADAR_STATE_LABEL[radarState]}`}>
            <i aria-hidden="true" />
            {RADAR_STATE_LABEL[radarState]}
          </span>
          <div className="radar-hero__disc" aria-hidden="true">
            <RadarDisc state={discState} />
          </div>
          <div className="radar-hero__copy">
            <span className="radar-hero__eyebrow">Radar HBX</span>
            <h2 className="radar-hero__title">{radarTitle}</h2>
            <p className="radar-viewer__status">{radarStatus}</p>
          </div>
        </div>

        {activeSummary.length > 0 && (
          <div className="radar-showoff__chips radar-viewer__chips">
            {activeSummary.map((text, index) => <span key={index} className="radar-showoff__chip">{text}</span>)}
          </div>
        )}

        {!searchInProgress && hasSearched && items.length === 0 && searchMsg && (
          <p className="radar-viewer__feedback">{searchMsg}</p>
        )}
      </div>
    );
  }

  // Origem do lead na lista: badge de quem DESCOBRIU (sourceChain) + chip de quem
  // só ENRIQUECEU. Card antigo sem esses campos → devolve null (renderiza idêntico a hoje).
  function renderOriginBadge(row: RadarLead) {
    const ob = originBadge(row.sourceChain);
    const hasEnriched = Boolean(row.enrichedBy && row.enrichedBy.length);
    const inclusionReasons = Array.isArray(row.inclusionReasons) ? row.inclusionReasons.filter(Boolean) : [];
    const hasInclusionReasons = inclusionReasons.length > 0;
    if (!ob && !hasEnriched && !hasInclusionReasons) return null;
    return (
      <div className="radar-origin">
        {ob && <span className={`radar-origin-badge ${ob.cls}`}>{ob.label}</span>}
        {hasEnriched && (
          <span className="radar-origin-enriched">enriquecido: {row.enrichedBy!.join(", ")}</span>
        )}
        {hasInclusionReasons && (
          <span
            className="radar-origin-enriched"
            title={`Por que entrou: ${inclusionReasons.map(inclusionReasonLabel).join("; ")}`}
          >
            por que entrou
          </span>
        )}
      </div>
    );
  }

  // ── Lista densa (LEADS-FINAL/02): linhas de --row-height, default desktop —
  // MESMO items, MESMAS funções de dado da grade de cards (renderOriginBadge/
  // contatoMascarado/puxar/toggleSel) — só a moldura muda. "Ver mais" navega
  // pra /leads/[id] SÓ quando o lead já está POSSUÍDO (revealed) — regra dura
  // do plano: card ainda não puxado nunca vê a página cheia, o clique na linha
  // (setSelLead) já abre o aside mascarado + CTA "Puxar", que é o caminho certo.
  function renderRowsDense() {
    return (
      <div className="tbl-wrap row-dense-list-wrap">
        {items.length === 0 ? (
          <div className="radar2-empty">{emptyMsg}</div>
        ) : (
          <div className="row-dense-list">
            <div className="row-dense-list__head" aria-hidden="true">
              <span>Empresa</span>
              <span>Cidade/UF</span>
              <span>Contato</span>
              <span style={{ textAlign: "center" }}>Score</span>
              <span>Status</span>
              <span />
            </div>
            {items.map(row => {
              const isSel = selLead?.id === row.id;
              const checked = selected.has(row.id);
              const revealed = tab === "carteira" && Boolean(row.phone);
              return (
                // Linha é um wrapper clicável, mas carrega botões reais de ação
                // (Puxar/Ver mais/WhatsApp) — <button> não pode conter <button>
                // (hydration error). div+role="button" preserva semântica/teclado
                // sem aninhar. 07/07.
                <div
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  className={"row-dense" + (isSel ? " row-dense--sel" : "")}
                  onClick={() => setSelLead(isSel ? null : row)}
                  onKeyDown={e => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelLead(isSel ? null : row);
                    }
                  }}
                >
                  <span className="row-dense__id">
                    {tab === "shelf" && (
                      <label className="row-dense__pick" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSel(row.id)}
                          aria-label={`Selecionar ${row.name || "lead"}`}
                        />
                      </label>
                    )}
                    <Av name={row.name || "—"} size={30} />
                    <span className="row-dense__id-body">
                      <span className="row-dense__name">{row.name || "—"}</span>
                      <span className="row-dense__seg">{row.segment || row.businessCategory || "—"}</span>
                      {renderOriginBadge(row)}
                    </span>
                  </span>
                  <span className="row-dense__loc">
                    {row.city ? `${row.city}${row.state ? "/" + row.state : ""}` : "Brasil"}
                  </span>
                  <span className="row-dense__contact">
                    {tab === "shelf" ? contatoMascarado(row) : <span>{row.phone || row.email || "—"}</span>}
                  </span>
                  <span className="row-dense__temp">
                    {row.opportunityScore != null && row.opportunityScore > 0 ? (
                      <span className={"score-ring" + (row.opportunityScore >= 60 ? " hi" : " mid")} style={{ width: 26, height: 26, fontSize: "0.6rem" }}>
                        {row.opportunityScore}
                      </span>
                    ) : "—"}
                  </span>
                  <span className="row-dense__owner">
                    <RadarAiBadge status={aiStatusMap[row.id]} />
                    {(!aiStatusMap[row.id] || aiStatusMap[row.id]?.state === "none") && "—"}
                  </span>
                  <span className="row-dense__actions" onClick={e => e.stopPropagation()}>
                    {revealed && (
                      <button
                        type="button"
                        className="btn-ghost btn-xs"
                        title="Abrir WhatsApp"
                        onClick={() => abrirWhatsAppInterno({ phone: row.phone, name: row.name })}
                      >
                        <I d={ICONS.msg} size={13} />
                      </button>
                    )}
                    {tab === "shelf" ? (
                      <button
                        type="button"
                        className="btn-teal btn-xs"
                        onClick={() => puxar(row.id)}
                        disabled={pullBusyId === row.id || bulkBusy || meterBlocked}
                      >
                        {pullBusyId === row.id ? "Puxando…" : "Puxar"}
                      </button>
                    ) : null}
                    {revealed && (
                      <button
                        type="button"
                        className="btn-ghost btn-xs"
                        title="Ver mais"
                        onClick={() => router.push(`/leads/${encodeURIComponent(row.id)}`)}
                      >
                        Ver mais
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
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
            <span>Total no Brasil:</span>
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
            {/* Área principal da lista */}
            <div className="radar2-main">
              {/* Embutido no Vendas (casca única): título "Pipeline de pesquisa" DENTRO
                  do painel — mesmo tratamento do "Pipeline de vendas" do funil. 29/06. */}
              {embedded && embedTitle && (
                <div className="panel-head leads-embed-head">
                  <h2>{embedTitle}</h2>
                </div>
              )}
              {/* Barra de comando horizontal — os filtros saíram do aside paredão pra cá. */}
              {renderCommandBar()}
              {/* Segunda linha operacional: ações em massa à esquerda/direita e o modo
                  de visualização centralizado. O rodapé de ações sai de baixo da lista,
                  liberando a altura dos resultados até a paginação. */}
              <div className="leads-headrow leads-headrow--toolbar">
                <div className="leads-headrow__start">
                  {!embedded && (
                    <div className="tabs" data-tut="leads-abas">
                      <button className={"tab" + (tab === "shelf" ? " active" : "")} onClick={() => switchTab("shelf")}>
                        Disponíveis <span className="n">{counts.shelf == null ? "—" : fmtInt(counts.shelf)}</span>
                      </button>
                      <button
                        className={"tab" + (tab === "carteira" ? " active" : "")}
                        onClick={() => switchTab("carteira")}
                      >
                        Minha carteira <span className="n">{counts.carteira == null ? "—" : fmtInt(counts.carteira)}</span>
                      </button>
                    </div>
                  )}
                  {tab === "shelf" && (
                    <button
                      type="button"
                      className="btn-ghost btn-xs leads-bulk-select"
                      disabled={items.length === 0}
                      aria-pressed={items.length > 0 && selected.size === items.length}
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
                  )}
                </div>

                <div className="leads-headrow__center">
                  <div className="glass-pill-track leads-viewtoggle" role="group" aria-label="Modo de exibição da lista">
                    <GlassPill {...viewPill} />
                    <button
                      type="button"
                      ref={viewPill.itemRef("linhas")}
                      className={"glass-pill-item leads-viewtoggle__item" + (viewMode === "linhas" ? " active" : "")}
                      onClick={() => setViewMode("linhas")}
                      aria-pressed={viewMode === "linhas"}
                      title="Ver em linhas (denso)"
                    >
                      <I d={ICONS.list} size={14} /> Linhas
                    </button>
                    <button
                      type="button"
                      ref={viewPill.itemRef("cards")}
                      className={"glass-pill-item leads-viewtoggle__item" + (viewMode === "cards" ? " active" : "")}
                      onClick={() => setViewMode("cards")}
                      aria-pressed={viewMode === "cards"}
                      title="Ver em cards"
                    >
                      <I d={ICONS.grid} size={14} /> Cards
                    </button>
                  </div>
                </div>

                <div className="leads-headrow__end">
                  {tab === "shelf" && (
                    <>
                      {hasHistory && (
                        <button
                          type="button"
                          className="btn-ghost btn-xs leads-history-clear"
                          onClick={() => { setHistoryHidden(true); setSelected(new Set()); setSelLead(null); }}
                          title="Remover o histórico exibido"
                        >
                          <I d={ICONS.x} size={13} /> Excluir histórico
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-teal radar2-pull-btn leads-bulk-pull"
                        data-tut="leads-puxar"
                        onClick={puxarSelecionados}
                        disabled={selected.size === 0 || meterBlocked || bulkBusy}
                      >
                        {bulkBusy ? "Puxando…" : `Puxar selecionados${selected.size ? ` (${selected.size})` : ""}`}
                      </button>
                    </>
                  )}
                </div>
              </div>
              {hasHistory && <div className="leads-history-note">Histórico recente</div>}
              {/* Progresso REAL de uma busca em andamento (não é o radar decorativo
                  narrando estado — é feedback de uma operação assíncrona de verdade).
                  O texto de IDLE "Em pausa — volta sozinho" saiu daqui (item 2). */}
              {searchInProgress && !stopRequested && (
                <div className={`radar2-live radar2-live--${radarState === "pausado" ? "pausado" : "funcionando"}`}>
                  <span className="dot" />
                  {radarState === "pausado"
                    ? run?.meta?.operationalMessage || "Radar pausado"
                    : searchQueue
                      ? `Fila ${searchQueue.current}/${searchQueue.total} · ${searchQueue.label}`
                      : `Preparando ${localLabel || "território"}`}
                  {" · "}{fmtInt(runVisibleCount)} achados{runProgress != null ? ` · ${runProgress}%` : ""}
                  {radarState === "funcionando" && " · mantenha esta tela aberta"}
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

              {/* Linhas densas (default) ou grade de cards — MESMO items, MESMO
                  modelo/normalização (buildNegocioDetail/renderOriginBadge/
                  contatoMascarado); só a moldura muda por viewMode. */}
              {viewMode === "linhas" ? renderRowsDense() : (
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
                              <RadarAiBadge status={aiStatusMap[row.id]} />

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
                                    : tab === "carteira"
                                      ? <button className="btn-ghost btn-xs" onClick={() => router.push("/vendas")}>Abrir</button>
                                      : null}
                                </div>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </div>
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

      </div>

      {/* Aside lateral com 2 estados */}
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

      {/* Território inteligente: a UI nunca autoriza mais de cinco cidades e
          deixa explícito quando haverá fila de execuções. */}
      {citiesModalOpen && (() => {
        const q = normCity(citiesQuery);
        const filtered = q ? cityOptions.filter(option => normCity(option.label).includes(q)) : cityOptions;
        const selectedOptions = cities.map(label => ({ value: label, label }));
        const visibleOptions = q
          ? filtered
          : mergeFilterOptions(selectedOptions, filtered);
        const selectionLimit = geoMode === "radius" || geoMode === "nearby" ? 1 : MAX_CITY_TARGETS;
        const showCityPicker = geoMode !== "nearby" && (geoMode !== "ddd" || dddOptions.length > 0);
        const territoryReady = geoTargets.length > 0
          && (geoMode !== "ddd" || VALID_DDDS.has(ddd))
          && (!(geoMode === "radius" || geoMode === "nearby") || Number(alcance) > 0)
          && (geoMode !== "nearby" || Boolean(geo));
        return (
          <div className="hbx-veil" onClick={closeCitiesModal}>
            <div
              ref={citiesModalRef}
              className="hbx-modal be-cities-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Filtros da busca"
              onClick={e => e.stopPropagation()}
            >
              <div className="be-cities">
                <div className="be-cities__head">
                  <span className="be-cities__eyebrow">Radar HBX</span>
                  <button type="button" className="be-cities__x" aria-label="Fechar" onClick={closeCitiesModal}>
                    <I d={ICONS.x} size={16} />
                  </button>
                </div>

                <div className="glass-pill-track be-geo-modes" role="group" aria-label="Formato do território">
                  <GlassPill {...geoModePill} />
                  {GEO_MODE_META.map(mode => (
                    <button
                      key={mode.key}
                      type="button"
                      ref={geoModePill.itemRef(mode.key)}
                      aria-pressed={geoMode === mode.key}
                      className={"glass-pill-item be-geo-mode" + (geoMode === mode.key ? " active" : "")}
                      onClick={() => selectGeoMode(mode.key)}
                    >
                      <I d={mode.icon} size={16} />
                      <span>
                        <strong>{mode.label}</strong>
                        {mode.eyebrow && <small>{mode.eyebrow}</small>}
                      </span>
                    </button>
                  ))}
                </div>

                <GeoModeTransition mode={geoMode} direction={geoModeDirection}>
                  {(geoModeInfo.eyebrow || geoModeInfo.description) && (
                    <div className="be-geo-mode-note">
                      <span className="be-geo-mode-note__icon"><I d={geoModeInfo.icon} size={17} /></span>
                      <span>
                        {geoModeInfo.eyebrow && <strong>{geoModeInfo.eyebrow}</strong>}
                        {geoModeInfo.description && <small>{geoModeInfo.description}</small>}
                      </span>
                    </div>
                  )}

                  {geoMode === "ddd" ? (
                    <div className="be-geo-ddd">
                      <div className="be-geo-ddd__field">
                        <label htmlFor="be-ddd-input">DDD brasileiro</label>
                        <div className="be-geo-ddd__control">
                          <span className="be-geo-ddd__prefix">(</span>
                          <input
                            id="be-ddd-input"
                            data-geo-autofocus
                            value={ddd}
                            inputMode="numeric"
                            maxLength={2}
                            disabled={dddBusy}
                            placeholder="11"
                            onChange={event => {
                              markFiltersDirty();
                              setDdd(event.target.value.replace(/\D/g, "").slice(0, 2));
                              setDddOptions([]);
                              setCities([]);
                              setUf("");
                              setDddError(null);
                            }}
                            onKeyDown={event => {
                              if (event.key === "Enter" && !dddBusy) void consultarDdd();
                            }}
                            autoFocus
                          />
                          <span className="be-geo-ddd__suffix">)</span>
                          <button
                            type="button"
                            className="btn-teal"
                            onClick={() => void consultarDdd()}
                            disabled={dddBusy || ddd.length !== 2}
                          >
                            {dddBusy ? "Consultando…" : "Consultar DDD"}
                          </button>
                        </div>
                      </div>
                      {dddError && <p className="be-geo-error" role="alert">{dddError}</p>}
                      {dddOptions.length > 0 && (
                        <p className="be-geo-ddd__result">
                          <strong>DDD {ddd}</strong> · {uf} · {dddOptions.length} cidades encontradas
                        </p>
                      )}
                    </div>
                  ) : geoMode === "nearby" ? (
                    <div className={"be-geo-nearby" + (geoTargets.length > 0 ? " be-geo-nearby--ready" : "")}>
                      <span className="be-geo-nearby__pulse"><I d={ICONS.mapin} size={21} /></span>
                      <span className="be-geo-nearby__copy">
                        <strong>{geoTargets.length > 0 ? `${geoTargets[0].city}/${geoTargets[0].state}` : "Use sua localização atual"}</strong>
                        <small>
                          {geo
                            ? "Transformamos sua posição em uma cidade-base para o Radar."
                            : "Ative a localização no topo do HBX para liberar este modo."}
                        </small>
                      </span>
                      <button
                        type="button"
                        className="btn-ghost"
                        data-geo-autofocus
                        onClick={() => void pullGeoLocation()}
                        disabled={!geo || geoBusy}
                      >
                        {geoBusy ? "Localizando…" : geoTargets.length > 0 ? "Atualizar" : "Usar localização"}
                      </button>
                    </div>
                  ) : (
                    <div className="be-geo-fields">
                      <label className="f" htmlFor="be-geo-uf">
                        <span>Estado</span>
                        <select
                          id="be-geo-uf"
                          className="select-dark"
                          value={uf}
                          onChange={event => {
                            markFiltersDirty();
                            setUf(event.target.value);
                            setCities([]);
                            setCitiesQuery("");
                            setCitiesLimitMsg(null);
                          }}
                        >
                          <option value="">Escolha a UF</option>
                          {ufOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </label>
                      <label className="f" htmlFor="be-geo-city-search">
                        <span>Buscar cidade</span>
                        <div className="be-cities__search">
                          <I d={ICONS.search} size={15} />
                          <input
                            id="be-geo-city-search"
                            data-geo-autofocus
                            value={citiesQuery}
                            onChange={event => setCitiesQuery(event.target.value)}
                            placeholder={uf ? "Digite o nome da cidade" : "Escolha a UF primeiro"}
                            disabled={!uf}
                            autoFocus
                          />
                        </div>
                      </label>
                    </div>
                  )}

                  {showCityPicker && (
                    <div className="be-geo-picker">
                      {geoMode === "ddd" && (
                        <div className="be-cities__search">
                          <I d={ICONS.search} size={15} />
                          <input
                            value={citiesQuery}
                            onChange={event => setCitiesQuery(event.target.value)}
                            aria-label="Buscar cidade dentro do DDD"
                          />
                        </div>
                      )}
                      <div className="be-cities__toolbar">
                        <span className="be-cities__selcount">
                          {cities.length}/{selectionLimit} selecionada{cities.length === 1 ? "" : "s"}
                        </span>
                        <span className="be-cities__visible-count">
                          {q
                            ? `${visibleOptions.length} resultado${visibleOptions.length === 1 ? "" : "s"}`
                            : `${cityOptions.length} cidades`}
                        </span>
                      </div>
                      <div className="be-cities__list" role="group" aria-label="Cidades disponíveis">
                        {cityOptions.length === 0 ? (
                          <div className="be-cities__empty">
                            {geoMode === "ddd" ? "Consulte um DDD para ver as cidades." : "Escolha um estado para ver as cidades."}
                          </div>
                        ) : filtered.length === 0 ? (
                          <div className="be-cities__empty">Nenhuma cidade encontrada.</div>
                        ) : (
                          visibleOptions.map(option => {
                            const on = cities.includes(option.label);
                            const disabled = !on && cities.length >= selectionLimit;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                aria-pressed={on}
                                disabled={disabled}
                                className={"be-cities__opt" + (on ? " is-on" : "")}
                                onClick={() => toggleCity(option.label)}
                              >
                                <span className="be-cities__check" aria-hidden="true">{on && <I d={ICONS.check} size={13} />}</span>
                                <span className="be-cities__opt-label">{option.label}</span>
                                {on && <span className="be-cities__opt-state">{uf}</span>}
                              </button>
                            );
                          })
                        )}
                      </div>
                      {citiesLimitMsg && <p className="be-geo-limit-message" aria-live="polite">{citiesLimitMsg}</p>}
                    </div>
                  )}

                  {(geoMode === "radius" || geoMode === "nearby") && (
                    <div className="be-geo-radius">
                      <div className="be-geo-radius__head">
                        <span>
                          <strong>Raio da região</strong>
                          <small>Uma única execução, a partir da cidade-base.</small>
                        </span>
                        <strong>{alcance || "—"} km</strong>
                      </div>
                      <div className="be-geo-radius__options" role="group" aria-label="Raio da região">
                        {[25, 50, 100, 250].map(radius => (
                          <button
                            key={radius}
                            type="button"
                            className={alcance === String(radius) ? "active" : ""}
                            onClick={() => { markFiltersDirty(); setAlcance(String(radius)); }}
                            aria-pressed={alcance === String(radius)}
                          >
                            {radius} km
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className={"be-geo-plan" + (territoryReady ? " be-geo-plan--ready" : "")}>
                    <div className="be-geo-plan__targets">
                      {geoTargets.length === 0 ? (
                        <span className="be-geo-plan__empty">Nenhum alvo definido.</span>
                      ) : geoTargets.map((target, index) => (
                        <span key={`${target.state}-${target.city}`} className="be-geo-target">
                          <b>{index + 1}</b>
                          {target.city}/{target.state}
                          {geoMode !== "nearby" && (
                            <button type="button" onClick={() => toggleCity(target.city)} aria-label={`Remover ${target.city}`}>
                              <I d={ICONS.x} size={10} />
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                </GeoModeTransition>

                <div className={"be-geo-advanced" + (advancedInlineOpen ? " is-open" : "")}>
                  <button
                    type="button"
                    className="be-geo-advanced__toggle"
                    data-advanced-autofocus={advancedInlineOpen ? "" : undefined}
                    onClick={() => setAdvancedInlineOpen(open => !open)}
                    aria-expanded={advancedInlineOpen}
                    aria-controls="be-geo-advanced-content"
                  >
                    <span className="be-geo-advanced__icon"><I d={ICONS.filter} size={15} /></span>
                    <strong>Avançado</strong>
                    {advancedCount > 0 && <span className="be-geo-advanced__count">{advancedCount}</span>}
                    <span className="be-geo-advanced__chevron"><I d={ICONS.chevronDown} size={14} /></span>
                  </button>
                  {advancedInlineOpen && (
                    <div id="be-geo-advanced-content" className="be-geo-advanced__body">
                      {renderAdvancedFilters()}
                    </div>
                  )}
                </div>

                <div className="be-cities__foot">
                  <span className="be-cities__autosave">A seleção é aplicada na hora.</span>
                  <button type="button" className="btn-ghost" onClick={() => { markFiltersDirty(); setCities([]); }} disabled={cities.length === 0}>
                    Limpar alvos
                  </button>
                  <button type="button" className="btn-teal" onClick={closeCitiesModal} disabled={!territoryReady}>
                    Concluir
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* WORM-15: Modal "Salvar filtro" — nome + (admin) atribuir a vendedor */}
      {saveModalOpen && (
        <div className="hbx-veil" onClick={() => setSaveModalOpen(false)}>
          <div className="hbx-modal" style={{ width: "min(420px, 92vw)" }} onClick={e => e.stopPropagation()}>
            <div className="radar-save-modal">
              <h3>Salvar pesquisa</h3>
              <p className="radar-save-modal__desc">
                {describeFiltro(buildFiltroSnapshot({
                  uf,
                  city,
                  segment,
                  alcance,
                  geoMode,
                  ddd,
                  minRating,
                  minReviews,
                  requiredChannels,
                  channelMatchMode,
                }))}
              </p>
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
    </div>
  );
}
