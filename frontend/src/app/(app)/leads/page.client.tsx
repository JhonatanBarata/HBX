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
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Av, I, ICONS, WhatsAppMark } from "@/components/hbx/shell";
import { CanalIcon } from "@/components/hbx/canal-icon";
import { DetalhesNegocio, type NegocioDetail } from "@/components/hbx/detalhes-negocio";
import { BotStatusIcon } from "@/components/hbx/bot-action";
import { GlassPill, useGlassPill } from "@/components/hbx/glass-pill";
import { RadarAiBadge } from "@/components/hbx/radar-ai-badge";
import { RadarDisc } from "@/components/hbx/radar-disc";
import {
  FILTRO_AVANCADO_VAZIO,
  FiltroAvancadoModal,
  type CnpjBaseQueryInput,
  type FiltroAvancadoState,
} from "@/components/hbx/filtro-avancado-modal";
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
// Pool máximo por busca = 100, exibido em 4 páginas de 25 ("1 de 4"). Regra do dono 23/07.
const SHELF_LIMIT = 25;
const SEARCH_BATCH = 100;

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

function getStoredFilters(): { uf: string; cities: string[]; segment: string; alcance: string; quantos: number } {
  if (typeof window === "undefined") return { uf: "", cities: [], segment: "", alcance: "", quantos: 5 };
  try {
    const s = localStorage.getItem("hbx:leads-filters");
    if (s) {
      const p = JSON.parse(s) as Record<string, unknown>;
      // Migração: formato antigo guardava `city` (string única) → vira array de 1.
      const cities = Array.isArray(p.cities)
        ? p.cities.filter((c): c is string => typeof c === "string" && c.trim().length > 0)
        : (typeof p.city === "string" && p.city.trim() ? [p.city] : []);
      return {
        uf: typeof p.uf === "string" ? p.uf : "",
        cities,
        segment: typeof p.segment === "string" ? p.segment : "",
        alcance: typeof p.alcance === "string" ? p.alcance : "",
        quantos: typeof p.quantos === "number" && p.quantos > 0 ? p.quantos : 5,
      };
    }
  } catch { /* sem storage */ }
  return { uf: "", cities: [], segment: "", alcance: "", quantos: 5 };
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

export function LeadsClient({ embedded = false, onLeadPulled, onEmbedStats, embedTitle }: { embedded?: boolean; onLeadPulled?: (focus?: boolean) => void; onEmbedStats?: (s: { totalBrasil: number | null; disponiveis: number | null; cotaLabel: string; cotaValue: string; cotaPct: number }) => void; embedTitle?: ReactNode } = {}) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>(getStoredViewMode);
  const viewPill = useGlassPill<HTMLButtonElement>(viewMode);
  useEffect(() => {
    try { localStorage.setItem("hbx:leads-view-mode", viewMode); } catch { /* sem storage */ }
  }, [viewMode]);

  // Filtro avançado (item 3b — popup ressuscitado do commit revertido): consulta
  // a base Receita (28M) via cnpj-base/query só como PRÉVIA; "Aplicar" traduz o
  // subconjunto compatível (UF/cidade/CNAE-ou-palavra/WhatsApp) pros filtros que
  // o Pipeline de pesquisa já usa (uf/city/segment/zapFiltro), sem trocar a lista.
  const [advOpen, setAdvOpen] = useState(false);
  const [advDraft, setAdvDraft] = useState<FiltroAvancadoState>(FILTRO_AVANCADO_VAZIO);

  // filtros (lago → prateleira) — persiste em localStorage. INICIALIZADOR
  // ESTÁTICO (não ler localStorage aqui): o inicializador roda no SSR e no 1º
  // render do cliente; se o servidor devolve "" e o cliente lê o filtro salvo,
  // os <select> value= divergem → hydration React 418. O valor salvo entra só
  // PÓS-montagem (efeito de restauração abaixo), mesmo padrão SSR-safe já usado
  // no geoState do Topbar e no collapsed do ActivationChecklist.
  const [uf, setUf] = useState("");
  // MULTI-CIDADE (23/07): a busca aceita VÁRIAS cidades do MESMO UF. `cities` é a
  // fonte da verdade; `city` derivada = primeira, mantida só p/ leituras single-city
  // (persistência/geo/pesquisa salva antiga). Painel seletivo abre em modal central.
  const [cities, setCities] = useState<string[]>([]);
  const city = cities[0] || "";
  const [citiesModalOpen, setCitiesModalOpen] = useState(false);
  const [citiesQuery, setCitiesQuery] = useState("");
  const [segment, setSegment] = useState("");
  const [alcance, setAlcance] = useState("");
  const [quantos, setQuantos] = useState(5);
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

  // Filtro estilo CNPJ Biz sobre a base (VENDAS-REFAB S4, 04/07): tem-site e
  // tem-WhatsApp provável. Tri-estado (qualquer/sim/não) — mapeia direto pros
  // params que o GET /webscraping/radar/leads já aceita (noWebsite/withWebsite/
  // likelyWhatsapp). Substituiu "Canais exigidos" (removido — não existe na
  // nova regra lista+web).
  const [siteFiltro, setSiteFiltro] = useState<"qualquer" | "com" | "sem">("qualquer");
  const [zapFiltro, setZapFiltro] = useState<"qualquer" | "com">("qualquer");

  // Contagem grátis da gaveta (LEADS-FINAL/03): Estado/Cidade/Tem WhatsApp
  // viram recorte real da base Receita (states/cities/contato.comCelular) —
  // sem isto a prévia da gaveta ficaria muda pro que o usuário vê no topo.
  // "Tem site" fica de fora de propósito: a base RFB não tem coluna de site
  // (é dado de scraping web) — não finge que filtra o que não pode filtrar,
  // mesma honestidade do resto do popup (ver camposSoPreviaAtivos no modal).
  // Memo estabiliza a referência (o preview do modal reage a mudança de
  // objeto) — só recalcula quando Estado/Cidade/WhatsApp realmente mudam.
  const advExtraQueryInput = useMemo<Partial<CnpjBaseQueryInput>>(() => {
    const extra: Partial<CnpjBaseQueryInput> = {};
    if (uf) extra.states = [uf];
    if (cities.length) extra.cities = cities;
    if (zapFiltro === "com") extra.contato = { comCelular: true };
    return extra;
  }, [uf, cities, zapFiltro]);

  // Combobox próprio do segmento (05/07) — o <datalist> nativo do Chrome só
  // mostrava, pela seta, o que casa com o texto já digitado. Aqui a seta abre a
  // lista INTEIRA sempre; digitar só prioriza (matches no topo/realçados).
  const [segMenuOpen, setSegMenuOpen] = useState(false);
  const segBoxRef = useRef<HTMLDivElement | null>(null);

  // "Minhas pesquisas" mora dentro da gaveta Avançado. Mantém ref + click-fora/
  // Escape e reusa o mesmo estado do antigo popover da barra.
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

  async function pullGeoLocation() {
    if (!geo || geoBusy) return;
    markFiltersDirty();
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
          const ufCities = BRAZIL_CITIES_BY_UF[resolvedUf] || [];
          const match = ufCities.find(c => normCity(c) === normCity(cityRaw));
          setCities([match || cityRaw]);
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
    if (which === "shelf" && alcance) params.set("radiusKm", alcance);
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
          setLiveRunItems(Array.isArray(res.items) ? res.items : []);
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
    // Não persistir antes de restaurar: no mount os filtros nascem vazios
    // (defaults estáticos SSR-safe) — gravar aqui apagaria o que estava salvo.
    if (!filtersRestored.current) return;
    try { localStorage.setItem("hbx:leads-filters", JSON.stringify({ uf, cities, segment, alcance, quantos })); } catch { /* sem storage */ }
  }, [uf, cities, segment, alcance, quantos]);

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
      setUf(f.uf); setCities(f.cities); setSegment(f.segment); setAlcance(f.alcance); setQuantos(f.quantos);
    });
    return () => { cancelled = true; cancelAnimationFrame(id); };
  }, []);

  // Filtros não consultam o Radar automaticamente. A busca filtrada só começa
  // depois de uma ação explícita no botão Buscar.

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
        setLiveRunItems(Array.isArray(res?.items) ? res.items : []);
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

  function markFiltersDirty() {
    setHasSearched(false);
    setLiveRunItems(null);
    setSearchMsg(null);
    setSelected(new Set());
    setSelLead(null);
  }

  // Liga/desliga uma cidade na seleção múltipla (painel central). markFiltersDirty
  // zera o resultado anterior — mudar o recorte não pode mostrar leads de outro.
  function toggleCity(label: string) {
    markFiltersDirty();
    setCities(prev => prev.includes(label) ? prev.filter(c => c !== label) : [...prev, label]);
  }

  function limparFiltros() {
    setUf("");
    setCities([]);
    setCitiesQuery("");
    setCitiesModalOpen(false);
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
    setHasSearched(false);
    setLiveRunItems(null);
    try { localStorage.removeItem("hbx:leads-filters"); } catch { /* sem storage */ }
  }

  // Item 3b: "Aplicar filtro" do popup avançado — traduz o subconjunto compatível
  // (UF/cidade/CNAE-ou-palavra-chave/WhatsApp) pros filtros que o Pipeline de
  // pesquisa já entende. Campos só-RFB (capital, idade, sócio…) não têm onde
  // aterrissar no Pipeline hoje (RadarLeadPool não guarda essas colunas) — o
  // popup já avisa isso na prévia, então aqui só aplicamos o que é real.
  function aplicarFiltroAvancado(f: FiltroAvancadoState) {
    setAdvOpen(false);
    if (f.states[0]) setUf(f.states[0]);
    if (f.cities.length) setCities(f.cities.filter(c => c.trim()));
    const seg = f.cnaes[0] || f.keyword.trim();
    if (seg) setSegment(seg);
    if (f.comCelular === true) setZapFiltro("com");
    setPage(1);
    setSelected(new Set());
    setTab("shelf");
    setHasSearched(false);
    setLiveRunItems(null);
    setSearchMsg(null);
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
    setCities(nextCity ? [nextCity] : []);
    setSegment(nextSeg);
    setAlcance(nextAlc);
    setQuantos(nextQtd);
    setPage(1);
    setTab("shelf");
    setSavedBar(false);
    setSavedMsg(`Pesquisa "${s.nome}" aplicada.`);
    setHasSearched(false);
    setLiveRunItems(null);
    setSearchMsg(null);
    setSelected(new Set());
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
  const runVisibleCount = liveRunItems?.length ?? run?.meta?.deliveredCount ?? 0;

  // Estado visual do disco (23/07 — reativa a leitura de estado do radar por
  // cor): pesquisando AGORA = funcionando; motor pausado (não-terminal) =
  // pausado; qualquer outra coisa (ocioso/pronto/concluído) = parado.
  const discState: "funcionando" | "pausado" | "parado" =
    runActive ? "funcionando" : opState === "pausado" ? "pausado" : "parado";

  // P4: valida campos e abre popup se faltando — usado em 3 gatilhos
  function validarCamposOuPopup(effSegment?: string): boolean {
    const segToCheck = effSegment != null ? effSegment : segment;
    const faltando: string[] = [];
    if (!segToCheck.trim()) faltando.push("Segmento");
    if (!uf.trim()) faltando.push("Estado");
    if (!cities.length) faltando.push("Cidade");
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
    setHasSearched(true);
    setHistoryHidden(false);
    setSearchMsg(null);
    setLoadError(null);
    setLiveRunItems([]);
    setData(prev => prev ? { ...prev, items: [], total: 0 } : prev);
    setRunBusy(true);
    try {
      // MULTI-CIDADE (23/07): o backend processa 1 cidade por run. Aqui a busca
      // dispara UM run por cidade selecionada (sequencial), acumulando os leads
      // ao vivo; o poll acompanha o ÚLTIMO run e os leads das demais cidades
      // caem na prateleira/pool quando a busca encerra. `cities` sempre tem ≥1
      // item aqui (validado acima). Sem cidade explícita, cai no fluxo antigo.
      const alvos = cities.length ? cities : [city];
      let lastRun: RunResponse = null;
      const acumulado: RadarLead[] = [];
      let primeiroErro: string | null = null;
      let primeiraMsg: string | null = null;
      for (const alvo of alvos) {
        // P1/P8a: inclui quantity no body (DTO exige; antes ficava de fora → 400).
        // Lote fixo (SEARCH_BATCH) — o usuário não escolhe mais "quantos" (removido).
        const body: Record<string, unknown> = { city: alvo, state: uf || undefined, segment: effSegment, quantity: SEARCH_BATCH };
        if (effRadius > 0) body.radiusKm = effRadius;
        if (geo) { body.originLat = geo.lat; body.originLng = geo.lng; }
        // Filtro estilo CNPJ Biz (mesmo DTO do GET /radar/leads — RadarPullDto estende
        // RadarDatabaseQueryDto): reflete tem-site/tem-WhatsApp na busca ao vivo também.
        if (siteFiltro === "com") body.withWebsite = true;
        if (siteFiltro === "sem") body.noWebsite = true;
        if (zapFiltro === "com") body.likelyWhatsapp = true;
        try {
          const res = await apiFetch<RunResponse>("/webscraping/radar/search-runs", {
            method: "POST",
            body: JSON.stringify(body),
          });
          lastRun = res;
          if (Array.isArray(res?.items)) acumulado.push(...res.items);
          if (res?.message && !primeiraMsg) primeiraMsg = res.message;
        } catch (err) {
          if (!primeiroErro) primeiroErro = err instanceof Error ? err.message : "Não consegui iniciar a busca.";
          // Cota/erro numa cidade não deve abortar as demais — segue o loop.
        }
      }
      // Reflete a expansão nos filtros visíveis (sem mexer quando é busca normal).
      if (override?.segment != null) setSegment(effSegment);
      if (override?.radiusKm != null) setAlcance(String(override.radiusKm));
      setRun(lastRun);
      setLiveRunItems(acumulado);
      setTab("shelf");
      setPage(1);
      setSelected(new Set());
      if (primeiroErro && !lastRun) { setLiveRunItems(null); setSearchMsg(primeiroErro); }
      else if (primeiraMsg) setSearchMsg(primeiraMsg);
    } catch (err) {
      setLiveRunItems(null);
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
      setLiveRunItems(Array.isArray(res?.items) ? res.items : []);
      void loadList("shelf", { page: 1 }).finally(() => setLiveRunItems(null));
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

  const showingLiveRun = tab === "shelf" && liveRunItems !== null;
  const historyItems = data?.items || [];
  const hideHistory = tab === "shelf" && !hasSearched && historyHidden;
  const items = showingLiveRun ? (liveRunItems ?? []) : (hideHistory ? [] : historyItems);
  const hasHistory = tab === "shelf" && !hasSearched && !historyHidden && historyItems.length > 0;

  const aiStatusMap = useRadarAiStatusPoll(items.map(row => row.id), {
    onTerminal: (radarLeadId) => { void refreshRadarLead(radarLeadId); },
  });

  const limit = data?.meta?.limit || pageSize;
  const filters = data?.meta?.availableFilters;
  const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, "pt-BR");
  const segOptions = (filters?.segments || []).sort(byLabel);
  const ufOptions = mergeFilterOptions(filters?.states, BRAZIL_UF_OPTIONS).sort(byLabel);
  const cityOptions = uf
    ? mergeBrazilCityOptions(uf, filters?.citiesByState?.[uf]).sort(byLabel)
    : [];
  const canSearch = Boolean(segment.trim() && uf.trim() && cities.length > 0);
  // Rótulo amigável do recorte de cidades pros textos ao vivo (1 cidade = nome; várias = "N cidades").
  const localLabel = cities.length === 0 ? "" : cities.length === 1 ? cities[0] : `${cities.length} cidades`;

  const pageTotal = showingLiveRun ? (liveRunItems?.length ?? 0) : (hideHistory ? 0 : (data?.total || 0));
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
    : runActive && tab === "shelf"
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
    });
  }, [onEmbedStats, totalBrasilReal, counts.shelf, meterLabel, meterValue, meterPct]);

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

  // ── Filtros opcionais: os dois campos obrigatórios (segmento + cidade) ficam
  // na barra principal. Alcance, canais, pesquisas salvas e filtros da Receita
  // vivem somente na gaveta Avançado.
  function renderQuickFilters() {
    const chips = activeChips();
    return (
      <>
        <div className="be-adv-grid2">
          <div className="f">
            <label htmlFor="cb-alcance">Alcance</label>
            <select id="cb-alcance" className="select-dark" value={alcance} disabled={!city.trim()} onChange={e => { markFiltersDirty(); setAlcance(e.target.value); }}>
              <option value="">Só a cidade</option>
              <option value="25">+ 25 km</option>
              <option value="50">+ 50 km</option>
              <option value="100">+ 100 km</option>
            </select>
          </div>
          <div className="f">
            <label>Localização atual</label>
            {geo ? (
              <button
                type="button"
                className="btn-ghost btn-xs"
                onClick={pullGeoLocation}
                disabled={geoBusy}
              >
                <I d={ICONS.mapin} size={14} /> {geoBusy ? "Atualizando…" : "Usar minha localização"}
              </button>
            ) : (
              <p className="hint be-adv-location-hint">Ative a localização no topo do sistema para usar como alternativa à cidade.</p>
            )}
          </div>
        </div>

        <div className="be-adv-grid2">
          <div className="f">
            <label><I d={ICONS.website} size={13} /> Tem site</label>
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
                  onClick={() => { markFiltersDirty(); setSiteFiltro(opt.key); }}
                  aria-pressed={siteFiltro === opt.key}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="f">
            <label><WhatsAppMark size={13} /> Tem WhatsApp</label>
            <div role="group" aria-label="Filtrar por WhatsApp" className="radar-canais__tristate">
              {([
                { key: "qualquer", label: "Qualquer" },
                { key: "com", label: "Com" },
              ] as const).map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  className={"radar-canais__switch" + (zapFiltro === opt.key ? " radar-canais__switch--on" : "")}
                  onClick={() => { markFiltersDirty(); setZapFiltro(opt.key); }}
                  aria-pressed={zapFiltro === opt.key}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {chips.length > 0 && (
          <div className="be-adv-active">
            <span className="be-adv-active__label">Filtros opcionais ativos</span>
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
                disabled={!segment.trim() && !city.trim() && !uf.trim()}
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
                        onClick={() => { applySavedSearch(s); setAdvOpen(false); }}
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

        <button
          type="button"
          className="btn-ghost btn-xs be-adv-clear"
          onClick={() => { setAdvDraft(FILTRO_AVANCADO_VAZIO); limparFiltros(); }}
        >
          <I d={ICONS.x} size={13} /> Limpar busca
        </button>
      </>
    );
  }

  // Chips dos filtros opcionais. Cidade/UF e segmento não viram chips porque
  // agora são os campos obrigatórios, sempre visíveis e editáveis na linha principal.
  type ActiveChip = { key: string; label: string; onRemove: () => void };
  function activeChips(): ActiveChip[] {
    const chips: ActiveChip[] = [];
    if (alcance) chips.push({ key: "alcance", label: `+ ${alcance} km`, onRemove: () => { markFiltersDirty(); setAlcance(""); } });
    if (siteFiltro !== "qualquer") chips.push({ key: "site", label: siteFiltro === "com" ? "Com site" : "Sem site", onRemove: () => { markFiltersDirty(); setSiteFiltro("qualquer"); } });
    if (zapFiltro !== "qualquer") chips.push({ key: "zap", label: "Com WhatsApp", onRemove: () => { markFiltersDirty(); setZapFiltro("qualquer"); } });
    return chips;
  }

  // ── Barra de comando: uma linha no desktop, com somente o que é necessário
  // para executar a busca — segmento, UF/cidade e Buscar. Todo o restante
  // fica atrás de Avançado.
  function renderCommandBar() {
    const optionalCount = activeChips().length;
    return (
      <div className="be-cmdbar be-cmdbar--required" data-tut="leads-filtros">
        <div className="be-search be-required-segment" data-tut="leads-busca-criativa" ref={segBoxRef}>
          <I d={ICONS.search} size={16} />
          <input
            className="be-search__input"
            placeholder="Segmento ou tipo de empresa"
            value={segment}
            onChange={e => {
              markFiltersDirty();
              setSegment(e.target.value);
              if (segOptions.length) setSegMenuOpen(true);
            }}
            onKeyDown={e => {
              if (e.key === "Enter" && canSearch && !runBusy && !runActive) { setSegMenuOpen(false); executarBusca(); }
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

        <div
          className="be-required-location"
          aria-label="Localização obrigatória da busca"
          title="Escolha UF e cidade"
        >
          <select
            id="cb-uf-inline"
            value={uf}
            onChange={e => {
              markFiltersDirty();
              setCities([]);
              setAlcance("");
              setUf(e.target.value);
            }}
            aria-label="Estado"
            aria-required="true"
          >
            <option value="">UF</option>
            {ufOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button
            type="button"
            id="cb-city-inline"
            className="be-cities-trigger"
            disabled={!uf.trim()}
            onClick={() => { setCitiesQuery(""); setCitiesModalOpen(true); }}
            aria-haspopup="dialog"
            aria-label="Cidades da busca (selecione uma ou várias)"
            title={!uf.trim() ? "Escolha o estado primeiro" : "Selecione uma ou várias cidades"}
          >
            <span className="be-cities-trigger__label">
              {cities.length === 0 ? "Cidade" : cities.length === 1 ? cities[0] : `${cities.length} cidades`}
            </span>
            <I d={ICONS.chevronDown} size={15} />
          </button>
        </div>

        <button
          type="button"
          className="btn-ghost btn-xs be-cmdbar__advanced be-cmdbar__clear"
          onClick={() => { setAdvDraft(FILTRO_AVANCADO_VAZIO); limparFiltros(); }}
          disabled={!segment.trim() && !uf.trim() && cities.length === 0 && !alcance && siteFiltro === "qualquer" && zapFiltro === "qualquer"}
          title="Limpar segmento, estado, cidades e filtros"
        >
          <I d={ICONS.x} size={13} /> Limpar
        </button>

        {runActive ? (
          <button className="btn-ghost be-cmdbar__go" onClick={pararBusca}>◼ Parar</button>
        ) : (
          <button
            className="btn-teal be-cmdbar__go"
            data-tut="leads-buscar"
            onClick={() => executarBusca()}
            disabled={runBusy || !canSearch}
            title={!canSearch ? "Selecione segmento, estado e cidade" : undefined}
          >
            {runBusy ? "Iniciando…" : "Buscar"}
          </button>
        )}

        <button
          type="button"
          className="btn-ghost btn-xs be-cmdbar__advanced"
          data-tut="leads-filtro-avancado"
          onClick={() => setAdvOpen(true)}
          title="Alcance, site, WhatsApp, dados da Receita e pesquisas salvas"
        >
          <I d={ICONS.filter} size={13} /> Avançado
          {optionalCount > 0 && <span className="be-cmdbar__advanced-count">{optionalCount}</span>}
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
            <div className="radar-mini-bar__sub">{[localLabel, uf].filter(Boolean).join(" · ") || "Todo o Brasil"}{segment ? ` · ${segment}` : ""}</div>
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
      [localLabel, uf].filter(Boolean).join(" · "),
      alcance ? `+ ${alcance} km` : "",
      siteFiltro === "com" ? "Com site" : siteFiltro === "sem" ? "Sem site" : "",
      zapFiltro === "com" ? "Com WhatsApp" : "",
    ].filter(Boolean);
    const radarTitle = runActive
      ? "Buscando empresas"
      : hasSearched
        ? (items.length > 0 ? "Busca concluída" : "Nenhuma empresa encontrada")
        : "Radar pronto";
    const radarStatus = runActive
      ? `Mapeando ${localLabel || "sua região"}${runProgress != null ? ` · ${runProgress}%` : "…"}`
      : hasSearched
        ? (items.length > 0
          ? `${fmtInt(items.length)} empresa${items.length === 1 ? " encontrada" : "s encontradas"}`
          : "Tente outra cidade ou segmento.")
        : canSearch
          ? "Tudo pronto para buscar."
          : "Preencha os filtros para começar.";

    return (
      <div className="radar-console radar-showoff radar-viewer">
        <div className="radar-hero">
          <div className="radar-hero__disc">
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

        {!runActive && hasSearched && items.length === 0 && searchMsg && (
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
              {runActive && (
                <div className="radar2-live radar2-live--funcionando">
                  <span className="dot" /> Varrendo {localLabel || "…"} · {fmtInt(runVisibleCount)} achados{runProgress != null ? ` · ${runProgress}%` : ""}
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

      {/* Gaveta "Filtro" (LEADS-FINAL/03, 06/07): Onde buscar (Estado/Cidade/
          Alcance/site/WhatsApp — quickSlot) + todas as colunas reais do RFB
          (CONTRATO-FILTRO.md), prévia ao vivo contra a base 28M. */}
      {advOpen && (
        <FiltroAvancadoModal
          draft={advDraft}
          onChange={setAdvDraft}
          onClose={() => setAdvOpen(false)}
          onApply={aplicarFiltroAvancado}
          quickSlot={renderQuickFilters()}
          extraQueryInput={advExtraQueryInput}
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

      {/* MULTI-CIDADE (23/07): painel central seletivo. Pop-up centralizado pela
          classe (.hbx-veil/.hbx-modal) — Lei nº2. Lista as cidades do UF escolhido;
          o usuário marca quantas quiser e a busca roda o segmento em cada uma. */}
      {citiesModalOpen && (() => {
        const q = citiesQuery.trim().toLowerCase();
        const filtered = q ? cityOptions.filter(o => o.label.toLowerCase().includes(q)) : cityOptions;
        const filteredLabels = filtered.map(o => o.label);
        const allFilteredOn = filteredLabels.length > 0 && filteredLabels.every(l => cities.includes(l));
        return (
          <div className="hbx-veil" onClick={() => setCitiesModalOpen(false)}>
            <div className="hbx-modal be-cities-modal" style={{ width: "min(560px, 94vw)" }} onClick={e => e.stopPropagation()}>
              <div className="be-cities">
                <div className="be-cities__head">
                  <h3>Cidades{uf ? ` — ${uf}` : ""}</h3>
                  <button type="button" className="be-cities__x" aria-label="Fechar" onClick={() => setCitiesModalOpen(false)}>
                    <I d={ICONS.x} size={16} />
                  </button>
                </div>
                <p className="be-cities__hint">Selecione quantas quiser — a busca roda o segmento em cada cidade marcada.</p>
                <div className="be-cities__search">
                  <I d={ICONS.search} size={15} />
                  <input
                    value={citiesQuery}
                    onChange={e => setCitiesQuery(e.target.value)}
                    placeholder="Filtrar cidade…"
                    aria-label="Filtrar cidade"
                    autoFocus
                  />
                </div>
                <div className="be-cities__toolbar">
                  <span className="be-cities__selcount">{cities.length} selecionada(s)</span>
                  <div className="be-cities__toolbar-actions">
                    <button
                      type="button"
                      className="btn-ghost btn-xs"
                      disabled={filteredLabels.length === 0}
                      onClick={() => {
                        markFiltersDirty();
                        if (allFilteredOn) setCities(prev => prev.filter(c => !filteredLabels.includes(c)));
                        else setCities(prev => Array.from(new Set([...prev, ...filteredLabels])));
                      }}
                    >
                      {allFilteredOn ? "Desmarcar" : "Selecionar"} {q ? "filtradas" : "todas"}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost btn-xs"
                      disabled={cities.length === 0}
                      onClick={() => { markFiltersDirty(); setCities([]); }}
                    >
                      Limpar seleção
                    </button>
                  </div>
                </div>
                <div className="be-cities__list" role="listbox" aria-multiselectable="true">
                  {cityOptions.length === 0 ? (
                    <div className="be-cities__empty">Escolha um estado para ver as cidades.</div>
                  ) : filtered.length === 0 ? (
                    <div className="be-cities__empty">Nenhuma cidade encontrada.</div>
                  ) : (
                    filtered.map(o => {
                      const on = cities.includes(o.label);
                      return (
                        <button
                          key={o.value}
                          type="button"
                          role="option"
                          aria-selected={on}
                          className={"be-cities__opt" + (on ? " is-on" : "")}
                          onClick={() => toggleCity(o.label)}
                        >
                          <span className="be-cities__check" aria-hidden="true">{on && <I d={ICONS.check} size={13} />}</span>
                          <span className="be-cities__opt-label">{o.label}</span>
                        </button>
                      );
                    })
                  )}
                </div>
                <div className="be-cities__foot">
                  <button type="button" className="btn-ghost" onClick={() => { markFiltersDirty(); setCities([]); }} disabled={cities.length === 0}>
                    Limpar
                  </button>
                  <button type="button" className="btn-teal" onClick={() => setCitiesModalOpen(false)}>
                    Pronto{cities.length ? ` (${cities.length})` : ""}
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
    </div>
  );
}
