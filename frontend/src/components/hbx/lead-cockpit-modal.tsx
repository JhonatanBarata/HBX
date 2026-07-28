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

function InfoRow({ label, children, mono = false }: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="lead-cockpit__kv-row">
      <span className="lead-cockpit__kv-key">{label}</span>
      <span className={`lead-cockpit__kv-value${mono ? " hbx-mono" : ""}`}>{children}</span>
    </div>
  );
}

function CopyRow({ label, value, mono = true, badge }: {
  label: string;
  value?: string | null;
  mono?: boolean;
  badge?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const display = value || "—";

  function copy() {
    if (!value) return;
    navigator.clipboard?.writeText(value).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1_400);
      },
      () => undefined,
    );
  }

  return (
    <div className="lead-cockpit__kv-row">
      <span className="lead-cockpit__kv-key">{label}</span>
      <span className={`lead-cockpit__copy-value${mono ? " hbx-mono" : ""}`}>
        <span>{display}</span>
        {badge}
        {value && (
          <button type="button" className="lead-cockpit__copy-button" onClick={copy} aria-label={`Copiar ${label}`}>
            <I d={copied ? ICONS.check : ICONS.doc} size={10} />
          </button>
        )}
      </span>
    </div>
  );
}

function CardTitle({ icon, title, action }: {
  icon: string[];
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="lead-cockpit__compact-card-head">
      <span><I d={icon} size={14} /> {title}</span>
      {action}
    </header>
  );
}

function Score({ value, label }: { value: number; label: string }) {
  const safeValue = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  return (
    <div className="lead-cockpit__score">
      <span><strong>{safeValue}%</strong><small>{label}</small></span>
      <progress max={100} value={safeValue} aria-label={`${label}: ${safeValue}%`} />
    </div>
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
  const situacaoLabel = (company?.found && company.situacao) || lead.companySituation || null;
  const situacaoAtiva = situacaoLabel ? String(situacaoLabel).toLowerCase().includes("ativa") : null;
  const cnpjDisplay = cnpj ? (formatBrCnpj(cnpj) || cnpj) : null;

  function renderCadenceSteps(persona: PreVooPersona, currentStep: number) {
    return (
      <div className="lead-cockpit__cadence-steps">
        {persona.passos.map((passo, index) => (
          <span key={`${passo.canal}-${passo.dia}-${index}`}>
            <i>{index < currentStep ? "✓" : index + 1}</i>
            <b>{passo.titulo || humanize(passo.canal)}</b>
            <small>{passo.dia === 0 ? "hoje" : `D+${passo.dia}`}</small>
          </span>
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
        <section className="lead-cockpit__compact-card">
          <CardTitle
            icon={ICONS.doc}
            title="Empresa"
            action={situacaoLabel ? (
              <span className={`tag${situacaoAtiva ? " teal" : " warn"}`}>
                {situacaoAtiva ? "RFB ativa" : humanize(situacaoLabel)}
              </span>
            ) : undefined}
          />
          {companyLoading ? (
            <div className="lead-cockpit__empty-state">Carregando Receita Federal…</div>
          ) : (
            <>
              <CopyRow label="CNPJ" value={cnpjDisplay} />
              <InfoRow label="Razão social">{source?.razaoSocial || lead.razaoSocial || "—"}</InfoRow>
              <InfoRow label="Fantasia">{source?.nomeFantasia || "—"}</InfoRow>
              <InfoRow label="CNAE">
                {source?.cnae
                  ? `${formatBrCnae(source.cnae)}${source.cnaeDescription ? ` — ${source.cnaeDescription}` : ""}`
                  : (formatBrCnae(lead.cnae) || "—")}
              </InfoRow>
              <InfoRow label="Porte">
                {[source?.porte, source?.simples ? "Simples Nacional" : null, source?.mei ? "MEI" : null].filter(Boolean).join(" · ") || "—"}
              </InfoRow>
              <InfoRow label="Natureza">{source?.naturezaJuridica || "—"}</InfoRow>
              <InfoRow label="Capital social" mono>{source?.capitalSocial != null ? fmtMoney(source.capitalSocial) : "—"}</InfoRow>
              <InfoRow label="Abertura">
                {source?.openedAt ? `${fmtDate(source.openedAt)}${age != null ? ` · ${age} ano${age === 1 ? "" : "s"}` : ""}` : "—"}
              </InfoRow>
              <InfoRow label="Unidade">{source?.matrizFilial ? humanize(source.matrizFilial) : "—"}</InfoRow>
            </>
          )}
        </section>

        <section className="lead-cockpit__compact-card">
          <CardTitle
            icon={ICONS.users}
            title="Pessoa-chave"
            action={company?.partners?.length ? <span className="tag">{company.partners.length} sócio{company.partners.length === 1 ? "" : "s"}</span> : undefined}
          />
          <div className="lead-cockpit__person">
            <Av name={keyPersonName !== "—" ? keyPersonName : lead.name || "—"} size={34} />
            <span>
              <strong>{keyPersonName !== "—" ? keyPersonName : "Responsável não identificado"}</strong>
              <small>{keyPersonRoleLabel}</small>
            </span>
          </div>
          <CopyRow
            label="Telefone"
            value={ownerPhone ? formatPhoneDisplay(ownerPhone) : null}
            badge={ownerPhone && whatsappMap[onlyDigits(ownerPhone)] === true ? <span className="tag teal">WhatsApp ✓</span> : undefined}
          />
          <InfoRow label="Instagram">{lead.ownerInstagram || "não localizado"}</InfoRow>
          <InfoRow label="Facebook">{lead.ownerFacebook || "não localizado"}</InfoRow>
          {extraPartners.map((partner, index) => (
            <InfoRow key={`${partner.name || "partner"}-${index}`} label={index === 0 ? "Outros sócios" : ""}>
              {partner.name || "—"}{partner.qualification ? ` · ${humanize(partner.qualification)}` : ""}
            </InfoRow>
          ))}
        </section>

        <section className="lead-cockpit__compact-card">
          <CardTitle icon={ICONS.phone} title="Contatos" />
          {phones.length ? phones.map((phone, index) => (
            <CopyRow
              key={phone}
              label={index === 0 ? "Telefone" : `Telefone ${index + 1}`}
              value={formatPhoneDisplay(phone)}
              badge={whatsappMap[onlyDigits(phone)] === true ? <span className="tag teal">WhatsApp ✓</span> : undefined}
            />
          )) : <InfoRow label="Telefone">—</InfoRow>}
          {emails.length ? emails.map((item, index) => (
            <CopyRow key={item} label={index === 0 ? "E-mail" : `E-mail ${index + 1}`} value={item} mono={false} />
          )) : <InfoRow label="E-mail">—</InfoRow>}
          <InfoRow label="Site">{lead.website || "não localizado"}</InfoRow>
          <InfoRow label="Endereço">{lead.address || "—"}</InfoRow>
        </section>

        <section className="lead-cockpit__compact-card">
          <CardTitle icon={ICONS.scrape} title="Radar e prontidão" action={<span className="tag">{opportunityScore}/100</span>} />
          <Score value={opportunityScore} label="oportunidade" />
          {approachReason && <p className="lead-cockpit__card-copy">{approachReason}</p>}
          {radarReasonsLoading ? (
            <div className="lead-cockpit__empty-state">Carregando motivos…</div>
          ) : radarReasons.length ? (
            <ul className="lead-cockpit__reason-list">
              {radarReasons.map((reason) => (
                <li key={reason}><I d={ICONS.check} size={11} /> {INCLUSION_REASON_LABELS[reason] || humanize(reason)}</li>
              ))}
            </ul>
          ) : (
            <span className="muted-note">Motivo de inclusão não informado.</span>
          )}
          <Score value={readinessScore} label="prontidão" />
          <InfoRow label="Cadastro">{registrationQuality}% completo</InfoRow>
          {lead.timesSeen != null && lead.timesSeen > 1 && <InfoRow label="Visto no Radar">{lead.timesSeen} vezes</InfoRow>}
          {preVoo?.prontidao?.faltantes?.length ? (
            <div className="lead-cockpit__chips">
              {preVoo.prontidao.faltantes.map((text, index) => (
                <span key={`${text}-${index}`} className="tag red">{text.split(" — ")[0].replace(/\.$/, "")}</span>
              ))}
            </div>
          ) : null}
          {preVoo?.enrichment?.enabled && preVoo.enrichment.podeBuscar && (
            <button type="button" className="btn-ghost btn-xs lead-cockpit__card-action" onClick={buscarDadosPreVoo} disabled={preVooEnrichBusy}>
              <I d={ICONS.search} size={12} /> {preVooEnrichBusy ? "Buscando…" : "Buscar mais dados"}
            </button>
          )}
          {preVooEnrichMsg && <span className="muted-note">{preVooEnrichMsg}</span>}
        </section>

        {templateText && (
          <button
            type="button"
            className="lead-cockpit__template-copy"
            onClick={() => focusWorkspace(recommendedChannel.toLowerCase().includes("mail") ? "email" : "whatsapp", templateText)}
          >
            <span>{templateText}</span>
            <b><I d={ICONS.doc} size={10} /> Usar modelo de mensagem</b>
          </button>
        )}
      </>
    );
  }

  function renderRoboCard() {
    const robo = preVoo?.robo;
    const bloqueio = preVoo?.roboBloqueado;
    const personas = preVoo?.personas || [];

    return (
      <section className="lead-cockpit__compact-card lead-cockpit__cadence-card">
        <CardTitle
          icon={ICONS.bolt}
          title="Robô de cadência"
          action={<span className={`tag${robo?.ligado ? " teal" : bloqueio ? " warn" : ""}`}>{robo?.ligado ? "Rodando" : bloqueio ? "Parado" : "Pronto"}</span>}
        />
        {preVooLoading ? (
          <div className="lead-cockpit__empty-state">Carregando plano…</div>
        ) : !preVoo || preVoo.locked ? (
          <div className="lead-cockpit__empty-state">Plano indisponível para este lead.</div>
        ) : robo?.ligado ? (
          <>
            <div className="lead-cockpit__robot-state is-active">
              <span><I d={ICONS.bolt} size={14} /></span>
              <p>
                <strong>
                  {selectedPersona ? `Plano ${selectedPersona.nome.split(" (")[0]}` : "Robô ativo"}
                  {" · passo "}{robo.currentStep + 1}{selectedPersona ? ` de ${selectedPersona.passos.length}` : ""}
                </strong>
                <small>Acompanhe a história e assuma quando houver resposta.</small>
              </p>
            </div>
            {selectedPersona && renderCadenceSteps(selectedPersona, robo.currentStep)}
            <div className="lead-cockpit__row-acts">
              <button type="button" className="btn-ghost btn-xs" onClick={desligarRobo} disabled={roboBusy}>
                {roboBusy ? "Desligando…" : "Desligar robô"}
              </button>
              <button type="button" className="btn-teal btn-xs" onClick={() => void changeStage("qualificado")} disabled={stageBusy}>
                Assumir atendimento
              </button>
            </div>
          </>
        ) : bloqueio?.codigo === "config_ausente" ? (
          <>
            <div className="lead-cockpit__robot-block">
              <strong>Falta configurar horário e teto</strong>
              <span>A configuração vale para a empresa e é aplicada ao liberar o robô.</span>
            </div>
            <div className="lead-cockpit__next-action-meta">
              <span><small>Início</small><input className="field-dark" type="time" value={configStart} onChange={(event) => setConfigStart(event.target.value)} /></span>
              <span><small>Fim</small><input className="field-dark" type="time" value={configEnd} onChange={(event) => setConfigEnd(event.target.value)} /></span>
              <span><small>Teto por dia</small><input className="field-dark" type="number" min={1} max={200} value={configLimit} onChange={(event) => setConfigLimit(event.target.value)} /></span>
            </div>
            <button type="button" className="btn-teal btn-xs" onClick={salvarConfigDisparo} disabled={configBusy}>
              {configBusy ? "Salvando…" : "Salvar e liberar o robô"}
            </button>
            {configMsg && <span className={`ctx-msg ${configMsg.startsWith("✓") ? "ok" : "err"}`}>{configMsg}</span>}
          </>
        ) : bloqueio ? (
          <>
            <div className="lead-cockpit__robot-block">
              <strong>{bloqueio.motivo}</strong>
              <span>{bloqueio.acao}</span>
            </div>
            {bloqueio.codigo === "whatsapp_desconectado" && (
              <button type="button" className="btn-teal btn-xs" onClick={() => setWaConnectOpen(true)}>
                <WhatsAppMark size={12} /> Conectar WhatsApp
              </button>
            )}
          </>
        ) : (
          <>
            <nav className="glass-pill-track lead-cockpit__persona-pick" aria-label="Escolha de persona da cadência">
              <GlassPill {...personaPill} />
              {personas.map((persona) => (
                <button
                  key={persona.key}
                  type="button"
                  ref={personaPill.itemRef(persona.key)}
                  className={`glass-pill-item lead-cockpit__persona-chip${selectedPersonaKey === persona.key ? " is-active" : ""}`}
                  aria-pressed={selectedPersonaKey === persona.key}
                  onClick={() => setSelectedPersonaKey(persona.key)}
                >
                  {persona.nome.split(" (")[0]}{persona.recomendado ? <small> ★ sugerida</small> : null}
                </button>
              ))}
            </nav>
            {selectedPersona && (
              <>
                <p className="lead-cockpit__card-copy">{selectedPersona.descricao}</p>
                {renderCadenceSteps(selectedPersona, -1)}
              </>
            )}
            {!nextSlotLoading && nextSlot?.slot && (
              <InfoRow label="Próximo horário">
                {fmtDateTime(nextSlot.slot)}
                {nextSlot.conflito && nextSlot.motivoConflito ? ` · ${conflictLabel(nextSlot.motivoConflito)}` : ""}
              </InfoRow>
            )}
            <button type="button" className="btn-teal btn-xs" onClick={ligarRobo} disabled={roboBusy || !selectedPersonaKey}>
              {roboBusy ? "Ligando…" : "Ligar robô"}
            </button>
          </>
        )}
        {roboMsg && <span className={`ctx-msg ${roboMsg.startsWith("✓") ? "ok" : "err"}`}>{roboMsg}</span>}
        {stageMsg && <span className={`ctx-msg ${stageMsg.startsWith("✓") ? "ok" : "err"}`}>{stageMsg}</span>}
      </section>
    );
  }

  function renderNegocioCard() {
    return (
      <section className="lead-cockpit__compact-card lead-cockpit__commercial-summary">
        <CardTitle
          icon={ICONS.money}
          title="Negócio"
          action={<span className={`tag${lead.saleStatus === "sale_confirmed" ? " teal" : " warn"}`}>{lead.saleStatusLabel || "Sem venda"}</span>}
        />
        <small>Recorrência mensal</small>
        <strong className="lead-cockpit__money">{lead.saleValue != null ? fmtMoney(lead.saleValue) : "R$ 0,00"}</strong>
        <InfoRow label="Produto">{lead.product?.name || "Não definido"}</InfoRow>
        <InfoRow label="Implantação" mono>{lead.setupValue != null ? fmtMoney(lead.setupValue) : "—"}</InfoRow>
        <InfoRow label="Comissão" mono>
          {lead.commissionAmount != null ? `${fmtMoney(lead.commissionAmount)}${lead.commissionRecurring ? " /mês" : ""}` : "—"}
        </InfoRow>
        <InfoRow label="Responsável">{lead.owner?.name || "—"}</InfoRow>
      </section>
    );
  }

  function renderFinanceiroCard() {
    return (
      <section className="lead-cockpit__compact-card lead-cockpit__statement-card">
        <CardTitle
          icon={ICONS.money}
          title="Financeiro do cliente"
          action={extrato ? <span className={`tag${extrato.saldoAberto > 0 ? " warn" : " teal"}`}>{extrato.saldoAberto > 0 ? "Em aberto" : "Em dia"}</span> : undefined}
        />
        {financeMessage && <span className={`ctx-msg ${financeMessage.startsWith("✓") ? "ok" : "err"}`}>{financeMessage}</span>}
        {!customerProfileId ? (
          <>
            <span className="muted-note">Sem cobranças.</span>
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
        ) : (
          <>
            <div className="lead-cockpit__balance">
              <span>Saldo em aberto</span>
              <strong>{fmtMoney(extrato.saldoAberto)}</strong>
            </div>
            {extrato.charges.length === 0 ? (
              <span className="muted-note">Sem cobranças.</span>
            ) : (
              <div className="lead-cockpit__charges">
                {extrato.charges.slice(0, 8).map((charge) => (
                  <div className="lead-cockpit__charge-row" key={charge.id}>
                    <span>
                      <strong>{charge.description || "Título"}</strong>
                      <small>{sourceModuleLabel(charge.sourceModule)} · {fmtDate(charge.dueDate)}</small>
                    </span>
                    <span className={chargeTagClass(charge.status)}>{chargeStatusLabel(charge.status)}</span>
                    <strong>{fmtMoney(charge.amount)}</strong>
                    {String(charge.status || "").toLowerCase() === "pending" && (
                      <button type="button" className="btn-ghost btn-xs" onClick={() => markPaid(charge.id)} disabled={financeBusy != null}>
                        {financeBusy === charge.id ? "Baixando…" : "Marcar pago"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    );
  }

  if (!open) return null;

  return (
    <>
      <div className={"hbx-veil lead-cockpit__veil" + (closing ? " is-closing" : "")} onClick={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
        <section ref={shellRef} className="hbx-modal lead-cockpit lead-cockpit--workbench" role="dialog" aria-modal="true" aria-label={`Detalhes do lead ${lead.name || ""}`}>
          <header className="lead-cockpit__approved-head">
            <div className="lead-cockpit__approved-identity">
              <Av name={lead.name || "—"} size={44} />
              <div className="lead-cockpit__approved-id">
                <span className="lead-cockpit__approved-title-row">
                  <h2>{lead.name || "—"}</h2>
                  <span className="lead-cockpit__approved-badges">
                    <RadarAiBadge status={aiStatus} />
                    {situacaoLabel && <span className={`tag${situacaoAtiva ? " teal" : " warn"}`}>{situacaoAtiva ? "RFB ativa" : humanize(situacaoLabel)}</span>}
                    {!lead.website && <span className="tag warn">Sem site</span>}
                  </span>
                </span>
                <p title={[lead.razaoSocial, lead.segment, cityState].filter(Boolean).join(" • ")}>
                  {[lead.razaoSocial, lead.segment, cityState].filter(Boolean).join(" • ") || "—"}
                </p>
              </div>
            </div>

            {availableChannels.length > 0 && (
              <span className="lead-cockpit__approved-channels" aria-label="Canais do lead">
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
                        <CanalIcon canal={canal} size="xl" />
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
                      <CanalIcon canal={canal} size="xl" />
                    </a>
                  );
                })}
              </span>
            )}

            <div className="lead-cockpit__approved-actions">
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
          </header>

          <div className="lead-cockpit__statusbar">
            <label className="lead-cockpit__stage-field">
              <small>Etapa</small>
              <select
                value={stage}
                disabled={stageBusy}
                aria-label="Etapa do lead"
                onChange={(event) => void changeStage(event.target.value as CockpitStage)}
              >
                {COCKPIT_STAGES.map((item) => (
                  <option key={item.key} value={item.key}>{item.label}</option>
                ))}
              </select>
            </label>
            <div className="lead-cockpit__header-next">
              <span><small>Próxima ação</small><strong>{lead.nextAction || "Primeiro contato"}</strong></span>
              <span><small>Quando</small><strong>{lead.returnAt ? fmtDateTime(lead.returnAt) : "Hoje"}</strong></span>
            </div>
            <div className="lead-cockpit__row-acts">
              <button type="button" className="btn-teal btn-xs" onClick={() => focusWorkspace(recommendedChannel.toLowerCase().includes("mail") ? "email" : "whatsapp")}>
                Fazer agora
              </button>
              <button type="button" className="btn-ghost btn-xs" onClick={() => setReagendarOpen(true)}>Reagendar</button>
            </div>
          </div>

          <div className="lead-cockpit__workspace">
            <aside className="lead-cockpit__rail lead-cockpit__rail--intelligence" aria-label="Dossiê do lead">
              {renderDossier()}
            </aside>

            <main className="lead-cockpit__history-column">
              <section className="lead-cockpit__smart-strip">
                <span className="lead-cockpit__smart-strip-icon"><I d={ICONS.bolt} size={15} /></span>
                <span>
                  <strong>Copiloto</strong>
                  <small>Rascunho, resumo e próxima ação sem envio automático.</small>
                </span>
                {copilotoEnabled ? (
                  <CopilotoPanel
                    leadId={lead.id}
                    ficha={copilotoFicha}
                    onDraft={(text) => focusWorkspace("whatsapp", text)}
                    onSaveNote={saveCopilotoNote}
                  />
                ) : (
                  <button type="button" className="btn-ghost btn-xs" onClick={() => router.push("/automacao?secao=atendente")}>
                    Ativar copiloto
                  </button>
                )}
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

            <aside className="lead-cockpit__rail lead-cockpit__rail--operations" aria-label="Operação do lead">
              {renderRoboCard()}
              {canViewValues && renderNegocioCard()}
              {canViewValues && renderFinanceiroCard()}
              <section className="lead-cockpit__compact-card lead-cockpit__lead-actions">
                <CardTitle icon={ICONS.check} title="Ações" />
                <div className="lead-cockpit__action-grid">
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
