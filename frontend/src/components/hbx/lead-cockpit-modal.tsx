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

type CockpitDrawer = "cadastro" | "financeiro" | null;
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

const COCKPIT_STAGES: Array<{ key: CockpitStage; label: string }> = [
  { key: "novo", label: "Planejar" },
  { key: "contato", label: "Robô trabalhando" },
  { key: "retorno", label: "Te chamou" },
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

function displayPersonaDescription(value: string): string {
  if (value === "Ritmo equilibrado ao longo de ~9 dias, sem sobrecarregar o WhatsApp.") {
    return "Ritmo equilibrado por cerca de 9 dias, sem sobrecarregar o WhatsApp.";
  }
  if (value === "Mais TOQUES (e-mail/atividade) e presença firme — o WhatsApp segue espaçado (teto de chip fixo).") {
    return "Mais contatos por e-mail e atividades, com WhatsApp espaçado dentro do limite do chip.";
  }
  return value;
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

  const [drawer, setDrawer] = useState<CockpitDrawer>(null);
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
  const [cnpjCopied, setCnpjCopied] = useState(false);
  const [templateCopied, setTemplateCopied] = useState(false);
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
      else if (drawer) setDrawer(null);
      else requestClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [agendaOpen, closureReasonOpen, drawer, requestClose, open, reagendarOpen, semInteresseOpen]);

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

  function copyCnpj() {
    const cnpj = (company?.found && company.cnpj) || lead.cnpj || null;
    if (!cnpj) return;
    navigator.clipboard?.writeText(cnpj).then(
      () => {
        setCnpjCopied(true);
        window.setTimeout(() => setCnpjCopied(false), 1_500);
      },
      () => undefined,
    );
  }

  function copyTemplate() {
    const intelligence = lead.leadIntelligence;
    const template = typeof intelligence?.messageTemplate === "string"
      ? intelligence.messageTemplate
      : String((intelligence?.messageTemplate as { text?: string } | null | undefined)?.text || "");
    if (!template) return;
    navigator.clipboard?.writeText(template).then(
      () => {
        setTemplateCopied(true);
        window.setTimeout(() => setTemplateCopied(false), 1_500);
      },
      () => undefined,
    );
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
  const pain = intelligence?.painType ? humanize(intelligence.painType) : lead.website ? "Atendimento" : "Sem site";
  const smartTitle = recommendedChannel.toLowerCase().includes("mail")
    ? "Próxima melhor ação: e-mail curto, WhatsApp no retorno"
    : `Próxima melhor ação: iniciar por ${recommendedChannel}`;
  const smartReason = intelligence?.painPitch
    || intelligence?.opportunityReason
    || "Use o contato confirmado e uma mensagem curta para abrir a conversa sem parecer invasivo.";
  const approachReason = intelligence?.opportunityReason
    || "Contato confirmado e sinais comerciais suficientes para uma abordagem consultiva e objetiva.";
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

  function renderCompanyRows() {
    if (companyLoading) return <div className="lead-cockpit__empty-state">Carregando Receita Federal…</div>;
    const source = company?.found ? company : null;
    const age = yearsSince(source?.openedAt);
    return (
      <>
        <CopyRow label="Razão social" value={source?.razaoSocial || lead.razaoSocial} mono={false} />
        <CopyRow label="CNPJ" value={formatBrCnpj(source?.cnpj || lead.cnpj)} />
        <InfoRow label="Nome fantasia">{source?.nomeFantasia || "—"}</InfoRow>
        <InfoRow label="Situação">
          {(source?.situacao || lead.companySituation)
            ? <span className={`tag${String(source?.situacao || lead.companySituation).toLowerCase().includes("ativa") ? " teal" : " warn"}`}>{humanize(source?.situacao || lead.companySituation)}</span>
            : "—"}
        </InfoRow>
        <InfoRow label="CNAE">{source?.cnae ? `${formatBrCnae(source.cnae)}${source.cnaeDescription ? ` — ${source.cnaeDescription}` : ""}` : (formatBrCnae(lead.cnae) || "—")}</InfoRow>
        <InfoRow label="Natureza">{source?.naturezaJuridica || "—"}</InfoRow>
        <InfoRow label="Porte">{source?.porte || "—"}</InfoRow>
        <InfoRow label="Capital social">{source?.capitalSocial != null ? fmtMoney(source.capitalSocial) : "—"}</InfoRow>
        <InfoRow label="Abertura">{source?.openedAt ? `${fmtDate(source.openedAt)}${age != null ? ` · ${age} ano${age === 1 ? "" : "s"}` : ""}` : "—"}</InfoRow>
        <InfoRow label="Simples Nacional">{source?.simples == null ? "—" : source.simples ? "Sim" : "Não"}</InfoRow>
        <InfoRow label="MEI">{source?.mei == null ? "—" : source.mei ? "Sim" : "Não"}</InfoRow>
        <InfoRow label="Unidade">{source?.matrizFilial ? humanize(source.matrizFilial) : "—"}</InfoRow>
      </>
    );
  }

  function renderIntelligenceRail() {
    return (
      <aside className="lead-cockpit__rail lead-cockpit__rail--intelligence" aria-label="Inteligência do lead">
        <section className="lead-cockpit__compact-card">
          <CardTitle
            icon={ICONS.users}
            title="Empresa e contato"
            action={<span className="tag">{preVoo?.empresa?.found ? "Receita Federal" : "Dados do lead"}</span>}
          />
          <div className="lead-cockpit__person">
            <Av name={keyPersonName !== "—" ? keyPersonName : lead.name || "—"} size={30} />
            <span>
              <strong>{keyPersonName !== "—" ? keyPersonName : "Responsável não identificado"}</strong>
              <small>{keyPersonRoleLabel}</small>
            </span>
          </div>
          <InfoRow label="Empresa">{preVoo?.empresa?.nomeFantasia || preVoo?.empresa?.razaoSocial || lead.name || "—"}</InfoRow>
          <InfoRow label="Segmento">{lead.segment || "—"}</InfoRow>
          <InfoRow label="Cidade/UF">{cityState}</InfoRow>
          <InfoRow label="WhatsApp">
            {preVoo?.canais?.whatsapp.status === "confirmado"
              ? <span className="tag teal">Confirmado</span>
              : preVoo?.canais?.whatsapp.status === "duvidoso"
                ? <span className="tag warn">Não confirmado</span>
                : <span className="tag">Sem WhatsApp</span>}
          </InfoRow>
          <InfoRow label="E-mail">
            {preVoo?.canais?.email.status === "confirmado"
              ? <span className="tag teal">Confirmado</span>
              : preVoo?.canais?.email.status === "duvidoso"
                ? <span className="tag warn">Provável</span>
                : <span className="tag">Sem e-mail</span>}
          </InfoRow>
        </section>

        <section className="lead-cockpit__compact-card">
          <CardTitle
            icon={ICONS.check}
            title="Prontidão"
            action={preVoo?.prontidao
              ? <span className={`tag${preVoo.prontidao.veredito === "pronto" ? " teal" : " warn"}`}>{preVoo.prontidao.veredito === "pronto" ? "Pronto" : "Faltam dados"}</span>
              : undefined}
          />
          {preVooLoading ? (
            <div className="lead-cockpit__empty-state">Carregando entendimento do lead…</div>
          ) : !preVoo?.prontidao || preVoo.locked ? (
            <div className="lead-cockpit__empty-state">
              <strong>Entendimento indisponível</strong>
              <span>A inteligência deste lead ainda não está disponível.</span>
            </div>
          ) : (
            <>
              <Score value={readinessScore} label="prontidão" />
              <p className="lead-cockpit__card-copy">{preVoo.prontidao.veredictoLabel}</p>
              <div className="lead-cockpit__chips">
                {preVoo.prontidao.faltantes.map((text, index) => (
                  <span key={`missing-${index}`} className="tag red" title={text}>{text.split(" — ")[0].replace(/\.$/, "")}</span>
                ))}
                {preVoo.prontidao.duvidosos.map((text, index) => (
                  <span key={`uncertain-${index}`} className="tag warn" title={text}>{text.split(" — ")[0].replace(/\.$/, "")}</span>
                ))}
                {!preVoo.prontidao.faltantes.length && !preVoo.prontidao.duvidosos.length && <span className="tag teal">Tudo confirmado</span>}
              </div>
              {preVoo.enrichment?.enabled && preVoo.enrichment.podeBuscar && (
                <button type="button" className="btn-ghost btn-xs lead-cockpit__card-action" onClick={buscarDadosPreVoo} disabled={preVooEnrichBusy}>
                  <I d={ICONS.search} size={12} /> {preVooEnrichBusy ? "Buscando…" : "Buscar dados"}
                </button>
              )}
              {preVooEnrichMsg && <span className="muted-note">{preVooEnrichMsg}</span>}
            </>
          )}
        </section>

        <section className="lead-cockpit__compact-card">
          <CardTitle icon={ICONS.scrape} title="Por que entrou no Radar" />
          {radarReasonsLoading ? (
            <div className="lead-cockpit__empty-state">Carregando motivos…</div>
          ) : radarReasons.length ? (
            <ul className="lead-cockpit__reason-list">
              {radarReasons.map((reason) => (
                <li key={reason}><I d={ICONS.check} size={11} /> {INCLUSION_REASON_LABELS[reason] || humanize(reason)}</li>
              ))}
            </ul>
          ) : (
            <div className="lead-cockpit__empty-state">Motivo de inclusão não informado.</div>
          )}
        </section>

        <section className="lead-cockpit__compact-card lead-cockpit__intelligence-card">
          <CardTitle icon={ICONS.bolt} title="Inteligência" action={<span className="tag">{opportunityScore}/100</span>} />
          <strong>Boa oportunidade de abordagem</strong>
          <p className="lead-cockpit__card-copy">{approachReason}</p>
          <div className="lead-cockpit__signals">
            <span><small>Canal</small><strong>{recommendedChannel}</strong></span>
            <span><small>Dor</small><strong>{pain}</strong></span>
          </div>
          {templateText && (
            <button type="button" className="lead-cockpit__template-copy" onClick={copyTemplate}>
              <span>{templateText}</span>
              <b><I d={templateCopied ? ICONS.check : ICONS.doc} size={10} /> {templateCopied ? "Copiado" : "Copiar mensagem"}</b>
            </button>
          )}
        </section>
      </aside>
    );
  }

  function renderOperationsRail() {
    const personas = preVoo?.personas || [];
    return (
      <aside className="lead-cockpit__rail lead-cockpit__rail--operations" aria-label="Operação do lead">
        <section className="lead-cockpit__compact-card">
          <CardTitle
            icon={ICONS.clock}
            title="Próxima ação"
            action={<button type="button" className="lead-cockpit__micro-button" onClick={() => setAgendaOpen(true)}>Agenda</button>}
          />
          <input
            className="field-dark"
            maxLength={140}
            value={nextActionDraft}
            placeholder="Defina o próximo passo"
            onChange={(event) => setNextActionDraft(event.target.value)}
            aria-label="Próxima ação do lead"
          />
          <div className="lead-cockpit__next-action-meta">
            <span><small>Prazo atual</small><strong>{lead.returnAt ? fmtDateTime(lead.returnAt) : "Hoje"}</strong></span>
            <span>
              <small>Próximo horário livre</small>
              <strong>{nextSlotLoading ? "Consultando…" : nextSlot?.slot ? fmtDateTime(nextSlot.slot) : "Não informado"}</strong>
            </span>
          </div>
          {nextSlot?.conflito && nextSlot.motivoConflito && <span className="muted-note">{nextSlot.motivoConflito}</span>}
          <div className="lead-cockpit__row-acts">
            <button type="button" className="btn-ghost btn-xs" onClick={() => setReagendarOpen(true)}>
              <I d={ICONS.clock} size={11} /> Reagendar
            </button>
            <button type="button" className="btn-teal btn-xs" onClick={saveNextAction} disabled={nextActionBusy}>
              {nextActionBusy ? "Salvando…" : "Salvar próxima ação"}
            </button>
          </div>
          {acaoMsg && <span className={`ctx-msg ${acaoMsg.startsWith("✓") ? "ok" : "err"}`}>{acaoMsg}</span>}
        </section>

        <section className="lead-cockpit__compact-card lead-cockpit__cadence-card">
          <CardTitle
            icon={ICONS.bolt}
            title="Plano ativo"
            action={<span className={`tag${preVoo?.robo?.ligado ? " teal" : ""}`}>{preVoo?.robo?.ligado ? "Robô ativo" : "Aguardando decisão"}</span>}
          />
          {preVooLoading ? (
            <div className="lead-cockpit__empty-state">Carregando plano…</div>
          ) : !preVoo || preVoo.locked ? (
            <div className="lead-cockpit__empty-state">Plano indisponível.</div>
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
                  <p className="lead-cockpit__card-copy">{displayPersonaDescription(selectedPersona.descricao)}</p>
                  <div className="lead-cockpit__cadence-steps">
                    {selectedPersona.passos.map((passo, index) => (
                      <span key={`${passo.canal}-${passo.dia}-${index}`}>
                        <i>{index + 1}</i>
                        <b>{passo.titulo || humanize(passo.canal)}</b>
                        <small>{passo.dia === 0 ? "hoje" : `D+${passo.dia}`}</small>
                      </span>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </section>

        <section className="lead-cockpit__compact-card lead-cockpit__robot-card">
          <CardTitle icon={ICONS.bolt} title="Robô e vendedor" />
          {preVoo?.robo?.ligado ? (
            <>
              <div className="lead-cockpit__robot-state is-active">
                <span><I d={ICONS.bolt} size={14} /></span>
                <p><strong>Robô ativo · passo {preVoo.robo.currentStep + 1}</strong><small>Acompanhe a história e assuma quando houver resposta.</small></p>
              </div>
              <div className="lead-cockpit__row-acts">
                <button type="button" className="btn-ghost btn-xs" onClick={desligarRobo} disabled={roboBusy}>
                  {roboBusy ? "Desligando…" : "Desligar robô"}
                </button>
                <button type="button" className="btn-teal btn-xs" onClick={() => void changeStage("qualificado")} disabled={stageBusy}>
                  Assumir atendimento
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="lead-cockpit__responsibility">
                Ao ligar, o robô executa a cadência escolhida; revise o plano, pois a responsabilidade pelos contatos enviados continua sendo da sua empresa.
              </p>
              {preVoo?.roboBloqueado && (
                <div className="lead-cockpit__robot-block">
                  <strong>{preVoo.roboBloqueado.motivo}</strong>
                  <span>{preVoo.roboBloqueado.acao}</span>
                </div>
              )}
              <div className="lead-cockpit__row-acts">
                {preVoo?.roboBloqueado?.codigo === "whatsapp_desconectado" && (
                  <button type="button" className="btn-ghost btn-xs" onClick={() => setWaConnectOpen(true)}>
                    <WhatsAppMark size={12} /> Conectar WhatsApp
                  </button>
                )}
                <button
                  type="button"
                  className="btn-teal btn-xs"
                  onClick={ligarRobo}
                  disabled={roboBusy || !selectedPersonaKey || Boolean(preVoo?.roboBloqueado)}
                  title={preVoo?.roboBloqueado ? `${preVoo.roboBloqueado.motivo} ${preVoo.roboBloqueado.acao}` : undefined}
                >
                  {roboBusy ? "Ligando…" : "Ligar robô"}
                </button>
              </div>
            </>
          )}
          {roboMsg && <span className={`ctx-msg ${roboMsg.startsWith("✓") ? "ok" : "err"}`}>{roboMsg}</span>}
          {stageMsg && <span className={`ctx-msg ${stageMsg.startsWith("✓") ? "ok" : "err"}`}>{stageMsg}</span>}
        </section>

        <section className="lead-cockpit__compact-card lead-cockpit__lead-actions">
          <CardTitle icon={ICONS.check} title="Ações do vendedor" />
          <div className="lead-cockpit__action-grid">
            <button type="button" className="btn-teal btn-xs" onClick={() => setFecharOpen(true)}>
              <I d={ICONS.money} size={11} /> Fechar venda
            </button>
            <button type="button" className="btn-ghost btn-xs" onClick={() => setSemInteresseOpen(true)}>Sem interesse</button>
            <button type="button" className="btn-ghost btn-xs" onClick={() => setDrawer("cadastro")}>Ver cadastro</button>
            {canViewValues && <button type="button" className="btn-ghost btn-xs" onClick={() => setDrawer("financeiro")}>Ver financeiro</button>}
          </div>
        </section>
      </aside>
    );
  }

  function renderCadastro() {
    return (
      <div className="lead-cockpit__drawer-grid">
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
          <InfoRow label="Cidade/UF">{cityState}</InfoRow>
          <InfoRow label="Site">{lead.website || "Não encontrado"}</InfoRow>
        </section>

        <section className="lead-cockpit__compact-card">
          <CardTitle icon={ICONS.users} title="Pessoa-chave" />
          <div className="lead-cockpit__person">
            <Av name={keyPersonName} size={30} />
            <span><strong>{keyPersonName}</strong><small>{keyPersonRoleLabel}</small></span>
          </div>
          <InfoRow label="Telefone">{lead.ownerPhone ? formatPhoneDisplay(lead.ownerPhone) : lead.phone ? formatPhoneDisplay(lead.phone) : "—"}</InfoRow>
          <InfoRow label="Instagram">{lead.ownerInstagram || "Não localizado"}</InfoRow>
          <InfoRow label="Facebook">{lead.ownerFacebook || "Não localizado"}</InfoRow>
        </section>

        <section className="lead-cockpit__compact-card lead-cockpit__drawer-company">
          <CardTitle icon={ICONS.empresas} title="Empresa" action={<span className="tag">Receita Federal</span>} />
          <div className="lead-cockpit__company-kv">{renderCompanyRows()}</div>
        </section>

        <section className="lead-cockpit__compact-card">
          <CardTitle icon={ICONS.users} title="Quadro societário" action={<span className="tag">{company?.partners?.length || 0} pessoa(s)</span>} />
          <div className="lead-cockpit__partner-list">
            {company?.partners?.length ? company.partners.map((partner, index) => (
              <div className="lead-cockpit__person" key={`${partner.name || "partner"}-${index}`}>
                <Av name={partner.name || "—"} size={28} />
                <span><strong>{partner.name || "—"}</strong><small>{partner.qualification ? humanize(partner.qualification) : "Sócio"}</small></span>
              </div>
            )) : <span className="muted-note">Sem quadro societário disponível.</span>}
          </div>
        </section>

        <section className="lead-cockpit__compact-card">
          <CardTitle icon={ICONS.check} title="Qualidade do cadastro" action={<span className="tag">{registrationQuality}% completo</span>} />
          <Score value={registrationQuality} label="cadastro" />
          <p className="lead-cockpit__card-copy">Contato, Receita e pessoa-chave organizados para o trabalho comercial.</p>
        </section>

        <section className="lead-cockpit__compact-card">
          <CardTitle icon={ICONS.scrape} title="Origem" action={<span className="tag">Radar</span>} />
          <div className="lead-cockpit__chips">
            {lead.phone && <span className="tag teal">Telefone presente</span>}
            {lead.email && <span className="tag teal">E-mail presente</span>}
            {!lead.website && <span className="tag">Sem site</span>}
            {lead.timesSeen != null && lead.timesSeen > 1 && <span className="tag">Visto {lead.timesSeen}×</span>}
          </div>
        </section>
      </div>
    );
  }

  function renderFinanceiro() {
    return (
      <div className="lead-cockpit__drawer-grid lead-cockpit__drawer-grid--finance">
        <section className="lead-cockpit__compact-card">
          <CardTitle icon={ICONS.money} title="Resumo comercial" action={<span className={`tag${lead.saleStatus === "sale_confirmed" ? " teal" : " warn"}`}>{lead.saleStatusLabel || "Sem venda"}</span>} />
          <strong className="lead-cockpit__money">{lead.saleValue != null ? fmtMoney(lead.saleValue) : "R$ 0"}</strong>
          <div className="lead-cockpit__metrics">
            <span><small>Produto</small><strong>{lead.product?.name || "Não definido"}</strong></span>
            <span><small>Etapa</small><strong>{lead.statusLabel || "Prospecção"}</strong></span>
            <span><small>Comissão</small><strong>{lead.commissionAmount != null ? fmtMoney(lead.commissionAmount) : "—"}</strong></span>
            <span><small>Recorrência</small><strong>{lead.commissionRecurring == null ? "—" : lead.commissionRecurring ? "Sim" : "Não"}</strong></span>
          </div>
        </section>

        <section className="lead-cockpit__compact-card">
          <CardTitle icon={ICONS.doc} title="Proposta" />
          <InfoRow label="Produto sugerido">{lead.product?.name || "HBX Atendimento + Vendas"}</InfoRow>
          <InfoRow label="Implantação">{lead.setupValue != null ? fmtMoney(lead.setupValue) : "Não definida"}</InfoRow>
          <InfoRow label="Mensalidade">{lead.saleValue != null ? fmtMoney(lead.saleValue) : "Não definida"}</InfoRow>
          <InfoRow label="Responsável">{lead.owner?.name || "—"}</InfoRow>
        </section>

        <section className="lead-cockpit__compact-card lead-cockpit__drawer-statement">
          <CardTitle icon={ICONS.relat} title="Extrato do cliente" action={<span className="tag">{extrato?.charges.length || 0} títulos</span>} />
          {financeMessage && <span className={`ctx-msg ${financeMessage.startsWith("✓") ? "ok" : "err"}`}>{financeMessage}</span>}
          {!customerProfileId ? (
            <div className="lead-cockpit__finance-empty">
              <strong>Ainda não há movimentação financeira</strong>
              <small>O extrato nasce quando a venda é confirmada e o primeiro título é gerado.</small>
              {(lead.saleValue ?? 0) > 0 && (
                <button type="button" className="btn-teal btn-xs" onClick={createCharge} disabled={financeBusy != null}>
                  {financeBusy === "create" ? "Gerando…" : "Gerar cobrança"}
                </button>
              )}
            </div>
          ) : extratoError ? (
            <div className="lead-cockpit__empty-state">Não foi possível carregar o extrato.</div>
          ) : extrato == null ? (
            <div className="lead-cockpit__empty-state">Carregando extrato…</div>
          ) : extrato.charges.length === 0 ? (
            <div className="lead-cockpit__finance-empty"><strong>Nenhum título ainda</strong><small>O cliente já existe no financeiro, mas não possui cobranças.</small></div>
          ) : (
            <div className="lead-cockpit__charges">
              <div className="lead-cockpit__balance"><span>Saldo em aberto</span><strong>{fmtMoney(extrato.saldoAberto)}</strong></div>
              {extrato.charges.slice(0, 8).map((charge) => (
                <div className="lead-cockpit__charge-row" key={charge.id}>
                  <span><strong>{charge.description || "Título"}</strong><small>{sourceModuleLabel(charge.sourceModule)} · {fmtDate(charge.dueDate)}</small></span>
                  <span className={chargeTagClass(charge.status)}>{chargeStatusLabel(charge.status)}</span>
                  <strong className="hbx-mono">{fmtMoney(charge.amount)}</strong>
                  {String(charge.status || "").toLowerCase() === "pending" && (
                    <button type="button" className="lead-cockpit__micro-button" onClick={() => markPaid(charge.id)} disabled={financeBusy != null}>
                      {financeBusy === charge.id ? "Baixando…" : "Marcar pago"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="lead-cockpit__compact-card">
          <CardTitle icon={ICONS.money} title="Comissão" action={<span className="tag">{lead.commissionStatusLabel || "Pendente"}</span>} />
          <InfoRow label="Valor">{lead.commissionAmount != null ? fmtMoney(lead.commissionAmount) : "—"}</InfoRow>
          <InfoRow label="Vencimento">{lead.commissionDueAt ? fmtDate(lead.commissionDueAt) : "—"}</InfoRow>
          <InfoRow label="Recorrente">{lead.commissionRecurring == null ? "—" : lead.commissionRecurring ? "Sim" : "Não"}</InfoRow>
          <InfoRow label="Implantação">{lead.setupCommissionAmount != null ? fmtMoney(lead.setupCommissionAmount) : "—"}</InfoRow>
        </section>
      </div>
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
                  <span className="lead-cockpit__approved-badges"><RadarAiBadge status={aiStatus} /></span>
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
              {cnpj && (
                <button type="button" className="btn-ghost btn-xs" onClick={copyCnpj}>
                  <I d={cnpjCopied ? ICONS.check : ICONS.doc} size={12} /> <span>{cnpjCopied ? "Copiado" : "Copiar CNPJ"}</span>
                </button>
              )}
              {conciergeVisible && (
                <button type="button" className="btn-ghost btn-xs" onClick={searchSimilar}>
                  <I d={ICONS.concierge} size={12} /> <span>Buscar parecidos</span>
                </button>
              )}
              <button type="button" className="lead-cockpit__approved-close" onClick={requestClose} aria-label="Fechar">×</button>
            </div>
          </header>

          <div className="lead-cockpit__statusbar">
            {/* 26/07 — a fileira Planejar/Robô/Te chamou/Negociação/Fechado saiu
                daqui: era a MESMA guia da tela de trás, e dentro da ficha ela
                lia como navegação ("por que estou vendo o funil de novo?").
                Aqui a etapa é um DADO do lead, então virou um campo: mostra em
                que etapa ele está e deixa mudar. Mesmo endpoint (changeStage). */}
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
          </div>

          <div className="lead-cockpit__workspace">
            {renderIntelligenceRail()}

            <main className="lead-cockpit__history-column">
              <section className="lead-cockpit__smart-strip">
                <span className="lead-cockpit__smart-strip-icon"><I d={ICONS.bolt} size={15} /></span>
                <span>
                  <strong>{smartTitle}</strong>
                  <small>{smartReason}</small>
                </span>
                {copilotoEnabled ? (
                  <CopilotoPanel
                    leadId={lead.id}
                    ficha={copilotoFicha}
                    onDraft={(text) => focusWorkspace("whatsapp", text)}
                    onSaveNote={saveCopilotoNote}
                  />
                ) : <span className="muted-note">Copiloto indisponível</span>}
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

            {renderOperationsRail()}
          </div>

          {drawer && (
            <div className="hbx-veil lead-cockpit__contained-veil to-right" onClick={(event) => { if (event.target === event.currentTarget) setDrawer(null); }}>
              <aside className="hbx-drawer lead-cockpit__drawer" aria-label={drawer === "cadastro" ? "Cadastro do lead" : "Financeiro do lead"}>
                <header className="lead-cockpit__drawer-head">
                  <span>
                    <strong>{drawer === "cadastro" ? "Cadastro do lead" : "Financeiro do lead"}</strong>
                    <small>{lead.name}</small>
                  </span>
                  <button type="button" onClick={() => setDrawer(null)} aria-label="Fechar gaveta">×</button>
                </header>
                <div className="lead-cockpit__drawer-body">
                  {drawer === "cadastro" ? renderCadastro() : renderFinanceiro()}
                </div>
              </aside>
            </div>
          )}

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
              <div className="hbx-pop lead-cockpit__decision-pop" role="dialog" aria-modal="true" aria-label="Reagendar contato">
                <strong>Reagendar contato · {lead.name}</strong>
                <input className="field-dark" type="date" value={reagendarData} onChange={(event) => setReagendarData(event.target.value)} />
                <div className="lead-cockpit__decision-actions">
                  <button type="button" className="btn-ghost" onClick={() => setReagendarOpen(false)}>Cancelar</button>
                  <button type="button" className="btn-teal" disabled={!reagendarData || acaoBusy} onClick={reagendarContato}>
                    {acaoBusy ? "Salvando…" : "Confirmar"}
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
