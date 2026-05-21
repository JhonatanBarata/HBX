"use client";

import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type CSSProperties,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardScaffold from "@/components/DashboardScaffold";
import LiquidGlassCard, {
  liquidGlassCardStyles as glassCardStyles,
} from "@/components/LiquidGlassCard";
import HbxMobileDock from "@/components/mobile/HbxMobileDock";
import MobileLeadScoreGauge from "@/components/mobile/MobileLeadScoreGauge";
import { useQuickLaunchNotice } from "@/components/useQuickLaunchNotice";
import { apiFetch, getDashboardApiBaseUrl, getToken } from "@/app/_lib/api";
import { toMobileRoute } from "@/app/_lib/mobileRoutes";
import { startSmartPolling } from "@/app/_lib/polling";
import { useRequireModule } from "@/app/_lib/useRequireModule";
import { HBX_WINDOW_STANDARD } from "@/lib/hbx-window-system";
import {
  clearStoredRadarRun,
  isTerminalRadarRunStatus,
  readStoredRadarRun,
  saveStoredRadarRun,
  subscribeStoredRadarRun,
  type StoredRadarRun,
} from "@/lib/radar-active-run";
import {
  clearTopbarProgress,
  dispatchTopbarProgress,
} from "@/lib/topbar-progress";
import styles from "./page.module.css";

type LeadStatus = "novo" | "contato" | "retorno" | "qualificado" | "encerrado";
type LeadBlockKey = "today" | "overdue" | "scheduled" | "closed";
type DateFilterKey = "overdue" | "today" | `scheduled:${string}`;
type MobileAgendaTab = "overdue" | "today" | "upcoming";
type MobileVendasSection = "today" | "cards" | "report";
type WhatsappFilter = "all" | "with" | "without";
type InboxFilter = "all" | "in" | "out";
type MobileVisualChannelFilter = "whatsapp" | "instagram" | "email" | "site" | "phone" | "facebook";
type MobileReturnScheduler = {
  leadId: string;
  leadName: string;
  dateText: string;
  timeValue: string;
  monthKey: string;
};
type RadarSearchRunStatus =
  | "queued"
  | "running"
  | "sleeping"
  | "completed"
  | "partial_error"
  | "completed_insufficient_results"
  | "failed"
  | "canceled";
type RadarSearchRunResponse = {
  id: string;
  runId: string;
  status: RadarSearchRunStatus;
  targetQuantity: number;
  foundCount: number;
  message?: string | null;
  meta?: {
    requestedQuantity?: number;
    deliveredCount?: number;
    progress?: number;
    terminal?: boolean;
    autoImport?: {
      ran?: boolean;
      importedCount?: number;
      processedCount?: number;
      pendingCount?: number | null;
      remaining?: number | null;
      blocked?: boolean;
    } | null;
    filters?: {
      state?: string | null;
      city?: string | null;
      segment?: string | null;
      radiusKm?: number | null;
      regionalCities?: Array<{ city?: string | null; state?: string | null; distanceKm?: number | null }>;
      selectedSegments?: string[];
    };
  };
};

type LeadTimelineEventType =
  | "lead_created"
  | "origin_registered"
  | "contact_made"
  | "result_recorded"
  | "return_scheduled"
  | "status_changed"
  | "lead_closed"
  | "lead_reused"
  | "generic";

type LeadTimelineEvent = {
  id: string;
  eventType: LeadTimelineEventType;
  title: string;
  description?: string | null;
  sourceType?: string | null;
  statusFrom?: string | null;
  statusTo?: string | null;
  resultLabel?: string | null;
  returnAt?: string | null;
  createdAt?: string | null;
};

type SharedProfileSummary = {
  displayName?: string | null;
  phone?: string | null;
  origin?: string | null;
  lastContactAt?: string | null;
  currentContext?:
    | "vendas"
    | "atendimento"
    | "recovery"
    | "neutro"
    | string
    | null;
  presence?: {
    vendas?: { present?: boolean; status?: string | null };
    atendimento?: {
      present?: boolean;
      customerId?: string | null;
      conversationId?: string | number | null;
      lastContactAt?: string | null;
    };
    recovery?: {
      present?: boolean;
      status?: string | null;
      openAmount?: number | null;
    };
  };
};

type LeadMessageTemplate = {
  id: string;
  context: string;
  tone: string;
  text: string;
};

type LeadIntelligence = {
  email?: string | null;
  emailStatus?: "confirmed" | "probable" | "missing" | "unverified" | string;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  socialStatus?: "found" | "missing" | "weak" | "unknown" | string;
  socialConfidence?: number | null;
  primarySocial?: "instagram" | "facebook" | "both" | null;
  whatsappStatus?: "confirmed" | "missing" | "invalid" | "unverified" | string;
  contactQuality?: "ready" | "review" | "weak" | "blocked" | string;
  opportunityScore?: number | null;
  opportunityReason?: string | null;
  leadReasonTags?: string[];
  nextBestAction?: "whatsapp" | "call" | "email" | "review" | "discard" | string;
  lastVerifiedAt?: string | null;
  verifiedBy?: "hbx_master" | "client_engine" | "manual" | string | null;
  visibilityTier?: "candidate" | "list_basic" | "enrichment_pending" | "lead_plus_qualified" | "review_backup" | "blocked" | string | null;
  deliveryProduct?: "list" | "lead_plus" | string | null;
  debitEligible?: boolean | null;
  qualityReason?: string | null;
  enrichmentStatus?: "queued" | "processing" | "completed" | "failed" | string | null;
  enrichedAt?: string | null;
  cnpj?: string | null;
  messageTemplate?: LeadMessageTemplate | null;
  messageTemplates?: LeadMessageTemplate[];
  templateLibrarySize?: number;
  premiumTeaser?: {
    label?: string | null;
    cta?: string | null;
  } | null;
};

type VendasCapabilities = {
  canSeeLeadIntelligence?: boolean;
  canSeeOpportunityReason?: boolean;
  canSeeSocialLinks?: boolean | "teaser_only";
  canSeeMessageTemplates?: boolean;
  canUseAdvancedFilters?: boolean;
  canUseVerifiedWhatsapp?: boolean | "limited";
  canUseFilteredQuota?: boolean;
  canUseSalesProfileAdvanced?: boolean;
  canSeeConversionReport?: boolean;
  canExportConversionPdf?: boolean;
  canUseWeeklyProfileSuggestions?: boolean;
};

type SalesProfileDraft = {
  whatDoYouSell: string;
  offerCategory: string;
  targetAudience: string[];
  targetSegments: string[];
  avoidSegments: string[];
  preferredChannels: string[];
  weeklyAutoUpdateEnabled: boolean;
};

type SalesProfileResponse = {
  ok?: boolean;
  effectiveProfile?: {
    whatDoYouSell?: string | null;
    offerCategory?: string | null;
    targetAudience?: string[];
    targetSegments?: string[];
    avoidSegments?: string[];
    preferredChannels?: string[];
    weeklyAutoUpdateEnabled?: boolean;
  };
  source?: "user" | "company" | "default";
  capabilities?: VendasCapabilities;
};

type ConversionReportResponse = {
  ok?: boolean;
  capabilities?: VendasCapabilities;
  metrics?: {
    cardsRecebidos?: number | null;
    cardsChamados?: number | null;
    respostas?: number | null;
    interessados?: number | null;
    taxaResposta?: number | null;
    taxaConversao?: number | null;
    melhorSegmento?: string | null;
    melhorCidade?: string | null;
    melhorCanal?: string | null;
  };
  rankings?: {
    segments?: Array<{ label: string; count: number }>;
    cities?: Array<{ label: string; count: number }>;
    channels?: Array<{ label: string; count: number }>;
  };
  recommendation?: string;
};

type SalesProfileSuggestion = {
  diff?: string[];
};

type LeadItem = {
  id: string;
  sourceType: "manual" | "webscraping";
  primarySource?: string | null;
  sourceHistoryId?: string | null;
  timesSeen?: number;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  website?: string | null;
  rating?: number | null;
  reviews?: number | null;
  city?: string | null;
  segment?: string | null;
  status: LeadStatus;
  statusLabel: string;
  nextAction?: string | null;
  returnAt?: string | null;
  shortNote?: string | null;
  lastContactAt?: string | null;
  attemptCount?: number;
  lastResult?: string | null;
  wasClosedBefore?: boolean;
  updatedAt?: string | null;
  createdAt?: string | null;
  signals?: {
    alreadyExisted: boolean;
    cameFromWebscraping: boolean;
    hadPreviousContact: boolean;
    wasClosedBefore: boolean;
  };
  whatsappAvailability?: {
    status?: "unknown" | "available" | "unavailable";
    checkedAt?: string | null;
    message?: string | null;
  } | null;
  planTier?: "list" | "lead" | "full" | string;
  capabilities?: VendasCapabilities;
  leadIntelligence?: LeadIntelligence | null;
  isInInbox?: boolean;
  inboxConversationId?: string | number | null;
  atendimentoConversationId?: string | number | null;
  sharedProfile?: SharedProfileSummary | null;
  timeline?: LeadTimelineEvent[];
  quickActions: string[];
};

type BoardResponse = {
  summary: {
    total: number;
    today: number;
    overdue: number;
    scheduled: number;
    closed: number;
  };
  planTier?: "list" | "lead" | "full" | string;
  capabilities?: VendasCapabilities;
  blocks: Record<LeadBlockKey, LeadItem[]>;
};

type TodayAgendaSyncResponse = {
  ok?: boolean;
  todayLeadCount?: number;
  mirroredLeadCount?: number;
  conversationIds?: Array<string | number>;
  leadConversationIds?: Record<string, string | number>;
  activated?: number;
  updated?: number;
  deactivated?: number;
  skippedWithoutPhone?: number;
  skippedWithoutWhatsapp?: number;
  message?: string | null;
};

type BulkDeleteLeadsResponse = {
  ok?: boolean;
  deletedCount?: number;
};

type MobileBulkDeleteTarget = {
  tab: Extract<MobileAgendaTab, "overdue" | "today">;
  label: string;
  count: number;
  leadIds: string[];
};

type ReportLeadErrorResponse = {
  ok?: boolean;
  deletedCount?: number;
  autoSent?: boolean;
  whatsappUrl?: string | null;
  message?: string | null;
};

type LeadEnrichmentResponse = {
  ok?: boolean;
  leadId: string;
  planTier?: "list" | "lead" | "full" | string;
  capabilities?: VendasCapabilities;
  whatsappAvailability?: LeadItem["whatsappAvailability"];
  leadIntelligence?: LeadIntelligence | null;
};

type LeadDraft = {
  name: string;
  phone: string;
  email: string;
  status: LeadStatus;
  nextAction: string;
  returnAt: string;
  shortNote: string;
};

type MobileChannelAsset = "phone" | "whatsapp" | "instagram" | "facebook" | "email" | "site";

const MOBILE_VISUAL_FILTERS: Array<{ value: MobileVisualChannelFilter; label: string; asset: MobileChannelAsset }> = [
  { value: "whatsapp", label: "WhatsApp", asset: "whatsapp" },
  { value: "instagram", label: "Instagram", asset: "instagram" },
  { value: "email", label: "E-mail", asset: "email" },
  { value: "site", label: "Site", asset: "site" },
  { value: "phone", label: "Telefone", asset: "phone" },
  { value: "facebook", label: "Facebook", asset: "facebook" },
];

const MOBILE_CHANNEL_ASSETS: Record<MobileChannelAsset, { light: string; dark: string; label: string }> = {
  phone: {
    light: "/icons/hbx-channels/telefone.webp",
    dark: "/icons/hbx-channels/telefone_dark.webp",
    label: "Telefone",
  },
  whatsapp: {
    light: "/icons/hbx-channels/whatsapp.webp",
    dark: "/icons/hbx-channels/whatsapp_dark.webp",
    label: "WhatsApp",
  },
  instagram: {
    light: "/icons/hbx-channels/instagram.webp",
    dark: "/icons/hbx-channels/instagram_dark.webp",
    label: "Instagram",
  },
  facebook: {
    light: "/icons/hbx-channels/facebook.webp",
    dark: "/icons/hbx-channels/facebook_dark.webp",
    label: "Facebook",
  },
  email: {
    light: "/icons/hbx-channels/email.webp",
    dark: "/icons/hbx-channels/email_dark.webp",
    label: "E-mail",
  },
  site: {
    light: "/icons/hbx-channels/site_globe.webp",
    dark: "/icons/hbx-channels/site_globe_dark.webp",
    label: "Site",
  },
};

function MobileChannelIconAsset({ channel }: { channel: MobileChannelAsset }) {
  const asset = MOBILE_CHANNEL_ASSETS[channel];
  return (
    <>
      <img className={styles.mobileVendasChannelAssetLight} src={asset.light} alt="" aria-hidden="true" loading="lazy" />
      <img className={styles.mobileVendasChannelAssetDark} src={asset.dark} alt="" aria-hidden="true" loading="lazy" />
      <span className={styles.mobileVendasChannelSrOnly}>{asset.label}</span>
    </>
  );
}

function HeroPremiumCrown({ active }: { active: boolean }) {
  return (
    <Link
      href={toMobileRoute("/planos?intent=lead")}
      className={styles.mobileHeroPremiumCrown}
      data-active={active ? "true" : "false"}
      aria-label={active ? "Ver plano HBX Lead" : "Fazer upgrade para HBX Lead"}
      title={active ? "Ver plano HBX Lead" : "Upgrade para HBX Lead"}
    >
      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
        <path d="M4.2 18.5h15.6l.7-9.9-4.6 3.5L12 4.7 8.1 12.1 3.5 8.6l.7 9.9Z" />
        <path d="M5.2 20.2h13.6" />
        <circle cx="12" cy="4.7" r="1.25" />
        <circle cx="3.5" cy="8.6" r="1.15" />
        <circle cx="20.5" cy="8.6" r="1.15" />
      </svg>
    </Link>
  );
}

type DateFilterItem = {
  key: DateFilterKey;
  blockKey: Exclude<LeadBlockKey, "closed">;
  count: number;
  title: string;
  subtitle: string;
  dayLabel: string;
  isoDate?: string | null;
};

type LeadCardView = {
  lead: LeadItem;
  draft: LeadDraft;
  blockKey: LeadBlockKey;
  selected: boolean;
  saving: boolean;
  onFocus: () => void;
  onQuickAction: (action: string) => void;
  onInboxAction: (lead: LeadItem) => void;
  onEdit?: (id: string | null) => void;
  onDraftChange?: (leadId: string, patch: Partial<LeadDraft>) => void;
  onEditingActiveChange?: (active: boolean) => void;
  onSave?: (leadId: string) => void;
  editing?: boolean;
  bulkSelectionMode?: boolean;
  bulkSelected?: boolean;
  onBulkToggle?: (leadId: string) => void;
};

type FlyAnimation = {
  leadId: string;
  lead: LeadItem;
  draft: LeadDraft;
  blockKey: LeadBlockKey;
  from: { x: number; y: number; width: number; height: number };
  to: { x: number; y: number; width: number; height: number };
};

const STATUS_OPTIONS: Array<{ value: LeadStatus; label: string }> = [
  { value: "novo", label: "Novo lead" },
  { value: "contato", label: "Em contato" },
  { value: "retorno", label: "Retorno" },
  { value: "qualificado", label: "Qualificado" },
  { value: "encerrado", label: "Encerrado" },
];

const BLOCK_LABELS: Record<LeadBlockKey, string> = {
  overdue: "Atrasados",
  today: "Hoje",
  scheduled: "Programados",
  closed: "Encerrados",
};
const VENDAS_PROGRESS_STEPS = [
  "lendo banco",
  "filtrando negativos",
  "selecionando melhores cards",
  "alimentando Vendas/Prospecção",
];
const MOBILE_READY_MESSAGE_PREF_KEY = "hbx.vendas.mobile.readyMessagePreference.v1";
const MOBILE_PREFERRED_CALLER_NAME_KEY = "hbx.vendas.mobile.preferredCallerName.v1";
const MOBILE_OPEN_LEAD_KEY = "hbx.vendas.mobile.openLeadId.v1";
const SALES_PROFILE_DEFAULT_DRAFT: SalesProfileDraft = {
  whatDoYouSell: "Sistema/Software",
  offerCategory: "serviço comercial",
  targetAudience: ["empresas pequenas", "comércios locais"],
  targetSegments: ["clínicas", "oficinas", "restaurantes"],
  avoidSegments: ["empresa grande", "órgão público", "sem telefone", "diretório/lista genérica"],
  preferredChannels: ["whatsapp"],
  weeklyAutoUpdateEnabled: false,
};
const SALES_PROFILE_SELL_EXAMPLES = [
  "Plano de saúde",
  "Sistema/Software",
  "Serviços locais",
  "Consultoria",
  "Imobiliária",
  "Estética/beleza",
  "Outro",
];
const SALES_PROFILE_AUDIENCE_EXAMPLES = [
  "idosos",
  "famílias",
  "empresas pequenas",
  "comércios locais",
  "profissionais autônomos",
  "clínicas",
  "oficinas",
  "restaurantes",
  "salões",
];
const SALES_PROFILE_AVOID_EXAMPLES = [
  "empresa grande",
  "órgão público",
  "sem telefone",
  "sem WhatsApp",
  "diretório/lista genérica",
  "fora da cidade",
  "segmento errado",
];
const SALES_PROFILE_CHANNELS = ["whatsapp", "ligação", "e-mail", "instagram"];
const MOBILE_READY_MESSAGE_LIBRARY = [
  "Olá, tudo bem? Vi a {{company}} em {{city}} e queria te mostrar uma forma simples de organizar contatos, retornos e oportunidades sem depender de planilha.",
  "Oi, tudo bem? Notei que empresas de {{segment}} costumam perder retorno por falta de acompanhamento. Posso te mandar uma ideia rápida para resolver isso?",
  "Olá! Vi a {{company}} e achei que o HBX pode ajudar vocês a acompanhar interessados, lembretes e próximos contatos em um só lugar.",
  "Oi, tudo bem? Trabalho com uma solução para organizar prospecção e atendimento pelo WhatsApp. Faz sentido eu te explicar em 1 minuto?",
  "Olá! Posso te mostrar como deixar os contatos de {{segment}} mais organizados e com retorno automático no momento certo?",
  "Oi! Passei pelo perfil da {{company}} e vi espaço para melhorar acompanhamento de clientes. Posso te enviar uma explicação curta?",
  "Olá. O HBX ajuda empresas locais a não esquecerem retorno, orçamento e follow-up. Posso te mostrar como ficaria para {{segment}}?",
  "Oi, tudo bem? Se hoje vocês anotam contatos em WhatsApp, agenda ou planilha, tenho uma forma mais simples de centralizar isso. Posso mandar?",
  "Olá! Vi a {{company}} em {{city}}. Posso te mostrar uma ideia para transformar contatos soltos em uma fila clara de próximas ações?",
  "Oi. Ajudo empresas a organizar leads, retornos e atendimentos para vender com mais previsibilidade. Posso te explicar rapidamente?",
  "Olá! Tenho uma sugestão prática para melhorar o controle dos contatos que chegam pelo WhatsApp. Posso te enviar?",
  "Oi! A ideia é simples: cada contato vira um card com status, lembrete e próxima ação. Quer ver como isso pode funcionar para {{company}}?",
  "Olá. Vi que {{segment}} depende muito de retorno rápido. Posso te mostrar uma ferramenta para não deixar interessados esfriarem?",
  "Oi! O HBX organiza quem precisa ser chamado hoje, amanhã e depois. Posso te mandar um exemplo aplicado à {{company}}?",
  "Olá! Posso te mostrar uma forma de acompanhar orçamento, retorno e conversa sem perder histórico no WhatsApp?",
  "Oi. Trabalho com automação comercial para pequenas empresas. A proposta é ganhar controle sem complicar a rotina. Posso explicar?",
  "Olá! Se fizer sentido, te mostro como a {{company}} pode ter uma fila diária de contatos prioritários para chamar.",
  "Oi! Vi a {{company}} e pensei em uma melhoria simples: lembrar automaticamente quem precisa de retorno. Posso mandar a ideia?",
  "Olá. O HBX ajuda a separar contato novo, retorno e cliente interessado. Posso te mostrar como isso reduz esquecimentos?",
  "Oi, tudo bem? Tenho uma solução para organizar atendimento e prospecção em uma visão de app. Posso te mandar um resumo?",
  "Olá! Empresas de {{segment}} costumam ganhar muito quando cada conversa já nasce com próxima ação. Posso te mostrar?",
  "Oi! Posso te enviar uma ideia para acompanhar leads por prioridade, com WhatsApp, ligação e observação no mesmo lugar?",
  "Olá. Vi a {{company}} e queria sugerir um jeito de melhorar retorno comercial sem contratar mais gente agora.",
  "Oi, tudo bem? O objetivo é simples: menos contato perdido e mais follow-up no dia certo. Posso te explicar como?",
  "Olá! Se vocês recebem pedidos, dúvidas ou orçamentos pelo WhatsApp, o HBX pode organizar isso em cards. Posso mostrar?",
  "Oi. Posso te mandar um exemplo de fluxo para a {{company}} acompanhar contatos e oportunidades com mais clareza?",
  "Olá! Tenho uma ideia curta para transformar o WhatsApp em uma agenda comercial organizada. Faz sentido eu enviar?",
  "Oi! Vi a {{company}} em {{city}} e achei que vocês podem se beneficiar de uma rotina mais clara de retorno aos clientes.",
  "Olá. O HBX mostra o próximo contato certo e evita que leads fiquem esquecidos. Posso te mostrar a ideia?",
  "Oi, tudo bem? Posso te explicar como organizar clientes interessados por status, data de retorno e canal de contato?",
  "Olá! Trabalho com uma plataforma que ajuda empresas a venderem com mais organização no WhatsApp. Posso te mandar uma prévia?",
  "Oi. Se hoje vocês dependem de memória para retornar clientes, tenho uma solução simples para automatizar lembretes. Posso mostrar?",
  "Olá! Vi a {{company}} e pensei em uma forma de melhorar acompanhamento sem mudar o jeito que vocês atendem.",
  "Oi! Posso te mandar uma ideia rápida para organizar prospecção, contatos e retornos usando o HBX?",
  "Olá. Para {{segment}}, velocidade de retorno faz diferença. Posso te mostrar como priorizar quem chamar primeiro?",
  "Oi! O HBX ajuda a enxergar quem está quente, quem precisa de retorno e quem deve ser descartado. Quer ver?",
  "Olá! Tenho uma forma de deixar o comercial mais visual: cards, score, próxima ação e mensagem pronta. Posso enviar?",
  "Oi. Vi a {{company}} e queria te mostrar um jeito de reduzir retrabalho no acompanhamento dos contatos.",
  "Olá! Posso te mostrar como o HBX organiza WhatsApp, ligação e observações em uma rotina diária de vendas?",
  "Oi! A proposta é ajudar a {{company}} a não perder oportunidades por falta de follow-up. Posso te explicar?",
  "Olá. Se vocês fazem orçamento ou atendimento consultivo, o HBX pode lembrar cada próxima etapa. Posso mandar um resumo?",
  "Oi, tudo bem? Tenho uma ideia para deixar o retorno ao cliente mais rápido e rastreável. Posso compartilhar?",
  "Olá! Vi a {{company}} e achei que uma agenda comercial inteligente pode ajudar no dia a dia. Posso te mostrar?",
  "Oi. Posso te enviar uma explicação bem objetiva de como o HBX organiza leads e retornos para empresas locais?",
  "Olá! O HBX cria uma fila de ação para o time saber quem chamar agora. Posso mostrar como seria para {{segment}}?",
  "Oi! Se fizer sentido, te mando um exemplo de mensagem, card e próxima ação para a rotina comercial da {{company}}.",
  "Olá. Ajudo empresas a terem mais controle dos contatos vindos do WhatsApp. Posso te mandar uma ideia rápida?",
  "Oi! Vi a {{company}} e pensei em uma melhoria simples para organizar oportunidades sem perder o histórico.",
  "Olá! Posso te mostrar como priorizar contatos bons, descartar negativos e manter retornos no prazo?",
  "Oi. Tenho uma sugestão curta para melhorar a cadência comercial da {{company}} com menos esforço manual. Posso enviar?",
] as const;

const WHATSAPP_FILTER_LABELS: Record<WhatsappFilter, string> = {
  all: "Whatsapp",
  with: "Com WhatsApp",
  without: "Sem WhatsApp",
};

const INBOX_FILTER_LABELS: Record<InboxFilter, string> = {
  all: "Inbox: Todos",
  in: "Inbox: No Inbox",
  out: "Inbox: Fora do Inbox",
};

const PT_BR_MOJIBAKE_PATTERN = /(?:\u00c3|\u00c2|\u00e2|\u00c5|\u0192|\ufffd)/;
const PT_BR_TEXT_ATTRIBUTES_TO_REPAIR = [
  "aria-label",
  "title",
  "placeholder",
  "alt",
] as const;
const WINDOWS_1252_BYTES_BY_CHAR: Record<string, number> = {
  "\u20ac": 0x80,
  "\u201a": 0x82,
  "\u0192": 0x83,
  "\u201e": 0x84,
  "\u2026": 0x85,
  "\u2020": 0x86,
  "\u2021": 0x87,
  "\u02c6": 0x88,
  "\u2030": 0x89,
  "\u0160": 0x8a,
  "\u2039": 0x8b,
  "\u0152": 0x8c,
  "\u017d": 0x8e,
  "\u2018": 0x91,
  "\u2019": 0x92,
  "\u201c": 0x93,
  "\u201d": 0x94,
  "\u2022": 0x95,
  "\u2013": 0x96,
  "\u2014": 0x97,
  "\u02dc": 0x98,
  "\u2122": 0x99,
  "\u0161": 0x9a,
  "\u203a": 0x9b,
  "\u0153": 0x9c,
  "\u017e": 0x9e,
  "\u0178": 0x9f,
};

function decodeWindows1252AsUtf8(value: string) {
  const bytes = Uint8Array.from(
    Array.from(value, (char) => {
      const mapped = WINDOWS_1252_BYTES_BY_CHAR[char];
      if (typeof mapped === "number") return mapped;
      const code = char.charCodeAt(0);
      return code <= 0xff ? code : 0x3f;
    }),
  );
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function repairPtBrMojibakeText(value: string) {
  if (!PT_BR_MOJIBAKE_PATTERN.test(value)) return value;

  let current = value;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (!PT_BR_MOJIBAKE_PATTERN.test(current)) break;
    const next = decodeWindows1252AsUtf8(current);
    if (!next || next === current || next.includes("\ufffd")) break;
    current = next;
  }

  return current
    .replace(/PR\u00c3(?:[\u0192\u00c2\u00a2\u00e2\u20ac\u0152\u201c]*)?XIMO/gi, "PR\u00d3XIMO")
    .replace(/Pr\u00c3(?:[\u0192\u00c2\u00a2\u00e2\u20ac\u0152\u201c]*)?ximo/gi, "Pr\u00f3ximo")
    .replace(/\u00c2\u00b7/g, "\u00b7");
}

function repairPtBrMojibakeNode(root: ParentNode) {
  if (typeof document === "undefined") return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let currentNode = walker.nextNode();
  while (currentNode) {
    const parent = currentNode.parentElement;
    if (!parent?.closest("script,style,textarea,input")) {
      textNodes.push(currentNode as Text);
    }
    currentNode = walker.nextNode();
  }

  textNodes.forEach((node) => {
    const original = node.nodeValue || "";
    const repaired = repairPtBrMojibakeText(original);
    if (repaired !== original) node.nodeValue = repaired;
  });

  root.querySelectorAll<HTMLElement>("*").forEach((element) => {
    PT_BR_TEXT_ATTRIBUTES_TO_REPAIR.forEach((attribute) => {
      const original = element.getAttribute(attribute);
      if (!original) return;
      const repaired = repairPtBrMojibakeText(original);
      if (repaired !== original) element.setAttribute(attribute, repaired);
    });
  });
}

function formatDateTime(value?: string | null) {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime())
    ? parsed.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";
}

function formatShortDate(value?: string | null) {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime())
    ? parsed.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
    : "-";
}

function toDatetimeLocal(value?: string | null) {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return "";
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function plusDaysDatetimeLocal(days: number) {
  const now = new Date();
  now.setDate(now.getDate() + days);
  now.setHours(
    days > 0 ? 9 : now.getHours(),
    days > 0 ? 0 : now.getMinutes(),
    0,
    0,
  );
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function dateKeyToShortBrazilianDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-");
  return day && month && year ? `${day}/${month}/${year.slice(-2)}` : "";
}

function parseShortBrazilianDate(value: string) {
  const match = String(value || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!match) return "";
  const day = Number(match[1]);
  const month = Number(match[2]);
  const rawYear = Number(match[3]);
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  const parsed = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return "";
  }
  return `${year}-${padDatePart(month)}-${padDatePart(day)}`;
}

function normalizeReturnTime(value: string) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";
  return `${padDatePart(hour)}:${padDatePart(minute)}`;
}

function monthKeyFromDateKey(dateKey: string) {
  return dateKey ? dateKey.slice(0, 7) : localDateKeyFromDate(new Date()).slice(0, 7);
}

function getMobileReturnDefaultDate(lead?: LeadItem | null) {
  const existing = lead?.returnAt ? new Date(lead.returnAt) : null;
  const base = existing && !Number.isNaN(existing.getTime()) ? existing : new Date();
  if (!existing || Number.isNaN(existing.getTime())) {
    base.setDate(base.getDate() + 1);
    base.setHours(9, 0, 0, 0);
  }
  return base;
}

function buildMobileReturnScheduler(lead: LeadItem): MobileReturnScheduler {
  const base = getMobileReturnDefaultDate(lead);
  const dateKey = localDateKeyFromDate(base);
  return {
    leadId: lead.id,
    leadName: lead.name || "Lead sem nome",
    dateText: dateKeyToShortBrazilianDate(dateKey),
    timeValue: `${padDatePart(base.getHours())}:${padDatePart(base.getMinutes())}`,
    monthKey: monthKeyFromDateKey(dateKey),
  };
}

function shiftMonthKey(monthKey: string, direction: -1 | 1) {
  const base = new Date(`${monthKey || monthKeyFromDateKey("")}-01T12:00:00`);
  if (Number.isNaN(base.getTime())) return monthKeyFromDateKey("");
  base.setMonth(base.getMonth() + direction);
  return localDateKeyFromDate(base).slice(0, 7);
}

function buildCalendarDays(monthKey: string) {
  const [yearValue, monthValue] = String(monthKey || "").split("-");
  const year = Number(yearValue);
  const month = Number(monthValue);
  const first = new Date(year, month - 1, 1, 12, 0, 0, 0);
  if (Number.isNaN(first.getTime())) return [];
  const startOffset = first.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const days: Array<{ key: string; day: number | null }> = [];
  for (let i = 0; i < startOffset; i += 1) days.push({ key: `empty-${i}`, day: null });
  for (let day = 1; day <= daysInMonth; day += 1) {
    days.push({
      key: `${year}-${padDatePart(month)}-${padDatePart(day)}`,
      day,
    });
  }
  return days;
}

function normalizePhoneDigits(raw: string) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length > 11) digits = digits.slice(2);
  return digits;
}

function buildCallUrl(phone?: string | null) {
  const digits = normalizePhoneDigits(String(phone || ""));
  return digits ? `tel:+55${digits}` : "";
}

function buildWhatsAppUrl(phone?: string | null, leadName?: string | null) {
  const digits = normalizePhoneDigits(String(phone || ""));
  if (!digits) return "";
  const message = leadName
    ? `Olá, ${leadName}. Estou retomando nosso contato pelo HBX Vendas.`
    : "Olá. Estou retomando nosso contato pelo HBX Vendas.";
  return `https://wa.me/55${digits}?text=${encodeURIComponent(message)}`;
}

function buildWhatsAppUrlWithMessage(phone?: string | null, message?: string | null) {
  const digits = normalizePhoneDigits(String(phone || ""));
  if (!digits) return "";
  const text = String(message || "").trim() || "Olá. Estou retomando nosso contato pelo HBX Vendas.";
  return `https://wa.me/55${digits}?text=${encodeURIComponent(text)}`;
}

function leadEmailForDisplay(lead: LeadItem) {
  return String(lead.email || lead.leadIntelligence?.email || "").trim();
}

function leadWebsiteForDisplay(lead: LeadItem) {
  return String(lead.website || "").trim();
}

function leadVisualScore(lead: LeadItem) {
  return Math.max(0, Math.min(100, Math.round(Number(lead.leadIntelligence?.opportunityScore || 0))));
}

function leadHasVisualChannel(lead: LeadItem, channel: MobileVisualChannelFilter) {
  const intelligence = lead.leadIntelligence || {};
  if (channel === "phone") return Boolean(normalizePhoneDigits(lead.phone || ""));
  if (channel === "whatsapp") {
    return isLeadWhatsappConfirmed(lead);
  }
  if (channel === "instagram") return Boolean(String(intelligence.instagramUrl || "").trim());
  if (channel === "facebook") return Boolean(String(intelligence.facebookUrl || "").trim());
  if (channel === "email") return Boolean(leadEmailForDisplay(lead));
  if (channel === "site") return Boolean(leadWebsiteForDisplay(lead));
  return false;
}

function normalizeExternalUrl(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function leadCapabilities(lead: LeadItem, board?: BoardResponse | null): VendasCapabilities {
  return lead.capabilities || board?.capabilities || {};
}

function canSeeLeadIntelligence(lead: LeadItem, board?: BoardResponse | null) {
  return leadCapabilities(lead, board).canSeeLeadIntelligence === true;
}

function canSeeSocialLinks(lead: LeadItem, board?: BoardResponse | null) {
  return leadCapabilities(lead, board).canSeeSocialLinks === true;
}

function hasLockedSocialLinks(lead: LeadItem, board?: BoardResponse | null) {
  const capabilities = leadCapabilities(lead, board);
  return capabilities.canSeeSocialLinks === "teaser_only" && Boolean(lead.leadIntelligence?.primarySocial);
}

function leadHasPremiumSignals(lead: LeadItem) {
  const intelligence = lead.leadIntelligence || {};
  return Boolean(
    leadEmailForDisplay(lead)
    || intelligence.instagramUrl
    || intelligence.facebookUrl
    || intelligence.primarySocial
    || intelligence.socialStatus === "found"
    || Number(intelligence.opportunityScore || 0) > 0
  );
}

function leadEnrichmentBadgeState(lead: LeadItem, board?: BoardResponse | null) {
  const intelligence = lead.leadIntelligence || {};
  const enrichmentStatus = String(intelligence.enrichmentStatus || "").trim().toLowerCase();
  const tier = String(intelligence.visibilityTier || "").trim().toLowerCase();
  const fromRadar = lead.sourceType === "webscraping" || String(lead.primarySource || "").toLowerCase().includes("radar");
  const lockedPremium = hasLockedSocialLinks(lead, board) || Boolean(intelligence.premiumTeaser);
  const pendingTier = ["candidate", "list_basic", "enrichment_pending"].includes(tier);
  const readyTier = ["lead_plus_qualified", "review_backup"].includes(tier);
  const enrichmentChecked = Boolean(
    intelligence.lastVerifiedAt
    || intelligence.verifiedBy
    || ["found", "missing", "weak"].includes(String(intelligence.socialStatus || "").toLowerCase())
    || ["confirmed", "missing", "invalid", "unverified"].includes(String(intelligence.whatsappStatus || "").toLowerCase())
    || ["confirmed", "probable", "missing", "unverified"].includes(String(intelligence.emailStatus || "").toLowerCase())
  );
  if (["queued", "processing"].includes(enrichmentStatus)) {
    return {
      state: "enriching" as const,
      label: "Enriquecendo",
      title: "O Radar está buscando site, redes sociais, CNPJ e sinais comerciais deste card.",
    };
  }
  if ((pendingTier && !enrichmentChecked) || (fromRadar && !readyTier && !leadHasPremiumSignals(lead) && !enrichmentChecked)) {
    return {
      state: "enriching" as const,
      label: "Enriquecendo",
      title: "O Radar está buscando site, redes sociais, CNPJ e sinais comerciais deste card.",
    };
  }
  if (enrichmentStatus === "failed") {
    return {
      state: "reviewed" as const,
      label: "Revisado",
      title: "O Radar revisou este card, mas não encontrou novos sinais agora.",
    };
  }
  if (lockedPremium) {
    return {
      state: "locked" as const,
      label: "Lead",
      title: "Sinais premium encontrados. Disponível no HBX Lead.",
    };
  }
  if (readyTier || leadHasPremiumSignals(lead)) {
    return {
      state: "ready" as const,
      label: "Pronto",
      title: "Enriquecimento premium analisado.",
    };
  }
  return null;
}

function CrownGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4.2 18.5h15.6l.7-9.9-4.6 3.5L12 4.7 8.1 12.1 3.5 8.6l.7 9.9Z" />
      <path d="M5.2 20.2h13.6" />
      <circle cx="12" cy="4.7" r="1.25" />
      <circle cx="3.5" cy="8.6" r="1.15" />
      <circle cx="20.5" cy="8.6" r="1.15" />
    </svg>
  );
}

function MobileEnrichmentCrown({ lead, board, compact = false }: { lead: LeadItem; board?: BoardResponse | null; compact?: boolean }) {
  const badge = leadEnrichmentBadgeState(lead, board);
  if (!badge) return null;
  if (badge.state === "locked") {
    return (
      <Link
        href={toMobileRoute("/planos?intent=lead")}
        className={styles.mobileLeadEnrichmentCrown}
        data-state={badge.state}
        data-compact={compact ? "true" : "false"}
        title={badge.title}
        aria-label={badge.title}
        onClick={(event) => event.stopPropagation()}
      >
        <CrownGlyph />
        <span>{badge.label}</span>
      </Link>
    );
  }
  return (
    <span
      className={styles.mobileLeadEnrichmentCrown}
      data-state={badge.state}
      data-compact={compact ? "true" : "false"}
      title={badge.title}
      aria-label={badge.title}
    >
      <CrownGlyph />
      <span>{badge.label}</span>
    </span>
  );
}

function isLeadWhatsappConfirmed(lead: LeadItem) {
  const intelligenceStatus = String(lead.leadIntelligence?.whatsappStatus || "").trim().toLowerCase();
  const availabilityStatus = String(lead.whatsappAvailability?.status || "").trim().toLowerCase();
  return (
    ["confirmed", "available", "valid", "exists"].includes(intelligenceStatus) ||
    availabilityStatus === "available"
  );
}

function leadWhatsappHref(lead: LeadItem) {
  return isLeadWhatsappConfirmed(lead) ? buildWhatsAppUrl(lead.phone, lead.name) : "";
}

type LeadChannelAsset = {
  channel: MobileChannelAsset;
  href: string;
  external?: boolean;
  locked?: boolean;
};

function buildLeadChannelAssets(lead: LeadItem): LeadChannelAsset[] {
  const socialLinksVisible = canSeeSocialLinks(lead);
  const phoneHref = lead.phone ? buildCallUrl(lead.phone) : "";
  const whatsappHref = leadWhatsappHref(lead);
  const instagramHref = normalizeExternalUrl(lead.leadIntelligence?.instagramUrl);
  const facebookHref = normalizeExternalUrl(lead.leadIntelligence?.facebookUrl);
  const email = String(lead.email || lead.leadIntelligence?.email || "").trim();
  const websiteHref = normalizeExternalUrl(lead.website);
  return [
    phoneHref ? { channel: "phone", href: phoneHref } : null,
    whatsappHref ? { channel: "whatsapp", href: whatsappHref, external: true } : null,
    instagramHref ? { channel: "instagram", href: socialLinksVisible ? instagramHref : "", external: true, locked: !socialLinksVisible } : null,
    facebookHref ? { channel: "facebook", href: socialLinksVisible ? facebookHref : "", external: true, locked: !socialLinksVisible } : null,
    email ? { channel: "email", href: `mailto:${email}` } : null,
    websiteHref ? { channel: "site", href: websiteHref, external: true } : null,
  ].filter(Boolean) as LeadChannelAsset[];
}

function socialBadgeLabel(primarySocial?: LeadIntelligence["primarySocial"]) {
  if (primarySocial === "instagram") return "IG";
  if (primarySocial === "facebook") return "f";
  if (primarySocial === "both") return "Redes";
  return "";
}

function readMobileReadyMessagePreference() {
  if (typeof window === "undefined") return 0;
  const value = Number(window.localStorage.getItem(MOBILE_READY_MESSAGE_PREF_KEY));
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function saveMobileReadyMessagePreference(index: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MOBILE_READY_MESSAGE_PREF_KEY, String(Math.max(0, Math.floor(index))));
}

function readMobileOpenLeadId() {
  if (typeof window === "undefined") return "";
  return String(window.sessionStorage.getItem(MOBILE_OPEN_LEAD_KEY) || "").trim();
}

function salesProfileDraftFromResponse(payload?: SalesProfileResponse | null): SalesProfileDraft {
  const profile = payload?.effectiveProfile || {};
  return {
    whatDoYouSell: String(profile.whatDoYouSell || SALES_PROFILE_DEFAULT_DRAFT.whatDoYouSell),
    offerCategory: String(profile.offerCategory || SALES_PROFILE_DEFAULT_DRAFT.offerCategory),
    targetAudience: Array.isArray(profile.targetAudience) && profile.targetAudience.length
      ? profile.targetAudience
      : SALES_PROFILE_DEFAULT_DRAFT.targetAudience,
    targetSegments: Array.isArray(profile.targetSegments) && profile.targetSegments.length
      ? profile.targetSegments
      : SALES_PROFILE_DEFAULT_DRAFT.targetSegments,
    avoidSegments: Array.isArray(profile.avoidSegments) && profile.avoidSegments.length
      ? profile.avoidSegments
      : SALES_PROFILE_DEFAULT_DRAFT.avoidSegments,
    preferredChannels: Array.isArray(profile.preferredChannels) && profile.preferredChannels.length
      ? profile.preferredChannels
      : SALES_PROFILE_DEFAULT_DRAFT.preferredChannels,
    weeklyAutoUpdateEnabled: Boolean(profile.weeklyAutoUpdateEnabled),
  };
}

function toggleStringValue(values: string[], value: string) {
  const normalized = value.trim();
  if (!normalized) return values;
  return values.some((item) => item.toLowerCase() === normalized.toLowerCase())
    ? values.filter((item) => item.toLowerCase() !== normalized.toLowerCase())
    : [...values, normalized].slice(0, 30);
}

function formatReportPercent(value: unknown) {
  return `${Math.round((Number(value || 0) || 0) * 100)}%`;
}

function saveMobileOpenLeadId(leadId: string | null) {
  if (typeof window === "undefined") return;
  const normalized = String(leadId || "").trim();
  if (normalized) window.sessionStorage.setItem(MOBILE_OPEN_LEAD_KEY, normalized);
  else window.sessionStorage.removeItem(MOBILE_OPEN_LEAD_KEY);
}

function mobileMessageTokenValue(value: string | null | undefined, fallback: string) {
  return String(value || "").trim() || fallback;
}

function readMobilePreferredCallerName() {
  if (typeof window === "undefined") return "";
  return String(window.localStorage.getItem(MOBILE_PREFERRED_CALLER_NAME_KEY) || "").trim();
}

function saveMobilePreferredCallerName(value: string) {
  if (typeof window === "undefined") return;
  const trimmed = String(value || "").trim();
  if (trimmed) window.localStorage.setItem(MOBILE_PREFERRED_CALLER_NAME_KEY, trimmed);
  else window.localStorage.removeItem(MOBILE_PREFERRED_CALLER_NAME_KEY);
}

function personalizeMobileReadyMessage(
  template: string,
  lead: LeadItem,
  preferredPersonName?: string | null,
) {
  const company = mobileMessageTokenValue(lead.name, "sua empresa");
  const fromPerson = String(preferredPersonName || "").trim();
  const greetingName = company === "sua empresa" ? "tudo bem" : company;
  const city = mobileMessageTokenValue(lead.city, "sua região");
  const segment = mobileMessageTokenValue(lead.segment, "empresas locais");
  const source = mobileMessageTokenValue(lead.primarySource, "Radar Digital");
  return template
    .replaceAll("{{name}}", greetingName)
    .replaceAll("{{caller}}", fromPerson || "HBX")
    .replaceAll("{{company}}", company)
    .replaceAll("{{city}}", city)
    .replaceAll("{{segment}}", segment)
    .replaceAll("{{source}}", source);
}

function boardsPayloadEqual(left: BoardResponse | null, right: BoardResponse | null) {
  if (left === right) return true;
  if (!left || !right) return false;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function radarRunResponseEqual(left: RadarSearchRunResponse | null, right: RadarSearchRunResponse | null) {
  if (left === right) return true;
  if (!left || !right) return false;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function isTextEntryElementActive() {
  if (typeof document === "undefined") return false;
  const active = document.activeElement;
  if (!active) return false;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) {
    return true;
  }
  return active instanceof HTMLElement && active.isContentEditable;
}

function buildMobileReadyMessageTemplates(lead: LeadItem, preferredPersonName?: string | null) {
  const backendTemplates = [
    ...(lead.leadIntelligence?.messageTemplates || []),
    ...(lead.leadIntelligence?.messageTemplate ? [lead.leadIntelligence.messageTemplate] : []),
  ];
  const generatedTemplates = MOBILE_READY_MESSAGE_LIBRARY.map((template, index) => ({
    id: `mobile-smart-${index + 1}`,
    context: "entrada_inteligente",
    tone: "consultiva",
    text: personalizeMobileReadyMessage(template, lead, preferredPersonName),
  }));
  const seen = new Set<string>();
  return [...backendTemplates, ...generatedTemplates].filter((template) => {
    const text = String(template.text || "").trim();
    if (!text || seen.has(text)) return false;
    seen.add(text);
    return true;
  });
}

function intelligenceScoreLabel(score?: number | null) {
  const value = Math.max(0, Math.min(100, Math.round(Number(score || 0))));
  if (value >= 80) return "Alta prioridade";
  if (value >= 62) return "Boa prioridade";
  if (value >= 42) return "Revisar";
  return "Baixa prioridade";
}

function buildSellerScoreBreakdown(lead: LeadItem) {
  const intelligence = lead.leadIntelligence || {};
  const tags = new Set((intelligence.leadReasonTags || []).map((tag) => String(tag || "").trim()));
  const whatsappReady = isLeadWhatsappConfirmed(lead);
  const email = leadEmailForDisplay(lead);
  const website = leadWebsiteForDisplay(lead);
  const instagram = normalizeExternalUrl(intelligence.instagramUrl);
  const facebook = normalizeExternalUrl(intelligence.facebookUrl);
  const rows = [
    { label: "Base do card", points: 44, active: true },
    { label: "WhatsApp confirmado", points: 24, active: whatsappReady },
    { label: "Telefone válido", points: 16, active: Boolean(buildCallUrl(lead.phone)) },
    { label: "E-mail encontrado", points: String(intelligence.emailStatus || "").toLowerCase() === "probable" ? 8 : 14, active: Boolean(email) },
    { label: "Instagram", points: facebook ? 4 : 6, active: Boolean(instagram) },
    { label: "Facebook", points: instagram ? 4 : 4, active: Boolean(facebook) },
    { label: "Site fraco ou ausente", points: 7, active: !website || tags.has("sem_site") },
    { label: "Você selecionou cidade", points: 5, active: tags.has("cidade_alvo") || Boolean(lead.city) },
    { label: "Você selecionou segmento", points: 5, active: tags.has("segmento_alvo") || Boolean(lead.segment) },
    { label: "Boa avaliação pública", points: 5, active: tags.has("boa_avaliacao") || Number(lead.rating || 0) >= 4.2 },
    { label: "Prova social", points: 4, active: tags.has("prova_social") || Number(lead.reviews || 0) >= 20 },
  ].filter((row) => row.active);
  return rows.slice(0, 8);
}

function leadTagLabel(tag: string) {
  const labels: Record<string, string> = {
    sem_site: "Sem site",
    whatsapp_confirmado: "WhatsApp confirmado",
    email_encontrado: "E-mail encontrado",
    cidade_alvo: "Cidade alvo",
    segmento_alvo: "Segmento alvo",
    boa_avaliacao: "Boa avaliação",
    prova_social: "Prova social",
    instagram_encontrado: "Instagram",
    facebook_encontrado: "Facebook",
    rede_social_confirmada: "Rede social",
    rede_social_sem_site: "Social sem site",
  };
  return labels[tag] || tag.replace(/_/g, " ");
}

function whatsappStatusLabel(status?: string | null) {
  if (status === "confirmed") return "WhatsApp verificado";
  if (status === "missing") return "Sem WhatsApp";
  if (status === "invalid") return "Telefone inválido";
  return "WhatsApp pendente";
}

function nextBestActionLabel(action?: string | null) {
  if (action === "whatsapp") return "Chamar no WhatsApp";
  if (action === "call") return "Tentar ligação";
  if (action === "email") return "Enviar e-mail";
  if (action === "discard") return "Não chamar";
  return "Revisar card";
}

function getLeadWhatsappStatus(lead: LeadItem) {
  return lead.whatsappAvailability?.status || "unknown";
}

function matchesWhatsappFilter(lead: LeadItem, filter: WhatsappFilter) {
  const status = getLeadWhatsappStatus(lead);
  if (filter === "with") return status === "available";
  if (filter === "without") return status === "unavailable";
  return true;
}

function isLeadInInbox(lead: LeadItem) {
  return Boolean(
    lead.isInInbox ||
    lead.inboxConversationId ||
    lead.atendimentoConversationId ||
    lead.sharedProfile?.presence?.atendimento?.present,
  );
}

function getLeadInboxConversationId(lead: LeadItem) {
  return String(
    lead.inboxConversationId ||
      lead.atendimentoConversationId ||
      lead.sharedProfile?.presence?.atendimento?.conversationId ||
      "",
  ).trim();
}

function matchesInboxFilter(lead: LeadItem, filter: InboxFilter) {
  if (filter === "in") return isLeadInInbox(lead);
  if (filter === "out") return !isLeadInInbox(lead);
  return true;
}

function nextInboxFilter(current: InboxFilter): InboxFilter {
  if (current === "all") return "in";
  if (current === "in") return "out";
  return "all";
}

function nextWhatsappFilter(current: WhatsappFilter): WhatsappFilter {
  if (current === "all") return "with";
  if (current === "with") return "without";
  return "all";
}

function sourceLabel(value?: string | null) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "webscraping") return "Radar Digital";
  if (normalized === "manual") return "Manual";
  return normalized || "Sem origem";
}

function statusLabel(status: LeadStatus) {
  return STATUS_OPTIONS.find((item) => item.value === status)?.label || status;
}

function compactVendasMessage(message: string | null) {
  const text = String(message || "").trim();
  if (!text) return "";
  if (text.toLowerCase().includes("deve ser um e-mail válido")) {
    return "E-mail inválido. Remova ou informe um endereço válido.";
  }
  return text;
}

function setVendasCardDragLock(active: boolean) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  if (active) {
    root.dataset.vendasDraggingCard = "true";
    root.dataset.hbxTopbarDragLock = "true";
    return;
  }

  delete root.dataset.vendasDraggingCard;
  delete root.dataset.hbxTopbarDragLock;
}

function createDraft(lead: LeadItem): LeadDraft {
  return {
    name: String(lead.name || ""),
    phone: String(lead.phone || ""),
    email: String(lead.email || ""),
    status: lead.status,
    nextAction: String(lead.nextAction || ""),
    returnAt: toDatetimeLocal(lead.returnAt),
    shortNote: String(lead.shortNote || ""),
  };
}

function buildLeadWebscrapingSummary(lead: LeadItem) {
  const parts: string[] = [];
  if (lead.rating != null) parts.push(`Nota ${Number(lead.rating).toFixed(1)}`);
  if (Number(lead.reviews || 0) > 0)
    parts.push(`${Number(lead.reviews)} avaliações`);
  return parts.join(" • ");
}

function hydrateDrafts(board: BoardResponse | null) {
  const next: Record<string, LeadDraft> = {};
  if (!board) return next;
  (["overdue", "today", "scheduled", "closed"] as LeadBlockKey[]).forEach(
    (blockKey) => {
      (board.blocks[blockKey] || []).forEach((lead) => {
        next[lead.id] = createDraft(lead);
      });
    },
  );
  return next;
}

function mergeHydratedDraftsPreservingInput(
  board: BoardResponse | null,
  currentDrafts: Record<string, LeadDraft>,
) {
  const hydrated = hydrateDrafts(board);
  const next = { ...hydrated };
  Object.keys(currentDrafts).forEach((leadId) => {
    if (hydrated[leadId]) next[leadId] = currentDrafts[leadId];
  });
  try {
    return JSON.stringify(next) === JSON.stringify(currentDrafts)
      ? currentDrafts
      : next;
  } catch {
    return next;
  }
}

function buildLocalDateKey(value?: string | null) {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${`${parsed.getMonth() + 1}`.padStart(2, "0")}-${`${parsed.getDate()}`.padStart(2, "0")}`;
}

function railTitle(dateKey: string) {
  const parsed = new Date(`${dateKey}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? "Programado"
    : parsed.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function railDay(dateKey: string) {
  const parsed = new Date(`${dateKey}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? "Data"
    : parsed.toLocaleDateString("pt-BR", { weekday: "short" });
}

function pluralize(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function returnMeta(lead: LeadItem, draft: LeadDraft, block: LeadBlockKey) {
  const effective = draft.returnAt
    ? new Date(draft.returnAt).toISOString()
    : lead.returnAt || null;
  if (!effective)
    return { label: "Sem retorno definido", tone: "neutral" } as const;
  if (block === "overdue")
    return {
      label: `Atrasado desde ${formatDateTime(effective)}`,
      tone: "overdue",
    } as const;
  if (block === "today")
    return {
      label: `Hoje • ${formatDateTime(effective)}`,
      tone: "today",
    } as const;
  if (block === "scheduled")
    return {
      label: `Agendado • ${formatDateTime(effective)}`,
      tone: "scheduled",
    } as const;
  return {
    label: `Arquivo • ${formatShortDate(effective)}`,
    tone: "closed",
  } as const;
}

function timelineTone(type?: LeadTimelineEventType) {
  if (type === "lead_closed") return "closed";
  if (type === "return_scheduled") return "scheduled";
  if (type === "contact_made" || type === "result_recorded") return "contact";
  if (type === "origin_registered") return "origin";
  if (type === "lead_reused") return "existing";
  return "neutral";
}

function timelineMeta(event: LeadTimelineEvent) {
  if (event.eventType === "origin_registered")
    return event.sourceType === "webscraping"
      ? "Origem Radar Digital"
      : "Origem manual";
  if (event.eventType === "status_changed" && event.statusTo)
    return `Status ${event.statusTo}`;
  if (event.eventType === "result_recorded" && event.resultLabel)
    return event.resultLabel;
  if (event.eventType === "return_scheduled" && event.returnAt)
    return formatDateTime(event.returnAt);
  return event.createdAt ? formatDateTime(event.createdAt) : "Agora";
}

function recomputeSummary(blocks: BoardResponse["blocks"]) {
  return {
    total:
      blocks.overdue.length +
      blocks.today.length +
      blocks.scheduled.length +
      blocks.closed.length,
    today: blocks.today.length,
    overdue: blocks.overdue.length,
    scheduled: blocks.scheduled.length,
    closed: blocks.closed.length,
  };
}

function compareDateKeys(left: string, right: string) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function normalizeBoardForLocalAgenda(input: BoardResponse) {
  const todayKey = localDateKeyFromDate(new Date());
  const blocks: BoardResponse["blocks"] = {
    overdue: [],
    today: [],
    scheduled: [],
    closed: [],
  };

  const allLeads = [
    ...input.blocks.overdue,
    ...input.blocks.today,
    ...input.blocks.scheduled,
    ...input.blocks.closed,
  ];

  for (const lead of allLeads) {
    if (lead.status === "encerrado") {
      blocks.closed.push(lead);
      continue;
    }

    const leadDateKey = buildLocalDateKey(lead.returnAt || lead.updatedAt);
    if (!leadDateKey) {
      blocks.today.push(lead);
      continue;
    }

    const compare = compareDateKeys(leadDateKey, todayKey);
    if (compare < 0) blocks.overdue.push(lead);
    else if (compare > 0) blocks.scheduled.push(lead);
    else blocks.today.push(lead);
  }

  return {
    ...input,
    blocks,
    summary: recomputeSummary(blocks),
  };
}

function markBoardLeadsInInbox(
  board: BoardResponse | null,
  leadIds: string[],
  leadConversationIds?: Record<string, string | number>,
  fallbackConversationId?: string | number | null,
) {
  if (!board || !leadIds.length) return board;
  const targetIds = new Set(
    leadIds.map((leadId) => String(leadId || "").trim()).filter(Boolean),
  );
  if (!targetIds.size) return board;

  let changed = false;
  const blocks = Object.fromEntries(
    (["overdue", "today", "scheduled", "closed"] as LeadBlockKey[]).map(
      (blockKey) => [
        blockKey,
        (board.blocks[blockKey] || []).map((lead) => {
          if (!targetIds.has(lead.id)) return lead;
          const conversationId =
            leadConversationIds?.[lead.id] ||
            fallbackConversationId ||
            lead.inboxConversationId ||
            lead.atendimentoConversationId ||
            null;
          if (!conversationId && isLeadInInbox(lead)) return lead;
          changed = true;
          return {
            ...lead,
            isInInbox: true,
            inboxConversationId: conversationId,
            atendimentoConversationId: conversationId,
            sharedProfile: {
              ...(lead.sharedProfile || {}),
              presence: {
                ...(lead.sharedProfile?.presence || {}),
                atendimento: {
                  ...(lead.sharedProfile?.presence?.atendimento || {}),
                  present: true,
                  conversationId,
                },
              },
            },
          };
        }),
      ],
    ),
  ) as BoardResponse["blocks"];

  return changed ? { ...board, blocks } : board;
}

function formatDatetimeLocal(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function localDateKeyFromDate(date: Date) {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`;
}

function buildTargetDatetimeLocal(
  dateKey: string,
  currentReturnAt?: string | null,
  fallbackHour = 9,
  fallbackMinute = 0,
) {
  const base = currentReturnAt
    ? new Date(currentReturnAt)
    : new Date(`${dateKey}T09:00:00`);
  const next = new Date(base);
  next.setFullYear(
    Number(dateKey.slice(0, 4)),
    Number(dateKey.slice(5, 7)) - 1,
    Number(dateKey.slice(8, 10)),
  );
  if (!currentReturnAt) next.setHours(fallbackHour, fallbackMinute, 0, 0);
  return formatDatetimeLocal(next);
}

function DateDropSlot({
  item,
  active,
  pulse,
  dragging,
  ignoreClick,
  onDateShortcut,
  onSelect,
  register,
}: {
  item: DateFilterItem;
  active: boolean;
  pulse: boolean;
  dragging: boolean;
  ignoreClick: () => boolean;
  onDateShortcut: () => void;
  onSelect: () => void;
  register: (node: HTMLElement | null) => void;
}) {
  const { isOver, setNodeRef: setDropRef } = useDroppable({
    id: item.key,
    data: { type: "date-filter", key: item.key },
  });
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `date:${item.key}`,
    data: { type: "date-filter", key: item.key },
  });

  const setCombinedRef = (node: HTMLElement | null) => {
    setDropRef(node);
    setDragRef(node);
    register(node);
  };

  const rawSubtitle = String(item.subtitle || "").trim();
  let showSubtitle = Boolean(rawSubtitle);
  try {
    const normalized = rawSubtitle
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^\w\s]/g, "")
      .toLowerCase()
      .trim();
    if (
      ["sem pendencia", "fluxo principal", "sem agenda"].includes(normalized)
    ) {
      showSubtitle = false;
    }
  } catch {
    const fallback = rawSubtitle
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")
      .trim();
    if (["sem pendencia", "fluxo principal", "sem agenda"].includes(fallback)) {
      showSubtitle = false;
    }
  }

  // UX: hide the "retorno futuro" subtitle for scheduled date cards
  // (removes strings like "1 retorno futuro" that clutter the small cards)
  if (item.blockKey === "scheduled") {
    showSubtitle = false;
  }

  return (
    <div
      className={styles.dateFilterCard}
      data-active={active ? "true" : "false"}
      data-tone={item.blockKey}
      data-dropover={isOver ? "true" : "false"}
      data-pulse={pulse ? "true" : "false"}
      data-dragging={dragging || isDragging ? "true" : "false"}
      onClick={() => {
        if (ignoreClick()) return;
        onSelect();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (ignoreClick()) return;
          onSelect();
        }
      }}
      ref={setCombinedRef}
      {...attributes}
      {...listeners}
    >
      <span className={styles.dateFilterDay}>{item.dayLabel}</span>
      <strong>{item.title}</strong>
      {showSubtitle ? <span>{item.subtitle}</span> : null}

      {active ? (
        <button
          type="button"
          className={styles.atendimentoShortcut}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onDateShortcut();
          }}
          title="Enviar cards visíveis desta data para Prospecção"
          aria-label="Enviar cards visíveis desta data para Prospecção"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ) : null}

      <AnimatedCount value={item.count} />
      <span className={styles.receiveHint}>Solte aqui</span>
    </div>
  );
}

function AnimatedCount({ value }: { value: number }) {
  const [displayed, setDisplayed] = useState(value);
  const [rolling, setRolling] = useState(false);
  const prevRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (prevRef.current === value) return;
    const from = prevRef.current;
    const to = value;
    prevRef.current = value;
    const diff = Math.abs(to - from);
    const DURATION = Math.max(240, Math.min(560, 220 + diff * 10));
    const startTime = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - startTime) / DURATION, 1);
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const current = Math.round(from + (to - from) * eased);
      setDisplayed(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplayed(to);
        setRolling(false);
      }
    };
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame((now) => {
      setRolling(true);
      tick(now);
    });
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [value]);

  return <b data-rolling={rolling ? "true" : "false"}>{displayed}</b>;
}

function LeadCardView({
  lead,
  draft,
  blockKey,
  selected,
  saving,
  onFocus,
  onQuickAction,
  onInboxAction,
  onEdit,
  onDraftChange,
  onEditingActiveChange,
  onSave,
  editing,
  bulkSelectionMode,
  bulkSelected,
  onBulkToggle,
}: LeadCardView) {
  const meta = returnMeta(lead, draft, blockKey);
  const signals = lead.signals || {
    alreadyExisted: Boolean((lead.timesSeen || 0) > 1),
    cameFromWebscraping:
      lead.sourceType === "webscraping" ||
      String(lead.primarySource || "").toLowerCase() === "webscraping",
    hadPreviousContact: Boolean(
      (lead.attemptCount || 0) > 0 || lead.lastContactAt,
    ),
    wasClosedBefore: Boolean(lead.wasClosedBefore),
  };
  const chips = [
    signals.alreadyExisted ? "Lead conhecido" : null,
    signals.cameFromWebscraping ? "Radar Digital" : null,
    signals.hadPreviousContact ? "Com histórico" : null,
    signals.wasClosedBefore ? "Já encerrado" : null,
    lead.whatsappAvailability?.status === "unavailable" ? "Sem WhatsApp" : null,
    lead.city || null,
  ].filter(Boolean);

  const callUrl = buildCallUrl(draft.phone || lead.phone);
  const whatsappBlocked = lead.whatsappAvailability?.status === "unavailable";
  const whatsappUrl = whatsappBlocked
    ? ""
    : buildWhatsAppUrl(draft.phone || lead.phone, draft.name || lead.name);
  const leadWebsiteHref = normalizeExternalUrl(leadWebsiteForDisplay(lead));
  const leadSource = lead.primarySource || lead.sourceType;
  const inInbox = isLeadInInbox(lead);
  const webscrapingSummary = buildLeadWebscrapingSummary(lead);
  const channelAssets = buildLeadChannelAssets(lead);

  // inline editor mount/animation control — uses global motion timings
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [editorRendered, setEditorRendered] = useState<boolean>(
    Boolean(editing),
  );
  const [editorAnimating, setEditorAnimating] = useState(false);

  useEffect(() => {
    const el = editorRef.current;
    const motion = HBX_WINDOW_STANDARD.motion;
    let timer: number | undefined;

    if (editing) {
      requestAnimationFrame(() => {
        setEditorRendered(true);
      });
      // open animation
      requestAnimationFrame(() => {
        if (!el) return;
        el.style.overflow = "hidden";
        el.style.maxHeight = "0px";
        el.style.opacity = "0";
        el.style.transition = `max-height ${motion.enterMs}ms ${motion.enterEasing}, opacity ${motion.enterMs}ms ${motion.enterEasing}`;
        requestAnimationFrame(() => {
          if (!el) return;
          el.style.maxHeight = `${el.scrollHeight}px`;
          el.style.opacity = "1";
        });
        requestAnimationFrame(() => {
          setEditorAnimating(true);
        });
        timer = window.setTimeout(() => {
          if (!el) return;
          el.style.maxHeight = "";
          el.style.overflow = "";
          el.style.transition = "";
          setEditorAnimating(false);
        }, motion.enterMs + 20);
      });
    } else {
      // close animation
      if (!el) {
        requestAnimationFrame(() => {
          setEditorRendered(false);
        });
      } else {
        el.style.overflow = "hidden";
        el.style.maxHeight = `${el.scrollHeight}px`;
        el.style.opacity = "1";
        el.style.transition = `max-height ${motion.exitMs}ms ${motion.exitEasing}, opacity ${motion.exitMs}ms ${motion.exitEasing}`;
        requestAnimationFrame(() => {
          if (!el) return;
          el.style.maxHeight = "0px";
          el.style.opacity = "0";
        });
        requestAnimationFrame(() => {
          setEditorAnimating(true);
        });
        timer = window.setTimeout(() => {
          setEditorAnimating(false);
          setEditorRendered(false);
          if (el) {
            el.style.maxHeight = "";
            el.style.overflow = "";
            el.style.transition = "";
          }
        }, motion.exitMs + 20);
      }
    }

    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [editing]);

  return (
    <LiquidGlassCard
      as="article"
      className={styles.leadCard}
      accentTone={
        blockKey === "today"
          ? "success"
          : blockKey === "overdue"
            ? "danger"
            : blockKey === "scheduled"
              ? "info"
              : "warning"
      }
      data-selected={selected ? "true" : "false"}
      data-bulk-selected={bulkSelected ? "true" : "false"}
      data-tone={blockKey}
      data-whatsapp={getLeadWhatsappStatus(lead)}
      header={
        <div
          className={styles.leadMainButton}
          role="button"
          tabIndex={0}
          onClick={onFocus}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onFocus();
            }
          }}
        >
          <div className={styles.leadCardTop}>
            {bulkSelectionMode ? (
              <button
                type="button"
                className={styles.bulkSelectCardButton}
                data-selected={bulkSelected ? "true" : "false"}
                aria-pressed={bulkSelected ? "true" : "false"}
                aria-label={
                  bulkSelected ? "Remover card da seleção" : "Selecionar card"
                }
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onBulkToggle?.(lead.id);
                }}
              >
                {bulkSelected ? "✓" : ""}
              </button>
            ) : null}
            <div className={styles.leadIdentity}>
              {leadSource &&
                String(leadSource).trim().toLowerCase() !== "manual" && (
                  <span
                    className={`${styles.leadEyebrow} ${glassCardStyles.eyebrow}`}
                  >
                    {sourceLabel(leadSource)}
                  </span>
                )}
              <strong className={`${styles.leadName} ${glassCardStyles.title}`}>
                {draft.name || lead.name || "Lead sem nome"}
              </strong>
              <span
                className={`${styles.returnBadge} ${glassCardStyles.pill} ${glassCardStyles.noBreak}`}
                data-tone={meta.tone}
              >
                {meta.label}
              </span>
              <span
                className={`${styles.leadSubline} ${glassCardStyles.subtitle}`}
              >
                {lead.segment ? (
                  <>
                    {lead.segment}
                    {lead.city ? ` • ${lead.city}` : null}
                  </>
                ) : lead.city ? (
                  lead.city
                ) : null}
              </span>
              {channelAssets.length ? (
                <div className={styles.leadCardChannelRow} aria-label="Canais disponíveis">
                  {channelAssets.map((asset) => {
                    const icon = (
                      <span
                        className={styles.mobileVendasChannelIcon}
                        data-channel={asset.channel}
                        data-compact="true"
                        data-locked={asset.locked ? "true" : "false"}
                        title={MOBILE_CHANNEL_ASSETS[asset.channel].label}
                      >
                        <MobileChannelIconAsset channel={asset.channel} />
                      </span>
                    );
                    if (asset.locked) {
                      return (
                        <Link
                          key={asset.channel}
                          href={toMobileRoute("/planos?intent=lead")}
                          aria-label={`${MOBILE_CHANNEL_ASSETS[asset.channel].label} disponível no HBX Lead`}
                          onClick={(event) => event.stopPropagation()}
                        >
                          {icon}
                        </Link>
                      );
                    }
                    return (
                      <a
                        key={asset.channel}
                        href={asset.href}
                        target={asset.external ? "_blank" : undefined}
                        rel={asset.external ? "noreferrer" : undefined}
                        aria-label={MOBILE_CHANNEL_ASSETS[asset.channel].label}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {icon}
                      </a>
                    );
                  })}
                </div>
              ) : null}
            </div>
            <div className={glassCardStyles.headerAside}>
              <button
                type="button"
                className={`${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`}
                onClick={() => onEdit?.(lead.id)}
                aria-label="Editar"
              >
                Editar
              </button>
              <button
                type="button"
                className={`${styles.inboxLeadButton} ${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`}
                data-state={inInbox ? "in" : "out"}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onInboxAction(lead);
                }}
                disabled={saving || blockKey === "closed"}
              >
                {inInbox ? "Inbox" : "Importar"}
              </button>
            </div>
          </div>
          <div className={glassCardStyles.cluster}>
            {chips.slice(0, 3).map((chip) => (
              <span
                key={`${lead.id}-${chip}`}
                className={`${styles.memoryChip} ${glassCardStyles.pill} ${glassCardStyles.noBreak}`}
              >
                {chip}
              </span>
            ))}
          </div>
        </div>
      }
      lead={
        editorRendered ? (
          <div
            ref={editorRef}
            className={styles.inlineEdit}
            aria-hidden={!editing && editorAnimating}
            onFocus={() => onEditingActiveChange?.(true)}
            onBlur={(event) => {
              const nextTarget = event.relatedTarget;
              if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
              onEditingActiveChange?.(false);
            }}
          >
            <div className={styles.fieldGrid}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Nome</span>
                <input
                  className={styles.fieldInput}
                  value={draft.name}
                  onChange={(e) =>
                    onDraftChange?.(lead.id, { name: e.target.value })
                  }
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Telefone</span>
                <input
                  className={styles.fieldInput}
                  value={draft.phone}
                  onChange={(e) =>
                    onDraftChange?.(lead.id, { phone: e.target.value })
                  }
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>E-mail</span>
                <input
                  className={styles.fieldInput}
                  value={draft.email}
                  onChange={(e) =>
                    onDraftChange?.(lead.id, { email: e.target.value })
                  }
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Status</span>
                <select
                  className={styles.fieldInput}
                  value={draft.status}
                  onChange={(e) =>
                    onDraftChange?.(lead.id, {
                      status: e.target.value as LeadStatus,
                    })
                  }
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.fieldWide}>
                <span className={styles.fieldLabel}>Próxima ação</span>
                <input
                  className={styles.fieldInput}
                  value={draft.nextAction}
                  onChange={(e) =>
                    onDraftChange?.(lead.id, { nextAction: e.target.value })
                  }
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Retorno</span>
                <input
                  className={styles.fieldInput}
                  type="datetime-local"
                  value={draft.returnAt}
                  onChange={(e) =>
                    onDraftChange?.(lead.id, { returnAt: e.target.value })
                  }
                />
              </label>
              <label className={styles.fieldWide}>
                <span className={styles.fieldLabel}>Observação curta</span>
                <textarea
                  className={styles.fieldTextarea}
                  rows={3}
                  value={draft.shortNote}
                  onChange={(e) =>
                    onDraftChange?.(lead.id, { shortNote: e.target.value })
                  }
                />
              </label>
            </div>
            <div className={styles.detailFooterActions}>
              <button
                type="button"
                className={`${glassCardStyles.actionButton} ${glassCardStyles.actionPrimary} ${glassCardStyles.noBreak}`}
                onClick={() => onSave?.(lead.id)}
                disabled={saving}
              >
                {saving ? "Salvando..." : "Salvar"}
              </button>
              <button
                type="button"
                className={`${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`}
                onClick={() => onEdit?.(null)}
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : null
      }
      actions={
        <div className={styles.leadActionRow}>
          <a
            className={`${glassCardStyles.actionButton} ${glassCardStyles.actionPrimary} ${styles.whatsappAction} ${glassCardStyles.noBreak} ${whatsappBlocked ? styles.whatsappUnavailable : ""}`}
            href={whatsappUrl || undefined}
            target={whatsappUrl ? "_blank" : undefined}
            rel={whatsappUrl ? "noreferrer" : undefined}
            aria-disabled={!whatsappUrl}
            title={
              whatsappBlocked
                ? "Este numero nao possui WhatsApp."
                : "Abrir conversa no WhatsApp"
            }
            onClick={() => {
              if (whatsappUrl) onQuickAction("tentativa_whatsapp");
            }}
          >
            {whatsappBlocked ? "Sem WhatsApp" : "WhatsApp"}
          </a>
          <a
            className={`${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`}
            href={callUrl || undefined}
            aria-disabled={!callUrl}
            onClick={() => {
              if (callUrl) onQuickAction("tentativa_call");
            }}
          >
            Ligar
          </a>
          {lead.quickActions.includes("amanha") ? (
            <button
              type="button"
              className={`${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`}
              onClick={() => onQuickAction("amanha")}
              disabled={saving}
            >
              Amanhã
            </button>
          ) : null}
          {lead.quickActions.includes("encerrar") ? (
            <button
              type="button"
              className={`${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`}
              onClick={() => onQuickAction("encerrar")}
              disabled={saving}
            >
              Encerrar
            </button>
          ) : null}
          {lead.quickActions.includes("reabrir") ? (
            <button
              type="button"
              className={`${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`}
              onClick={() => onQuickAction("reabrir")}
              disabled={saving}
            >
              Reabrir
            </button>
          ) : null}
        </div>
      }
      highlight={
        <div
          className={`${glassCardStyles.stack} ${styles.leadQuickReadStack}`}
        >
          <div className={styles.leadInfoBlock}>
            <span className={glassCardStyles.sectionLabel}>Endereço</span>
            <strong className={glassCardStyles.sectionTitle}>
              Localização
            </strong>
            <p className={glassCardStyles.bodyText}>
              {lead.address || "Sem endereço registrado."}
            </p>
          </div>
          <div className={styles.leadInfoBlock}>
            <span className={glassCardStyles.sectionLabel}>Resumo</span>
            <strong className={glassCardStyles.sectionTitle}>
              Leitura rapida
            </strong>
            <p className={glassCardStyles.bodyText}>
              {draft.shortNote ||
                lead.shortNote ||
                webscrapingSummary ||
                "Sem observação curta registrada."}
            </p>
          </div>
        </div>
      }
      metrics={
        <div className={glassCardStyles.metricGrid}>
          <div className={glassCardStyles.metricCard}>
            <span className={glassCardStyles.metricLabel}>Tentativas</span>
            <strong className={glassCardStyles.metricValue}>
              {lead.attemptCount || 0}
            </strong>
          </div>
          <div className={glassCardStyles.metricCard}>
            <span className={glassCardStyles.metricLabel}>Ultimo contato</span>
            <strong className={glassCardStyles.metricValue}>
              {formatShortDate(lead.lastContactAt)}
            </strong>
          </div>
          {lead.rating != null ? (
            <div className={glassCardStyles.metricCard}>
              <span className={glassCardStyles.metricLabel}>Nota</span>
              <strong className={glassCardStyles.metricValue}>
                {Number(lead.rating).toFixed(1)}
              </strong>
            </div>
          ) : null}
          {Number(lead.reviews || 0) > 0 ? (
            <div className={glassCardStyles.metricCard}>
              <span className={glassCardStyles.metricLabel}>Avaliacoes</span>
              <strong className={glassCardStyles.metricValue}>
                {lead.reviews}
              </strong>
            </div>
          ) : null}
        </div>
      }
    >
      {leadWebsiteHref ? (
        <div className={glassCardStyles.cluster}>
          <a
            className={`${glassCardStyles.actionButton} ${glassCardStyles.noBreak}`}
            href={leadWebsiteHref}
            target="_blank"
            rel="noreferrer"
          >
            Site
          </a>
        </div>
      ) : null}
    </LiquidGlassCard>
  );
}

function DraggableLeadCard({
  lead,
  draft,
  blockKey,
  selected,
  saving,
  disabled,
  hidden,
  onFocus,
  onQuickAction,
  onInboxAction,
  onEdit,
  onDraftChange,
  onSave,
  editing,
  bulkSelectionMode,
  bulkSelected,
  onBulkToggle,
  register,
}: LeadCardView & {
  disabled: boolean;
  hidden: boolean;
  register: (node: HTMLElement | null) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: lead.id,
    disabled,
    data: { type: "lead", leadId: lead.id },
  });

  return (
    <div
      className={styles.draggableWrap}
      data-dragging={isDragging ? "true" : "false"}
      data-flying={hidden ? "true" : "false"}
      ref={(node) => {
        setNodeRef(node);
        register(node);
      }}
      {...attributes}
      {...listeners}
    >
      <LeadCardView
        lead={lead}
        draft={draft}
        blockKey={blockKey}
        selected={selected}
        saving={saving}
        onFocus={onFocus}
        onQuickAction={onQuickAction}
        onInboxAction={onInboxAction}
        onEdit={onEdit}
        onDraftChange={onDraftChange}
        onSave={onSave}
        editing={editing}
        bulkSelectionMode={bulkSelectionMode}
        bulkSelected={bulkSelected}
        onBulkToggle={onBulkToggle}
      />
    </div>
  );
}

function SalesMotionBackground() {
  const bars = [32, 46, 60, 76, 94, 112, 130];
  const path = "M34 188 L58 188 L76 158 L96 170 L112 144 L130 156 L148 130 L166 142 L184 114 L202 126 L220 96 L238 108 L256 78 L274 90 L292 60";

  return (
    <div className={styles.salesMotionBackdrop} aria-hidden="true">
      <div className={styles.salesMotionAura} />
      <svg viewBox="0 0 360 250" focusable="false">
        <g className={styles.salesMotionGrid}>
          <path d="M32 194 H318" />
          <path d="M42 164 H306 M42 132 H306 M42 100 H306 M42 68 H306" />
          <path d="M80 48 V202 M128 48 V202 M176 48 V202 M224 48 V202 M272 48 V202" />
        </g>
        <g className={styles.salesMotionPipeline}>
          <rect x="254" y="154" width="72" height="42" rx="12" />
          <text x="290" y="181" textAnchor="middle">$</text>
        </g>
        <g transform="translate(70 32)">
          <line className={styles.salesMotionBaseLine} x1="24" y1="190" x2="282" y2="190" />
          {bars.map((height, index) => (
            <rect
              key={height}
              className={styles.salesMotionBar}
              x={index * 36 + 64}
              y={190 - height}
              width="24"
              height={height}
              rx="4"
              style={{ animationDelay: `${index * 0.18}s` }}
            />
          ))}
          <path className={styles.salesMotionLine} d={path} />
          {bars.map((height, index) => (
            <circle
              key={`hit-${height}`}
              className={styles.salesMotionHitDot}
              cx={index * 36 + 76}
              cy={190 - height}
              r="4.5"
              style={{ animationDelay: `${0.72 + index * 0.39}s` }}
            />
          ))}
          <circle className={styles.salesMotionDot} cx="292" cy="60" r="5" />
          <path className={styles.salesMotionArrow} d="M292 60 l-2 22 l19 -13 z" />
        </g>
        <g className={styles.salesMotionDeals}>
          <circle cx="52" cy="184" r="3" />
          <circle cx="118" cy="142" r="2.5" />
          <circle cx="176" cy="121" r="2.5" />
          <circle cx="258" cy="78" r="3" />
        </g>
        <g className={styles.salesMotionCoins}>
          <circle cx="310" cy="116" r="9" />
          <text x="310" y="121" textAnchor="middle">$</text>
          <circle cx="50" cy="64" r="6" />
          <path d="M47 64 H53" />
        </g>
        <defs>
          <linearGradient id="salesMotionBarGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#75d5ff" stopOpacity="0.98" />
            <stop offset="100%" stopColor="#1669ff" stopOpacity="0.35" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

export default function VendasClientPage({ mobileRoute = false }: { mobileRoute?: boolean } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    if (!mobileRoute || typeof document === "undefined") return;

    const root = document.body;
    let frame = 0;
    const repair = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        repairPtBrMojibakeNode(root);
      });
    };

    repair();
    const observer = new MutationObserver(repair);
    observer.observe(root, {
      attributes: true,
      attributeFilter: [...PT_BR_TEXT_ATTRIBUTES_TO_REPAIR],
      characterData: true,
      childList: true,
      subtree: true,
    });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [mobileRoute]);
  const hasToken = useRequireModule("vendas");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<string, LeadDraft>>({});
  const [savingLeadId, setSavingLeadId] = useState<string | null>(null);
  const [creatingManual, setCreatingManual] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const mobileSearch = "";
  const [selectedMobileLeadId, setSelectedMobileLeadId] = useState<string | null>(null);
  const [mobileReturnScheduler, setMobileReturnScheduler] =
    useState<MobileReturnScheduler | null>(null);
  const [mobileReturnScheduleError, setMobileReturnScheduleError] =
    useState<string | null>(null);
  const [mobileAnimatedScore, setMobileAnimatedScore] = useState(0);
  const [mobileScoreLead, setMobileScoreLead] = useState<LeadItem | null>(null);
  const [mobileVisualChannelFilters, setMobileVisualChannelFilters] = useState<MobileVisualChannelFilter[]>([]);
  const [mobileMinScoreFilter, setMobileMinScoreFilter] = useState(0);
  const [mobileScoreFilterOpen, setMobileScoreFilterOpen] = useState(false);
  const [radarPopupOpen, setRadarPopupOpen] = useState(false);
  const [mobileNoteLead, setMobileNoteLead] = useState<LeadItem | null>(null);
  const [mobileNoteDraft, setMobileNoteDraft] = useState("");
  const [mobileSavingNote, setMobileSavingNote] = useState(false);
  const [mobileEnrichmentLoadingId, setMobileEnrichmentLoadingId] = useState<string | null>(null);
  const [mobileTemplateIndex, setMobileTemplateIndex] = useState(() => readMobileReadyMessagePreference());
  const [mobileReportLead, setMobileReportLead] = useState<LeadItem | null>(null);
  const [mobileReportReason, setMobileReportReason] = useState("");
  const [mobileReporting, setMobileReporting] = useState(false);
  const [mobileDeletingLead, setMobileDeletingLead] = useState(false);
  const [mobileBulkDeleteTarget, setMobileBulkDeleteTarget] =
    useState<MobileBulkDeleteTarget | null>(null);
  const [mobileBulkHoldTab, setMobileBulkHoldTab] = useState<
    MobileBulkDeleteTarget["tab"] | null
  >(null);
  const [whatsappFilter, setWhatsappFilter] = useState<WhatsappFilter>("all");
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>("all");
  const [bulkSelectionMode, setBulkSelectionMode] = useState(false);
  const [selectedBulkLeadIds, setSelectedBulkLeadIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [bulkSelectAllAccount, setBulkSelectAllAccount] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [vendasVisualCount, setVendasVisualCount] = useState(0);
  const [storedRadarRun, setStoredRadarRun] = useState<StoredRadarRun | null>(null);
  const [liveRadarRun, setLiveRadarRun] = useState<RadarSearchRunResponse | null>(null);
  const [radarStatusPulseKey, setRadarStatusPulseKey] = useState(0);
  const [selectedDateKey, setSelectedDateKey] =
    useState<DateFilterKey>("today");
  const [mobileAgendaTab, setMobileAgendaTab] =
    useState<MobileAgendaTab>("today");
  const [mobileSection, setMobileSection] = useState<MobileVendasSection>("today");
  const [salesProfile, setSalesProfile] = useState<SalesProfileResponse | null>(null);
  const [salesProfileDraft, setSalesProfileDraft] = useState<SalesProfileDraft>(SALES_PROFILE_DEFAULT_DRAFT);
  const [salesProfileSaving, setSalesProfileSaving] = useState(false);
  const [salesProfileSuggestion, setSalesProfileSuggestion] = useState<SalesProfileSuggestion | null>(null);
  const [conversionReport, setConversionReport] = useState<ConversionReportResponse | null>(null);
  const [conversionReportPeriod, setConversionReportPeriod] = useState<"today" | "7d" | "30d">("7d");
  const [conversionReportLoading, setConversionReportLoading] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [accountSheetOpen, setAccountSheetOpen] = useState(false);
  const [accountNameDraft, setAccountNameDraft] = useState("");
  const [mobilePreferredCallerName, setMobilePreferredCallerName] = useState("");
  const [accountProfile, setAccountProfile] = useState<{
    email?: string | null;
    company?: {
      paymentStatus?: string | null;
      subscriptionStatus?: string | null;
      premiumAccess?: boolean | null;
    } | null;
  } | null>(null);
  const [accountProfileLoading, setAccountProfileLoading] = useState(false);
  const composerOpenRef = useRef(false);
  const mobileSkipDraftHydrateRef = useRef(false);
  const [expandedTimelineEventId, setExpandedTimelineEventId] = useState<
    string | null
  >(null);
  const [activeDragLeadId, setActiveDragLeadId] = useState<string | null>(null);
  const [activeDragDateKey, setActiveDragDateKey] = useState<string | null>(
    null,
  );
  const [pulseDateKey, setPulseDateKey] = useState<DateFilterKey | null>(null);
  const [flyAnimation, setFlyAnimation] = useState<FlyAnimation | null>(null);
  const [manualLead, setManualLead] = useState({
    name: "",
    phone: "",
    email: "",
    nextAction: "Primeiro contato",
    returnAt: plusDaysDatetimeLocal(0),
    shortNote: "",
  });
  const leadCardRefs = useRef<Record<string, HTMLElement | null>>({});
  const boardRef = useRef<BoardResponse | null>(null);
  const dateFilterRefs = useRef<Record<string, HTMLElement | null>>({});
  const archiveRef = useRef<HTMLElement | null>(null);
  const editingInputActiveRef = useRef(false);
  const pendingVisualBoardRef = useRef<BoardResponse | null>(null);
  const lastDragEndedAtRef = useRef(0);
  const filterScrollerRef = useRef<HTMLDivElement | null>(null);
  const mobileBulkHoldTimerRef = useRef<number | null>(null);
  const mobileBulkHoldCompletedRef = useRef(false);
  const mobileDeepLinkHandledRef = useRef("");
  const lastRadarStatusSnapshotRef = useRef<{ count: number; status: string } | null>(null);
  const mobileScoreAnimatedKeyRef = useRef<string | null>(null);
  const mobileScoreAnimationRunRef = useRef(0);
  const lastRadarBoardRefreshCountRef = useRef(0);
  const lastRadarAutoImportRefreshKeyRef = useRef("");
  const radarBoardRefreshInFlightRef = useRef(false);
  const latestRadarRunHydratedRef = useRef(false);
  const todayAgendaLaunchNotice = useQuickLaunchNotice();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  useEffect(() => {
    if (mobileRoute) return;
    const radarParam = String(searchParams.get("radar") || "").trim().toLowerCase();
    if (radarParam === "1" || radarParam === "open" || radarParam === "true") {
      setRadarPopupOpen(true);
    }
  }, [mobileRoute, searchParams]);

  useEffect(() => {
    if (mobileRoute || typeof window === "undefined") return undefined;
    const handleDesktopRadarPopup = () => setRadarPopupOpen(true);
    window.addEventListener("hbx:vendas-radar-popup", handleDesktopRadarPopup);
    return () => window.removeEventListener("hbx:vendas-radar-popup", handleDesktopRadarPopup);
  }, [mobileRoute]);

  useEffect(() => {
    if (!radarPopupOpen || typeof window === "undefined") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setRadarPopupOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [radarPopupOpen]);

  const detectDateFilterCollision = useMemo<CollisionDetection>(
    () =>
      ({ pointerCoordinates, droppableContainers }) => {
        if (!pointerCoordinates) return [];

        for (const container of droppableContainers) {
          const id = String(container.id);
          const node = dateFilterRefs.current[id];
          const rect = node?.getBoundingClientRect();
          if (!rect) continue;

          if (
            pointerCoordinates.x >= rect.left &&
            pointerCoordinates.x <= rect.right &&
            pointerCoordinates.y >= rect.top &&
            pointerCoordinates.y <= rect.bottom
          ) {
            return [
              {
                id: container.id,
                data: { droppableContainer: container, value: 0 },
              },
            ];
          }
        }

        return [];
      },
    [],
  );

  function applyBoardPayload(
    normalizedPayload: BoardResponse,
    options?: { forceHydrateDrafts?: boolean },
  ) {
    setBoard((previous) =>
      boardsPayloadEqual(previous, normalizedPayload) ? previous : normalizedPayload,
    );
    const skipHydrate =
      !options?.forceHydrateDrafts &&
      (composerOpenRef.current ||
        editingInputActiveRef.current ||
        Boolean(editingLeadId) ||
        (mobileRoute && mobileSkipDraftHydrateRef.current));
    if (skipHydrate) {
      setDrafts((current) =>
        mergeHydratedDraftsPreservingInput(normalizedPayload, current),
      );
    } else {
      setDrafts(hydrateDrafts(normalizedPayload));
    }
  }

  async function loadBoard(options?: {
    forceHydrateDrafts?: boolean;
    forceVisualRefresh?: boolean;
  }) {
    setError(null);
    try {
      const payload = await apiFetch<BoardResponse>("/vendas/board");
      const normalizedPayload = normalizeBoardForLocalAgenda(payload);
      if (!options?.forceVisualRefresh && isTextEntryElementActive()) {
        pendingVisualBoardRef.current = normalizedPayload;
      } else {
        pendingVisualBoardRef.current = null;
        applyBoardPayload(normalizedPayload, options);
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Falha ao carregar o CRM de Vendas.",
      );
    } finally {
      setLoading(false);
    }
  }

  const loadBoardRef = useRef(loadBoard);

  useEffect(() => {
    loadBoardRef.current = loadBoard;
  });

  const hasEnrichingLead = useMemo(() => {
    if (!board) return false;
    return (["overdue", "today", "scheduled", "closed"] as LeadBlockKey[]).some((blockKey) =>
      (board.blocks[blockKey] || []).some((lead) => leadEnrichmentBadgeState(lead, board)?.state === "enriching"),
    );
  }, [board]);

  async function loadSalesProfile() {
    try {
      const payload = await apiFetch<SalesProfileResponse>("/vendas/sales-profile");
      setSalesProfile(payload);
      setSalesProfileDraft(salesProfileDraftFromResponse(payload));
    } catch {
      setSalesProfile(null);
      setSalesProfileDraft(SALES_PROFILE_DEFAULT_DRAFT);
    }
  }

  async function saveSalesProfile() {
    setSalesProfileSaving(true);
    setError(null);
    try {
      const payload = await apiFetch<SalesProfileResponse>("/vendas/sales-profile", {
        method: "PATCH",
        body: JSON.stringify({
          whatDoYouSell: salesProfileDraft.whatDoYouSell,
          offerCategory: salesProfileDraft.offerCategory,
          targetAudience: { labels: salesProfileDraft.targetAudience },
          targetSegments: { labels: salesProfileDraft.targetSegments },
          avoidSegments: {
            labels: salesProfileDraft.avoidSegments,
            hardReject: salesProfileDraft.avoidSegments.filter((item) =>
              /órgão|orgao|diretório|diretorio|sem telefone|segmento errado/i.test(item),
            ),
          },
          preferredChannels: salesProfileDraft.preferredChannels,
          leadPreferences: {
            preferSmallBusiness: true,
            preferNoWebsite: true,
            preferInstagram: salesProfileDraft.preferredChannels.includes("instagram"),
            preferWhatsapp: salesProfileDraft.preferredChannels.includes("whatsapp"),
            preferHighReviews: true,
            preferLocalBusiness: true,
          },
          negativeRules: {
            avoidPublicSector: salesProfileDraft.avoidSegments.some((item) => /órgão|orgao/i.test(item)),
            avoidLargeCompanies: salesProfileDraft.avoidSegments.some((item) => /grande/i.test(item)),
            avoidDirectories: salesProfileDraft.avoidSegments.some((item) => /diretório|diretorio|lista/i.test(item)),
            avoidNoPhone: salesProfileDraft.avoidSegments.some((item) => /sem telefone/i.test(item)),
            avoidNoWhatsapp: salesProfileDraft.avoidSegments.some((item) => /sem whatsapp/i.test(item)),
            avoidOutOfCity: salesProfileDraft.avoidSegments.some((item) => /fora da cidade/i.test(item)),
          },
          weeklyAutoUpdateEnabled: salesProfileDraft.weeklyAutoUpdateEnabled,
        }),
      });
      setSalesProfile(payload);
      setSalesProfileDraft(salesProfileDraftFromResponse(payload));
      setFeedback("Perfil de Venda salvo.");
    } catch (profileError) {
      setError(profileError instanceof Error ? profileError.message : "Falha ao salvar Perfil de Venda.");
    } finally {
      setSalesProfileSaving(false);
    }
  }

  async function suggestSalesProfile() {
    setSalesProfileSaving(true);
    setError(null);
    try {
      const payload = await apiFetch<{ suggestion?: SalesProfileSuggestion | null }>("/vendas/sales-profile/suggest-weekly", {
        method: "POST",
      });
      setSalesProfileSuggestion(payload.suggestion || null);
      setFeedback("Sugestão gerada com base na semana.");
    } catch (profileError) {
      setError(profileError instanceof Error ? profileError.message : "Falha ao gerar sugestão.");
    } finally {
      setSalesProfileSaving(false);
    }
  }

  async function loadConversionReport(period = conversionReportPeriod) {
    setConversionReportLoading(true);
    try {
      const payload = await apiFetch<ConversionReportResponse>(`/vendas/report?period=${encodeURIComponent(period)}`);
      setConversionReport(payload);
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : "Falha ao carregar relatório.");
    } finally {
      setConversionReportLoading(false);
    }
  }

  async function exportConversionReportPdf() {
    try {
      const token = getToken();
      const response = await fetch(`${getDashboardApiBaseUrl()}/vendas/report/export.pdf?period=${encodeURIComponent(conversionReportPeriod)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error(await response.text());
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (pdfError) {
      setError(pdfError instanceof Error ? pdfError.message : "Falha ao exportar PDF.");
    }
  }

  useEffect(() => {
    const requestedSection = String(searchParams?.get("mobileSection") || "").trim();
    const requestedSheet = String(searchParams?.get("mobileSheet") || "").trim();
    const deepLinkKey = `${requestedSection}:${requestedSheet}`;
    if (!requestedSection && !requestedSheet) return;
    if (mobileDeepLinkHandledRef.current === deepLinkKey) return;
    mobileDeepLinkHandledRef.current = deepLinkKey;

    if (requestedSection === "report") setMobileSection("report");
    if (requestedSection === "cards") {
      setMobileSection("cards");
      setMobileAgendaTab("upcoming");
    }
    if (requestedSection === "today") {
      setMobileSection("today");
      setMobileAgendaTab("today");
    }
    if (requestedSheet === "account") {
      setAccountNameDraft(mobilePreferredCallerName || readMobilePreferredCallerName());
      setAccountSheetOpen(true);
    }
  }, [mobilePreferredCallerName, searchParams]);

  useEffect(() => {
    const syncStoredRun = () => {
      const next = readStoredRadarRun();
      setStoredRadarRun((previous) => {
        try {
          return JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
        } catch {
          return next;
        }
      });
    };
    syncStoredRun();
    return subscribeStoredRadarRun(syncStoredRun);
  }, []);

  useEffect(() => {
    if (hasToken !== true || storedRadarRun?.runId || latestRadarRunHydratedRef.current) return;
    latestRadarRunHydratedRef.current = true;
    let cancelled = false;
    apiFetch<RadarSearchRunResponse | null>("/webscraping/radar/search-runs/latest", {
      requireAuth: true,
      timeoutMs: 15000,
    })
      .then((payload) => {
        if (cancelled || !payload?.runId) return;
        saveStoredRadarRun({
          runId: payload.runId || payload.id,
          status: payload.status,
          city: payload.meta?.filters?.city || null,
          state: payload.meta?.filters?.state || null,
          segment: payload.meta?.filters?.segment || null,
          radiusKm: Number(payload.meta?.filters?.radiusKm ?? 0) || 0,
          regionalCities: payload.meta?.filters?.regionalCities || null,
          selectedSegments: payload.meta?.filters?.selectedSegments || null,
          targetQuantity: Number(payload.targetQuantity || payload.meta?.requestedQuantity || 0) || null,
          deliveredCount: Number(payload.meta?.deliveredCount || payload.foundCount || 0) || 0,
        });
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [hasToken, storedRadarRun?.runId]);

  useEffect(() => {
    if (hasToken !== true) return undefined;
    const runId = storedRadarRun?.runId;
    if (!runId) {
      setLiveRadarRun(null);
      return undefined;
    }
    const activeRunId = runId;

    async function refreshRadarRun() {
      const payload = await apiFetch<RadarSearchRunResponse>(`/webscraping/radar/search-runs/${encodeURIComponent(activeRunId)}`, {
        requireAuth: true,
        timeoutMs: 15000,
      });
      setLiveRadarRun((previous) => {
        return radarRunResponseEqual(previous, payload) ? previous : payload;
      });
      if (payload.status === "canceled") {
        clearStoredRadarRun(activeRunId);
        return;
      }
      const deliveredCount = Number(payload.meta?.deliveredCount || payload.foundCount || storedRadarRun?.deliveredCount || 0) || 0;
      saveStoredRadarRun({
        runId: payload.runId || payload.id,
        status: payload.status,
        city: payload.meta?.filters?.city || storedRadarRun?.city || null,
        state: payload.meta?.filters?.state || storedRadarRun?.state || null,
        segment: payload.meta?.filters?.segment || storedRadarRun?.segment || null,
        radiusKm: Number(payload.meta?.filters?.radiusKm ?? storedRadarRun?.radiusKm ?? 0) || 0,
        regionalCities: payload.meta?.filters?.regionalCities || storedRadarRun?.regionalCities || null,
        selectedSegments: payload.meta?.filters?.selectedSegments || storedRadarRun?.selectedSegments || null,
        targetQuantity: Number(payload.targetQuantity || payload.meta?.requestedQuantity || storedRadarRun?.targetQuantity || 0) || null,
        deliveredCount,
      });
      if (
        deliveredCount > lastRadarBoardRefreshCountRef.current &&
        !composerOpenRef.current &&
        !radarBoardRefreshInFlightRef.current
      ) {
        lastRadarBoardRefreshCountRef.current = deliveredCount;
        radarBoardRefreshInFlightRef.current = true;
        void loadBoard().finally(() => {
          radarBoardRefreshInFlightRef.current = false;
        });
      }
      const autoImport = payload.meta?.autoImport || null;
      const autoImportKey = autoImport
        ? [
            payload.runId || payload.id || activeRunId,
            Number(autoImport.processedCount || 0),
            Number(autoImport.importedCount || 0),
            Number(autoImport.pendingCount || 0),
          ].join(":")
        : "";
      const autoImportTouchedAgenda =
        Number(autoImport?.processedCount || 0) > 0 ||
        Number(autoImport?.importedCount || 0) > 0 ||
        Number(autoImport?.pendingCount || 0) > 0;
      if (
        autoImportKey &&
        autoImportKey !== lastRadarAutoImportRefreshKeyRef.current &&
        autoImportTouchedAgenda &&
        !composerOpenRef.current &&
        !radarBoardRefreshInFlightRef.current
      ) {
        lastRadarAutoImportRefreshKeyRef.current = autoImportKey;
        radarBoardRefreshInFlightRef.current = true;
        void loadBoard({ forceVisualRefresh: true }).finally(() => {
          radarBoardRefreshInFlightRef.current = false;
        });
      }
    }

    if (isTerminalRadarRunStatus(storedRadarRun?.status)) {
      void refreshRadarRun().catch(() => null);
      return undefined;
    }

    return startSmartPolling(async () => {
      if (composerOpenRef.current) return;
      try {
        await refreshRadarRun();
      } catch {
        // keep the last visible Radar status if one poll fails
      }
    }, {
      intervalMs: mobileRoute ? 6500 : 2200,
      immediate: true,
      pauseWhenHidden: true,
    });
  }, [hasToken, mobileRoute, storedRadarRun?.city, storedRadarRun?.deliveredCount, storedRadarRun?.runId, storedRadarRun?.segment, storedRadarRun?.state, storedRadarRun?.status, storedRadarRun?.targetQuantity]);

  useEffect(() => {
    if (composerOpenRef.current || mobileSkipDraftHydrateRef.current) return;
    const pendingCount = Math.max(
      0,
      (board?.summary.overdue || 0) + (board?.summary.today || 0) + (board?.summary.scheduled || 0),
    );
    const deliveredCount = Math.max(
      pendingCount,
      Number(liveRadarRun?.meta?.deliveredCount || liveRadarRun?.foundCount || storedRadarRun?.deliveredCount || 0),
    );
    const status = String(liveRadarRun?.status || storedRadarRun?.status || "");
    const previous = lastRadarStatusSnapshotRef.current;
    if (previous && (deliveredCount > previous.count || (status && status !== previous.status))) {
      setRadarStatusPulseKey((current) => current + 1);
    }
    lastRadarStatusSnapshotRef.current = { count: deliveredCount, status };
  }, [
    board?.summary.overdue,
    board?.summary.scheduled,
    board?.summary.today,
    liveRadarRun?.foundCount,
    liveRadarRun?.meta?.deliveredCount,
    liveRadarRun?.status,
    storedRadarRun?.deliveredCount,
    storedRadarRun?.status,
  ]);

  const openInboxAgenda = useCallback(
    (conversationId?: string | number | null) => {
      todayAgendaLaunchNotice.clear();
      const params = new URLSearchParams({
        atendimentoQueue: "bot",
        atendimentoSection: "conversa",
      });
      if (conversationId) params.set("conversationId", String(conversationId));
      router.push(`/atendimento?${params.toString()}`);
    },
    [router, todayAgendaLaunchNotice],
  );

  const syncLeadsToInbox = useCallback(
    async (
      leads: LeadItem[],
      options?: { openAfter?: boolean; title?: string; description?: string },
    ) => {
      const visibleLeadIds = leads.map((lead) => lead.id).filter(Boolean);
      if (!visibleLeadIds.length) {
        setFeedback("Nenhum card visível para importar ao Inbox.");
        return null;
      }

      todayAgendaLaunchNotice.start({
        loadingTitle: options?.title || "Abrindo Inbox",
        loadingDescription:
          options?.description || "Enviando os cards visíveis para Prospecção.",
        successTitle: "Prospecção pronta",
        successDescription:
          "Tudo certo. Os cards foram preparados em Prospecção.",
        ctaLabel: "Abrir Prospecção",
        onOpen: () => openInboxAgenda(),
      });

      try {
        const syncResult = await apiFetch<TodayAgendaSyncResponse>(
          "/vendas/agenda/whatsapp/sync-today",
          {
            method: "POST",
            body: JSON.stringify({ leadIds: visibleLeadIds }),
          },
        );
        const todayLeadCount = Number(syncResult?.todayLeadCount || 0);
        const mirroredLeadCount = Number(syncResult?.mirroredLeadCount || 0);
        if (!syncResult?.ok) {
          throw new Error(
            syncResult?.message ||
              "Os cards visíveis nao foram enviados para Prospecção. Recarregue e tente novamente.",
          );
        }
        const firstConversationId =
          syncResult?.conversationIds?.[0] ||
          (syncResult?.leadConversationIds
            ? syncResult.leadConversationIds[visibleLeadIds[0]]
            : null) ||
          null;
        const importedLeadIds = syncResult?.leadConversationIds
          ? Object.keys(syncResult.leadConversationIds)
          : firstConversationId && visibleLeadIds.length === 1
            ? visibleLeadIds
            : [];
        if (importedLeadIds.length) {
          setBoard((currentBoard) =>
            markBoardLeadsInInbox(
              currentBoard,
              importedLeadIds,
              syncResult?.leadConversationIds,
              firstConversationId,
            ),
          );
        }
        todayAgendaLaunchNotice.markSuccess({
          successDescription:
            String(syncResult?.message || "").trim() ||
            (todayLeadCount
              ? `${mirroredLeadCount} card(s) foram preparados em Prospecção com roteiro pendente para envio manual.`
              : "Nao ha cards visíveis para preparar em Prospecção."),
        });
        await loadBoard();
        if (options?.openAfter) openInboxAgenda(firstConversationId);
        return syncResult;
      } catch (syncError) {
        todayAgendaLaunchNotice.clear();
        setError(
          syncError instanceof Error
            ? syncError.message
            : "Falha ao importar cards para Prospecção.",
        );
        return null;
      }
    },
    [openInboxAgenda, todayAgendaLaunchNotice],
  );

  useEffect(() => {
    if (hasToken !== true) return;
    void loadBoard();
  }, [hasToken]);

  useEffect(() => {
    composerOpenRef.current = composerOpen;
  }, [composerOpen]);

  useEffect(() => {
    setMobilePreferredCallerName(readMobilePreferredCallerName());
    setAccountNameDraft(readMobilePreferredCallerName());
  }, []);

  useEffect(() => {
    boardRef.current = board;
  }, [board]);

  useEffect(() => {
    if (hasToken !== true || !hasEnrichingLead) return undefined;
    return startSmartPolling(async () => {
      if (composerOpenRef.current) return;
      await loadBoardRef.current({ forceVisualRefresh: true });
    }, {
      intervalMs: mobileRoute ? 4200 : 3200,
      immediate: false,
      pauseWhenHidden: true,
    });
  }, [hasToken, hasEnrichingLead, mobileRoute]);

  useEffect(() => {
    function handleFocusOut() {
      window.setTimeout(() => {
        if (isTextEntryElementActive()) return;
        const pending = pendingVisualBoardRef.current;
        if (!pending) return;
        pendingVisualBoardRef.current = null;
        applyBoardPayload(pending);
      }, 220);
    }

    document.addEventListener("focusout", handleFocusOut);
    return () => document.removeEventListener("focusout", handleFocusOut);
  });

  useEffect(() => {
    if (!accountSheetOpen || hasToken !== true) return;
    let cancelled = false;
    setAccountProfileLoading(true);
    void (async () => {
      try {
        const profile = await apiFetch<{
          email?: string | null;
          company?: {
            paymentStatus?: string | null;
            subscriptionStatus?: string | null;
            premiumAccess?: boolean | null;
          } | null;
        }>("/profile/current-user");
        if (!cancelled) setAccountProfile(profile);
      } catch {
        if (!cancelled) setAccountProfile(null);
      } finally {
        if (!cancelled) setAccountProfileLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountSheetOpen, hasToken]);

  useEffect(() => {
    if (hasToken !== true) return;
    void loadSalesProfile();
  }, [hasToken]);

  useEffect(() => {
    if (hasToken !== true || mobileSection !== "report") return;
    void loadConversionReport(conversionReportPeriod);
  }, [hasToken, mobileSection, conversionReportPeriod]);

  useEffect(() => {
    if (hasToken !== true) return;
    if (searchParams?.get("agendaStudio") !== "1") return;
    const mode = searchParams?.get("agendaMode") || "sales";
    if (mode !== "sales") return;
    router.replace(
      "/atendimento?atendimentoQueue=scheduled&atendimentoSection=agenda&agendaStudio=1&agendaMode=sales&returnTo=%2Fvendas",
    );
  }, [hasToken, router, searchParams]);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 5200);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    if (!pulseDateKey) return;
    const timer = window.setTimeout(() => setPulseDateKey(null), 560);
    return () => window.clearTimeout(timer);
  }, [pulseDateKey]);

  useEffect(() => {
    if (!flyAnimation) return;
    const timer = window.setTimeout(() => setFlyAnimation(null), 460);
    return () => window.clearTimeout(timer);
  }, [flyAnimation]);

  useEffect(() => {
    function handleKeyboardShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
        return;
      }
      if (event.key === "Escape") setCommandOpen(false);
    }
    window.addEventListener("keydown", handleKeyboardShortcut);
    return () => window.removeEventListener("keydown", handleKeyboardShortcut);
  }, []);

  const leadById = useMemo(() => {
    const map = new Map<string, { lead: LeadItem; block: LeadBlockKey }>();
    if (!board) return map;
    (["overdue", "today", "scheduled", "closed"] as LeadBlockKey[]).forEach(
      (blockKey) => {
        (board.blocks[blockKey] || []).forEach((lead) =>
          map.set(lead.id, { lead, block: blockKey }),
        );
      },
    );
    return map;
  }, [board]);

  const allLeads = useMemo(() => {
    const items: Array<{ lead: LeadItem; block: LeadBlockKey }> = [];
    if (!board) return items;
    (["overdue", "today", "scheduled", "closed"] as LeadBlockKey[]).forEach(
      (blockKey) => {
        (board.blocks[blockKey] || []).forEach((lead) =>
          items.push({ lead, block: blockKey }),
        );
      },
    );
    const orderWeight: Record<LeadBlockKey, number> = {
      overdue: 0,
      today: 1,
      scheduled: 2,
      closed: 3,
    };
    return items.sort((left, right) => {
      const blockDiff = orderWeight[left.block] - orderWeight[right.block];
      if (blockDiff !== 0) return blockDiff;
      return (
        new Date(right.lead.updatedAt || 0).getTime() -
        new Date(left.lead.updatedAt || 0).getTime()
      );
    });
  }, [board]);

  const mobileVisualFiltersUnlocked = Boolean(
    board?.capabilities?.canUseAdvancedFilters ||
    board?.capabilities?.canSeeLeadIntelligence ||
    board?.capabilities?.canSeeSocialLinks === true ||
    salesProfile?.capabilities?.canUseAdvancedFilters ||
    salesProfile?.capabilities?.canSeeLeadIntelligence ||
    salesProfile?.capabilities?.canSeeSocialLinks === true,
  );
  const mobileVisualFiltersActive =
    mobileVisualChannelFilters.length > 0 || mobileMinScoreFilter > 0;

  const mobileLeads = useMemo(() => {
    const normalized = mobileSearch.trim().toLowerCase();
    const liveLeads = (mobileSection === "cards" ? allLeads.filter(({ block }) => block !== "closed") : allLeads.filter(({ block }) => {
      if (mobileAgendaTab === "overdue") return block === "overdue";
      if (mobileAgendaTab === "today") return block === "today";
      return block === "scheduled";
    })).sort((left, right) => {
      if (mobileAgendaTab !== "upcoming") return 0;
      return (
        new Date(left.lead.returnAt || left.lead.updatedAt || 0).getTime() -
        new Date(right.lead.returnAt || right.lead.updatedAt || 0).getTime()
      );
    });
    const visuallyFiltered = mobileVisualFiltersActive
      ? liveLeads.filter(({ lead }) => (
          mobileVisualChannelFilters.every((channel) => leadHasVisualChannel(lead, channel)) &&
          leadVisualScore(lead) >= mobileMinScoreFilter
        ))
      : liveLeads;
    if (!normalized) return visuallyFiltered;
    return visuallyFiltered
      .filter(({ lead, block }) =>
        [
          lead.name,
          lead.city,
          lead.address,
          lead.segment,
          lead.statusLabel,
          lead.nextAction,
          lead.shortNote,
          block,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalized),
      );
  }, [
    allLeads,
    mobileAgendaTab,
    mobileMinScoreFilter,
    mobileSearch,
    mobileSection,
    mobileVisualChannelFilters,
    mobileVisualFiltersActive,
  ]);

  const selectedMobileLead = useMemo(() => {
    if (!selectedMobileLeadId) return null;
    return allLeads.find(({ lead }) => lead.id === selectedMobileLeadId)?.lead || null;
  }, [allLeads, selectedMobileLeadId]);

  function toggleMobileVisualFilter(channel: MobileVisualChannelFilter) {
    if (!mobileVisualFiltersUnlocked) return;
    setMobileVisualChannelFilters((current) =>
      current.includes(channel)
        ? current.filter((item) => item !== channel)
        : [...current, channel],
    );
  }

  function clearMobileVisualFilters() {
    setMobileVisualChannelFilters([]);
    setMobileMinScoreFilter(0);
  }

  function stepMobileScoreFilter(delta: number) {
    setMobileMinScoreFilter((current) => Math.max(0, Math.min(100, current + delta)));
  }

  function setMobileScoreFilterValue(value: number) {
    const nextValue = Number.isFinite(value) ? value : 0;
    setMobileMinScoreFilter(Math.max(0, Math.min(100, Math.round(nextValue))));
  }

  useEffect(() => {
    if (!mobileScoreFilterOpen || typeof window === "undefined") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileScoreFilterOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileScoreFilterOpen]);

  useEffect(() => {
    if (selectedMobileLeadId) saveMobileOpenLeadId(selectedMobileLeadId);
  }, [selectedMobileLeadId]);

  useEffect(() => {
    if (!selectedMobileLead) {
      setMobileAnimatedScore(0);
      mobileScoreAnimatedKeyRef.current = null;
      return;
    }
    const intelligenceVisible = canSeeLeadIntelligence(selectedMobileLead, board);
    const target = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          Number(intelligenceVisible ? selectedMobileLead.leadIntelligence?.opportunityScore || 0 : 0),
        ),
      ),
    );
    const animationKey = `${selectedMobileLead.id}:${intelligenceVisible ? "visible" : "locked"}:${target}`;
    if (typeof window === "undefined") {
      setMobileAnimatedScore(target);
      mobileScoreAnimatedKeyRef.current = animationKey;
      return;
    }
    if (
      target <= 0 ||
      mobileScoreAnimatedKeyRef.current === animationKey ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      setMobileAnimatedScore(target);
      mobileScoreAnimatedKeyRef.current = animationKey;
      return;
    }

    const runId = mobileScoreAnimationRunRef.current + 1;
    mobileScoreAnimationRunRef.current = runId;
    let frame = 0;
    let timer = 0;
    const duration = 680;
    setMobileAnimatedScore(0);

    timer = window.setTimeout(() => {
      if (mobileScoreAnimationRunRef.current !== runId) return;
      mobileScoreAnimatedKeyRef.current = animationKey;
      const startedAt = performance.now();

      const tick = (now: number) => {
        if (mobileScoreAnimationRunRef.current !== runId) return;
        const progress = Math.min(1, (now - startedAt) / duration);
        const eased = 1 - Math.pow(1 - progress, 2.4);
        const nextValue = progress >= 1 ? target : Math.min(target - 1, Math.round(target * eased));
        setMobileAnimatedScore(nextValue);
        if (progress < 1) {
          frame = window.requestAnimationFrame(tick);
        }
      };

      frame = window.requestAnimationFrame(tick);
    }, 40);

    return () => {
      window.clearTimeout(timer);
      window.cancelAnimationFrame(frame);
    };
  }, [board, selectedMobileLead]);

  useEffect(() => {
    const storedOpenLeadId = readMobileOpenLeadId();
    if (!storedOpenLeadId || selectedMobileLeadId) return;
    const record = allLeads.find(({ lead }) => lead.id === storedOpenLeadId);
    if (record) {
      setSelectedMobileLeadId(record.lead.id);
      setMobileNoteLead(record.lead);
      setMobileNoteDraft("");
    }
  }, [allLeads, selectedMobileLeadId]);

  useEffect(() => {
    if (!selectedMobileLeadId) return;
    const record = allLeads.find(({ lead }) => lead.id === selectedMobileLeadId);
    if (!record || record.lead === mobileNoteLead) return;
    setMobileNoteLead(record.lead);
  }, [allLeads, mobileNoteLead, selectedMobileLeadId]);

  const loadedLeadIds = useMemo(
    () => allLeads.map(({ lead }) => lead.id).filter(Boolean),
    [allLeads],
  );

  useEffect(() => {
    if (bulkSelectAllAccount) return;
    const availableIds = new Set(loadedLeadIds);
    setSelectedBulkLeadIds((current) => {
      const next = new Set(
        [...current].filter((leadId) => availableIds.has(leadId)),
      );
      return next.size === current.size ? current : next;
    });
  }, [bulkSelectAllAccount, loadedLeadIds]);

  const deferredCommandQuery = useDeferredValue(commandQuery);
  const commandResults = useMemo(() => {
    const normalized = deferredCommandQuery.trim().toLowerCase();
    const items = allLeads.slice(0, 20);
    if (!normalized) return items;
    return items.filter(({ lead, block }) =>
      [
        lead.name,
        lead.phone,
        lead.email,
        lead.address,
        lead.city,
        lead.segment,
        lead.nextAction,
        lead.shortNote,
        lead.lastResult,
        lead.primarySource,
        block,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [allLeads, deferredCommandQuery]);

  const dateFilters = useMemo<DateFilterItem[]>(() => {
    const scheduledGroups = new Map<string, LeadItem[]>();
    (board?.blocks.scheduled || []).forEach((lead) => {
      const dateKey = buildLocalDateKey(lead.returnAt || lead.updatedAt);
      if (!dateKey) return;
      scheduledGroups.set(dateKey, [
        ...(scheduledGroups.get(dateKey) || []),
        lead,
      ]);
    });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const futureBase = Array.from({ length: 14 }, (_, index) => {
      const current = new Date(today);
      current.setDate(today.getDate() + index + 1);
      const dateKey = buildLocalDateKey(current.toISOString());
      const leads = scheduledGroups.get(dateKey) || [];
      return {
        key: `scheduled:${dateKey}` as const,
        blockKey: "scheduled" as const,
        count: leads.length,
        title: railTitle(dateKey),
        subtitle: leads.length
          ? pluralize(leads.length, "retorno futuro", "retornos futuros")
          : "Sem agenda",
        dayLabel: railDay(dateKey),
        isoDate: dateKey,
      };
    });
    const lastFutureKey = futureBase[futureBase.length - 1]?.isoDate || "";
    const extraFuture = Array.from(scheduledGroups.entries())
      .filter(([dateKey]) => dateKey > lastFutureKey)
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([dateKey, leads]) => ({
        key: `scheduled:${dateKey}` as const,
        blockKey: "scheduled" as const,
        count: leads.length,
        title: railTitle(dateKey),
        subtitle: pluralize(leads.length, "retorno futuro", "retornos futuros"),
        dayLabel: railDay(dateKey),
        isoDate: dateKey,
      }));
    return [
      {
        key: "overdue",
        blockKey: "overdue",
        count: board?.summary.overdue || 0,
        title: "Atrasados",
        subtitle: board?.summary.overdue
          ? "Ontem para trás."
          : "Sem pendência.",
        dayLabel: "Prioridade",
      },
      {
        key: "today",
        blockKey: "today",
        count: board?.summary.today || 0,
        title: "Hoje",
        subtitle: board?.summary.today ? "Fluxo principal." : "Sem agenda.",
        dayLabel: "Operação",
      },
      ...futureBase,
      ...extraFuture,
    ];
  }, [board]);

  useEffect(() => {
    if (!dateFilters.length) return;
    setSelectedDateKey((current) => {
      if (dateFilters.some((item) => item.key === current)) return current;
      return (
        dateFilters.find((item) => item.count > 0)?.key || dateFilters[0].key
      );
    });
  }, [dateFilters]);

  const selectedFilter = useMemo(
    () =>
      dateFilters.find((item) => item.key === selectedDateKey) ||
      dateFilters[0] ||
      null,
    [dateFilters, selectedDateKey],
  );

  const filteredLeads = useMemo(() => {
    if (!board || !selectedFilter) return [];
    const scopedLeads =
      selectedFilter.key === "overdue"
        ? board.blocks.overdue || []
        : selectedFilter.key === "today"
          ? board.blocks.today || []
          : (board.blocks.scheduled || []).filter(
              (lead) =>
                buildLocalDateKey(lead.returnAt || lead.updatedAt) ===
                selectedFilter.isoDate,
            );
    return scopedLeads.filter(
      (lead) =>
        matchesWhatsappFilter(lead, whatsappFilter) &&
        matchesInboxFilter(lead, inboxFilter),
    );
  }, [board, selectedFilter, whatsappFilter, inboxFilter]);

  useEffect(() => {
    const notice = todayAgendaLaunchNotice.notice;
    const live = loading || notice?.phase === "loading";
    if (!live) {
      setVendasVisualCount(0);
      return undefined;
    }
    const target = Math.max(
      1,
      filteredLeads.length || board?.summary.total || 12,
    );
    setVendasVisualCount(1);
    const timer = window.setInterval(() => {
      setVendasVisualCount((current) => Math.min(target, current + 1));
    }, 210);
    return () => window.clearInterval(timer);
  }, [
    board?.summary.total,
    filteredLeads.length,
    loading,
    todayAgendaLaunchNotice.notice,
  ]);

  useEffect(() => {
    const notice = todayAgendaLaunchNotice.notice;
    const totalVisible = filteredLeads.length;
    const archivedCount = board?.summary.closed || 0;
    const metrics = [
      { label: "Restante", value: String(totalVisible) },
      { label: "Descarte", value: String(archivedCount) },
    ];
    const errorMessage = compactVendasMessage(error);
    const liveCards = filteredLeads
      .slice(0, Math.max(1, vendasVisualCount))
      .slice(-4)
      .map((lead) => ({
        id: `vendas:${lead.id}`,
        title: lead.name || "Card em Vendas",
        meta:
          [lead.segment, lead.city, lead.statusLabel]
            .filter(Boolean)
            .join(" • ") || "Prospecção",
        score: lead.timesSeen ? `${lead.timesSeen}x` : undefined,
      }));

    if (errorMessage) {
      dispatchTopbarProgress({
        source: "vendas",
        phase: "warning",
        title: "Vendas precisa de atenção",
        status: errorMessage,
        progress: 100,
        metrics,
      });
      return;
    }

    if (feedback) {
      dispatchTopbarProgress({
        source: "vendas",
        phase: "success",
        title: "Vendas atualizado",
        status: feedback,
        progress: 100,
        metrics,
      });
      return;
    }

    if (!notice && !loading) {
      clearTopbarProgress("vendas");
      return;
    }

    dispatchTopbarProgress({
      source: "vendas",
      phase: notice?.phase || "loading",
      title:
        notice?.phase === "success"
          ? notice.title
          : loading
            ? "Carregando Vendas"
            : "Sincronizando Vendas",
      status:
        notice?.statusLabel ||
        (loading
          ? "Preparando a agenda comercial..."
          : "Filtrando negativos e alimentando Prospecção..."),
      progress: notice?.progress ?? 18,
      steps: VENDAS_PROGRESS_STEPS,
      activeStepIndex: loading ? 0 : 3,
      cardFeed: liveCards,
      metrics,
    });
  }, [
    board?.summary.closed,
    error,
    feedback,
    filteredLeads,
    filteredLeads.length,
    loading,
    todayAgendaLaunchNotice.notice,
    vendasVisualCount,
  ]);

  useEffect(() => () => clearTopbarProgress("vendas"), []);

  useEffect(() => () => setVendasCardDragLock(false), []);

  const handleActiveDateShortcut = useCallback(async () => {
    if (!selectedFilter) return;
    await syncLeadsToInbox(filteredLeads, {
      title: "Abrindo Inbox",
      description: `Enviando os cards visíveis de ${selectedFilter.title} para Prospecção.`,
    });
  }, [filteredLeads, selectedFilter, syncLeadsToInbox]);

  useEffect(() => {
    setSelectedLeadId((current) => {
      if (current && filteredLeads.some((lead) => lead.id === current))
        return current;
      if (
        current &&
        showClosed &&
        (board?.blocks.closed || []).some((lead) => lead.id === current)
      )
        return current;
      // Do not auto-select the first lead by default. Keep selection null
      // until user explicitly focuses a lead to avoid the first card
      // being treated differently on initial render.
      return null;
    });
  }, [board?.blocks.closed, filteredLeads, showClosed]);

  useEffect(() => {
    if (!showClosed || !archiveRef.current) return;
    const id = window.setTimeout(() => {
      archiveRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      archiveRef.current?.focus();
    }, 80);
    return () => window.clearTimeout(id);
  }, [showClosed]);

  const selectedLeadRecord = selectedLeadId
    ? leadById.get(selectedLeadId) || null
    : null;
  const selectedLead = selectedLeadRecord?.lead || null;
  const selectedLeadDraft = selectedLead
    ? drafts[selectedLead.id] || createDraft(selectedLead)
    : null;
  const closedLeads = board?.blocks.closed || [];
  const mobileLeadCount = Math.max(
    board?.summary.total || 0,
    (board?.summary.overdue || 0) +
      (board?.summary.today || 0) +
      (board?.summary.scheduled || 0),
  );
  const mobileFutureCount = board?.summary.scheduled || 0;

  useEffect(() => {
    return () => {
      if (mobileBulkHoldTimerRef.current) {
        window.clearTimeout(mobileBulkHoldTimerRef.current);
      }
    };
  }, []);

  function mobileLeadPlace(lead: LeadItem) {
    const city = String(lead.city || "").trim();
    const address = String(lead.address || "").trim();
    const stateMatch = address.match(/\b([A-Z]{2})\b(?:\s*,?\s*Brasil)?$/);
    const state = stateMatch?.[1] || "";
    if (city && state && !city.includes(state)) return `${city} / ${state}`;
    return city || address || "Local não informado";
  }

  function mobileReturnLabel(lead: LeadItem) {
    const parsed = lead.returnAt ? new Date(lead.returnAt) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) return "Sem retorno";
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    const sameDay = (left: Date, right: Date) =>
      left.getFullYear() === right.getFullYear() &&
      left.getMonth() === right.getMonth() &&
      left.getDate() === right.getDate();
    const time = parsed.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    if (sameDay(parsed, today)) return `Hoje ${time}`;
    if (sameDay(parsed, tomorrow)) return `Amanhã ${time}`;
    return formatDateTime(lead.returnAt);
  }

  function mobilePhoneLabel(lead: LeadItem) {
    const digits = normalizePhoneDigits(String(lead.phone || ""));
    if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return lead.phone || "Telefone não informado";
  }

  function mobileLeadSourceLabel(lead: LeadItem) {
    if (lead.primarySource) return lead.primarySource;
    if (lead.sourceType === "webscraping") return "Radar Digital";
    return "Cadastro manual";
  }

  function mergeMobileLeadPatch(leadId: string, patch: Partial<LeadItem>) {
    setBoard((currentBoard) => {
      if (!currentBoard) return currentBoard;
      let changed = false;
      const blocks = Object.fromEntries(
        (["overdue", "today", "scheduled", "closed"] as LeadBlockKey[]).map(
          (blockKey) => [
            blockKey,
            (currentBoard.blocks[blockKey] || []).map((lead) => {
              if (lead.id !== leadId) return lead;
              changed = true;
              return { ...lead, ...patch };
            }),
          ],
        ),
      ) as BoardResponse["blocks"];
      return changed ? { ...currentBoard, blocks } : currentBoard;
    });
  }

  async function loadMobileLeadEnrichment(lead: LeadItem) {
    setMobileEnrichmentLoadingId(lead.id);
    try {
      const payload = await apiFetch<LeadEnrichmentResponse>(
        `/vendas/lead/${encodeURIComponent(lead.id)}/enrichment`,
        { method: "POST", body: JSON.stringify({ templateOffset: 0 }) },
      );
      const patch: Partial<LeadItem> = {
        whatsappAvailability: payload.whatsappAvailability || lead.whatsappAvailability || null,
        leadIntelligence: payload.leadIntelligence || lead.leadIntelligence || null,
        planTier: payload.planTier || lead.planTier,
        capabilities: payload.capabilities || lead.capabilities,
      };
      mergeMobileLeadPatch(lead.id, patch);
      setMobileNoteLead((current) =>
        current?.id === lead.id ? { ...current, ...patch } : current,
      );
    } catch (err) {
      setFeedback(
        err instanceof Error
          ? err.message
          : "Não foi possível enriquecer o card agora.",
      );
    } finally {
      setMobileEnrichmentLoadingId((current) => (current === lead.id ? null : current));
    }
  }

  function openMobileLeadDetail(lead: LeadItem) {
    setMobileTemplateIndex(readMobileReadyMessagePreference());
    setMobilePreferredCallerName(readMobilePreferredCallerName());
    saveMobileOpenLeadId(lead.id);
    setSelectedMobileLeadId(lead.id);
    setMobileNoteLead(lead);
    setMobileNoteDraft("");
    void loadMobileLeadEnrichment(lead);
  }

  function executeMobileLead(lead: LeadItem) {
    const whatsappHref = leadWhatsappHref(lead);
    if (whatsappHref) {
      void incrementAttempt(lead.id);
      window.open(whatsappHref, "_blank", "noopener,noreferrer");
      return;
    }

    const callHref = buildCallUrl(lead.phone);
    if (callHref) {
      void incrementAttempt(lead.id);
      window.location.href = callHref;
      return;
    }

    openMobileLeadDetail(lead);
    setFeedback("Sem WhatsApp ou telefone disponível. Revise o card e registre a observação.");
  }

  function renderMobileLeadChannels(lead: LeadItem, options?: { compact?: boolean }) {
    const callHref = buildCallUrl(lead.phone);
    const whatsappHref = leadWhatsappHref(lead);
    const socialLinksVisible = canSeeSocialLinks(lead, board);
    const instagramHref = socialLinksVisible
      ? normalizeExternalUrl(lead.leadIntelligence?.instagramUrl)
      : "";
    const facebookHref = socialLinksVisible
      ? normalizeExternalUrl(lead.leadIntelligence?.facebookUrl)
      : "";
    const email = leadEmailForDisplay(lead);
    const emailHref = email ? `mailto:${email}` : "";
    const websiteHref = normalizeExternalUrl(leadWebsiteForDisplay(lead));
    const lockedSocialLinks = hasLockedSocialLinks(lead, board);
    const compact = options?.compact === true;

    return (
      <>
        {callHref ? (
          <a
            href={callHref}
            className={styles.mobileVendasChannelIcon}
            data-channel="phone"
            data-compact={compact ? "true" : "false"}
            aria-label={`Ligar para ${lead.name || "lead"}`}
            onClick={(event) => {
              event.stopPropagation();
              void incrementAttempt(lead.id);
            }}
          >
            <MobileChannelIconAsset channel="phone" />
          </a>
        ) : null}
        {whatsappHref ? (
          <a
            href={whatsappHref}
            target="_blank"
            rel="noreferrer"
            className={styles.mobileVendasChannelIcon}
            data-channel="whatsapp"
            data-compact={compact ? "true" : "false"}
            aria-label={`Abrir WhatsApp de ${lead.name || "lead"}`}
            onClick={(event) => {
              event.stopPropagation();
              void incrementAttempt(lead.id);
            }}
          >
            <MobileChannelIconAsset channel="whatsapp" />
          </a>
        ) : null}
        {instagramHref ? (
          <a
            href={instagramHref}
            target="_blank"
            rel="noreferrer"
            className={styles.mobileVendasChannelIcon}
            data-channel="instagram"
            data-compact={compact ? "true" : "false"}
            aria-label={`Abrir Instagram de ${lead.name || "lead"}`}
            onClick={(event) => event.stopPropagation()}
          >
            <MobileChannelIconAsset channel="instagram" />
          </a>
        ) : null}
        {facebookHref ? (
          <a
            href={facebookHref}
            target="_blank"
            rel="noreferrer"
            className={styles.mobileVendasChannelIcon}
            data-channel="facebook"
            data-compact={compact ? "true" : "false"}
            aria-label={`Abrir Facebook de ${lead.name || "lead"}`}
            onClick={(event) => event.stopPropagation()}
          >
            <MobileChannelIconAsset channel="facebook" />
          </a>
        ) : null}
        {emailHref ? (
          <a
            href={emailHref}
            className={styles.mobileVendasChannelIcon}
            data-channel="email"
            data-compact={compact ? "true" : "false"}
            aria-label={`Enviar e-mail para ${lead.name || "lead"}`}
            onClick={(event) => event.stopPropagation()}
          >
            <MobileChannelIconAsset channel="email" />
          </a>
        ) : null}
        {websiteHref ? (
          <a
            href={websiteHref}
            target="_blank"
            rel="noreferrer"
            className={styles.mobileVendasChannelIcon}
            data-channel="site"
            data-compact={compact ? "true" : "false"}
            aria-label={`Abrir site de ${lead.name || "lead"}`}
            onClick={(event) => event.stopPropagation()}
          >
            <MobileChannelIconAsset channel="site" />
          </a>
        ) : null}
        {lockedSocialLinks ? (
          <Link
            href={toMobileRoute("/planos?intent=lead")}
            className={styles.mobileVendasPremiumChannels}
            data-compact={compact ? "true" : "false"}
            aria-label="Redes encontradas no HBX Lead"
            onClick={(event) => event.stopPropagation()}
          >
            <CrownGlyph />
            Redes encontradas no HBX Lead
          </Link>
        ) : null}
      </>
    );
  }

  function countMobileLeadChannels(lead: LeadItem) {
    const socialLinksVisible = canSeeSocialLinks(lead, board);
    return [
      buildCallUrl(lead.phone),
      leadWhatsappHref(lead),
      socialLinksVisible ? normalizeExternalUrl(lead.leadIntelligence?.instagramUrl) : "",
      socialLinksVisible ? normalizeExternalUrl(lead.leadIntelligence?.facebookUrl) : "",
      leadEmailForDisplay(lead) ? "email" : "",
      normalizeExternalUrl(leadWebsiteForDisplay(lead)),
      hasLockedSocialLinks(lead, board) ? "locked" : "",
    ].filter(Boolean).length;
  }

  function closeMobileLeadDetail() {
    saveMobileOpenLeadId(null);
    setSelectedMobileLeadId(null);
    setMobileNoteLead(null);
    setMobileNoteDraft("");
    setMobileScoreLead(null);
  }

  function activeMobileTemplate(lead: LeadItem) {
    const templates = buildMobileReadyMessageTemplates(lead, mobilePreferredCallerName);
    return templates[mobileTemplateIndex % templates.length];
  }

  function refreshMobileTemplate(lead: LeadItem) {
    const total = Math.max(1, buildMobileReadyMessageTemplates(lead, mobilePreferredCallerName).length);
    setMobileTemplateIndex((current) => {
      if (total <= 1) return current;
      let next = Math.floor(Math.random() * total);
      if (next === current % total) next = (next + 1) % total;
      saveMobileReadyMessagePreference(next);
      return next;
    });
  }

  async function copyMobileText(text: string, successMessage: string) {
    const value = String(text || "").trim();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setFeedback(successMessage);
    } catch {
      setFeedback("Não foi possível copiar automaticamente.");
    }
  }

  async function saveMobileNote() {
    const targetLead = selectedMobileLead || mobileNoteLead;
    if (!targetLead) return;
    setMobileSavingNote(true);
    try {
      await saveLead(
        targetLead.id,
        { shortNote: mobileNoteDraft },
        "Observação salva.",
      );
      mergeMobileLeadPatch(targetLead.id, { shortNote: mobileNoteDraft });
      setMobileNoteLead((current) =>
        current?.id === targetLead.id
          ? { ...current, shortNote: mobileNoteDraft }
          : current,
      );
    } finally {
      setMobileSavingNote(false);
    }
  }

  function openMobileReturnScheduler(lead: LeadItem) {
    setMobileReturnScheduleError(null);
    setMobileReturnScheduler(buildMobileReturnScheduler(lead));
  }

  function updateMobileReturnDateText(value: string) {
    const sanitized = value.replace(/[^\d/]/g, "").slice(0, 10);
    const parsedDateKey = parseShortBrazilianDate(sanitized);
    setMobileReturnScheduler((current) => current
      ? {
          ...current,
          dateText: sanitized,
          monthKey: parsedDateKey ? monthKeyFromDateKey(parsedDateKey) : current.monthKey,
        }
      : current);
    if (mobileReturnScheduleError) setMobileReturnScheduleError(null);
  }

  function selectMobileReturnCalendarDay(dateKey: string) {
    setMobileReturnScheduler((current) => current
      ? {
          ...current,
          dateText: dateKeyToShortBrazilianDate(dateKey),
          monthKey: monthKeyFromDateKey(dateKey),
        }
      : current);
    setMobileReturnScheduleError(null);
  }

  function shiftMobileReturnCalendarMonth(direction: -1 | 1) {
    setMobileReturnScheduler((current) => current
      ? { ...current, monthKey: shiftMonthKey(current.monthKey, direction) }
      : current);
  }

  async function saveMobileReturnSchedule() {
    if (!mobileReturnScheduler) return;
    const leadRecord = leadById.get(mobileReturnScheduler.leadId);
    const lead = leadRecord?.lead;
    const dateKey = parseShortBrazilianDate(mobileReturnScheduler.dateText);
    const timeValue = normalizeReturnTime(mobileReturnScheduler.timeValue);
    if (!dateKey) {
      setMobileReturnScheduleError("Informe a data no formato DD/MM/YY.");
      return;
    }
    if (!timeValue) {
      setMobileReturnScheduleError("Informe um horário válido.");
      return;
    }
    const currentDraft = drafts[mobileReturnScheduler.leadId] || (lead ? createDraft(lead) : null);
    setMobileReturnScheduleError(null);
    await saveLead(
      mobileReturnScheduler.leadId,
      {
        status: "retorno",
        nextAction: currentDraft?.nextAction || "Retomar lead",
        returnAt: `${dateKey}T${timeValue}`,
      },
      `Retorno agendado para ${mobileReturnScheduler.dateText} às ${timeValue}.`,
    );
    setSelectedDateKey(`scheduled:${dateKey}`);
    setMobileAgendaTab("upcoming");
    setMobileReturnScheduler(null);
  }

  function openMobileReport(lead: LeadItem) {
    setMobileReportLead(lead);
    setMobileReportReason("");
  }

  function getMobileBulkTarget(
    tab: MobileBulkDeleteTarget["tab"],
  ): MobileBulkDeleteTarget | null {
    const leads = tab === "overdue" ? board?.blocks.overdue || [] : board?.blocks.today || [];
    const leadIds = leads.map((lead) => lead.id).filter(Boolean);
    if (!leadIds.length) return null;
    return {
      tab,
      label: tab === "overdue" ? "Atrasados" : "Hoje",
      count: leadIds.length,
      leadIds,
    };
  }

  function cancelMobileBulkHold() {
    if (mobileBulkHoldTimerRef.current) {
      window.clearTimeout(mobileBulkHoldTimerRef.current);
      mobileBulkHoldTimerRef.current = null;
    }
    setMobileBulkHoldTab(null);
  }

  function startMobileBulkHold(
    event: ReactPointerEvent<HTMLButtonElement>,
    tab: MobileBulkDeleteTarget["tab"],
  ) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const target = getMobileBulkTarget(tab);
    if (!target || bulkDeleting) return;
    mobileBulkHoldCompletedRef.current = false;
    setMobileBulkHoldTab(tab);
    mobileBulkHoldTimerRef.current = window.setTimeout(() => {
      mobileBulkHoldTimerRef.current = null;
      mobileBulkHoldCompletedRef.current = true;
      setMobileBulkHoldTab(null);
      setMobileAgendaTab(tab);
      setMobileBulkDeleteTarget(target);
      navigator.vibrate?.(24);
    }, 1000);
  }

  function finishMobileBulkHold() {
    cancelMobileBulkHold();
    window.setTimeout(() => {
      mobileBulkHoldCompletedRef.current = false;
    }, 350);
  }

  async function deleteMobileLead(targetLead = mobileReportLead) {
    if (!targetLead) return;
    setMobileDeletingLead(true);
    setError(null);
    try {
      const payload = await apiFetch<BulkDeleteLeadsResponse>(
        `/vendas/leads/${encodeURIComponent(targetLead.id)}/delete`,
        { method: "POST" },
      );
      const deletedCount = Number(payload?.deletedCount || 0);
      setFeedback(
        deletedCount
          ? "Card ocultado do Vendas."
          : "Este card já não estava mais disponível no Vendas.",
      );
      setMobileReportLead(null);
      setMobileReportReason("");
      if (selectedMobileLeadId === targetLead.id) {
        closeMobileLeadDetail();
      }
      await loadBoard({ forceHydrateDrafts: true, forceVisualRefresh: true });
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Falha ao excluir o card.",
      );
    } finally {
      setMobileDeletingLead(false);
    }
  }

  async function submitMobileReport() {
    if (!mobileReportLead) return;
    const reason = mobileReportReason.trim();
    if (!reason) {
      setError("Informe o motivo antes de reclamar do card.");
      return;
    }
    setMobileReporting(true);
    setError(null);
    try {
      const payload = await apiFetch<ReportLeadErrorResponse>(
        `/vendas/leads/${encodeURIComponent(mobileReportLead.id)}/report-error`,
        {
          method: "POST",
          body: JSON.stringify({ reason }),
        },
      );
      if (payload?.whatsappUrl && !payload.autoSent) {
        window.open(payload.whatsappUrl, "_blank", "noopener,noreferrer");
      }
      setFeedback(payload?.message || "Reclamação registrada e card removido do Vendas.");
      setMobileReportLead(null);
      await loadBoard({ forceHydrateDrafts: true, forceVisualRefresh: true });
    } catch (reportError) {
      setError(
        reportError instanceof Error
          ? reportError.message
          : "Falha ao reportar o card.",
      );
    } finally {
      setMobileReporting(false);
    }
  }

  async function deleteMobileBulkTarget() {
    if (!mobileBulkDeleteTarget || !mobileBulkDeleteTarget.leadIds.length) return;
    setBulkDeleting(true);
    setError(null);
    try {
      const payload = await apiFetch<BulkDeleteLeadsResponse>(
        "/vendas/leads/delete-bulk",
        {
          method: "POST",
          body: JSON.stringify({ leadIds: mobileBulkDeleteTarget.leadIds }),
        },
      );
      const deletedCount = Number(payload?.deletedCount || 0);
      setFeedback(
        deletedCount
          ? `${deletedCount} card(s) excluído(s) de ${mobileBulkDeleteTarget.label}.`
          : "Nenhum card novo para excluir.",
      );
      setMobileBulkDeleteTarget(null);
      clearBulkSelection();
      setBulkSelectionMode(false);
      setSelectedLeadId(null);
      setSelectedMobileLeadId(null);
      await loadBoard({ forceHydrateDrafts: true, forceVisualRefresh: true });
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Falha ao excluir cards em massa.",
      );
    } finally {
      setBulkDeleting(false);
    }
  }

  function renderMobileVendas() {
    const mobilePendingCount = Math.max(
      0,
      (board?.summary.overdue || 0) + (board?.summary.today || 0) + (board?.summary.scheduled || 0),
    );
    const runStatus = String(liveRadarRun?.status || storedRadarRun?.status || "");
    const runAutoImport = liveRadarRun?.meta?.autoImport || null;
    const runFoundRaw = Math.max(
      0,
      Number(liveRadarRun?.meta?.deliveredCount || liveRadarRun?.foundCount || storedRadarRun?.deliveredCount || 0),
    );
    const runTarget = Math.max(
      1,
      Number(liveRadarRun?.targetQuantity || liveRadarRun?.meta?.requestedQuantity || storedRadarRun?.targetQuantity || 1),
    );
    const runTerminal = isTerminalRadarRunStatus(runStatus);
    const runActive = Boolean((liveRadarRun?.runId || storedRadarRun?.runId) && !runTerminal);
    const autoImportRan = Boolean(runAutoImport?.ran);
    const autoImportPendingCount = Math.max(0, Number(runAutoImport?.pendingCount || 0));
    const autoImportImportedCount = Math.max(0, Number(runAutoImport?.importedCount || 0));
    const runDelivered = autoImportRan ? autoImportImportedCount : runFoundRaw;
    const liveAgendaCount = mobilePendingCount;
    const incomingAgendaCount = runActive ? Math.max(autoImportPendingCount, autoImportImportedCount) : 0;
    const agendaReceivedCount = liveAgendaCount;
    const activeAgendaCount = liveAgendaCount > 0 ? liveAgendaCount : incomingAgendaCount;
    const radarBlockedByStrictFilters = autoImportRan && runFoundRaw > 0 && runDelivered <= 0 && activeAgendaCount <= 0;
    const radarFoundWithoutAgenda = runDelivered > 0 && activeAgendaCount <= 0;
    const runFilters = liveRadarRun?.meta?.filters;
    const radarState = runFilters?.state || storedRadarRun?.state || "";
    const radarCity = runFilters?.city || storedRadarRun?.city || "";
    const radarSegment = runFilters?.segment || storedRadarRun?.segment || "";
    const radarAdjustParams = new URLSearchParams();
    if (radarState) radarAdjustParams.set("state", radarState);
    if (radarCity) radarAdjustParams.set("city", radarCity);
    if (radarSegment) radarAdjustParams.set("segment", radarSegment);
    radarAdjustParams.set("quantity", String(runTarget || 40));
    const radarAdjustHref = radarAdjustParams.toString()
      ? `/radar-digital?${radarAdjustParams.toString()}`
      : "/radar-digital";
    const radarProgressLabel =
      runTarget > 1
        ? `${Math.min(runDelivered, runTarget)} de ${runTarget} cards`
        : `${runDelivered} ${runDelivered === 1 ? "card recebido" : "cards recebidos"}`;
    const radarLocatedCount = Math.max(runFoundRaw, activeAgendaCount, agendaReceivedCount);
    const radarLocatedLabel = `${radarLocatedCount.toLocaleString("pt-BR")} ${radarLocatedCount === 1 ? "card localizado" : "cards localizados"}`;
    const radarVendasLabel = `${activeAgendaCount.toLocaleString("pt-BR")} no Vendas`;
    const radarReceivedVendasLabel = `${agendaReceivedCount.toLocaleString("pt-BR")} no Vendas`;
    const radarContextLabel = [radarCity, radarState].filter(Boolean).join(" / ") || radarSegment || "Radar Digital";
    const mobileRadarState =
      !runActive && agendaReceivedCount > 0
        ? "received"
      : runStatus === "failed"
        ? "warning"
        : runStatus === "completed_insufficient_results" || runStatus === "partial_error"
          ? "partial"
          : radarBlockedByStrictFilters
            ? "partial"
          : runActive && activeAgendaCount > 0
            ? "receiving"
            : runActive && radarFoundWithoutAgenda
              ? "preparing"
            : runActive || loading
              ? "searching"
              : radarFoundWithoutAgenda
                  ? "preparing"
                  : "ready";
    const mobileRadarStatusLabel =
      runStatus === "sleeping"
        ? "Radar descansando"
      : mobileRadarState === "searching"
        ? "Pesquisando leads"
        : mobileRadarState === "preparing"
          ? `${runDelivered} ${runDelivered === 1 ? "card encontrado" : "cards encontrados"}`
        : mobileRadarState === "receiving"
          ? `${radarLocatedLabel}, ${radarVendasLabel}`
          : mobileRadarState === "partial"
            ? radarProgressLabel
            : mobileRadarState === "warning"
              ? "Radar precisa de ajuste"
              : mobileRadarState === "received"
                ? `${radarLocatedLabel}, ${radarReceivedVendasLabel}`
                : "Motor pronto";
    const mobileRadarStatusText =
      runStatus === "sleeping"
        ? "Retoma sozinho"
      : mobileRadarState === "searching"
        ? "Motores cruzando dados"
        : mobileRadarState === "preparing"
          ? "Preparando sua agenda"
        : mobileRadarState === "receiving"
          ? "ABASTECENDO SUA AGENDA"
            : mobileRadarState === "partial"
            ? "Amplie cidade ou segmento"
            : mobileRadarState === "warning"
              ? "Abra o Radar para revisar"
              : mobileRadarState === "received"
                ? agendaReceivedCount >= 40
                  ? "Finalize ou delete para liberar"
                  : "Radar alimentou o Vendas"
                : "Radar pronto para buscar";
    const salesHeaderState =
      !runActive && agendaReceivedCount > 0
        ? "active"
      : runStatus === "failed"
        ? "warning"
        : runStatus === "completed_insufficient_results" || runStatus === "partial_error"
          ? "partial"
          : radarBlockedByStrictFilters
            ? "partial"
          : runActive && activeAgendaCount > 0
            ? "receiving"
            : runActive && radarFoundWithoutAgenda
              ? "syncing"
            : runActive || loading
              ? "syncing"
              : "ready";
    const salesHeaderSubtitle =
      runStatus === "sleeping"
        ? "O Radar pausou esta busca e vai retomar automaticamente."
      : mobileRadarState === "ready"
        ? "Receba cards do Radar e acompanhe retornos."
        : mobileRadarState === "searching"
          ? `Buscando em ${radarContextLabel}.`
          : mobileRadarState === "preparing"
            ? `Radar encontrou cards em ${radarContextLabel}. Preparando Vendas.`
          : mobileRadarState === "receiving"
            ? `Cards aprovados chegando de ${radarContextLabel}.`
            : mobileRadarState === "partial"
              ? "O Radar entregou o que encontrou. Ajuste cidade ou segmento para completar."
              : mobileRadarState === "warning"
                ? "Revise o Radar para destravar a busca."
                : "Radar alimentou sua agenda comercial.";
    const activeCapabilities = board?.capabilities || salesProfile?.capabilities || {};
    const mobileHeroPremiumActive = Boolean(
      board?.planTier === "lead" ||
        board?.planTier === "full" ||
        activeCapabilities.canSeeLeadIntelligence ||
        activeCapabilities.canSeeOpportunityReason ||
        activeCapabilities.canSeeMessageTemplates ||
        activeCapabilities.canSeeSocialLinks === true ||
        accountProfile?.company?.premiumAccess ||
        String(accountProfile?.company?.subscriptionStatus || "").toLowerCase() === "trialing",
    );
    const reportMetrics = conversionReport?.metrics || {};
    const nextRecommendedMobileLead =
      allLeads.find(({ block }) => block !== "closed")?.lead || null;

    function renderMobileReport() {
      return (
        <div className={styles.mobileVendasList}>
          <section className={`${styles.mobileVendasReportPanel} hbx-mobile-card`}>
            <div className={styles.mobileVendasReportHeader}>
              <div>
                <span>HBX</span>
                <strong>Relatório de Conversão</strong>
                <p>{conversionReport?.recommendation || "Carregando leitura comercial..."}</p>
              </div>
              <select
                value={conversionReportPeriod}
                onChange={(event) => setConversionReportPeriod(event.target.value as "today" | "7d" | "30d")}
              >
                <option value="today">Hoje</option>
                <option value="7d">7 dias</option>
                <option value="30d">30 dias</option>
              </select>
            </div>
            {!activeCapabilities.canSeeConversionReport ? (
              <div className={styles.mobileVendasTeaser}>
                Relatório inteligente disponível no HBX Lead
              </div>
            ) : null}
            <div className={styles.mobileVendasReportGrid}>
              {[
                ["Recebidos", reportMetrics.cardsRecebidos],
                ["Chamados", reportMetrics.cardsChamados],
                ["Respostas", reportMetrics.respostas],
                ["Interessados", reportMetrics.interessados],
                ["Taxa resposta", formatReportPercent(reportMetrics.taxaResposta)],
                ["Conversão", formatReportPercent(reportMetrics.taxaConversao)],
              ].map(([label, value]) => (
                <span key={label}>
                  <small>{label}</small>
                  <strong>{conversionReportLoading ? "..." : value ?? 0}</strong>
                </span>
              ))}
            </div>
            <div className={styles.mobileVendasReportRanking}>
              <strong>Melhores sinais</strong>
              <p>Segmento: {reportMetrics.melhorSegmento || "Sem dados"}</p>
              <p>Cidade: {reportMetrics.melhorCidade || "Sem dados"}</p>
              <p>Canal: {reportMetrics.melhorCanal || "WhatsApp"}</p>
            </div>
            <button
              type="button"
              className="hbx-mobile-primary-button"
              onClick={() => void exportConversionReportPdf()}
              disabled={!activeCapabilities.canExportConversionPdf}
            >
              Exportar PDF
            </button>
            {!activeCapabilities.canExportConversionPdf ? (
              <small className={styles.mobileVendasReportLock}>Exportação PDF disponível no HBX Lead</small>
            ) : null}
          </section>
        </div>
      );
    }

    function renderMobileLeadDetail(lead: LeadItem) {
      const intelligence = lead.leadIntelligence || {};
      const capabilities = leadCapabilities(lead, board);
      const intelligenceVisible = canSeeLeadIntelligence(lead, board);
      const socialLinksVisible = canSeeSocialLinks(lead, board);
      const score = Math.max(
        0,
        Math.min(100, Math.round(Number(intelligenceVisible ? intelligence.opportunityScore || 0 : 0))),
      );
      const visibleScore = intelligenceVisible ? mobileAnimatedScore : score;
      const scoreLabel = intelligenceScoreLabel(score);
      const template = activeMobileTemplate(lead);
      const readyMessage = capabilities.canSeeMessageTemplates
        ? template.text
        : `Olá, tudo bem? Encontrei a ${lead.name || "sua empresa"} e queria apresentar uma solução simples para organizar contatos e retornos.`;
      const whatsappHref = buildWhatsAppUrlWithMessage(
        lead.phone,
        readyMessage,
      );
      const callHref = buildCallUrl(lead.phone);
      const email = leadEmailForDisplay(lead);
      const emailHref = email ? `mailto:${email}` : "";
      const website = leadWebsiteForDisplay(lead);
      const websiteHref = normalizeExternalUrl(website);
      const instagramHref = socialLinksVisible ? normalizeExternalUrl(intelligence.instagramUrl) : "";
      const facebookHref = socialLinksVisible ? normalizeExternalUrl(intelligence.facebookUrl) : "";
      const socialBadge = socialBadgeLabel(intelligence.primarySocial);
      const socialTeaserVisible = capabilities.canSeeSocialLinks === "teaser_only" && Boolean(socialBadge);
      const whatsappStatus = intelligence.whatsappStatus || lead.whatsappAvailability?.status || null;
      const whatsappReady = whatsappStatus === "confirmed" || lead.whatsappAvailability?.status === "available";
      const whatsappUnavailable = whatsappStatus === "missing" || whatsappStatus === "invalid" || lead.whatsappAvailability?.status === "unavailable";
      const tags = intelligence.leadReasonTags || [];
      const reasonChipTonePriority: Record<string, number> = {
        smart: 5,
        success: 4,
        primary: 3,
        danger: 3,
        neutral: 1,
      };
      const rawReasonChips = [
        !website ? { label: "Sem site", tone: "danger" } : null,
        whatsappReady ? { label: "WhatsApp confirmado", tone: "success" } : null,
        email ? { label: "E-mail encontrado", tone: "success" } : null,
        lead.city ? { label: "Cidade alvo", tone: "primary" } : null,
        intelligenceVisible && (intelligence.contactQuality === "ready" || score >= 70)
          ? { label: "Lead inteligente", tone: "smart" }
          : null,
        ...tags.map((tag) => ({ label: leadTagLabel(tag), tone: "neutral" })),
      ].filter(Boolean) as Array<{ label: string; tone: string }>;
      const reasonChips = Array.from(
        rawReasonChips.reduce((byLabel, chip) => {
          const key = chip.label.trim().toLowerCase();
          const current = byLabel.get(key);
          if (
            !current ||
            (reasonChipTonePriority[chip.tone] || 0) >
              (reasonChipTonePriority[current.tone] || 0)
          ) {
            byLabel.set(key, chip);
          }
          return byLabel;
        }, new Map<string, { label: string; tone: string }>())
          .values(),
      ).slice(0, 5);
      const loadingEnrichment = mobileEnrichmentLoadingId === lead.id;
      const timeline = (lead.timeline || []).slice(0, 4);
      const detailPlace = mobileLeadPlace(lead);
      const status = lead.statusLabel || statusLabel(lead.status);
      const suggestedAction = lead.nextAction || nextBestActionLabel(intelligence.nextBestAction);
      const priorityLabel = score ? scoreLabel : "Aguardando dados";
      const premiumTeaser = socialTeaserVisible
        ? { label: "Redes encontradas", cta: "Disponível no HBX Lead - Ver card inteligente" }
        : !intelligenceVisible && intelligence.premiumTeaser
        ? { label: intelligence.premiumTeaser.label || "Disponível no HBX Lead", cta: intelligence.premiumTeaser.cta || "Ver card inteligente" }
        : null;
      const mobileLeadActionBar = (
        <nav className={`${styles.mobileLeadDetailActionBar} hbx-mobile-action-bar`} aria-label="Ações do lead">
          <a
            className="hbx-mobile-primary-button"
            href={whatsappHref || undefined}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!whatsappHref}
            data-tone="whatsapp"
            onClick={(event) => {
              if (!whatsappHref) event.preventDefault();
              else void incrementAttempt(lead.id);
            }}
          >
            WhatsApp
          </a>
          <button
            type="button"
            className="hbx-mobile-secondary-button"
            onClick={() => openMobileReturnScheduler(lead)}
            disabled={savingLeadId === lead.id}
          >
            Retorno
          </button>
          <button
            type="button"
            className="hbx-mobile-secondary-button"
            data-tone="danger"
            onClick={() => void runQuickAction(lead, "encerrar")}
            disabled={savingLeadId === lead.id}
          >
            Negativo
          </button>
        </nav>
      );

      return (
        <section className={`${styles.mobileVendasShell} ${styles.mobileLeadDetailShell} hbx-mobile-page`} aria-label="Detalhe do lead mobile">
          <div className={`${styles.mobileLeadDetailScreen} hbx-mobile-page`}>
            <header className={`${styles.mobileLeadDetailHeader} ${styles.mobileLeadDetailCloseHeader} hbx-mobile-header`}>
              <button
                type="button"
                className={`${styles.mobileLeadBackButton} ${styles.mobileLeadCloseButton} hbx-mobile-secondary-button`}
                onClick={closeMobileLeadDetail}
                aria-label="Fechar observações"
              >
                X
              </button>
            </header>

            <div className={styles.mobileLeadDetailBody}>
              {feedback ? <div className={`${styles.feedback} hbx-mobile-notice`}>{feedback}</div> : null}
              {error ? <div className={`${styles.errorBanner} hbx-mobile-notice`} data-tone="error">{error}</div> : null}

              <section className={`${styles.mobileLeadHeroPremium} hbx-mobile-hero hbx-mobile-glass`}>
                <span className={styles.mobileLeadHeroVisual} aria-hidden="true" />
                <div className={styles.mobileLeadHeroIdentity}>
                  <div className={styles.mobileLeadPlusAvatar} aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M4 19h16" />
                      <path d="M6 19V9h12v10" />
                      <path d="M8 9V6h8v3" />
                      <path d="M9 13h6" />
                      <path d="M9 16h6" />
                    </svg>
                  </div>
                  <div>
                    <strong>{lead.name || "Lead sem nome"}</strong>
                    <span>{lead.segment || "Segmento não informado"}</span>
                    <em>{detailPlace}</em>
                    <MobileEnrichmentCrown lead={lead} board={board} />
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.mobileLeadScoreButton}
                  onClick={() => setMobileScoreLead(lead)}
                  aria-label="Ver explicação do score"
                >
                  <MobileLeadScoreGauge
                    className={styles.mobileLeadScoreBox}
                    premium
                    locked={!intelligenceVisible}
                    value={visibleScore}
                    label={!intelligenceVisible ? "♕ Score" : "Score"}
                    caption={intelligenceVisible ? priorityLabel : "HBX Lead"}
                  />
                </button>
                <div className={styles.mobileLeadHeroMeta} aria-label="Resumo do lead">
                  <span>{status}</span>
                  <span>{mobileReturnLabel(lead)}</span>
                  {socialBadge ? <span data-tone="social">{socialBadge}</span> : null}
                  <span>{mobileLeadSourceLabel(lead)}</span>
                </div>
              </section>

              {mobileScoreLead?.id === lead.id ? (
                <div className={styles.mobileScoreSheetBackdrop} role="presentation" onClick={() => setMobileScoreLead(null)}>
                  <section
                    className={styles.mobileScoreSheet}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Explicação do score"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <header>
                      <div>
                        <span>Score do card</span>
                        <strong>{lead.name || "Lead"}</strong>
                      </div>
                      <button type="button" onClick={() => setMobileScoreLead(null)} aria-label="Fechar explicação do score">
                        X
                      </button>
                    </header>
                    <p>
                      O score mostra quão fácil parece abordar esse lead agora, somando contato disponível, fit com sua busca e sinais comerciais.
                    </p>
                    <div className={styles.mobileScoreBreakdown}>
                      {buildSellerScoreBreakdown(lead).map((row) => (
                        <span key={row.label}>
                          <b>{row.label}</b>
                          <strong>+{row.points}</strong>
                        </span>
                      ))}
                    </div>
                  </section>
                </div>
              ) : null}

              <section className={`${styles.mobileLeadContactPanel} hbx-mobile-card`} aria-label="Contato do lead">
                <div className={styles.mobileLeadContactRows}>
                  <div>
                    <span className={styles.mobileLeadRowIcon} aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <path d="M6.6 10.8c1.5 3 3.6 5.1 6.6 6.6l2.2-2.2c.3-.3.8-.4 1.2-.2 1.3.4 2.6.7 4 .7.7 0 1.2.5 1.2 1.2v3.5c0 .7-.5 1.2-1.2 1.2C10.8 21.6 2.4 13.2 2.4 3.4c0-.7.5-1.2 1.2-1.2h3.5c.7 0 1.2.5 1.2 1.2 0 1.4.2 2.7.7 4 .1.4 0 .9-.3 1.2l-2.1 2.2Z" />
                      </svg>
                    </span>
                    <strong>{mobilePhoneLabel(lead)}</strong>
                    <b data-tone={whatsappUnavailable ? "danger" : whatsappReady ? "success" : "muted"}>
                      {whatsappStatusLabel(whatsappStatus)}
                    </b>
                  </div>
                  <div>
                    <span className={styles.mobileLeadRowIcon} aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <path d="M4 6h16v12H4z" />
                        <path d="m4 7 8 6 8-6" />
                      </svg>
                    </span>
                    {emailHref ? (
                      <a
                        className={styles.mobileLeadContactLink}
                        href={emailHref}
                        aria-label={`Enviar e-mail para ${email}`}
                      >
                        {email}
                      </a>
                    ) : (
                      <strong>E-mail não encontrado</strong>
                    )}
                    <b data-tone={email ? "success" : "muted"}>{email ? "E-mail encontrado" : "Sem e-mail"}</b>
                  </div>
                  <div>
                    <span className={styles.mobileLeadRowIcon} aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M3 12h18" />
                        <path d="M12 3c2.5 2.5 3.5 5.5 3.5 9S14.5 18.5 12 21" />
                        <path d="M12 3c-2.5 2.5-3.5 5.5-3.5 9s1 6.5 3.5 9" />
                      </svg>
                    </span>
                    {websiteHref ? (
                      <a
                        className={styles.mobileLeadContactLink}
                        href={websiteHref}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Abrir site de ${lead.name || "lead"}`}
                      >
                        {website}
                      </a>
                    ) : (
                      <strong>Sem site</strong>
                    )}
                    <b data-tone={website ? "smart" : "muted"}>{website ? "Site encontrado" : "Sem site"}</b>
                  </div>
                  {socialBadge && socialLinksVisible ? (
                    <div>
                      <span className={styles.mobileLeadRowIcon} aria-hidden="true">
                        {socialBadge}
                      </span>
                      <strong>Rede social encontrada</strong>
                      <b data-tone="success">Links liberados</b>
                    </div>
                  ) : null}
                </div>
                {(instagramHref || facebookHref) ? (
                  <div className={styles.mobileLeadSocialActions}>
                    {instagramHref ? (
                      <a href={instagramHref} target="_blank" rel="noreferrer">
                        Abrir Instagram
                      </a>
                    ) : null}
                    {facebookHref ? (
                      <a href={facebookHref} target="_blank" rel="noreferrer">
                        Abrir Facebook
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </section>

              {premiumTeaser ? (
                <section className={`${styles.mobileLeadPremiumTeaser} hbx-mobile-card`}>
                  <span aria-hidden="true">♕</span>
                  <div>
                    <strong>{premiumTeaser.label}</strong>
                    <small>{premiumTeaser.cta}</small>
                  </div>
                </section>
              ) : null}

              <section className={`${styles.mobileLeadReasonBlock} hbx-mobile-card`} data-locked={!capabilities.canSeeOpportunityReason ? "true" : "false"}>
                <h3>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="8" />
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 2v3" />
                    <path d="M22 12h-3" />
                  </svg>
                  Sinais comerciais
                </h3>
                <div>
                  {(reasonChips.length ? reasonChips : [{ label: "Cidade alvo", tone: "primary" }]).map((chip) => (
                    <span key={`${chip.label}:${chip.tone}`} data-tone={chip.tone}>
                      {chip.label}
                    </span>
                  ))}
                </div>
                <p>
                  {capabilities.canSeeOpportunityReason
                    ? intelligence.opportunityReason || "Revise os sinais comerciais antes da abordagem."
                    : "Motivo da oportunidade disponível no HBX Lead."}
                </p>
              </section>

              <section className={`${styles.mobileLeadNextActionBox} hbx-mobile-card`}>
                <h3>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m13 2-8 12h7l-1 8 8-12h-7l1-8Z" />
                  </svg>
                  Próxima ação
                </h3>
                <a
                  href={whatsappHref || undefined}
                  target="_blank"
                  rel="noreferrer"
                  aria-disabled={!whatsappHref}
                  onClick={(event) => {
                    if (!whatsappHref) event.preventDefault();
                    else void incrementAttempt(lead.id);
                  }}
                >
                  <span aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M19.05 4.94A9.8 9.8 0 0 0 12.06 2C6.59 2 2.13 6.46 2.13 11.93c0 1.75.46 3.46 1.32 4.97L2 22l5.27-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.47 0 9.93-4.46 9.93-9.93a9.86 9.86 0 0 0-2.95-6.97Z" />
                    </svg>
                  </span>
                  {suggestedAction}
                  <b aria-hidden="true">›</b>
                </a>
              </section>

              <section className={`${styles.mobileLeadReadyMessage} hbx-mobile-card`}>
                <h3>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 5h16v11H7l-3 3V5Z" />
                    <path d="M8 9h8" />
                    <path d="M8 13h5" />
                  </svg>
                  Mensagem pronta
                </h3>
                <p>
                  {!capabilities.canSeeMessageTemplates
                    ? "Mensagem pronta por segmento disponível no HBX Lead."
                    : loadingEnrichment
                      ? "Verificando WhatsApp..."
                      : readyMessage}
                </p>
                <div className={styles.mobileLeadQuickGrid}>
                  <a
                    href={callHref || undefined}
                    aria-disabled={!callHref}
                    onClick={(event) => {
                      if (!callHref) event.preventDefault();
                      else void incrementAttempt(lead.id);
                    }}
                  >
                    Ligar
                  </a>
                  <a href={emailHref || undefined} aria-disabled={!emailHref}>
                    E-mail
                  </a>
                  <button
                    type="button"
                    data-tone="primary"
                    onClick={() => void copyMobileText(readyMessage, "Mensagem copiada.")}
                    disabled={!capabilities.canSeeMessageTemplates}
                  >
                    Copiar msg
                  </button>
                  <button
                    type="button"
                    onClick={() => refreshMobileTemplate(lead)}
                    disabled={!capabilities.canSeeMessageTemplates}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M20 7v5h-5" />
                      <path d="M4 17v-5h5" />
                      <path d="M6.1 9A7 7 0 0 1 18 6.2L20 8" />
                      <path d="M17.9 15A7 7 0 0 1 6 17.8L4 16" />
                    </svg>
                    Atualizar
                  </button>
                </div>
              </section>

              <section id="mobile-lead-note" className={`${styles.mobileLeadObservationCard} hbx-mobile-card`}>
                <span className={styles.mobileLeadObservationVisual} aria-hidden="true" />
                <div className={styles.mobileLeadObservationHeader}>
                  <h3>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M5 5h14v11H8l-3 3V5Z" />
                      <path d="M9 9h6" />
                      <path d="M9 13h4" />
                    </svg>
                    Observações
                  </h3>
                  <span>{mobileNoteDraft.length}/280</span>
                </div>
                {lead.shortNote ? (
                  <p className={styles.mobileLeadSavedNote}>{lead.shortNote}</p>
                ) : null}
                <label className={styles.mobileLeadNoteEditor}>
                  <span>Nova observação</span>
                  <textarea
                    value={mobileNoteDraft}
                    onChange={(event) => setMobileNoteDraft(event.target.value)}
                    onFocus={() => {
                      mobileSkipDraftHydrateRef.current = true;
                    }}
                    onBlur={() => {
                      mobileSkipDraftHydrateRef.current = false;
                      const snapshot = boardRef.current;
                      if (snapshot) setDrafts(hydrateDrafts(snapshot));
                    }}
                    rows={4}
                    maxLength={280}
                    placeholder="Escreva o contexto do atendimento, objeções, próximos passos ou qualquer detalhe importante."
                  />
                </label>
                <button
                  type="button"
                  className={`${styles.mobileLeadSaveNoteButton} hbx-mobile-primary-button`}
                  onClick={() => void saveMobileNote()}
                  disabled={mobileSavingNote || savingLeadId === lead.id}
                >
                  {mobileSavingNote ? "Salvando" : "Salvar observação"}
                </button>
                <button
                  type="button"
                  className={`${styles.mobileLeadRefreshButton} hbx-mobile-secondary-button`}
                  onClick={() => refreshMobileTemplate(lead)}
                >
                  Atualizar mensagem
                </button>
              </section>

              <section className={`${styles.mobileLeadTimeline} hbx-mobile-card`}>
                <span className={styles.mobileTimelineVisual} aria-hidden="true" />
                <h3>Histórico</h3>
                {(timeline.length
                  ? timeline
                  : [
                      {
                        id: "empty",
                        eventType: "generic",
                        title: "Lead validado pelo HBX",
                        description: intelligence.opportunityReason || "Aguardando primeira observação.",
                        createdAt: new Date().toISOString(),
                        sourceType: "hbx",
                      } as LeadTimelineEvent,
                    ]
                ).map((event) => (
                  <div key={event.id} data-tone={timelineTone(event.eventType)}>
                    <span aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <path d="M12 8v4l3 2" />
                        <circle cx="12" cy="12" r="8" />
                      </svg>
                    </span>
                    <p>
                      <strong>{timelineMeta(event)}</strong>
                      {event.title || event.description || "Atendimento atualizado."}
                    </p>
                  </div>
                ))}
              </section>
            </div>

            {typeof document !== "undefined"
              ? createPortal(mobileLeadActionBar, document.body)
              : mobileLeadActionBar}
            <HbxMobileDock
              primaryLabel="Incluir lead manual"
              onPrimaryAction={() => setComposerOpen(true)}
              onRelatorio={() => {
                setSelectedMobileLeadId(null);
                setMobileSection("report");
              }}
              onConta={() => {
                setAccountNameDraft(mobilePreferredCallerName || readMobilePreferredCallerName());
                setAccountSheetOpen(true);
              }}
            />
          </div>
        </section>
      );
    }

    if (selectedMobileLead) return renderMobileLeadDetail(selectedMobileLead);

    return (
      <section className={`${styles.mobileVendasShell} ${styles.mobileLeadListScreen}`} aria-label="Vendas mobile">
        <div className={styles.mobileVendasContextBar}>
          <header className={`${styles.mobileVendasHeader} hbx-mobile-header`}>
            <section
              className={styles.mobileVendasHeroPanel}
              data-state={salesHeaderState}
              data-radar-state={mobileRadarState}
              data-pulse={radarStatusPulseKey}
              aria-label="Resumo de Vendas"
            >
              <SalesMotionBackground />
              <HeroPremiumCrown active={mobileHeroPremiumActive} />
              <span className={styles.mobileVendasHeroCopy}>
                <small>HBX</small>
                <strong>Vendas</strong>
                <em>{salesHeaderSubtitle}</em>
              </span>
              <span className={styles.mobileVendasHeroGoal}>
                <b>
                  {mobileRadarState === "searching" ? (
                    <i />
                  ) : mobileRadarState === "partial" || mobileRadarState === "warning" ? (
                    "!"
                  ) : (
                    "✓"
                  )}
                </b>
                <span>
                  <strong>{mobileRadarStatusLabel}</strong>
                  <em>{mobileRadarStatusText}</em>
                </span>
              </span>
              <Link
                className={styles.mobileVendasHeroAction}
                href={mobileRadarState === "partial" || mobileRadarState === "warning" ? radarAdjustHref : "/radar-digital"}
                aria-label={
                  mobileRadarState === "partial" || mobileRadarState === "warning"
                    ? "Ajustar Radar Digital"
                    : "Abrir Radar Digital"
                }
              >
                {mobileRadarState === "partial" || mobileRadarState === "warning" ? "Ajustar Radar" : "Abrir Radar"}
              </Link>
            </section>
          </header>

          <div className={styles.mobileVendasHeroStats} aria-label="Resumo de Vendas">
            <button
              type="button"
              data-tone="danger"
              data-active={mobileAgendaTab === "overdue" ? "true" : "false"}
              data-holding={mobileBulkHoldTab === "overdue" ? "true" : "false"}
              onPointerDown={(event) => startMobileBulkHold(event, "overdue")}
              onPointerUp={finishMobileBulkHold}
              onPointerCancel={cancelMobileBulkHold}
              onPointerLeave={cancelMobileBulkHold}
              onClick={(event) => {
                if (mobileBulkHoldCompletedRef.current) {
                  event.preventDefault();
                  return;
                }
                setMobileSection("today");
                setMobileAgendaTab("overdue");
              }}
            >
              <b>Atrasados</b>
              <strong>{board?.summary.overdue ?? 0}</strong>
            </button>
            <button
              type="button"
              data-tone="primary"
              data-active={mobileAgendaTab === "today" ? "true" : "false"}
              data-holding={mobileBulkHoldTab === "today" ? "true" : "false"}
              onPointerDown={(event) => startMobileBulkHold(event, "today")}
              onPointerUp={finishMobileBulkHold}
              onPointerCancel={cancelMobileBulkHold}
              onPointerLeave={cancelMobileBulkHold}
              onClick={(event) => {
                if (mobileBulkHoldCompletedRef.current) {
                  event.preventDefault();
                  return;
                }
                setMobileSection("today");
                setMobileAgendaTab("today");
              }}
            >
              <b>Hoje</b>
              <strong>{board?.summary.today ?? mobileLeadCount}</strong>
            </button>
            <button
              type="button"
              data-tone="success"
              data-active={mobileAgendaTab === "upcoming" ? "true" : "false"}
              onClick={() => {
                setMobileSection("today");
                setMobileAgendaTab("upcoming");
              }}
            >
              <b>Próximos</b>
              <strong>{mobileFutureCount}</strong>
            </button>
          </div>

          <section
            className={styles.mobileVendasVisualFilters}
            data-locked={mobileVisualFiltersUnlocked ? "false" : "true"}
            data-active={mobileVisualFiltersActive ? "true" : "false"}
            aria-label="Filtros visuais dos cards"
          >
            <div className={styles.mobileVendasVisualFilterScroller}>
              {MOBILE_VISUAL_FILTERS.map((filter) => {
                const active = mobileVisualChannelFilters.includes(filter.value);
                return (
                  <button
                    type="button"
                    key={filter.value}
                    data-active={active ? "true" : "false"}
                    disabled={!mobileVisualFiltersUnlocked}
                    onClick={() => toggleMobileVisualFilter(filter.value)}
                    title={mobileVisualFiltersUnlocked ? filter.label : "Disponível no HBX Lead"}
                    aria-label={`${active ? "Remover filtro" : "Filtrar por"} ${filter.label}`}
                  >
                    <MobileChannelIconAsset channel={filter.asset} />
                    <span>{filter.label}</span>
                    {active ? <b>on</b> : null}
                    {!mobileVisualFiltersUnlocked ? <CrownGlyph /> : null}
                  </button>
                );
              })}
              <button
                type="button"
                className={styles.mobileVendasScoreIconFilter}
                data-active={mobileMinScoreFilter > 0 ? "true" : "false"}
                onClick={() => setMobileScoreFilterOpen((current) => !current)}
                title={mobileMinScoreFilter ? `Score mínimo ${mobileMinScoreFilter}+` : "Filtrar por score"}
                aria-label={mobileMinScoreFilter ? `Score mínimo ${mobileMinScoreFilter}+` : "Abrir filtro de score"}
                aria-pressed={mobileScoreFilterOpen ? "true" : "false"}
              >
                <strong aria-hidden="true">S</strong>
                {mobileMinScoreFilter > 0 ? <b>{mobileMinScoreFilter}+</b> : null}
              </button>
              <button
                type="button"
                className={styles.mobileVendasClearVisualFilters}
                disabled={!mobileVisualFiltersActive}
                onClick={clearMobileVisualFilters}
                title="Limpar filtros"
                aria-label="Limpar filtros"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M4 7h16" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                  <path d="M6 7l1 14h10l1-14" />
                  <path d="M9 7V4h6v3" />
                </svg>
              </button>
            </div>
          </section>

          {mobileScoreFilterOpen && typeof document !== "undefined" ? createPortal(
            <div
              className={styles.mobileVendasScoreModalBackdrop}
              role="presentation"
              onClick={() => setMobileScoreFilterOpen(false)}
            >
              <section
                className={styles.mobileVendasScoreModal}
                role="dialog"
                aria-modal="true"
                aria-labelledby="mobile-score-filter-title"
                onClick={(event) => event.stopPropagation()}
              >
                <header className={styles.mobileVendasScoreModalHeader}>
                  <div>
                    <span>Filtro de score</span>
                    <strong id="mobile-score-filter-title">Score mínimo</strong>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMobileScoreFilterOpen(false)}
                    aria-label="Fechar filtro de score"
                  >
                    ×
                  </button>
                </header>

                <div
                  className={styles.mobileVendasScoreModalMeter}
                  data-empty={mobileMinScoreFilter <= 0 ? "true" : "false"}
                  style={{ "--mobile-score-filter": `${mobileMinScoreFilter}%` } as CSSProperties}
                >
                  <div className={styles.mobileVendasScoreModalRing}>
                    <strong>{mobileMinScoreFilter}</strong>
                    <span>mínimo</span>
                  </div>
                  <p>
                    Exibe apenas cards com score igual ou maior.
                  </p>
                </div>

                <div className={styles.mobileVendasScoreModalControls} data-locked={mobileVisualFiltersUnlocked ? "false" : "true"}>
                  <button
                    type="button"
                    disabled={!mobileVisualFiltersUnlocked || mobileMinScoreFilter <= 0}
                    onClick={() => stepMobileScoreFilter(-1)}
                    aria-label="Diminuir score mínimo em 1"
                  >
                    -
                  </button>
                  <label>
                    <span>{mobileVisualFiltersUnlocked ? "Arraste para calibrar a régua" : "Disponível no HBX Lead"}</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={mobileMinScoreFilter}
                      disabled={!mobileVisualFiltersUnlocked}
                      onChange={(event) => setMobileScoreFilterValue(Number(event.target.value))}
                      aria-label="Score mínimo de 0 a 100"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={!mobileVisualFiltersUnlocked || mobileMinScoreFilter >= 100}
                    onClick={() => stepMobileScoreFilter(1)}
                    aria-label="Aumentar score mínimo em 1"
                  >
                    +
                  </button>
                </div>

                <footer className={styles.mobileVendasScoreModalActions}>
                  <button
                    type="button"
                    disabled={mobileMinScoreFilter <= 0}
                    onClick={() => setMobileScoreFilterValue(0)}
                  >
                    Limpar
                  </button>
                  <button type="button" onClick={() => setMobileScoreFilterOpen(false)}>
                    Usar filtro
                  </button>
                </footer>
              </section>
            </div>,
            document.body,
          ) : null}

          {nextRecommendedMobileLead && mobileSection !== "report" ? (
            <section className={styles.mobileVendasRecommendedCard} aria-label="Próximo card recomendado">
              <button
                type="button"
                onClick={() => openMobileLeadDetail(nextRecommendedMobileLead)}
              >
                <span className={styles.mobileVendasRecommendedTopline}>
                  <span>Próximo card recomendado</span>
                  <MobileEnrichmentCrown lead={nextRecommendedMobileLead} board={board} compact />
                </span>
                <strong>{nextRecommendedMobileLead.name || "Lead sem nome"}</strong>
                <small>
                  {mobileLeadPlace(nextRecommendedMobileLead)} · {nextRecommendedMobileLead.nextAction || "Executar contato"}
                </small>
              </button>
              <div className={styles.mobileVendasRecommendedFooter}>
                <div
                  className={styles.mobileVendasRecommendedChannels}
                  data-channel-count={countMobileLeadChannels(nextRecommendedMobileLead)}
                  aria-label="Canais disponíveis"
                >
                  {renderMobileLeadChannels(nextRecommendedMobileLead, { compact: true })}
                </div>
                <button type="button" onClick={() => executeMobileLead(nextRecommendedMobileLead)}>
                  Chamar agora
                </button>
              </div>
            </section>
          ) : null}

        </div>

        {mobileSection === "report" ? renderMobileReport() : loading ? (
          <div className={`${styles.mobileVendasLoading} hbx-mobile-empty`}>
            <span />
            <strong>Carregando agenda</strong>
          </div>
        ) : (
          <div className={styles.mobileVendasList}>
            {mobileLeads.length ? (
              mobileLeads.map(({ lead }, index) => {
                const status = lead.statusLabel || statusLabel(lead.status);
                return (
                  <div
                    className={styles.mobileVendasSwipeShell}
                    key={lead.id}
                  >
                    <article
                      className={`${styles.mobileVendasCard} hbx-mobile-card`}
                      role="button"
                      tabIndex={0}
                      onClick={() => openMobileLeadDetail(lead)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openMobileLeadDetail(lead);
                        }
                      }}
                      style={{ ["--mobile-card-index" as string]: index } as CSSProperties}
                    >
                      <div
                        className={styles.mobileVendasAvatar}
                        data-variant={index % 2 === 0 ? "green" : "violet"}
                        aria-hidden="true"
                      >
                        <svg viewBox="0 0 24 24">
                          <path d="M5 21V5.8C5 4.8 5.8 4 6.8 4h10.4c1 0 1.8.8 1.8 1.8V21" />
                          <path d="M8.5 8h2" />
                          <path d="M13.5 8h2" />
                          <path d="M8.5 12h2" />
                          <path d="M13.5 12h2" />
                          <path d="M10 21v-4h4v4" />
                        </svg>
                      </div>
                      <div className={styles.mobileVendasCardMain}>
                        <div className={styles.mobileVendasCardTitle}>
                          <div>
                            <strong>{lead.name || "Lead sem nome"}</strong>
                            <span>{mobileLeadPlace(lead)}</span>
                          </div>
                          <MobileEnrichmentCrown lead={lead} board={board} compact />
                        </div>
                        <div className={styles.mobileVendasCardMeta}>
                          <span data-status={lead.status}>{status}</span>
                          <small>
                            Retorno <b>{mobileReturnLabel(lead)}</b>
                          </small>
                        </div>
                        <div className={styles.mobileVendasChannelRow} aria-label="Canais disponíveis">
                        {renderMobileLeadChannels(lead)}
                      </div>
                    </div>
                  </article>
                    <div className={styles.mobileVendasSwipeActions} aria-label={`Ações de ${lead.name || "lead"}`}>
                      <button
                        type="button"
                        data-action="report"
                        onClick={(event) => {
                          event.stopPropagation();
                          openMobileReport(lead);
                        }}
                        disabled={mobileReporting || mobileDeletingLead}
                      >
                        Reclamar
                      </button>
                      <button
                        type="button"
                        data-action="delete"
                        onClick={(event) => {
                          event.stopPropagation();
                          void deleteMobileLead(lead);
                        }}
                        disabled={mobileReporting || mobileDeletingLead}
                      >
                        Ocultar
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className={`${styles.mobileVendasEmpty} hbx-mobile-empty`}>
                <strong>
                  {(board?.summary.total || 0) <= 0 && radarBlockedByStrictFilters
                    ? "Cards localizados ainda não entraram"
                    : (board?.summary.total || 0) <= 0 && radarFoundWithoutAgenda
                    ? "Cards encontrados, preparando sua agenda"
                    : (board?.summary.total || 0) <= 0
                    ? "Sua lista de abordagem está vazia"
                    : "Nenhum lead disponível agora"}
                </strong>
                <span>
                  {(board?.summary.total || 0) <= 0 && radarBlockedByStrictFilters
                    ? "O Radar localizou empresas. Aguarde a sincronização ou amplie cidade e segmento."
                    : (board?.summary.total || 0) <= 0 && radarFoundWithoutAgenda
                    ? "O Radar encontrou cards aprovados. Mantenha esta tela aberta enquanto o Vendas sincroniza."
                    : (board?.summary.total || 0) <= 0
                    ? "Busque empresas no Radar. Os cards aprovados chegam aqui prontos para chamar."
                    : "Troque a guia, limpe a busca ou volte ao Radar para ampliar cidade e segmento."}
                </span>
                {(board?.summary.total || 0) <= 0 && !radarFoundWithoutAgenda ? (
                  <Link className="hbx-mobile-primary-button" href={toMobileRoute("/radar-digital")}>
                    Buscar cards agora
                  </Link>
                ) : null}
              </div>
            )}
          </div>
        )}

        <HbxMobileDock
          primaryLabel="Incluir lead manual"
          onPrimaryAction={() => setComposerOpen(true)}
          onRelatorio={() => {
            setMobileSection("report");
            setSelectedMobileLeadId(null);
          }}
          onConta={() => {
            setAccountNameDraft(mobilePreferredCallerName || readMobilePreferredCallerName());
            setAccountSheetOpen(true);
          }}
        />

        {mobileReportLead ? (
          <div
            className={styles.mobileVendasSheetBackdrop}
            onClick={() => setMobileReportLead(null)}
          >
            <section
              className={`${styles.mobileVendasNoteSheet} ${styles.mobileVendasReportSheet}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="mobile-vendas-report-title"
              onClick={(event) => event.stopPropagation()}
            >
              <span className={styles.mobileVendasSheetHandle} />
              <div className={styles.mobileVendasSheetHeader}>
                <h2 id="mobile-vendas-report-title">Reclamar do card</h2>
                <button type="button" onClick={() => setMobileReportLead(null)}>
                  ×
                </button>
              </div>
              <p className={styles.mobileVendasReportLead}>
                {mobileReportLead.name || "Lead sem nome"}
              </p>
              <textarea
                value={mobileReportReason}
                onChange={(event) => setMobileReportReason(event.target.value)}
                rows={5}
                placeholder="Explique por que este card não prestou"
              />
              <div className={styles.mobileVendasSheetFooter}>
                <button
                  type="button"
                  className={styles.mobileVendasDeleteButton}
                  onClick={() => setMobileReportLead(null)}
                  disabled={mobileReporting || mobileDeletingLead}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className={styles.mobileVendasDangerButton}
                  onClick={() => void deleteMobileLead()}
                  disabled={mobileReporting || mobileDeletingLead}
                >
                  {mobileDeletingLead ? "Ocultando" : "Ocultar"}
                </button>
                <button
                  type="button"
                  onClick={() => void submitMobileReport()}
                  disabled={
                    mobileReporting ||
                    mobileDeletingLead ||
                    !mobileReportReason.trim()
                  }
                >
                  {mobileReporting ? "Enviando" : "Reclamar"}
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {mobileBulkDeleteTarget ? (
          <div
            className={styles.mobileVendasSheetBackdrop}
            onClick={() => {
              if (!bulkDeleting) setMobileBulkDeleteTarget(null);
            }}
          >
            <section
              className={`${styles.mobileVendasNoteSheet} ${styles.mobileVendasReportSheet} ${styles.mobileVendasAttentionSheet}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="mobile-vendas-bulk-delete-title"
              onClick={(event) => event.stopPropagation()}
            >
              <span className={styles.mobileVendasSheetHandle} />
              <div className={styles.mobileVendasSheetHeader}>
                <div>
                  <small>Atenção</small>
                  <h2 id="mobile-vendas-bulk-delete-title">
                    Excluir cards de {mobileBulkDeleteTarget.label}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileBulkDeleteTarget(null)}
                  disabled={bulkDeleting}
                >
                  ×
                </button>
              </div>
              <div className={styles.mobileVendasAttentionBody}>
                <strong>{mobileBulkDeleteTarget.count} card(s) serão removidos do Vendas.</strong>
                <p>
                  A base do Radar Digital continua preservada. Esta ação só limpa
                  os cards devidos desta guia.
                </p>
              </div>
              <div className={styles.mobileVendasSheetFooter}>
                <button
                  type="button"
                  className={styles.mobileVendasDeleteButton}
                  onClick={() => setMobileBulkDeleteTarget(null)}
                  disabled={bulkDeleting}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className={styles.mobileVendasDangerButton}
                  onClick={() => void deleteMobileBulkTarget()}
                  disabled={bulkDeleting}
                >
                  {bulkDeleting ? "Excluindo" : "Excluir"}
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    );
  }

  function scrollDateRail(direction: -1 | 1) {
    const el = filterScrollerRef.current;
    if (!el) return;
    el.scrollBy({
      left: direction * Math.max(260, Math.round(el.clientWidth * 0.72)),
      behavior: "smooth",
    });
  }

  function clearBulkSelection() {
    setSelectedBulkLeadIds(new Set());
    setBulkSelectAllAccount(false);
  }

  function toggleBulkSelectionMode() {
    if (bulkSelectionMode) clearBulkSelection();
    setBulkSelectionMode((current) => !current);
  }

  function toggleLeadBulkSelection(leadId: string) {
    const normalizedLeadId = String(leadId || "").trim();
    if (!normalizedLeadId) return;
    setBulkSelectionMode(true);
    setBulkSelectAllAccount(false);
    setSelectedBulkLeadIds((current) => {
      const next = new Set(current);
      if (next.has(normalizedLeadId)) next.delete(normalizedLeadId);
      else next.add(normalizedLeadId);
      return next;
    });
  }

  function toggleBulkSelectAll() {
    setBulkSelectionMode(true);
    if (bulkSelectAllAccount) {
      clearBulkSelection();
      return;
    }
    setBulkSelectAllAccount(true);
    setSelectedBulkLeadIds(new Set(loadedLeadIds));
  }

  async function deleteSelectedLeadsBulk() {
    const selectedIds = Array.from(selectedBulkLeadIds);
    if (!bulkSelectAllAccount && !selectedIds.length) return;

    const targetLabel = bulkSelectAllAccount
      ? "todos os cards da conta atual"
      : `${selectedIds.length} card(s) selecionado(s)`;
    const confirmed = window.confirm(
      `Excluir ${targetLabel} do Vendas? Os cards somem da tela, mas a base do Radar Digital continua preservada.`,
    );
    if (!confirmed) return;

    setBulkDeleting(true);
    setError(null);
    try {
      const payload = await apiFetch<BulkDeleteLeadsResponse>(
        "/vendas/leads/delete-bulk",
        {
          method: "POST",
          body: JSON.stringify(
            bulkSelectAllAccount ? { all: true } : { leadIds: selectedIds },
          ),
        },
      );
      const deletedCount = Number(payload?.deletedCount || 0);
      setFeedback(
        deletedCount
          ? `${deletedCount} card(s) excluído(s) do Vendas.`
          : "Nenhum card novo para excluir.",
      );
      clearBulkSelection();
      setBulkSelectionMode(false);
      setSelectedLeadId(null);
      await loadBoard();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Falha ao excluir cards em massa.",
      );
    } finally {
      setBulkDeleting(false);
    }
  }

  async function handleCreateManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatingManual(true);
    setError(null);
    try {
      const body: {
        name?: string;
        phone?: string;
        nextAction?: string;
        returnAt?: string;
        shortNote?: string;
        email?: string;
      } = {
        name: manualLead.name || undefined,
        phone: manualLead.phone || undefined,
        nextAction: manualLead.nextAction || undefined,
        returnAt: manualLead.returnAt || undefined,
        shortNote: manualLead.shortNote || undefined,
      };
      if (manualLead.email && String(manualLead.email).trim())
        body.email = manualLead.email;

      const payload = await apiFetch<{ ok: boolean; action: string }>(
        "/vendas/manual",
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      );
      setFeedback(
        payload.action === "updated"
          ? "Lead manual atualizado no CRM."
          : "Lead manual criado no CRM.",
      );
      setManualLead({
        name: "",
        phone: "",
        email: "",
        nextAction: "Primeiro contato",
        returnAt: plusDaysDatetimeLocal(0),
        shortNote: "",
      });
      setComposerOpen(false);
      await loadBoard({ forceHydrateDrafts: true, forceVisualRefresh: true });
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Falha ao criar lead manual.",
      );
    } finally {
      setCreatingManual(false);
    }
  }

  function setLeadDraft(leadId: string, patch: Partial<LeadDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [leadId]: {
        ...(prev[leadId] || {
          name: "",
          phone: "",
          email: "",
          status: "novo" as LeadStatus,
          nextAction: "",
          returnAt: "",
          shortNote: "",
        }),
        ...patch,
      },
    }));
  }

  async function saveLead(
    leadId: string,
    patch?: Partial<LeadDraft>,
    successMessage?: string,
  ) {
    const draft = {
      ...(drafts[leadId] || {
        name: "",
        phone: "",
        email: "",
        status: "novo" as LeadStatus,
        nextAction: "",
        returnAt: "",
        shortNote: "",
      }),
      ...(patch || {}),
    };
    const email = String(draft.email || "").trim();
    setSavingLeadId(leadId);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name: draft.name,
        phone: draft.phone,
        email: email || null,
        status: draft.status,
        nextAction: draft.nextAction,
        returnAt: draft.returnAt || "",
        shortNote: draft.shortNote,
      };
      await apiFetch(`/vendas/lead/${leadId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setFeedback(successMessage || "Lead atualizado com sucesso.");
      await loadBoard({ forceHydrateDrafts: true, forceVisualRefresh: true });
      // If the saved lead was being edited inline, close the inline editor
      if (editingLeadId === leadId) {
        editingInputActiveRef.current = false;
        setEditingLeadId(null);
      }
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Falha ao atualizar o lead.",
      );
    } finally {
      setSavingLeadId(null);
    }
  }

  function applyOptimisticAttemptIncrement(
    currentBoard: BoardResponse,
    leadId: string,
  ) {
    const blocks: BoardResponse["blocks"] = {
      overdue: [...currentBoard.blocks.overdue],
      today: [...currentBoard.blocks.today],
      scheduled: [...currentBoard.blocks.scheduled],
      closed: [...currentBoard.blocks.closed],
    };

    let found = false;
    [
      "overdue" as LeadBlockKey,
      "today" as LeadBlockKey,
      "scheduled" as LeadBlockKey,
      "closed" as LeadBlockKey,
    ].forEach((blockKey) => {
      blocks[blockKey] = blocks[blockKey].map((lead) => {
        if (lead.id !== leadId) return lead;
        found = true;
        return {
          ...lead,
          attemptCount: (lead.attemptCount || 0) + 1,
          updatedAt: new Date().toISOString(),
        };
      });
    });

    if (!found) return currentBoard;
    return { blocks, summary: recomputeSummary(blocks) };
  }

  async function incrementAttempt(leadId: string) {
    if (!board) return;
    const currentRecord = leadById.get(leadId);
    const currentAttempt = currentRecord?.lead.attemptCount || 0;
    const nextAttempt = currentAttempt + 1;
    const previousBoard = board;
    const optimisticBoard = applyOptimisticAttemptIncrement(board, leadId);
    setBoard(optimisticBoard);
    setSavingLeadId(leadId);
    setError(null);
    try {
      await apiFetch(`/vendas/lead/${leadId}`, {
        method: "PATCH",
        body: JSON.stringify({ attemptCount: nextAttempt }),
      });
      setFeedback("Tentativa registrada.");
      await loadBoard();
    } catch (err) {
      setBoard(previousBoard);
      setError(
        err instanceof Error ? err.message : "Falha ao registrar tentativa.",
      );
    } finally {
      setSavingLeadId(null);
    }
  }

  async function runQuickAction(lead: LeadItem, action: string) {
    const currentDraft = drafts[lead.id] || createDraft(lead);
    if (action === "tentativa_whatsapp" || action === "tentativa_call") {
      await incrementAttempt(lead.id);
      return;
    }
    if (action === "hoje") {
      await saveLead(lead.id, {
        status:
          currentDraft.status === "novo" ? "contato" : currentDraft.status,
        nextAction: currentDraft.nextAction || "Retomar hoje",
        returnAt: plusDaysDatetimeLocal(0),
      });
      return;
    }
    if (action === "amanha") {
      // Move the lead to the next available date filter instead of only setting a datetime.
      // Compute the lead's current date key and find its index inside `dateFilters`.
      const currentRecord = leadById.get(lead.id);
      const leadBlock = currentRecord?.block || "today";
      const currentDateKey =
        leadBlock === "scheduled"
          ? (`scheduled:${buildLocalDateKey(lead.returnAt || lead.updatedAt)}` as DateFilterKey)
          : (leadBlock as DateFilterKey);

      const idx = dateFilters.findIndex((item) => item.key === currentDateKey);
      const nextIndex =
        idx >= 0 ? Math.min(idx + 1, Math.max(0, dateFilters.length - 1)) : 0;
      const targetKey =
        dateFilters[nextIndex]?.key ||
        (dateFilters[0]?.key as DateFilterKey) ||
        "today";

      await handleDateMove(lead.id, targetKey);
      return;
    }
    if (action === "encerrar") {
      await saveLead(lead.id, {
        status: "encerrado",
        nextAction: currentDraft.nextAction || "Lead encerrado",
        returnAt: "",
      });
      return;
    }
    if (action === "reabrir") {
      await saveLead(lead.id, {
        status: "retorno",
        nextAction: currentDraft.nextAction || "Retomar lead",
        returnAt: plusDaysDatetimeLocal(1),
      });
    }
  }

  async function handleLeadInboxAction(lead: LeadItem) {
    if (isLeadInInbox(lead)) {
      openInboxAgenda(getLeadInboxConversationId(lead) || null);
      return;
    }
    setSavingLeadId(lead.id);
    try {
      await syncLeadsToInbox([lead], {
        title: "Importando para Inbox",
        description: "Preparando este card no Inbox interno.",
      });
    } finally {
      setSavingLeadId(null);
    }
  }

  function focusLead(leadId: string) {
    const current = leadById.get(leadId);
    if (!current) return;
    if (current.block === "overdue") setSelectedDateKey("overdue");
    if (current.block === "today") setSelectedDateKey("today");
    if (current.block === "scheduled") {
      const dateKey = buildLocalDateKey(
        current.lead.returnAt || current.lead.updatedAt,
      );
      if (dateKey) setSelectedDateKey(`scheduled:${dateKey}`);
    }
    if (current.block === "closed") setShowClosed(true);
    setSelectedLeadId(leadId);
    setCommandOpen(false);
    // After changing selected block/lead, wait a tick for DOM to update
    // then scroll the actual card into view and move keyboard focus there.
    window.setTimeout(() => {
      const node = leadCardRefs.current[leadId];
      if (node) {
        try {
          node.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "nearest",
          });
        } catch {
          node.scrollIntoView({ behavior: "smooth" });
        }
        // focus the primary interactive element inside the card if present
        const focusable = node.querySelector(
          'button, [role="button"], a, input, textarea, [tabindex]',
        ) as HTMLElement | null;
        if (focusable) focusable.focus();
      } else {
        // fallback: ensure detail panel is visible
        document
          .querySelector<HTMLElement>("[data-detail-panel='true']")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 80);
  }

  function registerLeadCardRef(leadId: string, node: HTMLElement | null) {
    leadCardRefs.current[leadId] = node;
  }

  function registerDateFilterRef(
    filterKey: DateFilterKey,
    node: HTMLElement | null,
  ) {
    dateFilterRefs.current[filterKey] = node;
  }

  function createPatchedDraft(lead: LeadItem, targetKey: DateFilterKey) {
    const currentDraft = drafts[lead.id] || createDraft(lead);
    let returnAt =
      currentDraft.returnAt || toDatetimeLocal(lead.returnAt) || "";
    let status = currentDraft.status;

    if (targetKey === "today") {
      returnAt = buildTargetDatetimeLocal(
        localDateKeyFromDate(new Date()),
        null,
        12,
        0,
      );
    } else if (targetKey === "overdue") {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      returnAt = buildTargetDatetimeLocal(
        localDateKeyFromDate(yesterday),
        returnAt || null,
      );
    } else {
      returnAt = buildTargetDatetimeLocal(
        targetKey.slice("scheduled:".length),
        returnAt || null,
      );
      if (status !== "encerrado" && status !== "qualificado")
        status = "retorno";
    }

    return {
      ...currentDraft,
      status,
      returnAt: toDatetimeLocal(returnAt),
    };
  }

  function applyOptimisticDateMove(
    currentBoard: BoardResponse,
    leadId: string,
    targetKey: DateFilterKey,
    nextDraft: LeadDraft,
  ) {
    const blocks: BoardResponse["blocks"] = {
      overdue: [...currentBoard.blocks.overdue],
      today: [...currentBoard.blocks.today],
      scheduled: [...currentBoard.blocks.scheduled],
      closed: [...currentBoard.blocks.closed],
    };
    let movingLead: LeadItem | null = null;

    (["overdue", "today", "scheduled", "closed"] as LeadBlockKey[]).forEach(
      (blockKey) => {
        blocks[blockKey] = blocks[blockKey].filter((lead) => {
          if (lead.id !== leadId) return true;
          movingLead = lead;
          return false;
        });
      },
    );

    if (!movingLead) return currentBoard;

    const patchedLead: LeadItem = {
      ...(movingLead as LeadItem),
      status: nextDraft.status,
      statusLabel: statusLabel(nextDraft.status),
      returnAt: nextDraft.returnAt
        ? new Date(nextDraft.returnAt).toISOString()
        : "",
      updatedAt: new Date().toISOString(),
    };

    if (targetKey === "today") blocks.today.unshift(patchedLead);
    else if (targetKey === "overdue") blocks.overdue.unshift(patchedLead);
    else blocks.scheduled.unshift(patchedLead);

    return { blocks, summary: recomputeSummary(blocks) };
  }

  async function handleDateMove(leadId: string, targetKey: DateFilterKey) {
    if (!board) return;
    const currentRecord = leadById.get(leadId);
    if (!currentRecord || currentRecord.block === "closed") return;

    const currentDateKey =
      currentRecord.block === "scheduled"
        ? (`scheduled:${buildLocalDateKey(currentRecord.lead.returnAt || currentRecord.lead.updatedAt)}` as DateFilterKey)
        : (currentRecord.block as DateFilterKey);
    if (currentDateKey === targetKey) return;

    const previousBoard = board;
    const previousDrafts = drafts;
    const nextDraft = createPatchedDraft(currentRecord.lead, targetKey);
    const optimisticBoard = applyOptimisticDateMove(
      board,
      leadId,
      targetKey,
      nextDraft,
    );

    setBoard(optimisticBoard);
    setDrafts((prev) => ({ ...prev, [leadId]: nextDraft }));
    setSelectedLeadId(leadId);
    setSavingLeadId(leadId);

    try {
      await apiFetch(`/vendas/lead/${leadId}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: nextDraft.status,
          nextAction: nextDraft.nextAction,
          returnAt: nextDraft.returnAt || "",
        }),
      });
      setFeedback("Lead movido na agenda.");
      await loadBoard();
    } catch (moveError) {
      setBoard(previousBoard);
      setDrafts(previousDrafts);
      setError(
        moveError instanceof Error
          ? moveError.message
          : "Falha ao mover o lead na agenda.",
      );
    } finally {
      setSavingLeadId(null);
    }
  }
  async function moveAllLeadsFromSourceToTarget(
    sourceKey: DateFilterKey,
    targetKey: DateFilterKey,
  ) {
    if (!board) return;
    let leadsToMove: LeadItem[] = [];
    if (sourceKey === "overdue") leadsToMove = [...board.blocks.overdue];
    else if (sourceKey === "today") leadsToMove = [...board.blocks.today];
    else if (sourceKey.startsWith("scheduled:")) {
      const iso = sourceKey.slice("scheduled:".length);
      leadsToMove = (board.blocks.scheduled || []).filter(
        (l) => buildLocalDateKey(l.returnAt || l.updatedAt) === iso,
      );
    } else {
      return;
    }

    if (!leadsToMove.length) return;
    const totalMoves = leadsToMove.length;
    const nextDraftByLeadId: Record<string, LeadDraft> = {};
    const failedLeadIds: string[] = [];
    let completedMoves = 0;

    for (const lead of leadsToMove) {
      nextDraftByLeadId[lead.id] = createPatchedDraft(lead, targetKey);
    }

    setError(null);
    setFeedback(`Movendo 0/${totalMoves} retornos...`);
    setSelectedDateKey(targetKey);
    setSelectedLeadId(null);

    const concurrency = Math.min(3, totalMoves);
    let cursor = 0;

    async function moveOneLead(lead: LeadItem) {
      const nextDraft = nextDraftByLeadId[lead.id];
      try {
        await apiFetch(`/vendas/lead/${lead.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: nextDraft.status,
            nextAction: nextDraft.nextAction,
            returnAt: nextDraft.returnAt || "",
          }),
        });

        completedMoves += 1;
        setDrafts((prev) => ({ ...prev, [lead.id]: nextDraft }));
        setBoard((currentBoard) =>
          currentBoard
            ? applyOptimisticDateMove(
                currentBoard,
                lead.id,
                targetKey,
                nextDraft,
              )
            : currentBoard,
        );
        setFeedback(
          completedMoves >= totalMoves
            ? `Movidos ${completedMoves} retornos.`
            : `Movendo ${completedMoves}/${totalMoves} retornos...`,
        );
      } catch {
        failedLeadIds.push(lead.id);
      }
    }

    async function worker() {
      while (cursor < leadsToMove.length) {
        const lead = leadsToMove[cursor];
        cursor += 1;
        if (!lead) break;
        await moveOneLead(lead);
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    await loadBoard();

    if (failedLeadIds.length) {
      setError(
        failedLeadIds.length === totalMoves
          ? "Falha ao mover os retornos da agenda."
          : `Falha ao mover ${failedLeadIds.length} de ${totalMoves} retornos.`,
      );
      return;
    }

    setFeedback(`Movidos ${totalMoves} retornos.`);
  }

  function handleDragStart(event: DragStartEvent) {
    const activeId = String(event.active.id || "");
    const isLeadDrag = Boolean(activeId && !activeId.startsWith("date:"));
    setVendasCardDragLock(isLeadDrag);

    if (activeId.startsWith("date:")) {
      setActiveDragDateKey(activeId.slice("date:".length));
      setActiveDragLeadId(null);
    } else {
      setActiveDragLeadId(activeId);
      setActiveDragDateKey(null);
    }
  }

  function handleDragCancel() {
    setVendasCardDragLock(false);
    setActiveDragLeadId(null);
    setActiveDragDateKey(null);
    lastDragEndedAtRef.current = performance.now();
  }

  async function handleDragEnd(event: DragEndEvent) {
    try {
      const activeId = String(event.active.id || "");
      const targetKey = event.over?.id as DateFilterKey | undefined;
      if (!activeId || !targetKey) {
        setActiveDragLeadId(null);
        setActiveDragDateKey(null);
        return;
      }

      if (activeId.startsWith("date:")) {
        setActiveDragLeadId(null);
        setActiveDragDateKey(null);
        const sourceKey = activeId.slice("date:".length) as DateFilterKey;
        if (sourceKey === targetKey) {
          lastDragEndedAtRef.current = performance.now();
          return;
        }
        setPulseDateKey(targetKey);
        await moveAllLeadsFromSourceToTarget(sourceKey, targetKey);
        lastDragEndedAtRef.current = performance.now();
        return;
      }

      const leadId = activeId;
      const record = leadById.get(leadId);
      const draft = record ? drafts[leadId] || createDraft(record.lead) : null;
      const fromRect = leadCardRefs.current[leadId]?.getBoundingClientRect();
      const targetRect =
        dateFilterRefs.current[targetKey]?.getBoundingClientRect();
      if (record && draft && fromRect && targetRect) {
        setFlyAnimation({
          leadId,
          lead: record.lead,
          draft,
          blockKey: record.block,
          from: {
            x: fromRect.left,
            y: fromRect.top,
            width: fromRect.width,
            height: fromRect.height,
          },
          to: {
            x: targetRect.left,
            y: targetRect.top,
            width: targetRect.width,
            height: targetRect.height,
          },
        });
      }
      setActiveDragLeadId(null);
      setActiveDragDateKey(null);
      setPulseDateKey(targetKey);
      await handleDateMove(leadId, targetKey);
      lastDragEndedAtRef.current = performance.now();
    } finally {
      setVendasCardDragLock(false);
    }
  }

  function renderLeadCard(lead: LeadItem, blockKey: LeadBlockKey) {
    const draft = drafts[lead.id] || createDraft(lead);
    const commonProps = {
      lead,
      draft,
      blockKey,
      selected: selectedLeadId === lead.id,
      saving: savingLeadId === lead.id,
      onFocus: () => focusLead(lead.id),
      onQuickAction: (action: string) => void runQuickAction(lead, action),
      onInboxAction: (targetLead: LeadItem) =>
        void handleLeadInboxAction(targetLead),
      onEdit: (id: string | null) => {
        const next = editingLeadId === id ? null : id;
        editingInputActiveRef.current = Boolean(next);
        setEditingLeadId(next);
        if (next) focusLead(next);
      },
      onDraftChange: (leadId: string, patch: Partial<LeadDraft>) =>
        setLeadDraft(leadId, patch),
      onEditingActiveChange: (active: boolean) => {
        editingInputActiveRef.current = active;
      },
      onSave: (leadId: string) => void saveLead(leadId),
      editing: editingLeadId === lead.id,
      bulkSelectionMode,
      bulkSelected: bulkSelectAllAccount || selectedBulkLeadIds.has(lead.id),
      onBulkToggle: (leadId: string) => toggleLeadBulkSelection(leadId),
    };

    if (blockKey === "closed") {
      return <LeadCardView key={lead.id} {...commonProps} />;
    }

    return (
      <DraggableLeadCard
        key={lead.id}
        {...commonProps}
        disabled={false}
        hidden={flyAnimation?.leadId === lead.id}
        register={(node) => registerLeadCardRef(lead.id, node)}
      />
    );
  }

  function renderDetailPanel() {
    if (!selectedLead || !selectedLeadDraft) {
      return (
        <aside className={styles.detailPanel} data-detail-panel="true">
          <div className={styles.detailRail}>
            <span>Fluxo UX: selecione um cliente</span>
            <span className={styles.miniPill}>Operação</span>
          </div>
          <div className={styles.detailEmpty}>
            <span className={styles.panelEyebrow}>Cliente</span>
            <strong>Escolha um card para abrir a lateral.</strong>
            <p>
              O detalhe fica mais estreito e mostra só o que precisa ser operado
              agora.
            </p>
          </div>
        </aside>
      );
    }

    return (
      <aside className={styles.detailPanel} data-detail-panel="true">
        <div className={styles.detailLayout}>
          <section className={styles.timelineSection}>
            <div className={styles.sectionTopline}>
              <div>
                <span className={styles.panelEyebrow}>Timeline</span>
              </div>
              <span className={styles.miniPill}>
                {(selectedLead.timeline || []).length} evento(s)
              </span>
            </div>
            {(selectedLead.timeline || []).length ? (
              <div className={styles.timelineList}>
                {(selectedLead.timeline || []).map((event) => {
                  const isExpanded = expandedTimelineEventId === event.id;
                  const titleText =
                    event.eventType === "return_scheduled"
                      ? "Retorno agendado"
                      : event.title;
                  return (
                    <article
                      key={event.id}
                      className={styles.timelineItem}
                      data-tone={timelineTone(event.eventType)}
                      data-expanded={isExpanded ? "true" : "false"}
                      onClick={() =>
                        setExpandedTimelineEventId(isExpanded ? null : event.id)
                      }
                    >
                      <div className={styles.timelineDot} />
                      <div className={styles.timelineBody}>
                        <div className={styles.timelineTopline}>
                          <strong>{titleText}</strong>
                          <span>
                            {isExpanded
                              ? event.createdAt
                                ? formatDateTime(event.createdAt)
                                : "Agora"
                              : ""}
                          </span>
                        </div>
                        {isExpanded ? (
                          <p>
                            {event.description ||
                              "Movimento comercial registrado."}
                          </p>
                        ) : null}
                        {isExpanded ? (
                          <span className={styles.timelineMeta}>
                            {timelineMeta(event)}
                          </span>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className={styles.emptyPanel}>
                <strong>Nenhum evento registrado</strong>
                <p>A timeline aparece conforme o lead é movimentado.</p>
              </div>
            )}
          </section>
        </div>
      </aside>
    );
  }

  function renderPipelineBoard() {
    if (!selectedFilter) {
      return (
        <section className={styles.boardShell}>
          <div className={styles.emptyBoard}>
            <strong>Nenhuma janela de datas disponível</strong>
            <p>Assim que houver agenda, os cards aparecem aqui.</p>
          </div>
        </section>
      );
    }

    const bulkActionDisabled =
      bulkDeleting || (!bulkSelectAllAccount && selectedBulkLeadIds.size === 0);
    const bulkSelectionLabel = bulkSelectAllAccount
      ? "Todos os cards da conta"
      : `${selectedBulkLeadIds.size} selecionado(s)`;

    return (
      <section className={styles.boardShell}>
        <div className={styles.cardsHeader}>
          <div>
            <span className={styles.panelEyebrow}>Clientes</span>
            <h2 className={styles.boardTitle}>{selectedFilter.title}</h2>
            <p className={styles.boardSubtitle}>
              Acompanhe quem você já chamou e quem precisa de retorno.
            </p>
          </div>
          <div className={styles.toolbar}>
            <button
              type="button"
              className={`${styles.secondaryAction} ${styles.toolbarHighlight}`}
              onClick={() => setComposerOpen(true)}
            >
              Criar novo Lead
            </button>
            <button
              type="button"
              className={`${styles.secondaryAction} ${styles.toolbarHighlight}`}
              data-active={bulkSelectionMode ? "true" : "false"}
              onClick={toggleBulkSelectionMode}
            >
              {bulkSelectionMode ? "Cancelar seleção" : "Selecionar"}
            </button>
            {bulkSelectionMode ? (
              <>
                <button
                  type="button"
                  className={`${styles.secondaryAction} ${styles.toolbarHighlight}`}
                  data-active={bulkSelectAllAccount ? "true" : "false"}
                  onClick={toggleBulkSelectAll}
                >
                  {bulkSelectAllAccount ? "Limpar todos" : "Selecionar todos"}
                </button>
                <button
                  type="button"
                  className={`${styles.secondaryAction} ${styles.bulkDeleteButton}`}
                  onClick={() => void deleteSelectedLeadsBulk()}
                  disabled={bulkActionDisabled}
                  title="Remove os cards do Vendas sem apagar a base do Radar Digital"
                >
                  {bulkDeleting
                    ? "Excluindo..."
                    : `Excluir em massa (${bulkSelectionLabel})`}
                </button>
              </>
            ) : null}
            <button
              type="button"
              className={`${styles.secondaryAction} ${styles.toolbarHighlight} ${styles.whatsappFilterButton}`}
              data-active={whatsappFilter !== "all" ? "true" : "false"}
              onClick={() =>
                setWhatsappFilter((current) => nextWhatsappFilter(current))
              }
              aria-pressed={whatsappFilter !== "all"}
              title="Alternar filtro com WhatsApp / sem WhatsApp"
            >
              {WHATSAPP_FILTER_LABELS[whatsappFilter]}
            </button>
            <button
              type="button"
              className={`${styles.secondaryAction} ${styles.toolbarHighlight} ${styles.inboxFilterButton}`}
              data-active={inboxFilter !== "all" ? "true" : "false"}
              onClick={() =>
                setInboxFilter((current) => nextInboxFilter(current))
              }
              aria-pressed={inboxFilter !== "all"}
              title="Alternar filtro de presença no Inbox"
            >
              {INBOX_FILTER_LABELS[inboxFilter]}
            </button>
            <button
              type="button"
              className={styles.secondaryAction}
              onClick={() => setShowClosed((current) => !current)}
            >
              {showClosed
                ? "Ocultar arquivo"
                : `Arquivo (${closedLeads.length})`}
            </button>
          </div>
        </div>

        {filteredLeads.length ? (
          <div className={styles.cardsGrid}>
            {filteredLeads.map((lead) =>
              renderLeadCard(lead, selectedFilter.blockKey),
            )}
          </div>
        ) : (
          <div className={styles.emptyBoard}>
            <strong>Sem cards nesta data</strong>
            <p>Nenhum cliente caiu nessa janela ainda.</p>
          </div>
        )}
      </section>
    );
  }

  if (hasToken === null) {
    return (
      <DashboardScaffold
        title="Vendas"
        description="Carregando sessão do CRM comercial."
        hideHeader={true}
      >
        <section className={styles.loadingCard}>
          <div className={styles.skeletonHero} />
          <div className={styles.skeletonBoard} />
        </section>
      </DashboardScaffold>
    );
  }

  if (!hasToken) return null;

  const activeDragRecord = activeDragLeadId
    ? leadById.get(activeDragLeadId) || null
    : null;
  const activeDragLead = activeDragRecord?.lead || null;
  const activeDragDraft = activeDragLead
    ? drafts[activeDragLead.id] || createDraft(activeDragLead)
    : null;
  const flyStyle = flyAnimation
    ? ({
        ["--fly-start-x" as string]: `${flyAnimation.from.x}px`,
        ["--fly-start-y" as string]: `${flyAnimation.from.y}px`,
        ["--fly-width" as string]: `${flyAnimation.from.width}px`,
        ["--fly-height" as string]: `${flyAnimation.from.height}px`,
        ["--fly-end-x" as string]: `${flyAnimation.to.x + flyAnimation.to.width / 2 - flyAnimation.from.width / 2}px`,
        ["--fly-end-y" as string]: `${flyAnimation.to.y + flyAnimation.to.height / 2 - flyAnimation.from.height / 2}px`,
        ["--fly-scale-x" as string]: `${Math.max(0.28, flyAnimation.to.width / flyAnimation.from.width)}`,
        ["--fly-scale-y" as string]: `${Math.max(0.24, flyAnimation.to.height / flyAnimation.from.height)}`,
      } satisfies CSSProperties)
    : undefined;

  const activeDragDateItem = activeDragDateKey
    ? dateFilters.find((f) => f.key === activeDragDateKey)
    : null;

  const vendasDragTopbarLockStyle = `
html[data-vendas-dragging-card="true"] {
  --topbar-total-height: 0px;
}

html[data-vendas-dragging-card="true"] .app-topbar,
html[data-vendas-dragging-card="true"] .app-topbar__frame,
html[data-vendas-dragging-card="true"] .app-topbar__portal,
html[data-vendas-dragging-card="true"] header[class*="topbar" i],
html[data-vendas-dragging-card="true"] [class*="app-topbar" i] {
  transform: translate3d(0, -140%, 0) !important;
  opacity: 0 !important;
  visibility: hidden !important;
  pointer-events: none !important;
  transition: none !important;
}

html[data-vendas-dragging-card="true"] .${styles.filterRail} {
  position: sticky;
  top: 0 !important;
  z-index: 2147483000 !important;
  isolation: isolate;
  transform: translateZ(0);
  overflow: visible !important;
  border-color: color-mix(in srgb, var(--brand) 46%, var(--line)) !important;
  box-shadow:
    0 1px 0 color-mix(in srgb, var(--surface-raised) 94%, transparent) inset,
    0 0 0 2px color-mix(in srgb, var(--brand) 18%, transparent),
    0 24px 56px -24px color-mix(in srgb, var(--brand) 34%, transparent),
    0 34px 84px -42px rgba(15, 23, 42, 0.36),
    var(--shadow-inset) !important;
}

html[data-vendas-dragging-card="true"] .${styles.filterRail}::after {
  content: "Solte no filtro de data";
  position: absolute;
  right: 1rem;
  top: -0.72rem;
  z-index: 4;
  padding: 0.22rem 0.58rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--brand) 38%, var(--line));
  background: color-mix(in srgb, var(--surface-raised) 96%, var(--background));
  color: color-mix(in srgb, var(--brand) 88%, var(--foreground));
  box-shadow: 0 14px 28px -18px color-mix(in srgb, var(--brand) 44%, transparent);
  font-size: 0.62rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  pointer-events: none;
}

html[data-vendas-dragging-card="true"] .${styles.dateFilterCard} {
  pointer-events: auto;
}

html[data-vendas-dragging-card="true"] .${styles.dateFilterCard}[data-dropover="true"] {
  z-index: 2147483001 !important;
  border-color: color-mix(in srgb, var(--brand) 78%, var(--line)) !important;
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--brand) 24%, transparent),
    0 30px 58px -26px color-mix(in srgb, var(--brand) 42%, transparent) !important;
}
`;

  const accountCapabilities = board?.capabilities || salesProfile?.capabilities || {};
  const accountProfileSummary = `${salesProfileDraft.whatDoYouSell || "Perfil"} para ${(salesProfileDraft.targetAudience || [])[0] || "pequenos negócios"}`;

  function renderAccountChipEditor(
    title: string,
    values: string[],
    examples: string[],
    onChange: (values: string[]) => void,
  ) {
    return (
      <section className={`${styles.mobileSalesProfileBlock} hbx-mobile-card`}>
        <strong>{title}</strong>
        <div className={styles.mobileSalesProfileChips}>
          {examples.map((item) => {
            const active = values.some((value) => value.toLowerCase() === item.toLowerCase());
            return (
              <button
                key={item}
                type="button"
                data-active={active ? "true" : "false"}
                onClick={() => onChange(toggleStringValue(values, item))}
              >
                {item}
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  function renderAccountSalesProfileSettings() {
    return (
      <div className={styles.mobileVendasAccountSettings}>
        <section className={`${styles.mobileSalesProfileHero} hbx-mobile-card`}>
          <span>Perfil ativo: {accountProfileSummary}</span>
          <strong>Perfil de Venda</strong>
          <p>O HBX usa isso para escolher melhores cards para você.</p>
        </section>
        <section className={`${styles.mobileSalesProfileBlock} hbx-mobile-card`}>
          <strong>O que você vende?</strong>
          <input
            value={salesProfileDraft.whatDoYouSell}
            onChange={(event) => setSalesProfileDraft((current) => ({ ...current, whatDoYouSell: event.target.value }))}
            placeholder="Ex.: Plano de saúde"
            maxLength={160}
          />
          <div className={styles.mobileSalesProfileChips}>
            {SALES_PROFILE_SELL_EXAMPLES.map((item) => (
              <button
                key={item}
                type="button"
                data-active={salesProfileDraft.whatDoYouSell === item ? "true" : "false"}
                onClick={() => setSalesProfileDraft((current) => ({ ...current, whatDoYouSell: item }))}
              >
                {item}
              </button>
            ))}
          </div>
        </section>
        {renderAccountChipEditor("Para quem você quer vender?", salesProfileDraft.targetAudience, SALES_PROFILE_AUDIENCE_EXAMPLES, (values) =>
          setSalesProfileDraft((current) => ({ ...current, targetAudience: values })),
        )}
        {renderAccountChipEditor("O que você quer evitar?", salesProfileDraft.avoidSegments, SALES_PROFILE_AVOID_EXAMPLES, (values) =>
          setSalesProfileDraft((current) => ({ ...current, avoidSegments: values })),
        )}
        {renderAccountChipEditor("Canal preferido", salesProfileDraft.preferredChannels, SALES_PROFILE_CHANNELS, (values) =>
          setSalesProfileDraft((current) => ({ ...current, preferredChannels: values })),
        )}
        <section className={`${styles.mobileSalesProfileBlock} hbx-mobile-card`}>
          <label className={styles.mobileSalesProfileToggle}>
            <input
              type="checkbox"
              checked={salesProfileDraft.weeklyAutoUpdateEnabled}
              onChange={(event) => setSalesProfileDraft((current) => ({ ...current, weeklyAutoUpdateEnabled: event.target.checked }))}
            />
            <span>Deixar o HBX sugerir ajustes toda segunda-feira</span>
          </label>
          <p>Você revisa antes de aplicar.</p>
        </section>
        {salesProfileSuggestion?.diff?.length ? (
          <section className={`${styles.mobileSalesProfileBlock} hbx-mobile-card`}>
            <strong>Sugestão da semana</strong>
            {salesProfileSuggestion.diff.map((item: string) => <p key={item}>{item}</p>)}
          </section>
        ) : null}
        <div className={styles.mobileSalesProfileActions}>
          <button type="button" className="hbx-mobile-primary-button" onClick={() => void saveSalesProfile()} disabled={salesProfileSaving}>
            {salesProfileSaving ? "Salvando" : "Salvar perfil"}
          </button>
          <button type="button" className="hbx-mobile-secondary-button" onClick={() => void suggestSalesProfile()} disabled={salesProfileSaving || !accountCapabilities.canUseWeeklyProfileSuggestions}>
            Gerar sugestão com base na semana
          </button>
          <button type="button" className="hbx-mobile-secondary-button" onClick={() => setSalesProfileDraft(SALES_PROFILE_DEFAULT_DRAFT)}>
            Restaurar padrão
          </button>
        </div>
      </div>
    );
  }

  const mobileReturnDateKey = mobileReturnScheduler
    ? parseShortBrazilianDate(mobileReturnScheduler.dateText)
    : "";
  const mobileReturnCalendarDays = mobileReturnScheduler
    ? buildCalendarDays(mobileReturnScheduler.monthKey)
    : [];
  const mobileReturnMonthLabel = mobileReturnScheduler
    ? new Date(`${mobileReturnScheduler.monthKey}-01T12:00:00`).toLocaleDateString("pt-BR", {
        month: "long",
        year: "numeric",
      })
    : "";
  function renderRadarPopup() {
    if (mobileRoute || !radarPopupOpen || typeof document === "undefined") return null;
    const radarPopupParams = new URLSearchParams(searchParams.toString());
    radarPopupParams.delete("radar");
    radarPopupParams.delete("radarAction");
    radarPopupParams.delete("radarTick");
    const radarPopupSrc = `/mobile/radar-digital${radarPopupParams.toString() ? `?${radarPopupParams.toString()}` : ""}`;

    return createPortal(
      <div
        className={styles.radarPopupBackdrop}
        role="presentation"
        onClick={() => setRadarPopupOpen(false)}
      >
        <section
          className={styles.radarPopup}
          role="dialog"
          aria-modal="true"
          aria-labelledby="vendas-radar-popup-title"
          onClick={(event) => event.stopPropagation()}
        >
          <header className={styles.radarPopupHeader}>
            <div>
              <span>Radar Digital</span>
              <strong id="vendas-radar-popup-title">Buscar cards para Vendas</strong>
            </div>
            <button type="button" onClick={() => setRadarPopupOpen(false)} aria-label="Fechar Radar Digital">
              X
            </button>
          </header>
          <div className={styles.radarPopupBody}>
            <iframe
              src={radarPopupSrc}
              title="Radar Digital"
              className={styles.radarPopupFrame}
            />
          </div>
        </section>
      </div>,
      document.body,
    );
  }

  if (mobileRoute) {
    return (
      <DashboardScaffold title="Vendas" hideHeader={true}>
        <style dangerouslySetInnerHTML={{ __html: vendasDragTopbarLockStyle }} />
        {renderMobileVendas()}
      </DashboardScaffold>
    );
  }

  return (
    <DashboardScaffold title="Vendas" hideHeader={true}>
      <style dangerouslySetInnerHTML={{ __html: vendasDragTopbarLockStyle }} />
      <div className={styles.desktopVendasShell}>
        <DndContext
          sensors={sensors}
          collisionDetection={detectDateFilterCollision}
          onDragStart={handleDragStart}
          onDragCancel={handleDragCancel}
          onDragEnd={(event) => void handleDragEnd(event)}
        >
        <div className={styles.premiumBackdrop}>
          <div className={styles.premiumBg} />
          <div className={styles.page}>
            <section className={styles.filterRail}>
              <div className={styles.filterRailHeader}>
                <div>
                  <span className={styles.panelEyebrow}>Filtro por datas</span>
                  <strong>Agenda comercial</strong>
                </div>
                <div className={styles.filterRailActions}>
                  <Link
                    href="/atendimento?atendimentoQueue=scheduled&atendimentoSection=agenda&agendaStudio=1&agendaMode=sales&returnTo=%2Fvendas"
                    prefetch={false}
                    className={styles.secondaryAction}
                  >
                    Agenda Vendas
                  </Link>
                </div>
              </div>
              <div className={styles.filterRailCarousel}>
                <button
                  type="button"
                  className={styles.dateRailScrollButton}
                  data-side="left"
                  onClick={() => scrollDateRail(-1)}
                  aria-label="Rolar datas para esquerda"
                >
                  <span aria-hidden="true">‹</span>
                </button>
                <div
                  className={styles.filterRailScroller}
                  ref={filterScrollerRef}
                >
                  {dateFilters.map((item) => (
                    <DateDropSlot
                      key={item.key}
                      item={item}
                      active={selectedDateKey === item.key}
                      pulse={pulseDateKey === item.key}
                      dragging={Boolean(activeDragLeadId || activeDragDateKey)}
                      ignoreClick={() =>
                        performance.now() - lastDragEndedAtRef.current < 70
                      }
                      onDateShortcut={() => void handleActiveDateShortcut()}
                      onSelect={() => setSelectedDateKey(item.key)}
                      register={(node) => registerDateFilterRef(item.key, node)}
                    />
                  ))}

                  {/* +Agenda button: rendered after all date cards so it is always last */}
                  <button
                    type="button"
                    className={`${styles.dateFilterCard} ${styles.addAgendaButton}`}
                    aria-label="+Agenda"
                    title="+Agenda"
                    onClick={() => {
                      /* graphical placeholder - no action */
                    }}
                  >
                    <span className={styles.dateFilterDay} />
                    <strong>+</strong>
                    <span />
                    <b />
                    <span className={styles.receiveHint} />
                  </button>
                </div>
                <button
                  type="button"
                  className={styles.dateRailScrollButton}
                  data-side="right"
                  onClick={() => scrollDateRail(1)}
                  aria-label="Rolar datas para direita"
                >
                  <span aria-hidden="true">›</span>
                </button>
              </div>
            </section>

            {loading ? (
              <section className={styles.loadingCard}>
                <div className={styles.skeletonBoard} />
              </section>
            ) : (
              <div className={styles.stageGrid}>
                <div className={styles.stageMain}>{renderPipelineBoard()}</div>
                <div className={styles.stageAside}>{renderDetailPanel()}</div>
              </div>
            )}

            {showClosed ? (
              <section
                ref={archiveRef}
                tabIndex={-1}
                className={styles.archiveSection}
                aria-labelledby="archive-heading"
              >
                <div className={styles.sectionTopline}>
                  <div id="archive-heading">
                    <span className={styles.panelEyebrow}>Arquivo</span>
                    <strong>Encerrados</strong>
                  </div>
                  <button
                    type="button"
                    className={styles.secondaryAction}
                    onClick={() => setShowClosed(false)}
                  >
                    Ocultar arquivo
                  </button>
                </div>
                {closedLeads.length ? (
                  <div className={styles.cardsGrid}>
                    {closedLeads.map((lead) => renderLeadCard(lead, "closed"))}
                  </div>
                ) : (
                  <div className={styles.emptyPanel}>
                    <strong>Nenhum encerrado ainda</strong>
                    <p>Os cards arquivados aparecem aqui.</p>
                  </div>
                )}
              </section>
            ) : null}
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {activeDragLead && activeDragDraft ? (
            <div className={styles.dragOverlayCard}>
              <LeadCardView
                lead={activeDragLead}
                draft={activeDragDraft}
                blockKey={activeDragRecord?.block || "today"}
                selected={false}
                saving={false}
                onFocus={() => focusLead(activeDragLead.id)}
                onQuickAction={(action) =>
                  void runQuickAction(activeDragLead, action)
                }
                onInboxAction={(targetLead) =>
                  void handleLeadInboxAction(targetLead)
                }
              />
            </div>
          ) : activeDragDateItem ? (
            <div
              className={`${styles.dragOverlayCard} ${styles.dragOverlayDateCard}`}
            >
              <div
                className={styles.dateFilterCard}
                style={{ pointerEvents: "none" }}
              >
                <span className={styles.dateFilterDay}>
                  {activeDragDateItem.dayLabel}
                </span>
                <strong>{activeDragDateItem.title}</strong>
                <span>{activeDragDateItem.subtitle}</span>
                <b>{activeDragDateItem.count}</b>
                <span className={styles.receiveHint}>Mover todos</span>
              </div>
            </div>
          ) : null}
        </DragOverlay>

        {flyAnimation ? (
          <div className={styles.flyCard} style={flyStyle}>
            <LeadCardView
              lead={flyAnimation.lead}
              draft={flyAnimation.draft}
              blockKey={flyAnimation.blockKey}
              selected={false}
              saving={false}
              onFocus={() => {}}
              onQuickAction={() => {}}
              onInboxAction={() => {}}
            />
          </div>
        ) : null}
        </DndContext>
        </div>

      {composerOpen ? createPortal(
        <div
          className={`${styles.systemPopupOverlay} ${styles.systemPopupOverlayActive} ${styles.mobileComposerOverlay}`}
          onClick={() => setComposerOpen(false)}
        >
          <div
            className={`${styles.systemPopupFrame} ${styles.mobileComposerSheet}`}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-lead-title"
          >
            <div className={styles.systemPopupChrome}>
              <div>
                <p className={styles.systemPopupEyebrow}>Vendas</p>
                <strong id="new-lead-title">Novo lead</strong>
              </div>
              <div className={styles.systemPopupActions}>
                <span className={styles.metaBadge}>Cadastro rápido</span>
                <button
                  type="button"
                  className={`btn btn-secondary btn-sm ${styles.mobileComposerClose}`}
                  onClick={() => setComposerOpen(false)}
                  aria-label="Fechar cadastro de lead"
                >
                  <span className={styles.mobileComposerCloseGlyph} aria-hidden="true">
                    ×
                  </span>
                  <span className={styles.mobileComposerCloseText}>Fechar</span>
                </button>
              </div>
            </div>
            <div className={`${styles.systemPopupBody} ${styles.mobileComposerBody}`}>
              <form
                className={styles.composerForm}
                onSubmit={handleCreateManual}
              >
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Nome</span>
                  <input
                    className={styles.fieldInput}
                    value={manualLead.name}
                    onChange={(event) =>
                      setManualLead((prev) => ({
                        ...prev,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Ex: Clínica Horizonte"
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Telefone</span>
                  <input
                    className={styles.fieldInput}
                    value={manualLead.phone}
                    onChange={(event) =>
                      setManualLead((prev) => ({
                        ...prev,
                        phone: event.target.value,
                      }))
                    }
                    placeholder="Ex: (11) 99999-0000"
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>E-mail</span>
                  <input
                    className={styles.fieldInput}
                    value={manualLead.email}
                    onChange={(event) =>
                      setManualLead((prev) => ({
                        ...prev,
                        email: event.target.value,
                      }))
                    }
                    placeholder="Opcional"
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Retorno</span>
                  <input
                    className={styles.fieldInput}
                    type="datetime-local"
                    value={manualLead.returnAt}
                    onChange={(event) =>
                      setManualLead((prev) => ({
                        ...prev,
                        returnAt: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className={styles.fieldWide}>
                  <span className={styles.fieldLabel}>Próxima ação</span>
                  <input
                    className={styles.fieldInput}
                    value={manualLead.nextAction}
                    onChange={(event) =>
                      setManualLead((prev) => ({
                        ...prev,
                        nextAction: event.target.value,
                      }))
                    }
                    placeholder="Ex: Primeiro contato"
                  />
                </label>
                <label className={styles.fieldWide}>
                  <span className={styles.fieldLabel}>Observação</span>
                  <textarea
                    className={styles.fieldTextarea}
                    rows={4}
                    value={manualLead.shortNote}
                    onChange={(event) =>
                      setManualLead((prev) => ({
                        ...prev,
                        shortNote: event.target.value,
                      }))
                    }
                    placeholder="Contexto rápido do lead."
                  />
                </label>
                <div className={`${styles.formFooter} ${styles.mobileComposerActions}`}>
                  <button
                    type="submit"
                    className={styles.primaryAction}
                    disabled={creatingManual}
                  >
                    {creatingManual ? "Criando..." : "Criar lead"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}

      {mobileReturnScheduler ? createPortal(
        <div className={styles.mobileReturnSchedulerBackdrop}>
          <section
            className={styles.mobileReturnSchedulerDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-return-scheduler-title"
          >
            <div className={styles.mobileReturnSchedulerHeader}>
              <div>
                <small>Retorno</small>
                <h2 id="mobile-return-scheduler-title">Agendar horário</h2>
                <p>{mobileReturnScheduler.leadName}</p>
              </div>
              <button
                type="button"
                onClick={() => setMobileReturnScheduler(null)}
                aria-label="Fechar calendário de retorno"
              >
                ×
              </button>
            </div>

            <div className={styles.mobileReturnSchedulerFields}>
              <label>
                <span>Data</span>
                <input
                  inputMode="numeric"
                  value={mobileReturnScheduler.dateText}
                  onChange={(event) => updateMobileReturnDateText(event.target.value)}
                  placeholder="DD/MM/YY"
                  maxLength={10}
                />
              </label>
              <label>
                <span>Horário</span>
                <input
                  type="time"
                  value={mobileReturnScheduler.timeValue}
                  onChange={(event) => {
                    setMobileReturnScheduleError(null);
                    setMobileReturnScheduler((current) =>
                      current ? { ...current, timeValue: event.target.value } : current,
                    );
                  }}
                />
              </label>
            </div>

            <div className={styles.mobileReturnCalendarCard}>
              <div className={styles.mobileReturnCalendarHeader}>
                <button type="button" onClick={() => shiftMobileReturnCalendarMonth(-1)} aria-label="Mês anterior">
                  ‹
                </button>
                <strong>{mobileReturnMonthLabel}</strong>
                <button type="button" onClick={() => shiftMobileReturnCalendarMonth(1)} aria-label="Próximo mês">
                  ›
                </button>
              </div>
              <div className={styles.mobileReturnWeekdays} aria-hidden="true">
                {["D", "S", "T", "Q", "Q", "S", "S"].map((label, index) => (
                  <span key={`${label}-${index}`}>{label}</span>
                ))}
              </div>
              <div className={styles.mobileReturnCalendarGrid}>
                {mobileReturnCalendarDays.map((day) => (
                  day.day ? (
                    <button
                      type="button"
                      key={day.key}
                      data-selected={day.key === mobileReturnDateKey ? "true" : "false"}
                      onClick={() => selectMobileReturnCalendarDay(day.key)}
                    >
                      {day.day}
                    </button>
                  ) : (
                    <span key={day.key} aria-hidden="true" />
                  )
                ))}
              </div>
            </div>

            {mobileReturnScheduleError ? (
              <p className={styles.mobileReturnSchedulerError}>{mobileReturnScheduleError}</p>
            ) : (
              <p className={styles.mobileReturnSchedulerHint}>
                O card entra na agenda exatamente na data e no horário escolhidos.
              </p>
            )}

            <button
              type="button"
              className={styles.mobileReturnSchedulerSave}
              onClick={() => void saveMobileReturnSchedule()}
              disabled={savingLeadId === mobileReturnScheduler.leadId}
            >
              {savingLeadId === mobileReturnScheduler.leadId ? "Salvando..." : "Salvar retorno"}
            </button>
          </section>
        </div>,
        document.body,
      ) : null}

      {accountSheetOpen ? createPortal(
        <div
          className={styles.mobileVendasSheetBackdrop}
          onClick={() => setAccountSheetOpen(false)}
        >
          <section
            className={`${styles.mobileVendasNoteSheet} ${styles.mobileVendasAccountSheet}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-vendas-account-title"
            onClick={(event) => event.stopPropagation()}
          >
            <span className={styles.mobileVendasSheetHandle} aria-hidden="true" />
            <div className={styles.mobileVendasSheetHeader}>
              <h2 id="mobile-vendas-account-title">Conta</h2>
              <button type="button" onClick={() => setAccountSheetOpen(false)} aria-label="Fechar">
                ×
              </button>
            </div>
            <div className={styles.mobileVendasAccountAvatar} aria-hidden="true">
              {(accountProfile?.email || "?").slice(0, 1).toUpperCase()}
            </div>
            <label className={styles.mobileVendasAccountField}>
              <span>Como quer ser chamado</span>
              <input
                value={accountNameDraft}
                onChange={(event) => setAccountNameDraft(event.target.value)}
                placeholder="Ex.: Ana"
                maxLength={80}
              />
            </label>
            <button
              type="button"
              className={`${styles.mobileVendasAccountSave} hbx-mobile-primary-button`}
              onClick={() => {
                const trimmed = accountNameDraft.trim();
                saveMobilePreferredCallerName(trimmed);
                setMobilePreferredCallerName(trimmed);
                setAccountSheetOpen(false);
                if (trimmed) setFeedback("Preferência salva.");
              }}
            >
              Salvar
            </button>
            <div className={styles.mobileVendasAccountBlock}>
              <strong>Financeiro</strong>
              <p>
                {accountProfileLoading
                  ? "Carregando..."
                  : accountProfile?.company
                    ? [
                        accountProfile.company.subscriptionStatus &&
                          `Plano: ${accountProfile.company.subscriptionStatus}`,
                        accountProfile.company.paymentStatus &&
                          `Pagamento: ${accountProfile.company.paymentStatus}`,
                        accountProfile.company.premiumAccess ? "Premium ativo" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Sem dados de cobrança nesta sessão."
                    : "Não foi possível carregar agora."}
                  </p>
                </div>
            <div className={styles.mobileVendasAccountBlock}>
              <strong>Configurações</strong>
              <p>Ajuste seu perfil de venda, público ideal e filtros de qualidade.</p>
            </div>
            {renderAccountSalesProfileSettings()}
            <div className={styles.mobileVendasAccountActions}>
              <Link className="hbx-mobile-secondary-button" href={toMobileRoute("/boasvindas")} onClick={() => setAccountSheetOpen(false)}>
                Upgrade
              </Link>
              <Link className="hbx-mobile-primary-button" href={toMobileRoute("/tutorial")} onClick={() => setAccountSheetOpen(false)}>
                Tutorial
              </Link>
            </div>
          </section>
        </div>,
        document.body,
      ) : null}

      {commandOpen ? (
        <div
          className="ui-popup-backdrop"
          onClick={() => setCommandOpen(false)}
        >
          <div
            className={styles.commandPalette}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.sectionTopline}>
              <div>
                <span className={styles.panelEyebrow}>Command palette</span>
                <strong>Buscar lead, cidade, ação, histórico ou origem</strong>
              </div>
              <button
                type="button"
                className={styles.secondaryAction}
                onClick={() => setCommandOpen(false)}
              >
                Fechar
              </button>
            </div>
            <input
              className={styles.commandInput}
              placeholder="Digite nome, telefone, cidade, origem ou próxima ação..."
              value={commandQuery}
              onChange={(event) => setCommandQuery(event.target.value)}
              autoFocus
            />
            <div className={styles.commandList}>
              {commandResults.length ? (
                commandResults.map(({ lead, block }) => (
                  <article
                    key={`command-${lead.id}`}
                    className={styles.commandRow}
                  >
                    <button
                      type="button"
                      className={styles.commandMain}
                      onClick={() => focusLead(lead.id)}
                    >
                      <strong>{lead.name || "Lead sem nome"}</strong>
                      <span>
                        {BLOCK_LABELS[block]} • {lead.statusLabel} •{" "}
                        {lead.nextAction || "Sem próxima ação"}
                      </span>
                    </button>
                    <div className={styles.commandActionRow}>
                      <a
                        className={styles.secondaryAction}
                        href={buildCallUrl(lead.phone) || undefined}
                      >
                        Ligar
                      </a>
                      <a
                        className={styles.secondaryAction}
                        href={
                          buildWhatsAppUrl(lead.phone, lead.name) || undefined
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
                        WhatsApp
                      </a>
                    </div>
                  </article>
                ))
              ) : (
                <div className={styles.emptyPanel}>
                  <strong>Nenhum resultado</strong>
                  <p>Tente nome, telefone, cidade, status ou próxima ação.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
      {renderRadarPopup()}
    </DashboardScaffold>
  );
}
