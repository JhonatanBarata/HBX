"use client";

import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { CopilotoPanel, type CopilotoFicha } from "@/app/(app)/leads/[id]/copiloto-panel";
import type { VendasLead } from "@/app/(app)/vendas/page.client";
import {
  AgendaLeadPanel,
  formatPhoneDisplay,
  humanize,
} from "@/components/hbx/detalhes-negocio";
import { GlassPill, useGlassPill } from "@/components/hbx/glass-pill";
import {
  LeadCockpitHistory,
  type LeadCockpitCommand,
  type LeadCockpitComposerMode,
  type LeadCockpitTimelineEvent,
} from "@/components/hbx/lead-cockpit-history";
import { RadarAiBadge } from "@/components/hbx/radar-ai-badge";
import { CANAL_LABEL, CanalIcon, type Canal } from "@/components/hbx/canal-icon";
import {
  Av,
  I,
  ICONS,
  WhatsAppMark,
  isModuleVisible,
  useCurrentUser,
  useEntitlements,
  useMyModules,
} from "@/components/hbx/shell";
import { FecharVendaModal } from "@/components/hbx/fechar-venda-modal";
import { WhatsAppConnectModal } from "@/components/hbx/whatsapp-connect-modal";
import { apiFetch } from "@/lib/api";
import { onlyDigits } from "@/lib/br-phone";
import { formatBrCnae, formatBrCnpj } from "@/lib/br-document";
import type { RadarAiLeadStatus } from "@/lib/radar-ai-status";

type CockpitStage = "novo" | "contato" | "retorno" | "qualificado" | "encerrado";

type PreVooCanal = {
  status: "confirmado" | "duvidoso" | "faltante";
  valor: string | null;
  detalhe: string;
};

type PreVooPasso = {
  dia: number;
  canal: string;
  titulo: string | null;
  corpo: string | null;
  atividadeTipo: string | null;
};

type PreVooPersona = {
  key: string;
  nome: string;
  descricao: string;
  recomendado: boolean;
  passos: PreVooPasso[];
};

type PreVoo = {
  ok: boolean;
  leadId: string;
  locked: boolean;
  empresa?: {
    found: boolean;
    cnpj: string | null;
    razaoSocial: string | null;
    nomeFantasia: string | null;
    situacao: string | null;
    cnae: string | null;
    cnaeDescription: string | null;
    cidade: string | null;
    estado: string | null;
  };
  contato?: {
    nome: string | null;
    cargo: string | null;
    confianca: "alta" | "media" | "baixa" | "ausente";
    fonte: string | null;
    candidatoDuvidoso: { nome: string; fonte: string } | null;
  };
  canais?: {
    whatsapp: PreVooCanal;
    email: PreVooCanal;
    telefoneVoz: { status: "confirmado" | "faltante"; valor: string | null };
  };
  prontidao?: {
    confirmados: string[];
    duvidosos: string[];
    faltantes: string[];
    veredito: "pronto" | "falta_dados";
    veredictoLabel: string;
  };
  recomendacao?: {
    personaKey: string;
    motivo: string;
    source: string;
    abertura: string;
    objetivo: string;
  };
  personas?: PreVooPersona[];
  enrichment?: { enabled: boolean; podeBuscar: boolean };
  robo?: {
    ligado: boolean;
    enrollmentId: string | null;
    cadenciaId: string | null;
    status: string | null;
    currentStep: number;
  };
  roboBloqueado?: {
    motivo: string;
    acao: string;
    codigo: "config_ausente" | "whatsapp_desconectado" | "lead_sem_canal";
  } | null;
} | null;

type CockpitCompany = {
  found?: boolean;
  locked?: boolean;
  cnpj?: string | null;
  razaoSocial?: string | null;
  nomeFantasia?: string | null;
  situacao?: string | null;
  cnae?: string | null;
  cnaeDescription?: string | null;
  porte?: string | null;
  capitalSocial?: number | null;
  naturezaJuridica?: string | null;
  openedAt?: string | null;
  simples?: boolean | null;
  mei?: boolean | null;
  matrizFilial?: string | null;
  partners?: Array<{ name?: string | null; qualification?: string | null }> | null;
} | null;

type ExtratoCharge = {
  id: string;
  amount: number;
  description?: string | null;
  status?: string | null;
  sourceModule?: string | null;
  dueDate?: string | null;
  paidAt?: string | null;
};

type Extrato = {
  clienteId: string;
  nome?: string | null;
  saldoAberto: number;
  total: number;
  charges: ExtratoCharge[];
} | null;

type NextSlot = {
  slot: string;
  conflito: boolean;
  motivoConflito: string | null;
} | null;

// Nomes das etapas — ordem do dono 27/07, ao pé da letra.
const COCKPIT_STAGES: Array<{ key: CockpitStage; label: string }> = [
  { key: "novo", label: "Planejar" },
  { key: "contato", label: "Automação" },
  { key: "retorno", label: "Retorno" },
  { key: "qualificado", label: "Negociação" },
  { key: "encerrado", label: "Fechado" },
];

const CLOSURE_REASONS = [
  { key: "convertido", label: "Convertido" },
  { key: "sem_interesse", label: "Sem interesse" },
  { key: "nao_atendeu", label: "Não atendeu" },
  { key: "contato_invalido", label: "Contato inválido" },
  { key: "outro", label: "Outro motivo" },
] as const;

// Conflito de slot pode chegar como CÓDIGO cru do backend (ex.: "fora_da_janela")
// — código interno NUNCA aparece na tela (reforma 27/07).
const CONFLICT_LABELS: Record<string, string> = {
  fora_da_janela: "Fora do horário de disparo",
  slot_ocupado: "Horário ocupado",
  sem_config: "Sem configuração de disparo",
};

function conflictLabel(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.includes(" ") ? trimmed : CONFLICT_LABELS[trimmed] || humanize(trimmed);
}

// Delta absoluto entre timestamps (não é data civil — imune a fuso).
function relativeTimeLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return fmtDateTime(value);
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "agora mesmo";
  if (minutes < 60) return `${minutes} min atrás`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "ontem";
  if (days < 30) return `${days} dias atrás`;
  return fmtDate(value);
}

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

function normalizeCockpitStage(value: string | null | undefined): CockpitStage {
  if (value === "contato" || value === "retorno" || value === "qualificado" || value === "encerrado") return value;
  return "novo";
}

function fmtMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function yearsSince(value: string | null | undefined): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const years = Math.floor((Date.now() - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  return years >= 0 ? years : null;
}

function chargeStatusLabel(status?: string | null): string {
  const key = String(status || "").toLowerCase();
  if (key === "pending") return "Em aberto";
  if (key === "paid") return "Pago";
  if (["canceled", "cancelled"].includes(key)) return "Cancelado";
  if (key === "failed") return "Falhou";
  return status ? humanize(status) : "—";
}

function chargeTagClass(status?: string | null): string {
  const key = String(status || "").toLowerCase();
  if (key === "paid") return "tag teal";
  if (key === "pending") return "tag warn";
  if (["canceled", "cancelled", "failed"].includes(key)) return "tag red";
  return "tag";
}

function sourceModuleLabel(source?: string | null): string {
  const key = String(source || "").toLowerCase();
  if (!key) return "—";
  if (key.startsWith("logistica")) return "Logística";
  if (key.startsWith("vendas")) return "Vendas";
  return humanize(key);
}

// Linha chave-valor do dossiê (Central do Lead, 27/07).
function Lc2Kv({ label, mono = false, empty = false, children }: {
  label: string;
  mono?: boolean;
  empty?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="lc2-kv">
      <small>{label}</small>
      <span className={`${mono ? "is-mono" : ""}${empty ? " is-empty" : ""}`.trim() || undefined}>{children}</span>
    </div>
  );
}

// Botão de copiar compacto com feedback no próprio ícone.
function Lc2Copy({ value, label, framed = false }: { value: string; label: string; framed?: boolean }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard?.writeText(value).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1_400);
      },
      () => undefined,
    );
  }
  return (
    <button
      type="button"
      className={`lc2-copy${framed ? " lc2-copy--framed" : ""}`}
      onClick={copy}
      aria-label={`Copiar ${label}`}
      title={`Copiar ${label}`}
    >
      {framed
        ? (copied ? "copiado" : "copiar")
        : <I d={copied ? ICONS.check : ICONS.doc} size={10} />}
    </button>
  );
}

// Anel de score da telemetria — traço anima do zero até o valor na abertura.
function Lc2Gauge({ value, label }: { value: number; label: string }) {
  const safe = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  const circumference = 2 * Math.PI * 21;
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => setDrawn(true));
    return () => window.cancelAnimationFrame(frameId);
  }, []);
  return (
    <svg className="lc2-gauge" width="48" height="48" viewBox="0 0 52 52" role="img" aria-label={`${label}: ${safe} de 100`}>
      <circle className="lc2-gauge__track" cx="26" cy="26" r="21" fill="none" strokeWidth="5" />
      <circle
        className="lc2-gauge__val"
        cx="26"
        cy="26"
        r="21"
        fill="none"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={drawn ? circumference * (1 - safe / 100) : circumference}
        transform="rotate(-90 26 26)"
      />
      <text x="26" y="31" textAnchor="middle" fontSize="13">{safe}</text>
    </svg>
  );
}

export function LeadCockpitModal({ lead, aiStatus, canViewValues, open, onClose, onConversationChanged }: {
  lead: VendasLead;
  aiStatus?: RadarAiLeadStatus | null;
  canViewValues: boolean;
  open: boolean;
  onClose: () => void;
  onConversationChanged?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const entitlements = useEntitlements();
  const currentUser = useCurrentUser();
  const modules = useMyModules();
  const conciergeVisible = isModuleVisible("concierge", entitlements, currentUser, modules);

  // ── ENTRADA E RETORNO (PAINEL-ÚNICO, 26/07) ──────────────────────────────
  // A ficha CRESCE de dentro da linha/card que foi clicado e, ao fechar, VOLTA
  // pra ele — que pisca pro olho reencontrar onde estava. Sem isso o cockpit
  // aparecia e sumia seco, e quem fechava perdia o lugar na planilha.
  // A origem é achada pelo id do lead (a linha já é `vnd-row-<id>`; o card do
  // quadro carrega `data-lead-id`). Não achou origem → entrada simples, como antes.
  const shellRef = useRef<HTMLElement | null>(null);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<number | null>(null);

  const originEl = useCallback(() => {
    if (typeof document === "undefined" || !lead.id) return null;
    return document.getElementById(`vnd-row-${lead.id}`)
      || document.querySelector<HTMLElement>(`.vnd-card[data-lead-id="${CSS.escape(lead.id)}"]`);
  }, [lead.id]);

  // Marca a tela de trás pra ela recuar (escala + desfoque) enquanto a ficha
  // está aberta. É o `.vnd-modehost` (painel de comando + planilha juntos) —
  // o modal é irmão dele no DOM, então o `filter` daqui não vira containing
  // block do `position: fixed` da ficha.
  const setListZoom = useCallback((on: boolean) => {
    if (typeof document === "undefined") return;
    document.querySelector(".vnd-modehost")?.classList.toggle("is-cockpit-zoom", on);
  }, []);

  // FLIP: leva o painel da caixa de origem até o tamanho final (ou o contrário).
  // Sem requestAnimationFrame de propósito — em aba sem composição o rAF não
  // dispara e a animação morreria no meio, deixando a ficha travada.
  const flip = useCallback((el: HTMLElement, from: DOMRect, back: boolean) => {
    const to = el.getBoundingClientRect();
    if (!to.width || !to.height) return false;
    const sx = from.width / to.width;
    const sy = from.height / to.height;
    const boxed = `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${sx}, ${sy})`;
    el.style.transition = "none";
    el.style.transformOrigin = "top left";
    if (back) {
      el.style.transform = "none";
      void el.offsetWidth;
      el.style.transition = "transform var(--lc-flip-out) var(--ease-out-quint), opacity var(--lc-flip-out) var(--ease-out-quint)";
      el.style.transform = boxed;
      el.style.opacity = "0";
    } else {
      el.style.transform = boxed;
      el.style.opacity = "0.35";
      void el.offsetWidth;
      el.style.transition = "transform var(--lc-flip-in) var(--ease-out-quint), opacity var(--lc-flip-in) var(--ease-out-quint)";
      el.style.transform = "none";
      el.style.opacity = "1";
    }
    return true;
  }, []);

  const requestClose = useCallback(() => {
    if (closing) return;
    const el = shellRef.current;
    const origem = originEl();
    setListZoom(false);
    if (!el || !origem) { onClose(); return; }
    // a lista volta ao lugar ao MESMO tempo que a ficha voa de volta pra linha
    if (!flip(el, origem.getBoundingClientRect(), true)) { onClose(); return; }
    setClosing(true);
    closeTimer.current = window.setTimeout(() => {
      origem.classList.remove("is-cockpit-back");
      void origem.offsetWidth;
      origem.classList.add("is-cockpit-back");
      window.setTimeout(() => origem.classList.remove("is-cockpit-back"), 1200);
      onClose();
    }, 420);
  }, [closing, flip, onClose, originEl, setListZoom]);

  // useLayoutEffect: a ficha tem que já nascer encolhida na linha. Com useEffect
  // o navegador chega a pintar um quadro dela inteira antes de encolher — dá um
  // "pisca" na abertura, exatamente o defeito que a transição vem consertar.
  useLayoutEffect(() => {
    if (!open) return;
    const el = shellRef.current;
    const origem = originEl();
    setListZoom(true);
    if (el && origem) flip(el, origem.getBoundingClientRect(), false);
    return () => {
      setListZoom(false);
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    };
  }, [open, flip, originEl, setListZoom]);

  const [stage, setStage] = useState<CockpitStage>(() => normalizeCockpitStage(lead.status));
  const [stageBusy, setStageBusy] = useState(false);
  const [stageMsg, setStageMsg] = useState<string | null>(null);
  const [closureReasonOpen, setClosureReasonOpen] = useState(false);
  const [nextActionDraft, setNextActionDraft] = useState(lead.nextAction || "");
  const [nextActionBusy, setNextActionBusy] = useState(false);
  const [workspaceCommand, setWorkspaceCommand] = useState<LeadCockpitCommand>({
    mode: "whatsapp",
    seq: 0,
  });
  const [company, setCompany] = useState<CockpitCompany>(null);
  const [companyLoading, setCompanyLoading] = useState(true);
  const [preVoo, setPreVoo] = useState<PreVoo>(null);
  const [preVooLoading, setPreVooLoading] = useState(true);
  const [selectedPersonaKey, setSelectedPersonaKey] = useState<string | null>(null);
  const [preVooEnrichBusy, setPreVooEnrichBusy] = useState(false);
  const [preVooEnrichMsg, setPreVooEnrichMsg] = useState<string | null>(null);
  const [roboBusy, setRoboBusy] = useState(false);
  const [roboMsg, setRoboMsg] = useState<string | null>(null);
  const [waOk, setWaOk] = useState<boolean | null>(null);
  const [waConnectOpen, setWaConnectOpen] = useState(false);
  const [emailReady, setEmailReady] = useState<boolean | null>(null);
  const [copilotoEnabled, setCopilotoEnabled] = useState(false);
  const [addedNotes, setAddedNotes] = useState<NonNullable<VendasLead["timeline"]>>([]);
  const [radarReasons, setRadarReasons] = useState<string[]>([]);
  const [radarReasonsLoading, setRadarReasonsLoading] = useState(Boolean(lead.radarLeadId));
  const [nextSlot, setNextSlot] = useState<NextSlot>(null);
  const [nextSlotLoading, setNextSlotLoading] = useState(true);
  const [customerProfileId, setCustomerProfileId] = useState<string | null>(lead.customerProfileId || null);
  const [extrato, setExtrato] = useState<Extrato>(null);
  const [extratoError, setExtratoError] = useState(false);
  const [financeBusy, setFinanceBusy] = useState<string | null>(null);
  const [financeMessage, setFinanceMessage] = useState<string | null>(null);
  const [acaoBusy, setAcaoBusy] = useState(false);
  const [acaoMsg, setAcaoMsg] = useState<string | null>(null);
  const [agendaOpen, setAgendaOpen] = useState(false);
  const [reagendarData, setReagendarData] = useState("");
  const [reagendarOpen, setReagendarOpen] = useState(false);
  const [semInteresseOpen, setSemInteresseOpen] = useState(false);
  const [fecharOpen, setFecharOpen] = useState(false);

  const personaPill = useGlassPill<HTMLButtonElement>(selectedPersonaKey || "", preVoo?.personas?.length || 0);
  const funnelPill = useGlassPill<HTMLButtonElement>(stage, COCKPIT_STAGES.length);

  // Config de disparo INLINE (S4 da reforma 27/07): o bloqueio "config_ausente"
  // se resolve DENTRO da ficha — nunca mais mandar o dono pra outra tela.
  const [configStart, setConfigStart] = useState("08:00");
  const [configEnd, setConfigEnd] = useState("18:00");
  const [configLimit, setConfigLimit] = useState("40");
  const [configBusy, setConfigBusy] = useState(false);
  const [configMsg, setConfigMsg] = useState<string | null>(null);

  const channelTargets: Partial<Record<Canal, string>> = {
    whatsapp: lead.phone || undefined,
    telefone: lead.phone ? `tel:${onlyDigits(lead.phone)}` : undefined,
    email: lead.email || undefined,
    instagram: lead.leadIntelligence?.instagramUrl || lead.ownerInstagram || undefined,
    facebook: lead.leadIntelligence?.facebookUrl || lead.ownerFacebook || undefined,
    site: lead.website ? (lead.website.startsWith("http") ? lead.website : `https://${lead.website}`) : undefined,
  };
  const availableChannels = (["telefone", "whatsapp", "email", "instagram", "facebook", "site"] as Canal[])
    .filter((canal) => Boolean(channelTargets[canal]));

  const loadPreVoo = useCallback(async () => {
    const response = await apiFetch<PreVoo>(`/vendas/lead/${encodeURIComponent(lead.id)}/pre-voo`);
    setPreVoo(response ?? null);
    setSelectedPersonaKey((current) => current
      || response?.personas?.find((persona) => persona.recomendado)?.key
      || response?.personas?.[0]?.key
      || null);
    setPreVooLoading(false);
    return response;
  }, [lead.id]);

  const loadExtrato = useCallback(async (id: string) => {
    try {
      const response = await apiFetch<Extrato>(`/financeiro-tenant/clientes/${encodeURIComponent(id)}/extrato`);
      setExtrato(response ?? null);
      setExtratoError(response == null);
    } catch {
      setExtrato(null);
      setExtratoError(true);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (agendaOpen) setAgendaOpen(false);
      else if (closureReasonOpen) setClosureReasonOpen(false);
      else if (reagendarOpen) setReagendarOpen(false);
      else if (semInteresseOpen) setSemInteresseOpen(false);
      else requestClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [agendaOpen, closureReasonOpen, requestClose, open, reagendarOpen, semInteresseOpen]);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    apiFetch<{ company?: CockpitCompany }>(`/vendas/lead/${encodeURIComponent(lead.id)}/cockpit`)
      .then((response) => {
        if (!alive) return;
        setCompany(response?.company ?? null);
        setCompanyLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setCompany(null);
        setCompanyLoading(false);
      });

    void (async () => {
      try {
        await loadPreVoo();
      } catch {
        if (!alive) return;
        setPreVoo(null);
        setPreVooLoading(false);
      }
    })();

    apiFetch<{ whatsappSession?: { accessible?: boolean } }>("/inbox/whatsapp-session")
      .then((response) => { if (alive) setWaOk(response?.whatsappSession?.accessible === true); })
      .catch(() => { if (alive) setWaOk(false); });

    apiFetch<{ ready?: boolean }>("/company-email/status")
      .then((response) => { if (alive) setEmailReady(response?.ready === true); })
      .catch(() => { if (alive) setEmailReady(false); });

    apiFetch<{ enabled?: boolean }>("/assistente/copiloto")
      .then((response) => { if (alive) setCopilotoEnabled(response?.enabled === true); })
      .catch(() => { if (alive) setCopilotoEnabled(false); });

    apiFetch<Exclude<NextSlot, null>>("/vendas/agenda-disparo/proximo-slot")
      .then((response) => {
        if (!alive) return;
        setNextSlot(response ?? null);
        setNextSlotLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setNextSlot(null);
        setNextSlotLoading(false);
      });

    if (lead.radarLeadId) {
      apiFetch<{ item?: { inclusionReasons?: string[] | null } }>(
        `/webscraping/radar/leads/${encodeURIComponent(lead.radarLeadId)}`,
      )
        .then((response) => {
          if (!alive) return;
          setRadarReasons(Array.isArray(response?.item?.inclusionReasons)
            ? response.item.inclusionReasons.filter(Boolean)
            : []);
          setRadarReasonsLoading(false);
        })
        .catch(() => {
          if (!alive) return;
          setRadarReasons([]);
          setRadarReasonsLoading(false);
        });
    }

    return () => { alive = false; };
  }, [lead.id, lead.radarLeadId, loadPreVoo, open]);

  useEffect(() => {
    if (!open || !canViewValues || !customerProfileId) return;
    void (async () => {
      await loadExtrato(customerProfileId);
    })();
  }, [canViewValues, customerProfileId, loadExtrato, open]);

  useEffect(() => {
    queueMicrotask(() => {
      setStage(normalizeCockpitStage(lead.status));
      setNextActionDraft(lead.nextAction || "");
    });
  }, [lead.nextAction, lead.status]);

  function focusWorkspace(mode: LeadCockpitComposerMode, draft?: string) {
    setWorkspaceCommand((current) => ({ mode, draft, seq: current.seq + 1 }));
  }

  async function buscarDadosPreVoo() {
    if (!lead.id || preVooEnrichBusy) return;
    setPreVooEnrichBusy(true);
    setPreVooEnrichMsg(null);
    try {
      await apiFetch(`/vendas/lead/${encodeURIComponent(lead.id)}/enrichment`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await loadPreVoo();
      setPreVooEnrichMsg("✓ Dados atualizados.");
    } catch (error) {
      setPreVooEnrichMsg(error instanceof Error ? error.message : "Não foi possível buscar mais dados agora.");
    } finally {
      setPreVooEnrichBusy(false);
    }
  }

  async function salvarConfigDisparo() {
    if (configBusy) return;
    setConfigBusy(true);
    setConfigMsg(null);
    try {
      await apiFetch("/vendas/agenda-disparo/config", {
        method: "PATCH",
        body: JSON.stringify({
          workingHoursStart: configStart,
          workingHoursEnd: configEnd,
          dailyLimitPerSender: Math.max(1, Math.min(200, Number(configLimit) || 40)),
        }),
      });
      setConfigMsg("✓ Configuração salva pra empresa toda.");
      await loadPreVoo();
    } catch (error) {
      setConfigMsg(error instanceof Error ? error.message : "Não foi possível salvar a configuração.");
    } finally {
      setConfigBusy(false);
    }
  }

  async function ligarRobo() {
    if (!lead.id || roboBusy || !selectedPersonaKey) return;
    setRoboBusy(true);
    setRoboMsg(null);
    try {
      await apiFetch(`/vendas/lead/${encodeURIComponent(lead.id)}/robo`, {
        method: "POST",
        body: JSON.stringify({ personaKey: selectedPersonaKey }),
      });
      await loadPreVoo();
      setStage("contato");
      setRoboMsg("✓ Robô ligado.");
      await onConversationChanged?.();
    } catch (error) {
      setRoboMsg(error instanceof Error ? error.message : "Não foi possível ligar o robô agora.");
    } finally {
      setRoboBusy(false);
    }
  }

  async function desligarRobo() {
    if (!lead.id || roboBusy) return;
    setRoboBusy(true);
    setRoboMsg(null);
    try {
      await apiFetch(`/vendas/lead/${encodeURIComponent(lead.id)}/robo`, { method: "DELETE" });
      await loadPreVoo();
      setRoboMsg("✓ Robô desligado.");
      await onConversationChanged?.();
    } catch (error) {
      setRoboMsg(error instanceof Error ? error.message : "Não foi possível desligar o robô agora.");
    } finally {
      setRoboBusy(false);
    }
  }

  async function changeStage(nextStage: CockpitStage, closureReason?: string) {
    if (!lead.id || stageBusy) return;
    if (nextStage === "encerrado" && !closureReason) {
      setClosureReasonOpen(true);
      return;
    }
    if (nextStage === stage && nextStage !== "encerrado") return;

    const previousStage = stage;
    setStage(nextStage);
    setStageBusy(true);
    setStageMsg(null);
    try {
      await apiFetch(`/vendas/lead/${encodeURIComponent(lead.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: nextStage,
          ...(closureReason ? { closureReason } : {}),
        }),
      });
      setClosureReasonOpen(false);
      setStageMsg("✓ Etapa atualizada.");
      if (nextStage === "qualificado" || nextStage === "encerrado") await loadPreVoo();
      await onConversationChanged?.();
    } catch (error) {
      setStage(previousStage);
      setStageMsg(error instanceof Error ? error.message : "Não foi possível atualizar a etapa.");
    } finally {
      setStageBusy(false);
    }
  }

  async function saveNextAction() {
    if (!lead.id || nextActionBusy) return;
    setNextActionBusy(true);
    setAcaoMsg(null);
    try {
      await apiFetch(`/vendas/lead/${encodeURIComponent(lead.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ nextAction: nextActionDraft.trim() || null }),
      });
      setAcaoMsg("✓ Próxima ação atualizada.");
      await onConversationChanged?.();
    } catch (error) {
      setAcaoMsg(error instanceof Error ? error.message : "Não foi possível atualizar a próxima ação.");
    } finally {
      setNextActionBusy(false);
    }
  }

  async function reagendarContato() {
    if (!lead.id || !reagendarData || acaoBusy) return;
    setAcaoBusy(true);
    setAcaoMsg(null);
    try {
      await apiFetch(`/vendas/lead/${encodeURIComponent(lead.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ returnAt: new Date(`${reagendarData}T09:00:00`).toISOString() }),
      });
      setAcaoMsg("✓ Contato reagendado.");
      setReagendarData("");
      setReagendarOpen(false);
      await onConversationChanged?.();
    } catch (error) {
      setAcaoMsg(error instanceof Error ? error.message : "Falha ao reagendar o contato.");
    } finally {
      setAcaoBusy(false);
    }
  }

  async function marcarSemInteresse(motivo: string) {
    if (!lead.id || !motivo || acaoBusy) return;
    setAcaoBusy(true);
    setAcaoMsg(null);
    try {
      await apiFetch(`/vendas/lead/${encodeURIComponent(lead.id)}/negativar`, {
        method: "POST",
        body: JSON.stringify({ status: motivo }),
      });
      setSemInteresseOpen(false);
      await onConversationChanged?.();
      onClose();
    } catch (error) {
      setAcaoMsg(error instanceof Error ? error.message : "Não foi possível finalizar o lead.");
    } finally {
      setAcaoBusy(false);
    }
  }

  async function saveCopilotoNote(text: string) {
    const response = await apiFetch<{ event?: LeadCockpitTimelineEvent }>(
      `/vendas/lead/${encodeURIComponent(lead.id)}/note`,
      { method: "POST", body: JSON.stringify({ note: text }) },
    );
    if (response?.event?.id) {
      setAddedNotes((current) => [response.event as NonNullable<VendasLead["timeline"]>[number], ...current]);
    }
    await onConversationChanged?.();
  }


  function searchSimilar() {
    try {
      sessionStorage.setItem("hbx:concierge-seed", JSON.stringify({
        targetSegment: lead.segment || "",
        city: lead.city || "",
        state: lead.state || "",
      }));
    } catch {
      // A busca segue sem pré-preenchimento quando o storage estiver indisponível.
    }
    router.push("/concierge");
  }

  async function markPaid(chargeId: string) {
    if (!customerProfileId || financeBusy) return;
    setFinanceBusy(chargeId);
    setFinanceMessage(null);
    try {
      await apiFetch(`/financeiro-tenant/charges/${encodeURIComponent(chargeId)}/quitar`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setFinanceMessage("✓ Título marcado como pago.");
      await loadExtrato(customerProfileId);
    } catch (error) {
      setFinanceMessage(error instanceof Error ? error.message : "Não foi possível dar baixa no título.");
    } finally {
      setFinanceBusy(null);
    }
  }

  async function createCharge() {
    if (financeBusy) return;
    setFinanceBusy("create");
    setFinanceMessage(null);
    try {
      const response = await apiFetch<{ customerProfileId?: string; alreadyExists?: boolean }>(
        `/vendas/lead/${encodeURIComponent(lead.id)}/gerar-cobranca`,
        { method: "POST", body: JSON.stringify({}) },
      );
      setFinanceMessage(response?.alreadyExists ? "✓ Cobrança já existia — extrato atualizado." : "✓ Cobrança gerada.");
      if (response?.customerProfileId) setCustomerProfileId(response.customerProfileId);
      else if (customerProfileId) await loadExtrato(customerProfileId);
    } catch (error) {
      setFinanceMessage(error instanceof Error ? error.message : "Não foi possível gerar a cobrança.");
    } finally {
      setFinanceBusy(null);
    }
  }

  const cityState = lead.city ? `${lead.city}${lead.state ? `/${lead.state}` : ""}` : "—";
  const cnpj = (company?.found && company.cnpj) || lead.cnpj || null;
  const intelligence = lead.leadIntelligence;
  const templateText = typeof intelligence?.messageTemplate === "string"
    ? intelligence.messageTemplate
    : String((intelligence?.messageTemplate as { text?: string } | null | undefined)?.text || "");
  const opportunityScore = Math.max(0, Math.min(100, Math.round(Number(lead.opportunityScore) || 0)));
  const phones = [lead.phone, ...(Array.isArray(lead.phones) ? lead.phones : [])]
    .filter((item): item is string => Boolean(item))
    .filter((item, index, all) => all.findIndex((other) => onlyDigits(other) === onlyDigits(item)) === index);
  const emails = [lead.email, ...(Array.isArray(lead.emails) ? lead.emails : [])]
    .filter((item): item is string => Boolean(item))
    .filter((item, index, all) => all.indexOf(item) === index);
  const whatsappMap = lead.phonesWhatsapp || {};
  const primaryPartner = company?.partners?.[0];
  const keyPersonName = primaryPartner?.name || lead.ownerName || lead.ownerNames?.[0] || "—";
  const keyPersonRole = primaryPartner?.qualification || (keyPersonName !== "—" ? "Pessoa-chave" : "Não identificada");
  const keyPersonRoleLabel = keyPersonName !== "—" ? humanize(keyPersonRole) : "Não identificada";
  const registrationValues = [
    lead.phone,
    lead.email,
    cnpj,
    company?.razaoSocial || lead.razaoSocial,
    company?.cnae || lead.cnae,
    lead.city,
    lead.state,
    keyPersonName !== "—" ? keyPersonName : null,
    lead.address,
    lead.website,
  ];
  const registrationQuality = Math.round((registrationValues.filter(Boolean).length / registrationValues.length) * 100);
  const recommendedChannel = intelligence?.recommendedChannel
    ? humanize(intelligence.recommendedChannel)
    : lead.email ? "E-mail" : "WhatsApp";
  // Texto gerado NÃO ocupa linha na tela (ordem do dono 27/07). Só sobra como
  // dica de passar o mouse no Score — e só quando o backend mandou algo.
  const approachReason = intelligence?.opportunityReason || undefined;
  const copilotoFicha: CopilotoFicha = {
    nome: lead.name,
    razaoSocial: (company?.found && company.razaoSocial) || lead.razaoSocial || null,
    cnpj: (company?.found && company.cnpj) || lead.cnpj || null,
    cnae: (company?.found && company.cnae) || lead.cnae || null,
    segmento: lead.segment,
    cidade: lead.city,
    uf: lead.state,
    situacao: (company?.found && company.situacao) || lead.companySituation || null,
  };
  const selectedPersona = preVoo?.personas?.find((persona) => persona.key === selectedPersonaKey)
    || preVoo?.personas?.find((persona) => persona.recomendado)
    || preVoo?.personas?.[0]
    || null;
  const readinessTotal = preVoo?.prontidao
    ? preVoo.prontidao.confirmados.length + preVoo.prontidao.duvidosos.length + preVoo.prontidao.faltantes.length
    : 0;
  const readinessScore = readinessTotal && preVoo?.prontidao
    ? Math.round((preVoo.prontidao.confirmados.length / readinessTotal) * 100)
    : 0;
  const timeline = [...addedNotes, ...(lead.timeline || [])]
    .filter((event, index, all) => all.findIndex((candidate) => candidate.id === event.id) === index);
  const lastInteractionAt = timeline.reduce<string | null>((latest, event) => {
    const at = event.createdAt || null;
    if (!at) return latest;
    return !latest || new Date(at).getTime() > new Date(latest).getTime() ? at : latest;
  }, null);
  const situacaoLabel = (company?.found && company.situacao) || lead.companySituation || null;
  const situacaoAtiva = situacaoLabel ? String(situacaoLabel).toLowerCase().includes("ativa") : null;
  const stageIndex = COCKPIT_STAGES.findIndex((item) => item.key === stage);
  const cnpjDisplay = cnpj ? (formatBrCnpj(cnpj) || cnpj) : null;

  function renderMetro(persona: PreVooPersona, currentStep: number) {
    return (
      <div className="lc2-metro">
        {persona.passos.map((passo, index) => (
          <div
            key={`${passo.canal}-${passo.dia}-${index}`}
            className={`lc2-metro__step${index < currentStep ? " is-done" : index === currentStep ? " is-next" : ""}`}
          >
            <span className="lc2-metro__node">{index < currentStep ? "✓" : index + 1}</span>
            <span className="lc2-metro__body">
              <b>{passo.titulo || humanize(passo.canal)}</b>
              <small>{passo.dia === 0 ? "hoje" : `D+${passo.dia}`}</small>
            </span>
          </div>
        ))}
      </div>
    );
  }

  function renderDossier() {
    const source = company?.found ? company : null;
    const age = yearsSince(source?.openedAt);
    const ownerPhone = lead.ownerPhone || (keyPersonName !== "—" ? lead.phone : null);
    const extraPartners = (company?.partners || []).slice(1);
    return (
      <>
        <section className="lc2-card">
          <div className="lc2-cnpjcard">
            {situacaoLabel && (
              <span className={`lc2-badge ${situacaoAtiva ? "is-ok" : "is-warn"} lc2-cnpjcard__rfb`}>
                {situacaoAtiva ? "RFB · ativa" : humanize(situacaoLabel)}
              </span>
            )}
            <span className="lc2-cnpjcard__k">CNPJ</span>
            <span className="lc2-cnpjcard__num">
              {cnpjDisplay || "—"}
              {cnpjDisplay && <Lc2Copy value={cnpjDisplay} label="CNPJ" framed />}
            </span>
            <div className="lc2-cnpjcard__row"><span>Razão social</span><b>{source?.razaoSocial || lead.razaoSocial || "—"}</b></div>
            <div className="lc2-cnpjcard__row">
              <span>Abertura</span>
              <b>{source?.openedAt ? `${fmtDate(source.openedAt)}${age != null ? ` · ${age} ano${age === 1 ? "" : "s"}` : ""}` : "—"}</b>
            </div>
            <div className="lc2-cnpjcard__row">
              <span>Porte</span>
              <b>{[source?.porte, source?.simples ? "Simples Nacional" : null, source?.mei ? "MEI" : null].filter(Boolean).join(" · ") || "—"}</b>
            </div>
          </div>
          <div className="lc2-card__body">
            {companyLoading ? <span className="muted-note">Carregando Receita Federal…</span> : (
              <>
                <Lc2Kv label="Fantasia" empty={!source?.nomeFantasia}>{source?.nomeFantasia || "—"}</Lc2Kv>
                <Lc2Kv label="CNAE">
                  {source?.cnae
                    ? `${formatBrCnae(source.cnae)}${source.cnaeDescription ? ` — ${source.cnaeDescription}` : ""}`
                    : (formatBrCnae(lead.cnae) || "—")}
                </Lc2Kv>
                <Lc2Kv label="Natureza" empty={!source?.naturezaJuridica}>{source?.naturezaJuridica || "—"}</Lc2Kv>
                <Lc2Kv label="Capital social" mono>{source?.capitalSocial != null ? fmtMoney(source.capitalSocial) : "—"}</Lc2Kv>
                <Lc2Kv label="Unidade" empty={!source?.matrizFilial}>{source?.matrizFilial ? humanize(source.matrizFilial) : "—"}</Lc2Kv>
              </>
            )}
          </div>
        </section>

        <section className="lc2-card">
          <span className="lc2-card__head">
            Dono da empresa
            {company?.partners?.length ? (
              <span className="lc2-card__st lc2-badge is-ok">{company.partners.length} sócio{company.partners.length === 1 ? "" : "s"}</span>
            ) : null}
          </span>
          <div className="lc2-card__body">
            <div className="lc2-person">
              <Av name={keyPersonName !== "—" ? keyPersonName : lead.name || "—"} size={38} />
              <span>
                <b>{keyPersonName !== "—" ? keyPersonName : "Responsável não identificado"}</b>
                <small>{keyPersonRoleLabel}</small>
              </span>
            </div>
            <Lc2Kv label="Telefone" mono empty={!ownerPhone}>
              {ownerPhone ? (
                <>
                  {formatPhoneDisplay(ownerPhone)}
                  {whatsappMap[onlyDigits(ownerPhone)] === true && <span className="lc2-badge is-ok">Whats ✓</span>}
                  {" "}
                  <Lc2Copy value={formatPhoneDisplay(ownerPhone)} label="telefone do dono" />
                </>
              ) : "—"}
            </Lc2Kv>
            <Lc2Kv label="Instagram" empty={!lead.ownerInstagram}>{lead.ownerInstagram || "não localizado"}</Lc2Kv>
            <Lc2Kv label="Facebook" empty={!lead.ownerFacebook}>{lead.ownerFacebook || "não localizado"}</Lc2Kv>
            {extraPartners.map((partner, index) => (
              <Lc2Kv key={`${partner.name || "partner"}-${index}`} label={index === 0 ? "Outros sócios" : ""}>
                {partner.name || "—"}{partner.qualification ? ` · ${humanize(partner.qualification)}` : ""}
              </Lc2Kv>
            ))}
          </div>
        </section>

        <section className="lc2-card">
          <span className="lc2-card__head">Contatos da empresa</span>
          <div className="lc2-card__body">
            {phones.length ? phones.map((phone, index) => (
              <Lc2Kv key={phone} label={index === 0 ? "Telefone" : `Telefone ${index + 1}`} mono>
                {formatPhoneDisplay(phone)}
                {whatsappMap[onlyDigits(phone)] === true && <span className="lc2-badge is-ok">Whats ✓</span>}
                {" "}
                <Lc2Copy value={formatPhoneDisplay(phone)} label="telefone" />
              </Lc2Kv>
            )) : <Lc2Kv label="Telefone" empty>—</Lc2Kv>}
            {emails.length ? emails.map((item, index) => (
              <Lc2Kv key={item} label={index === 0 ? "E-mail" : `E-mail ${index + 1}`}>
                {item} <Lc2Copy value={item} label="e-mail" />
              </Lc2Kv>
            )) : <Lc2Kv label="E-mail" empty>—</Lc2Kv>}
            <Lc2Kv label="Site" empty={!lead.website}>
              {lead.website || <span className="lc2-badge is-warn">sem site — argumento de venda</span>}
            </Lc2Kv>
            <Lc2Kv label="Endereço" empty={!lead.address}>{lead.address || "—"}</Lc2Kv>
          </div>
        </section>

        <details className="lc2-card" open>
          <summary><span className="lc2-card__head">Por que entrou no radar</span></summary>
          <div className="lc2-card__body">
            {radarReasonsLoading ? (
              <span className="muted-note">Carregando motivos…</span>
            ) : radarReasons.length ? (
              <ul className="lc2-why">
                {radarReasons.map((reason) => (
                  <li key={reason}>{INCLUSION_REASON_LABELS[reason] || humanize(reason)}</li>
                ))}
              </ul>
            ) : (
              <span className="muted-note">Motivo de inclusão não informado.</span>
            )}
            {lead.timesSeen != null && lead.timesSeen > 1 && <Lc2Kv label="Visto no radar">{lead.timesSeen} vezes</Lc2Kv>}
            <Lc2Kv label="Cadastro">{registrationQuality}% completo</Lc2Kv>
            {preVoo?.prontidao?.faltantes?.length ? (
              <Lc2Kv label="Falta">
                {preVoo.prontidao.faltantes.map((text) => text.split(" — ")[0].replace(/\.$/, "")).join(", ")}
              </Lc2Kv>
            ) : null}
            {preVoo?.enrichment?.enabled && preVoo.enrichment.podeBuscar && (
              <button type="button" className="btn-ghost btn-xs" onClick={buscarDadosPreVoo} disabled={preVooEnrichBusy}>
                <I d={ICONS.search} size={12} /> {preVooEnrichBusy ? "Buscando…" : "Buscar mais dados"}
              </button>
            )}
            {preVooEnrichMsg && <span className="muted-note">{preVooEnrichMsg}</span>}
          </div>
        </details>
      </>
    );
  }

  function renderRoboCard() {
    const robo = preVoo?.robo;
    const bloqueio = preVoo?.roboBloqueado;
    const personas = preVoo?.personas || [];
    return (
      <section className="lc2-card">
        <span className="lc2-card__head">
          <span className={`lc2-pulse${robo?.ligado ? "" : bloqueio ? " is-warn" : " is-off"}`} />
          Robô de cadência
          <span className={`lc2-card__st lc2-badge ${robo?.ligado ? "is-ok" : bloqueio ? "is-warn" : "is-ok"}`}>
            {robo?.ligado ? "rodando" : bloqueio ? "parado" : "pronto"}
          </span>
        </span>
        <div className="lc2-card__body">
          {preVooLoading ? (
            <span className="muted-note">Carregando plano…</span>
          ) : !preVoo || preVoo.locked ? (
            <span className="muted-note">Plano indisponível pra este lead.</span>
          ) : robo?.ligado ? (
            <>
              <div className="lc2-live">
                <span className="lc2-pulse" />
                <span>
                  <b>
                    {selectedPersona ? `Plano ${selectedPersona.nome.split(" (")[0]}` : "Robô ativo"}
                    {" · passo "}{robo.currentStep + 1}{selectedPersona ? ` de ${selectedPersona.passos.length}` : ""}
                  </b>
                </span>
              </div>
              {selectedPersona && renderMetro(selectedPersona, robo.currentStep)}
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn-ghost btn-xs" onClick={desligarRobo} disabled={roboBusy}>
                  {roboBusy ? "Desligando…" : "Desligar"}
                </button>
                <button type="button" className="btn-teal btn-xs" onClick={() => void changeStage("qualificado")} disabled={stageBusy}>
                  Assumir atendimento
                </button>
              </div>
            </>
          ) : bloqueio?.codigo === "config_ausente" ? (
            <div className="lc2-block">
              <b>Falta configurar horário e teto</b>
              <div className="lc2-form-row">
                <label>Início<input className="field-dark" type="time" value={configStart} onChange={(event) => setConfigStart(event.target.value)} /></label>
                <label>Fim<input className="field-dark" type="time" value={configEnd} onChange={(event) => setConfigEnd(event.target.value)} /></label>
                <label>Teto/dia<input className="field-dark" type="number" min={1} max={200} value={configLimit} onChange={(event) => setConfigLimit(event.target.value)} /></label>
              </div>
              <button type="button" className="btn-teal btn-xs lc2-block__cta" onClick={salvarConfigDisparo} disabled={configBusy}>
                {configBusy ? "Salvando…" : "Salvar e liberar o robô"}
              </button>
              {configMsg && <span className={`ctx-msg ${configMsg.startsWith("✓") ? "ok" : "err"}`}>{configMsg}</span>}
            </div>
          ) : bloqueio ? (
            <div className="lc2-block">
              <b>{bloqueio.motivo}</b>
              <p>{bloqueio.acao}</p>
              {bloqueio.codigo === "whatsapp_desconectado" && (
                <button type="button" className="btn-teal btn-xs" onClick={() => setWaConnectOpen(true)}>
                  <WhatsAppMark size={12} /> Conectar WhatsApp
                </button>
              )}
            </div>
          ) : (
            <>
              <nav className="glass-pill-track lc2-personas" aria-label="Escolha de persona da cadência">
                <GlassPill {...personaPill} />
                {personas.map((persona) => (
                  <button
                    key={persona.key}
                    type="button"
                    ref={personaPill.itemRef(persona.key)}
                    className={`glass-pill-item lc2-persona${selectedPersonaKey === persona.key ? " is-active" : ""}`}
                    aria-pressed={selectedPersonaKey === persona.key}
                    onClick={() => setSelectedPersonaKey(persona.key)}
                  >
                    {persona.nome.split(" (")[0]}
                    <small>{persona.recomendado ? "★ sugerida" : " "}</small>
                  </button>
                ))}
              </nav>
              {selectedPersona && (
                <>
                  {renderMetro(selectedPersona, -1)}
                </>
              )}
              {!nextSlotLoading && nextSlot?.slot && (
                <Lc2Kv label="Próximo horário livre">
                  {fmtDateTime(nextSlot.slot)}
                  {nextSlot.conflito && nextSlot.motivoConflito ? ` · ${conflictLabel(nextSlot.motivoConflito)}` : ""}
                </Lc2Kv>
              )}
              <button type="button" className="btn-teal lc2-robo__on" onClick={ligarRobo} disabled={roboBusy || !selectedPersonaKey}>
                {roboBusy ? "Ligando…" : "Ligar robô"}
              </button>
            </>
          )}
          {roboMsg && <span className={`ctx-msg ${roboMsg.startsWith("✓") ? "ok" : "err"}`}>{roboMsg}</span>}
          {stageMsg && <span className={`ctx-msg ${stageMsg.startsWith("✓") ? "ok" : "err"}`}>{stageMsg}</span>}
        </div>
      </section>
    );
  }

  function renderNegocioCard() {
    return (
      <section className="lc2-card">
        <span className="lc2-card__head">
          Negócio
          <span className={`lc2-card__st lc2-badge ${lead.saleStatus === "sale_confirmed" ? "is-ok" : "is-warn"}`}>
            {lead.saleStatusLabel || "Sem venda"}
          </span>
        </span>
        <div className="lc2-card__body">
          <div className="lc2-money">{lead.saleValue != null ? fmtMoney(lead.saleValue) : "R$ 0"}<small>/mês</small></div>
          <div className="lc2-mgrid">
            <div className="lc2-mcell"><small>Produto</small><b>{lead.product?.name || "Não definido"}</b></div>
            <div className="lc2-mcell"><small>Implantação</small><b>{lead.setupValue != null ? fmtMoney(lead.setupValue) : "—"}</b></div>
            <div className="lc2-mcell">
              <small>Comissão</small>
              <b>{lead.commissionAmount != null ? `${fmtMoney(lead.commissionAmount)}${lead.commissionRecurring ? " /mês" : ""}` : "—"}</b>
            </div>
            <div className="lc2-mcell"><small>Responsável</small><b>{lead.owner?.name || "—"}</b></div>
          </div>
        </div>
      </section>
    );
  }

  function renderFinanceiroCard() {
    return (
      <section className="lc2-card">
        <span className="lc2-card__head">
          Financeiro do cliente
          {extrato && (
            <span className={`lc2-card__st lc2-badge ${extrato.saldoAberto > 0 ? "is-warn" : "is-ok"}`}>
              {extrato.saldoAberto > 0 ? `${fmtMoney(extrato.saldoAberto)} em aberto` : "em dia"}
            </span>
          )}
        </span>
        <div className="lc2-card__body">
          {financeMessage && <span className={`ctx-msg ${financeMessage.startsWith("✓") ? "ok" : "err"}`}>{financeMessage}</span>}
          {!customerProfileId ? (
            <>
              {(lead.saleValue ?? 0) > 0 && (
                <button type="button" className="btn-teal btn-xs" onClick={createCharge} disabled={financeBusy != null}>
                  {financeBusy === "create" ? "Gerando…" : "Gerar cobrança"}
                </button>
              )}
            </>
          ) : extratoError ? (
            <span className="muted-note">Não foi possível carregar o extrato.</span>
          ) : extrato == null ? (
            <span className="muted-note">Carregando extrato…</span>
          ) : extrato.charges.length === 0 ? (
            <span className="muted-note">Sem cobranças.</span>
          ) : extrato.charges.slice(0, 8).map((charge) => (
            <div className="lc2-charge" key={charge.id}>
              <span>{charge.description || "Título"}<small>{sourceModuleLabel(charge.sourceModule)} · {fmtDate(charge.dueDate)}</small></span>
              <span className={chargeTagClass(charge.status)}>{chargeStatusLabel(charge.status)}</span>
              <b>{fmtMoney(charge.amount)}</b>
              {String(charge.status || "").toLowerCase() === "pending" && (
                <button type="button" className="btn-ghost btn-xs" onClick={() => markPaid(charge.id)} disabled={financeBusy != null}>
                  {financeBusy === charge.id ? "Baixando…" : "Marcar pago"}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (!open) return null;

  return (
    <>
      <div className={"hbx-veil lead-cockpit__veil" + (closing ? " is-closing" : "")} onClick={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
        <section ref={shellRef} className="hbx-modal lead-cockpit lead-cockpit--workbench lead-cockpit--central" role="dialog" aria-modal="true" aria-label={`Central do lead ${lead.name || ""}`}>
          {/* CENTRAL DO LEAD (27/07) — hero de identidade + funil + telemetria.
              Substitui o antigo header + barra de etapa + faixa do copiloto: a
              "próxima ação" aparecia em TRÊS lugares e o dono não sabia mais
              qual mandava. Agora é UMA célula (AGORA) e ela manda. */}
          <header className="lc2-hero">
            <div className="lc2-hero__row">
              <Av name={lead.name || "—"} size={46} />
              <div className="lc2-hero__id">
                <h2>{lead.name || "—"}</h2>
                <p title={[lead.razaoSocial, lead.segment, cityState].filter(Boolean).join(" • ")}>
                  {lead.razaoSocial ? <b>{lead.razaoSocial}</b> : null}
                  {[lead.segment, cityState].filter(Boolean).map((part) => ` · ${part}`).join("")}
                </p>
              </div>

              <RadarAiBadge status={aiStatus} />
              {situacaoLabel && (
                <span className={`lc2-badge ${situacaoAtiva ? "is-ok" : "is-warn"}`}>
                  {situacaoAtiva ? "RFB ativa" : humanize(situacaoLabel)}
                </span>
              )}
              {!lead.website && <span className="lc2-badge is-warn">Sem site</span>}

              {/* 27/07, ordem do dono: o funil ENTRA na linha do cabeçalho,
                  em vez de gastar uma faixa inteira só pra ele. */}
              <nav className="glass-pill-track lc2-funnel" aria-label="Etapa do lead">
                <GlassPill {...funnelPill} />
                {COCKPIT_STAGES.map((item, index) => (
                  <button
                    key={item.key}
                    type="button"
                    ref={funnelPill.itemRef(item.key)}
                    className={`glass-pill-item lc2-funnel__seg${index < stageIndex ? " is-done" : ""}${item.key === stage ? " is-current" : ""}`}
                    aria-pressed={item.key === stage}
                    disabled={stageBusy}
                    onClick={() => void changeStage(item.key)}
                  >
                    <i className="lc2-funnel__dot">{index + 1}</i>
                    <span>{item.label}</span>
                  </button>
                ))}
              </nav>

              {availableChannels.length > 0 && (
                <span className="lc2-hero__channels" aria-label="Canais do lead">
                  {availableChannels.map((canal) => {
                    if (canal === "whatsapp" || canal === "email") {
                      return (
                        <button
                          key={canal}
                          type="button"
                          title={CANAL_LABEL[canal]}
                          aria-label={`Abrir ${CANAL_LABEL[canal]}`}
                          onClick={() => focusWorkspace(canal)}
                        >
                          <CanalIcon canal={canal} size="md" />
                        </button>
                      );
                    }
                    const href = channelTargets[canal]!;
                    const external = canal === "instagram" || canal === "facebook" || canal === "site";
                    return (
                      <a
                        key={canal}
                        href={href}
                        title={CANAL_LABEL[canal]}
                        aria-label={`Abrir ${CANAL_LABEL[canal]}`}
                        target={external ? "_blank" : undefined}
                        rel={external ? "noopener noreferrer" : undefined}
                      >
                        <CanalIcon canal={canal} size="md" />
                      </a>
                    );
                  })}
                </span>
              )}

              {cnpjDisplay && (
                <span className="lc2-hero__cnpj">
                  <small>CNPJ</small>
                  {cnpjDisplay}
                  <Lc2Copy value={cnpjDisplay} label="CNPJ" framed />
                </span>
              )}

              <div className="lc2-hero__acts">
                {conciergeVisible && (
                  <button type="button" className="btn-ghost btn-xs" onClick={searchSimilar}>
                    <I d={ICONS.concierge} size={12} /> <span>Buscar parecidos</span>
                  </button>
                )}
                {canViewValues && (
                  <button type="button" className="btn-teal btn-xs" onClick={() => setFecharOpen(true)}>
                    <I d={ICONS.money} size={12} /> <span>Fechar venda</span>
                  </button>
                )}
                <button type="button" className="lead-cockpit__approved-close" onClick={requestClose} aria-label="Fechar">×</button>
              </div>
            </div>


            <div className="lc2-tele">
              {/* 27/07, ordem do dono: "resumir MUITA ESCRITA". Cada célula diz
                  UM número; o porquê vive no title, não ocupando linha. */}
              {/* Rótulo e valor DITADOS pelo dono (27/07). Uma linha por célula:
                  nada de frase de apoio embaixo do número. */}
              <div className="lc2-tele__cell" title={approachReason}>
                <Lc2Gauge value={opportunityScore} label="Score" />
                <span className="lc2-tele__key">Score</span>
              </div>

              <div className="lc2-tele__cell">
                <div>
                  <span className="lc2-tele__key">Prontidão</span>
                  <div className="lc2-tele__num">{readinessScore}<small>%</small></div>
                </div>
              </div>

              <div className="lc2-tele__cell is-optional" title={lastInteractionAt ? fmtDateTime(lastInteractionAt) : undefined}>
                <div>
                  <span className="lc2-tele__key">Último contato</span>
                  <div className="lc2-tele__num lc2-tele__num--word">
                    {relativeTimeLabel(lastInteractionAt) || "Sem registro"}
                  </div>
                </div>
              </div>

              {/* A ÚNICA próxima ação da ficha. */}
              <div className="lc2-now">
                <span className="lc2-pulse" />
                <div className="lc2-now__body">
                  <span className="lc2-now__key">Indicado</span>
                  <div className="lc2-now__what">{lead.nextAction || "Primeiro contato"}</div>
                </div>
                <button
                  type="button"
                  className="btn-teal btn-xs"
                  onClick={() => focusWorkspace(recommendedChannel.toLowerCase().includes("mail") ? "email" : "whatsapp")}
                >
                  Fazer agora
                </button>
                <button type="button" className="btn-ghost btn-xs" onClick={() => setReagendarOpen(true)}>Reagendar</button>
              </div>
            </div>
          </header>

          <div className="lc2-body">
            <aside className="lc2-col lc2-col--dossier" aria-label="Dossiê do lead">
              {renderDossier()}
            </aside>

            <main className="lc2-col lc2-col--talk">
              <section className="lc2-copilot">
                <div className="lc2-copilot__main">
                  {/* O modelo pronto do Radar deixa de ser "copiar pro
                      clipboard" e cai direto no composer, já no canal certo. */}
                  {templateText && (
                    <button
                      type="button"
                      className="btn-ghost btn-xs"
                      title={templateText}
                      onClick={() => focusWorkspace(
                        recommendedChannel.toLowerCase().includes("mail") ? "email" : "whatsapp",
                        templateText,
                      )}
                    >
                      <I d={ICONS.doc} size={12} /> Usar modelo de mensagem
                    </button>
                  )}
                  {copilotoEnabled ? (
                    <CopilotoPanel
                      leadId={lead.id}
                      ficha={copilotoFicha}
                      onDraft={(text) => focusWorkspace("whatsapp", text)}
                      onSaveNote={saveCopilotoNote}
                    />
                  ) : (
                    // Nunca mais "Copiloto indisponível" mudo: diz o que é e
                    // leva pro lugar de ligar (ordem do dono 27/07).
                    <div className="lc2-copilot__off">
                      <span>A redação assistida está desligada para esta empresa.</span>
                      <button type="button" className="btn-ghost btn-xs" onClick={() => router.push("/automacao?secao=atendente")}>
                        Ativar copiloto
                      </button>
                    </div>
                  )}
                </div>
              </section>

              <LeadCockpitHistory
                leadId={lead.id}
                leadName={lead.name}
                phone={lead.phone}
                email={lead.email}
                currentNote={lead.shortNote}
                conversationId={lead.conversation?.id}
                timeline={timeline}
                whatsappStatus={waOk}
                emailReady={emailReady}
                command={workspaceCommand}
                onConnectWhatsapp={() => setWaConnectOpen(true)}
                onConfigureEmail={() => router.push("/configuracoes")}
                onChanged={onConversationChanged}
              />
            </main>

            {/* Pilha de decisão. LEI DO VENDEDOR: dinheiro só com canViewValues. */}
            <aside className="lc2-col lc2-col--decide" aria-label="Robô e negócio">
              {renderRoboCard()}
              {canViewValues && renderNegocioCard()}
              {canViewValues && renderFinanceiroCard()}
              <section className="lc2-card">
                <div className="lc2-card__foot lc2-card__foot--solo">
                  <button type="button" className="btn-ghost btn-xs" onClick={() => setAgendaOpen(true)}>Agenda do lead</button>
                  <button type="button" className="btn-ghost btn-xs" onClick={() => setSemInteresseOpen(true)}>Sem interesse…</button>
                </div>
              </section>
            </aside>
          </div>

          {agendaOpen && (
            <div className="hbx-veil lead-cockpit__contained-veil to-right" onClick={(event) => { if (event.target === event.currentTarget) setAgendaOpen(false); }}>
              <aside className="hbx-drawer lead-cockpit__drawer lead-cockpit__drawer--agenda" aria-label="Agenda do lead">
                <header className="lead-cockpit__drawer-head">
                  <span><strong>Agenda do lead</strong><small>{lead.name}</small></span>
                  <button type="button" onClick={() => setAgendaOpen(false)} aria-label="Fechar agenda">×</button>
                </header>
                <div className="lead-cockpit__drawer-body"><AgendaLeadPanel key={lead.id} leadId={lead.id} /></div>
              </aside>
            </div>
          )}

          {closureReasonOpen && (
            <div className="hbx-veil lead-cockpit__contained-veil" onClick={(event) => { if (event.target === event.currentTarget) setClosureReasonOpen(false); }}>
              <div className="hbx-pop lead-cockpit__decision-pop" role="dialog" aria-modal="true" aria-label="Motivo do encerramento">
                <strong>Por que está encerrando?</strong>
                <div className="lead-cockpit__decision-list">
                  {CLOSURE_REASONS.map((reason) => (
                    <button key={reason.key} type="button" className="nav-item" onClick={() => void changeStage("encerrado", reason.key)} disabled={stageBusy}>
                      {reason.label}
                    </button>
                  ))}
                </div>
                <button type="button" className="btn-ghost" onClick={() => setClosureReasonOpen(false)}>Cancelar</button>
              </div>
            </div>
          )}

          {reagendarOpen && (
            <div className="hbx-veil lead-cockpit__contained-veil" onClick={(event) => { if (event.target === event.currentTarget) setReagendarOpen(false); }}>
              {/* Editar a próxima ação vive AQUI, não num card à parte: a ficha
                  mostra a ação em um lugar só (a célula AGORA) e edita em um
                  lugar só (este popup). */}
              <div className="hbx-pop lead-cockpit__decision-pop" role="dialog" aria-modal="true" aria-label="Próxima ação do lead">
                <strong>Próxima ação · {lead.name}</strong>
                <input
                  className="field-dark"
                  maxLength={140}
                  value={nextActionDraft}
                  placeholder="O que fazer com este lead"
                  aria-label="Próxima ação do lead"
                  onChange={(event) => setNextActionDraft(event.target.value)}
                />
                <input
                  className="field-dark"
                  type="date"
                  value={reagendarData}
                  aria-label="Quando retomar"
                  onChange={(event) => setReagendarData(event.target.value)}
                />
                {!nextSlotLoading && nextSlot?.slot && (
                  <span className="muted-note">
                    Próximo horário livre: {fmtDateTime(nextSlot.slot)}
                    {nextSlot.conflito && nextSlot.motivoConflito ? ` · ${conflictLabel(nextSlot.motivoConflito)}` : ""}
                  </span>
                )}
                {acaoMsg && <span className={`ctx-msg ${acaoMsg.startsWith("✓") ? "ok" : "err"}`}>{acaoMsg}</span>}
                <div className="lead-cockpit__decision-actions">
                  <button type="button" className="btn-ghost" onClick={() => setReagendarOpen(false)}>Cancelar</button>
                  <button
                    type="button"
                    className="btn-teal"
                    disabled={acaoBusy || nextActionBusy || (!reagendarData && nextActionDraft.trim() === (lead.nextAction || "").trim())}
                    onClick={async () => {
                      if (nextActionDraft.trim() !== (lead.nextAction || "").trim()) await saveNextAction();
                      if (reagendarData) await reagendarContato();
                      else setReagendarOpen(false);
                    }}
                  >
                    {acaoBusy || nextActionBusy ? "Salvando…" : "Salvar"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {semInteresseOpen && (
            <div className="hbx-veil lead-cockpit__contained-veil" onClick={(event) => { if (event.target === event.currentTarget) setSemInteresseOpen(false); }}>
              <div className="hbx-pop lead-cockpit__decision-pop" role="dialog" aria-modal="true" aria-label="Motivo de desinteresse">
                <strong>Sem interesse · {lead.name}</strong>
                <div className="lead-cockpit__decision-list">
                  {[
                    { key: "sem_interesse", label: "Sem interesse geral" },
                    { key: "ja_tem", label: "Já tem solução" },
                    { key: "preco", label: "Preço alto demais" },
                    { key: "sem_perfil", label: "Fora do perfil" },
                    { key: "nao_ligar", label: "Não ligar mais" },
                  ].map(({ key, label }) => (
                    <button key={key} type="button" className="nav-item" disabled={acaoBusy} onClick={() => marcarSemInteresse(key)}>
                      {label}
                    </button>
                  ))}
                </div>
                <button type="button" className="btn-ghost" onClick={() => setSemInteresseOpen(false)}>Cancelar</button>
              </div>
            </div>
          )}
        </section>
      </div>

      {waConnectOpen && (
        <WhatsAppConnectModal
          open={waConnectOpen}
          onClose={() => setWaConnectOpen(false)}
          onConnected={() => { setWaOk(true); setWaConnectOpen(false); }}
          onDisconnected={() => setWaOk(false)}
        />
      )}

      {fecharOpen && (
        <FecharVendaModal
          mode={{ kind: "lead", leadId: lead.id }}
          leadName={lead.name}
          phone={lead.phone}
          onClose={() => setFecharOpen(false)}
          onDone={() => { setFecharOpen(false); onConversationChanged?.(); }}
        />
      )}
    </>
  );
}
