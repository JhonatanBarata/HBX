"use client";

// ┌─────────────────────────────────────────────────────────────────────────────┐
// │  DetalhesNegocio — card unificado (3 telas: Vendas, Atendimento, Leads)    │
// │                                                                             │
// │  ZONAS DO CARD                                                              │
// │  ZONA 1 "Quem é": header + score ring + oportunidade (1 frase) +           │
// │    fileira de canais tri-cor + bloco empresa (CNPJ/razão/CNAE/sócio)       │
// │  [costura "O que fazer"]                                                    │
// │  ZONA 2 "O que fazer": ações + meta compacta + histórico recolhido          │
// │                                                                             │
// │  GATING por TIER do plano (não por entitlement):                            │
// │    list  → básico apenas (nome, phone, cidade, seg, canais, site, email)   │
// │    lead  → + inteligência (score, motivo, canal recomendado, wa verificado) │
// │    full  → + empresa (CNPJ, razão, CNAE, sócio, situação)                  │
// │                                                                             │
// │  HUMANIZAÇÃO: zero snake_case na tela. Mapa central LABEL_MAP.             │
// └─────────────────────────────────────────────────────────────────────────────┘

// REGRA SAGRADA: o efeito de máquina de escrever vive nas classes
// .dn-root / .dn-kv-row / .dn-skel (transitions.css + kit.css).
// NÃO editar essas classes. Todo campo novo entra na estrutura .dn-kv-row
// para herdar o efeito automaticamente.

import React, { useEffect, useState } from "react";

import { Av, I, ICONS, PhotoLightbox, useEntitlements } from "@/components/hbx/shell";
import { CanalIcon, type Canal, toCanal } from "@/components/hbx/canal-icon";
import { useWaOpenMode } from "@/lib/wa-open-mode";

// ── Humanização: mapa de snake_case → label legível ──────────────────────────
// Tudo que pode aparecer cru (painType, recommendedChannel, tags, status) passa
// por humanize() antes de entrar em tela.
const LABEL_MAP: Record<string, string> = {
  // PainType
  sem_site: "Sem site",
  site_fraco: "Site fraco",
  whatsapp_desorganizado: "WhatsApp desorganizado",
  alta_demanda: "Alta demanda",
  pouca_presenca: "Pouca presença digital",
  sem_social: "Sem redes sociais",
  sem_email: "Sem e-mail público",
  // RadarRecommendedChannel
  whatsapp: "WhatsApp",
  email: "E-mail",
  call: "Ligação",
  review: "Avaliar",
  discard: "Descartar",
  telefone: "Telefone",
  instagram: "Instagram",
  facebook: "Facebook",
  site: "Site",
  // RadarSocialStatus
  found: "Encontrado",
  partial: "Parcial",
  candidate_review: "Revisar",
  missing: "Ausente",
  weak: "Fraco",
  error: "Erro",
  unknown: "Desconhecido",
  // WeaknessTags
  sem_site_oficial: "Sem site oficial",
  sem_rede_social_confirmada: "Sem rede social confirmada",
  sem_email_publico_confirmado: "Sem e-mail público confirmado",
  whatsapp_nao_confirmado: "WhatsApp não confirmado",
  // ContactQuality
  blocked: "Bloqueado",
  good: "Boa",
  fair: "Razoável",
  // WebsiteStatus
  none: "Sem site",
  present: "Com site",
  social_only: "Só redes sociais",
  unreachable: "Site inacessível",
  // Source
  webscraping: "Radar Digital",
  manual: "Manual",
  // leadTemperature
  quente: "Quente",
  morno: "Morno",
  frio: "Frio",
  // companySituation
  ativa: "Ativa",
};

function humanize(raw: string | null | undefined): string {
  if (!raw) return "—";
  const key = raw.trim().toLowerCase().replace(/\s+/g, "_");
  return LABEL_MAP[key] || raw.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// ── Seções secundárias: ocultas sob o chevron "Mais detalhes" (default fechado)
const CARD_SECONDARY: string[] = [
  "detalhes",
  "intelligence",
  "origin",
  "dates",
];

// ── Modelo normalizado ────────────────────────────────────────────────────────

export type NegocioDetailHistory = {
  id: string;
  title?: string | null;
  description?: string | null;
  resultLabel?: string | null;
  returnAt?: string | null;
  createdAt?: string | null;
};

/** @deprecated use NegocioDetailHistory */
export type NegocioHistory = NegocioDetailHistory;

export type NegocioSale = {
  statusLabel?: string | null;
  status?: string | null;
  valueLabel?: string | null;
  /** @deprecated use valueLabel */
  value?: number | null;
  commissionLabel?: string | null;
  commissionValueLabel?: string | null;
  setupLabel?: string | null;
  /** @deprecated passado diretamente — use commissionValueLabel */
  commissionStatusLabel?: string | null;
  /** @deprecated use commissionValueLabel */
  commissionAmount?: number | null;
  setupValue?: number | null;
  setupCommissionStatusLabel?: string | null;
  setupCommissionAmount?: number | null;
  // detalhe de comissão estendido
  commissionDueAt?: string | null;       // vence em
  commissionRecurring?: boolean | null;  // recorrente?
  commissionNote?: string | null;        // nota da comissão
};

export type NegocioDetail = {
  id: string;
  name?: string | null;
  avatarUrl?: string | null;
  online?: boolean;

  phone?: string | null;
  email?: string | null;
  website?: string | null;
  channel?: string | null;
  cnpj?: string | null;
  cnae?: string | null;
  razaoSocial?: string | null;
  ownerName?: string | null;
  companySituation?: string | null;

  city?: string | null;
  state?: string | null;
  segment?: string | null;
  address?: string | null;

  statusLabel?: string | null;
  doNotCall?: boolean;
  leadTemperature?: string | null;

  valueLabel?: string | null;
  /** @deprecated use valueLabel */
  value?: string | null;
  productName?: string | null;
  rating?: number | null;
  reviews?: number | null;
  opportunityScore?: number | null;

  returnAt?: string | null;
  lastContactAt?: string | null;
  lastMessageAt?: string | null;
  attemptCount?: number | null;
  owner?: { name?: string | null; avatarUrl?: string | null } | null;
  nextAction?: string | null;
  shortNote?: string | null;
  lastResult?: string | null;
  timesSeen?: number | null;
  botActive?: boolean | null;
  humanAssigned?: boolean | null;
  isInInbox?: boolean | null;

  // enriquecimento
  enriched?: boolean;

  // datas meta
  createdAt?: string | null;
  updatedAt?: string | null;

  // origem
  sourceType?: string | null;
  primarySource?: string | null;

  // camada de inteligência (leadIntelligence enriquecida)
  leadIntelligence?: {
    whatsappStatus?: string | null;
    emailStatus?: string | null;
    websiteStatus?: string | null;
    instagramUrl?: string | null;
    facebookUrl?: string | null;
    opportunityReason?: string | null;
    leadReasonTags?: string[] | null;
    recommendedChannel?: string | null;
    painType?: string | null;
    painPitch?: string | null;
    messageTemplate?: string | null;
    contactQuality?: string | null;
  } | null;

  sale?: NegocioSale | null;
  history?: NegocioDetailHistory[] | null;
  observations?: string | null;
};

// ── Props ─────────────────────────────────────────────────────────────────────

export type DetalhesNegocioProps = {
  detail?: NegocioDetail | null;
  /** @deprecated use detail */
  negocio?: NegocioDetail | null;

  title?: string;
  onClose?: () => void;
  heroAction?: React.ReactNode;
  /** Slot opcional para coroa de enriquecido (preenchido pelo PLAN-C) */
  crownSlot?: React.ReactNode;
  actions?: React.ReactNode;
  emptyHint?: string;
  /** Exclui o card e devolve ao pool — aparece como 7° ícone na fileira de canais */
  onDelete?: () => void;

  /** quando true exibe skeleton shimmer nos campos que vêm da API de card */
  loading?: boolean;

  // ── compat props ─────────────────────────────────────────────────────────
  /** @deprecated passe pelo slot heroAction */
  waPhone?: string | null;
  /** @deprecated passe pelo slot heroAction */
  waName?: string | null;
  /** @deprecated passe pelo slot heroAction */
  waQrActive?: boolean;
  /** @deprecated passe pelo slot heroAction */
  waCanInternal?: boolean;
  /** @deprecated passe pelo slot heroAction */
  onWaOpenExternal?: () => void;
  /** @deprecated passe pelo slot heroAction */
  onWaOpenInternal?: () => void;
  /** @deprecated passe pelo slot heroAction */
  waStartBusy?: boolean;
  /** @deprecated passe pelo slot heroAction */
  waStartError?: string | null;

  obsDraft?: string;
  onObsChange?: (v: string) => void;
  onObsSave?: () => void;
  obsBusy?: boolean;
  onToggleDoNotCall?: () => void;
  /**
   * Chamado quando o operador escolhe "Sem interesse" + motivo no Atendimento.
   * Se passado, substitui o botão "Não ligar mais" por "Sem interesse" com submenu de motivos.
   * O callback recebe o slug do motivo (ex: "sem_interesse", "ja_tem", "preco", "sem_perfil").
   */
  onSemInteresse?: (reason: string) => void;
  historyLabel?: string;
  kvExtra?: React.ReactNode;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function fmtMoney(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtSourceLabel(sourceType?: string | null, primarySource?: string | null) {
  const src = String(primarySource || sourceType || "").trim().toLowerCase();
  return humanize(src) || "—";
}

const STATE_FULL: Record<string, string> = {
  AC:"Acre",AL:"Alagoas",AM:"Amazonas",AP:"Amapá",BA:"Bahia",CE:"Ceará",DF:"Distrito Federal",
  ES:"Espírito Santo",GO:"Goiás",MA:"Maranhão",MG:"Minas Gerais",MS:"Mato Grosso do Sul",
  MT:"Mato Grosso",PA:"Pará",PB:"Paraíba",PE:"Pernambuco",PI:"Piauí",PR:"Paraná",
  RJ:"Rio de Janeiro",RN:"Rio Grande do Norte",RO:"Rondônia",RR:"Roraima",
  RS:"Rio Grande do Sul",SC:"Santa Catarina",SE:"Sergipe",SP:"São Paulo",TO:"Tocantins",
};

function buildLocationLine(
  city: string | null | undefined,
  state: string | null | undefined,
  address: string | null | undefined,
): string {
  const base = `${city}${state ? `, ${state}` : ""}`;
  if (!address) return base;

  const cep = (address.match(/\d{5}-?\d{3}/) || [])[0]?.replace(/(\d{5})-?(\d{3})/, "$1-$2") ?? null;

  const stateUpper = (state || "").trim().toUpperCase();
  const stateFull = STATE_FULL[stateUpper] || "";
  const escRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  let street = address
    .replace(/\d{5}-?\d{3}/g, "")
    .replace(city ? new RegExp(`,?\\s*${escRx(city)}`, "gi") : /(?:)/, "")
    .replace(stateFull ? new RegExp(`,?\\s*${escRx(stateFull)}`, "gi") : /(?:)/, "")
    .replace(stateUpper ? new RegExp(`,?\\s*\\b${escRx(stateUpper)}\\b`, "g") : /(?:)/, "")
    .replace(/[,\s]+$/g, "").replace(/^[,\s]+/, "")
    .trim();

  if (/^atendimento\s+online$/i.test(street) || /^online$/i.test(street)) {
    street = "";
  }

  let result = base;
  if (street) result += ` - ${street}`;
  if (cep) result += ` CEP ${cep}`;
  return result;
}

// ── TypedText — efeito de digitação letra por letra ───────────────────────────

function TypedTextCore({ text, speed, delay }: { text: string; speed: number; delay: number }) {
  const [shown, setShown] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!text) { return; }
    let iv: ReturnType<typeof setInterval>;
    const timer = setTimeout(() => {
      let i = 0;
      iv = setInterval(() => {
        i++;
        setShown(text.slice(0, i));
        if (i >= text.length) { clearInterval(iv); setDone(true); }
      }, speed);
    }, delay);
    return () => { clearTimeout(timer); clearInterval(iv); };
  }, [text, speed, delay]);

  return <span className={"dn-typed" + (done ? " done" : "")}>{shown}</span>;
}

function TypedText({ text, speed = 48, delay = 0 }: { text: string; speed?: number; delay?: number }) {
  return <TypedTextCore key={text} text={text} speed={speed} delay={delay} />;
}

// ── Bloco recolhível para textos longos ───────────────────────────────────────

function CollapsibleText({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="dn-collapsible">
      <button className="dn-collapsible-toggle" onClick={() => setOpen(o => !o)} type="button">
        {label}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"
          style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.16s" }}>
          <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && <p className="dn-collapsible-body">{text}</p>}
    </div>
  );
}

// ── Chevron SVG (expand/collapse) ─────────────────────────────────────────────

function ChevronDown() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <path d="M3 5l3.5 3.5L10 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Gate de plano — borrado + cadeado + CTA quando locked ────────────────────

function LockGate({ locked, ctaText, children }: { locked: boolean; ctaText?: string; children: React.ReactNode }) {
  if (!locked) return <>{children}</>;
  return (
    <div className="dn-locked">
      {children}
      <div className="dn-lock-overlay">
        <span className="dn-lock-overlay__icon">🔒</span>
        <button
          type="button"
          className="dn-lock-overlay__cta"
          onClick={() => { window.location.href = "/configuracoes"; }}
        >
          {ctaText || "Disponível no HBX Lead+/Pro"}
        </button>
      </div>
    </div>
  );
}

// ── Score ring circular ───────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const r = 22;
  const circ = 2 * Math.PI * r;
  const dash = circ * (score / 100);
  return (
    <div className="dn-score-ring-wrap" title={`Score de oportunidade: ${score}/100`}>
      <svg className="dn-score-ring-svg" viewBox="0 0 54 54" aria-hidden="true">
        <circle className="dn-score-ring-bg" cx="27" cy="27" r={r} />
        <circle
          className="dn-score-ring-fill"
          cx="27" cy="27" r={r}
          strokeDasharray={`${dash} ${circ}`}
          strokeDashoffset={0}
          style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%" }}
        />
      </svg>
      <div className="dn-score-ring-label">
        <span className="dn-score-ring-num">{score}</span>
        <span className="dn-score-ring-sub">/100</span>
      </div>
    </div>
  );
}

// ── Fileira dos 6 ícones de canal — tri-cor: verde/vermelho/cinza ─────────────

const CANAIS_ORDEM: Canal[] = ["whatsapp", "telefone", "email", "instagram", "facebook", "site"];

type CanalState = "active" | "missing" | "unverified";

function ChannelRow({
  n,
  onWaExternal,
  onWaInternal,
  waQrActive,
  waCanInternal,
  onDelete,
  canSeeIntelligence = true,
}: {
  n: NegocioDetail;
  onWaExternal?: () => void;
  onWaInternal?: () => void;
  waQrActive?: boolean;
  waCanInternal?: boolean;
  onDelete?: () => void;
  canSeeIntelligence?: boolean;
}) {
  const li = n.leadIntelligence;
  const mode = useWaOpenMode();
  const internalReady = Boolean(waCanInternal && waQrActive);
  const useInternal = mode === "internal" && internalReady && Boolean(onWaInternal);
  const [deleteArm, setDeleteArm] = useState(false);
  useEffect(() => {
    if (!deleteArm) return;
    const t = setTimeout(() => setDeleteArm(false), 3000);
    return () => clearTimeout(t);
  }, [deleteArm]);

  function getHref(canal: Canal): string | null {
    switch (canal) {
      case "whatsapp":
        return n.phone ? `https://wa.me/${n.phone.replace(/\D/g, "").replace(/^(\d{10,11})$/, "55$1")}` : null;
      case "telefone":
        return n.phone ? `tel:${n.phone.replace(/[^\d+]/g, "")}` : null;
      case "email":
        return n.email ? `mailto:${n.email}` : null;
      case "instagram":
        return li?.instagramUrl || null;
      case "facebook":
        return li?.facebookUrl || null;
      case "site":
        return n.website ? (n.website.startsWith("http") ? n.website : `https://${n.website}`) : null;
      default:
        return null;
    }
  }

  function getCanalState(canal: Canal): CanalState {
    switch (canal) {
      case "whatsapp": {
        if (!n.phone) return "missing";
        const ws = li?.whatsappStatus;
        if (ws === "confirmed") return "active";
        if (ws === "missing" || ws === "invalid") return "missing";
        return "unverified";
      }
      case "telefone":
        return n.phone ? "active" : "missing";
      case "email": {
        if (n.email) return "active";
        const es = li?.emailStatus;
        if (es === "confirmed" || es === "probable") return "active";
        if (es === "missing" || es === "invalid") return "missing";
        return "unverified";
      }
      case "instagram":
        if (li?.instagramUrl) return "active";
        return li ? "missing" : "unverified";
      case "facebook":
        if (li?.facebookUrl) return "active";
        return li ? "missing" : "unverified";
      case "site": {
        if (n.website) return "active";
        const ws2 = li?.websiteStatus;
        if (ws2 === "confirmed" || ws2 === "present") return "active";
        if (ws2 === "none") return "missing";
        return "unverified";
      }
      default:
        return "unverified";
    }
  }

  const waVerified = li?.whatsappStatus === "confirmed";

  return (
    <div style={{ display: "grid", gap: 6 }}>
    <div className="dn-channels-row">
      {onDelete && (
        <button
          type="button"
          className="chan-ico--delete"
          title={deleteArm ? "Confirmar exclusão" : "Excluir card (devolve ao pool)"}
          aria-label={deleteArm ? "Confirmar exclusão" : "Excluir card"}
          style={{
            background: "none", border: "none", padding: 0, cursor: "pointer",
            color: deleteArm ? "var(--hbx-danger)" : "var(--text-muted)",
            transition: "color 0.15s",
          }}
          onClick={() => {
            if (deleteArm) { onDelete(); setDeleteArm(false); }
            else setDeleteArm(true);
          }}
        >
          <I d={ICONS.trash} size={22} />
        </button>
      )}
      {CANAIS_ORDEM.map(canal => {
        const canalState = getCanalState(canal);
        const href = canalState === "active" ? getHref(canal) : null;
        const isExternal = canal === "instagram" || canal === "facebook" || canal === "site" || canal === "whatsapp";

        const cls =
          canalState === "active" ? "chan-ico--on" :
          canalState === "missing" ? "chan-ico--missing" :
          "chan-ico--off";

        if (canal === "whatsapp" && canalState === "active" && (onWaExternal || onWaInternal)) {
          return (
            <span key={canal} className={cls} style={{ cursor: "pointer" }}
              onClick={() => { if (useInternal) onWaInternal!(); else if (onWaExternal) onWaExternal(); }}
              role="button" aria-label="WhatsApp">
              <CanalIcon canal={canal} size="xl" />
            </span>
          );
        }

        if (href) {
          return (
            <a
              key={canal}
              href={href}
              className={cls}
              target={isExternal ? "_blank" : undefined}
              rel={isExternal ? "noopener noreferrer" : undefined}
              aria-label={canal.charAt(0).toUpperCase() + canal.slice(1)}
            >
              <CanalIcon canal={canal} size="xl" />
            </a>
          );
        }

        return (
          <span key={canal} className={cls} aria-label={`${humanize(canal)} — ${canalState === "missing" ? "sem dado" : "não verificado"}`}>
            <CanalIcon canal={canal} size="xl" />
          </span>
        );
      })}
    </div>
    {waVerified && (
      <LockGate locked={!canSeeIntelligence} ctaText="Disponível no HBX Lead+/Pro">
        <span className="dn-wa-verified">
          ✓ WhatsApp VERIFICADO
        </span>
      </LockGate>
    )}
    </div>
  );
}

// ── Componente ────────────────────────────────────────────────────────────────

export function DetalhesNegocio({
  detail,
  negocio,
  title = "Detalhes do negócio",
  onClose,
  heroAction,
  crownSlot,
  actions,
  emptyHint,
  loading = false,
  waQrActive = false,
  waCanInternal = false,
  onWaOpenExternal,
  onWaOpenInternal,
  obsDraft,
  onObsChange,
  onObsSave,
  obsBusy,
  onToggleDoNotCall,
  onSemInteresse,
  historyLabel = "Histórico",
  kvExtra,
  onDelete,
  // compat props not used in render (kept for API compat)
  waPhone: _waPhone,
  waName: _waName,
  waStartBusy: _waStartBusy,
  waStartError: _waStartError,
}: DetalhesNegocioProps) {
  const n = detail !== undefined ? detail : (negocio !== undefined ? negocio : null);
  const [internalTab, setInternalTab] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [semInteresseOpen, setSemInteresseOpen] = useState(false);

  // ── Gate de plano por TIER (não por entitlement opportunity_score que estava errado)
  // Enquanto não carrega: assume canSeeIntelligence=true e canSeeCompany=false
  const ent = useEntitlements();
  const canSeeIntelligence = !ent.loaded || ent.canSeeLeadIntelligence;
  const canSeeCompany = ent.loaded && ent.canSeeCompanyData;

  const li = n?.leadIntelligence;
  const recChannel = li?.recommendedChannel ? toCanal(li.recommendedChannel) : null;

  // ── Renderizadores de seção ───────────────────────────────────────────────

  function renderScore() {
    if (!n) return null;
    if (n.opportunityScore == null || n.opportunityScore <= 0) return null;
    const content = (
      <div className="dn-score-inline">
        <ScoreRing score={n.opportunityScore} />
        <span className="dn-score-inline-label">Score de oportunidade</span>
      </div>
    );
    return <LockGate locked={!canSeeIntelligence} ctaText="Disponível no HBX Lead+/Pro">{content}</LockGate>;
  }

  function renderOpportunityTeaser() {
    if (!n || !li) return null;
    const reason = li.opportunityReason;
    const painType = li.painType;
    if (!reason && !painType) return null;

    let text = "";
    if (reason) {
      text = reason.length > 120 ? reason.slice(0, 117) + "…" : reason;
    } else if (painType) {
      text = humanize(painType);
    }

    const content = (
      <div className="dn-opportunity-teaser">
        <span className="dn-opportunity-teaser__icon">💡</span>
        <p className="dn-opportunity-teaser__text">{text}</p>
      </div>
    );
    return <LockGate locked={!canSeeIntelligence} ctaText="Disponível no HBX Lead+/Pro">{content}</LockGate>;
  }

  function renderStatusChip() {
    if (!n) return null;
    const hasBot = n.botActive !== undefined && n.botActive !== null;
    const hasHuman = n.humanAssigned !== undefined && n.humanAssigned !== null;
    if (!hasBot && !hasHuman) return null;
    const botOn = n.botActive === true;
    const human = n.humanAssigned === true;
    let cls = "dn-status-chip";
    let label: string;
    if (botOn) {
      cls += " is-bot";
      label = human ? "Bot ativo · Humano" : "Bot ativo";
    } else if (human) {
      cls += " is-human";
      label = hasBot ? "Bot off · Humano" : "Humano";
    } else {
      label = "Bot off";
    }
    return <span className={cls}>{label}</span>;
  }

  function renderContacts() {
    if (!n) return null;
    const hasCompanyData = Boolean(n.cnpj || n.razaoSocial || n.cnae || n.ownerName || n.companySituation);
    return (
      <div style={{ display: "grid", gap: 6 }}>
        {n.phone ? (
          <a href={`tel:${n.phone.replace(/[^\d+]/g, "")}`} className="ctx-phone">
            <CanalIcon canal="telefone" /> {n.phone}
          </a>
        ) : !loading ? (
          <div className="dn-no-phone muted-note">Sem telefone neste card.</div>
        ) : null}

        {n.website && (
          <a
            href={n.website.startsWith("http") ? n.website : `https://${n.website}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ctx-phone ctx-phone--site"
          >
            <CanalIcon canal="site" /> {n.website}
          </a>
        )}

        {/* Bloco EMPRESA — tier full (Pro/Implantação) */}
        {hasCompanyData && (
          <LockGate locked={!canSeeCompany} ctaText="Disponível no HBX Pro">
            <div style={{ display: "grid", gap: 4 }}>
              <span className="dn-section-head">
                <I d={ICONS.mapin} size={11} /> Empresa
              </span>
              {n.cnpj && (
                <div className="row dn-kv-row">
                  <span className="k">CNPJ</span>
                  <span className="v hbx-mono"><TypedText text={n.cnpj} speed={46} delay={60} /></span>
                </div>
              )}
              {n.razaoSocial && (
                <div className="row dn-kv-row">
                  <span className="k">Razão social</span>
                  <span className="v"><TypedText text={n.razaoSocial} speed={46} delay={80} /></span>
                </div>
              )}
              {n.cnae && (
                <div className="row dn-kv-row">
                  <span className="k">CNAE</span>
                  <span className="v"><TypedText text={n.cnae} speed={46} delay={100} /></span>
                </div>
              )}
              {n.ownerName && (
                <div className="row dn-kv-row">
                  <span className="k">Sócio</span>
                  <span className="v"><TypedText text={n.ownerName} speed={46} delay={120} /></span>
                </div>
              )}
              {n.companySituation && (
                <div className="row dn-kv-row">
                  <span className="k">Situação</span>
                  <span className="v">
                    <span className={"tag" + (n.companySituation.toLowerCase().includes("ativa") ? " teal" : " warn")}>
                      <TypedText text={humanize(n.companySituation)} speed={46} delay={140} />
                    </span>
                  </span>
                </div>
              )}
            </div>
          </LockGate>
        )}

        {n.email && !n.channel && (
          <div className="row dn-kv-row">
            <span className="k" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <I d={ICONS.mail} size={13} /> E-mail
            </span>
            <span className="v"><TypedText text={n.email} speed={44} delay={40} /></span>
          </div>
        )}

        {n.channel && (
          <div className="row dn-kv-row">
            <span className="k" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <I d={ICONS.msg} size={13} /> Canal
            </span>
            <span className="v"><span className="chan wa"><TypedText text={humanize(n.channel)} speed={46} delay={40} /></span></span>
          </div>
        )}

        {kvExtra}
      </div>
    );
  }

  function renderKvMain() {
    if (!n) return null;
    return (
      <div className="kv">
        {(n.valueLabel != null || n.value != null) && (
          <div className="row dn-kv-row">
            <span className="k">Valor</span>
            <span className="v is-strong">
              <TypedText text={String(n.valueLabel ?? n.value ?? "—")} speed={50} delay={0} />
            </span>
          </div>
        )}
        {n.productName && (
          <div className="row dn-kv-row">
            <span className="k">Produto</span>
            <span className="v"><TypedText text={n.productName} speed={46} delay={40} /></span>
          </div>
        )}
        {n.rating != null && (
          <div className="row dn-kv-row">
            <span className="k">Avaliação</span>
            <span className="v">
              <TypedText text={`★ ${n.rating.toFixed(1)}${n.reviews ? ` · ${n.reviews} avaliações` : ""}`} speed={46} delay={60} />
            </span>
          </div>
        )}
        {n.nextAction && (
          <div className="row dn-kv-row">
            <span className="k" style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
              <I d={ICONS.clock} size={11} /> Próxima ação
            </span>
            <span className="v"><TypedText text={n.nextAction} speed={46} delay={80} /></span>
          </div>
        )}
        {n.lastResult && (
          <div className="row dn-kv-row">
            <span className="k" style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
              <I d={ICONS.bolt} size={11} /> Último resultado
            </span>
            <span className="v"><TypedText text={n.lastResult} speed={46} delay={100} /></span>
          </div>
        )}
      </div>
    );
  }

  function renderSale() {
    if (!n || !n.sale || n.sale.status === "none") return null;
    const s = n.sale;
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <span className="dn-section-head">
          <I d={ICONS.money} size={11} /> Venda
        </span>
        <div className="kv">
          <div className="row dn-kv-row">
            <span className="k">Status</span>
            <span className="v">
              <span className={"tag" + (s.status === "sale_confirmed" ? " teal" : s.status === "canceled" ? " warn" : "")}>
                {s.statusLabel || humanize(s.status)}
              </span>
            </span>
          </div>
          <div className="row dn-kv-row">
            <span className="k">Valor fechado</span>
            <span className="v is-strong">
              <TypedText text={s.valueLabel ?? (s.value != null ? fmtMoney(s.value) : "—")} speed={46} delay={40} />
            </span>
          </div>
          <div className="row dn-kv-row">
            <span className="k">Comissão</span>
            <span className="v">
              {s.commissionLabel ?? s.commissionStatusLabel ?? "—"}
              {s.commissionValueLabel && (
                <span className="hbx-mono" style={{ marginLeft: 6 }}>{s.commissionValueLabel}</span>
              )}
              {!s.commissionValueLabel && s.commissionAmount != null && (
                <span className="hbx-mono" style={{ marginLeft: 6 }}>{fmtMoney(s.commissionAmount)}</span>
              )}
            </span>
          </div>
          {s.commissionRecurring && (
            <div className="row dn-kv-row">
              <span className="k">Tipo</span>
              <span className="v"><span className="tag teal">Recorrente</span></span>
            </div>
          )}
          {s.commissionDueAt && (
            <div className="row dn-kv-row">
              <span className="k">Vence</span>
              <span className="v"><TypedText text={fmtDate(s.commissionDueAt)} speed={46} delay={60} /></span>
            </div>
          )}
          {s.setupLabel && (
            <div className="row dn-kv-row">
              <span className="k">Implantação</span>
              <span className="v"><TypedText text={s.setupLabel} speed={46} delay={80} /></span>
            </div>
          )}
          {!s.setupLabel && s.setupValue != null && s.setupValue > 0 && (
            <React.Fragment>
              <div className="row dn-kv-row">
                <span className="k">Implantação</span>
                <span className="v">{fmtMoney(s.setupValue)}</span>
              </div>
              <div className="row dn-kv-row">
                <span className="k">Comissão implantação</span>
                <span className="v">
                  {s.setupCommissionStatusLabel || "—"}
                  {s.setupCommissionAmount != null ? ` · ${fmtMoney(s.setupCommissionAmount)}` : ""}
                </span>
              </div>
            </React.Fragment>
          )}
        </div>
        {s.commissionNote && (
          <div className="ctx-note">
            <span className="ctx-note-lbl">Nota</span>
            <p className="ctx-note-txt">{s.commissionNote}</p>
          </div>
        )}
      </div>
    );
  }

  function renderObs() {
    if (!n) return null;
    return (
      <>
        {!loading && onObsChange && (
          <div className="dn-obs-block">
            <h3>Observações</h3>
            <textarea
              className="field-dark"
              rows={3}
              maxLength={500}
              placeholder="Anotações deste contato…"
              value={obsDraft ?? ""}
              onChange={e => onObsChange(e.target.value)}
              style={{ resize: "vertical", paddingTop: 8, paddingBottom: 8 }}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
              {onSemInteresse ? (
                <span style={{ position: "relative", display: "grid" }}>
                  {n.doNotCall ? (
                    <button className="btn-ghost" onClick={onToggleDoNotCall}>Liberar contato</button>
                  ) : (
                    <button className="btn-ghost" onClick={() => setSemInteresseOpen(o => !o)}>
                      Sem interesse ▾
                    </button>
                  )}
                  {semInteresseOpen && !n.doNotCall && (
                    <div className="hbx-pop" style={{ position: "absolute", left: 0, bottom: "calc(100% + 4px)", zIndex: 30, minWidth: 210, padding: 6, display: "grid", gap: 2 }}>
                      {[
                        { key: "sem_interesse", label: "Sem interesse geral" },
                        { key: "ja_tem", label: "Já tem solução" },
                        { key: "preco", label: "Preço alto demais" },
                        { key: "sem_perfil", label: "Fora do perfil" },
                        { key: "nao_ligar", label: "Não ligar mais" },
                      ].map(({ key, label }) => (
                        <button key={key} className="nav-item" style={{ minHeight: 32, textAlign: "left" }}
                          onClick={() => { setSemInteresseOpen(false); onSemInteresse(key); }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </span>
              ) : onToggleDoNotCall ? (
                <button className="btn-ghost" onClick={onToggleDoNotCall}>
                  {n.doNotCall ? "Liberar contato" : "Não ligar mais"}
                </button>
              ) : null}
              {onObsSave && (
                <button className="btn-teal" style={{ minHeight: 36 }} disabled={obsBusy} onClick={onObsSave}>
                  {obsBusy ? "Salvando…" : "Salvar"}
                </button>
              )}
            </div>
          </div>
        )}
      </>
    );
  }

  function renderIntelligence() {
    if (!n || !li) return null;
    const hasOpportunityReason = Boolean(li.opportunityReason);
    const hasPainPitch = Boolean(li.painPitch);
    const hasMessageTemplate = Boolean(li.messageTemplate);
    const hasLeadReasonTags = Array.isArray(li.leadReasonTags) && li.leadReasonTags.length > 0;
    const hasPainType = Boolean(li.painType);

    if (!hasOpportunityReason && !hasPainPitch && !hasMessageTemplate && !hasLeadReasonTags && !hasPainType) {
      return null;
    }

    const content = (
      <div style={{ display: "grid", gap: 10 }}>
        <span className="dn-section-head">Inteligência do lead</span>

        {hasLeadReasonTags && (
          <div className="dn-chip-row">
            {(li.leadReasonTags as string[]).map(tag => (
              <span key={tag} className="tag">{humanize(tag)}</span>
            ))}
          </div>
        )}

        {hasPainType && (
          <div className="row dn-kv-row">
            <span className="k">Tipo de dor</span>
            <span className="v"><TypedText text={humanize(li.painType)} speed={46} delay={0} /></span>
          </div>
        )}

        {hasOpportunityReason && (
          <CollapsibleText label="Por que é oportunidade" text={li.opportunityReason!} />
        )}
        {hasPainPitch && (
          <CollapsibleText label="Pitch de dor" text={li.painPitch!} />
        )}
        {hasMessageTemplate && (
          <CollapsibleText label="Modelo de mensagem" text={li.messageTemplate!} />
        )}
      </div>
    );
    return <LockGate locked={!canSeeIntelligence} ctaText="Disponível no HBX Lead+/Pro">{content}</LockGate>;
  }

  function renderOrigin() {
    if (!n) return null;
    const hasOrigin = Boolean(n.sourceType || n.primarySource);
    if (!hasOrigin) return null;
    return (
      <div className="kv">
        <div className="row dn-kv-row">
          <span className="k">Origem</span>
          <span className="v">
            <span className="tag teal">
              <TypedText text={fmtSourceLabel(n.sourceType, n.primarySource)} speed={46} delay={0} />
            </span>
          </span>
        </div>
      </div>
    );
  }

  function renderDates() {
    if (!n) return null;
    if (!n.createdAt) return null;
    return (
      <div className="kv">
        <div className="row dn-kv-row">
          <span className="k">Criado em</span>
          <span className="v chip"><TypedText text={fmtDateTime(n.createdAt)} speed={46} delay={0} /></span>
        </div>
      </div>
    );
  }

  function renderHistoryList(entries: NegocioDetailHistory[]) {
    return (
      <ul className="ctx-timeline">
        {entries.map(ev => (
          <li className="ctx-tl-item" key={ev.id}>
            <span className="ctx-tl-dot" aria-hidden="true" />
            <div className="ctx-tl-body">
              <span className="ctx-tl-title">{ev.title || "Atualização"}</span>
              {ev.description && <span className="ctx-tl-desc">{ev.description}</span>}
              <div className="ctx-tl-foot">
                {ev.resultLabel && <span className="tag teal">{ev.resultLabel}</span>}
                {ev.returnAt && <span className="tag warn">Retorno {fmtDate(ev.returnAt)}</span>}
                <span className="ctx-tl-when">{fmtDate(ev.createdAt)}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  function renderHistory() {
    if (!n) return null;
    if (loading) {
      return (
        <div className="ctx-sec">
          <h3 style={{ margin: 0 }}>{historyLabel}</h3>
          <div style={{ display: "grid", gap: 12, marginTop: 4 }}>
            {[75, 60, 80].map((w, i) => (
              <div key={i} style={{ display: "grid", gap: 5 }}>
                <span className="dn-skel dn-skel-md" style={{ width: `${w}%` }} />
                <span className="dn-skel dn-skel-sm dn-skel-w45" />
              </div>
            ))}
          </div>
        </div>
      );
    }
    const hist = n.history;
    if (!hist || hist.length === 0) {
      return (
        <div className="ctx-sec">
          <h3 style={{ margin: 0 }}>{historyLabel}</h3>
          <p className="muted-note">Sem histórico ainda.</p>
        </div>
      );
    }
    const preview = hist.slice(0, 3);
    const hasMore = hist.length > 3;
    return (
      <div className="dn-history">
        <div className="dn-history-head">
          <span className="dn-history-title">{historyLabel}</span>
          {hasMore && (
            <button
              type="button"
              className="link dn-history-toggle"
              onClick={() => setInternalTab(internalTab === 0 ? 1 : 0)}
            >
              {internalTab === 0 ? `Ver todas (${hist.length})` : "← Voltar"}
            </button>
          )}
        </div>
        {internalTab === 0 ? renderHistoryList(preview) : renderHistoryList(hist)}
      </div>
    );
  }

  function renderDetalhes() {
    if (!n) return null;
    const hasReturnAt = n.returnAt !== undefined;
    const hasLastContact = n.lastContactAt !== undefined;
    const hasLastMsg = n.lastMessageAt !== undefined;
    const hasAttempts = n.attemptCount != null;
    const hasOwner = Boolean(n.owner?.name);
    const hasSeen = n.timesSeen != null && n.timesSeen > 1;
    const hasRecChannel = Boolean(recChannel);
    const hasQuality = Boolean(li?.contactQuality && li.contactQuality !== "review");
    const hasHistory = Boolean(n.history);

    const hasAnyKv = hasReturnAt || hasLastContact || hasLastMsg || hasAttempts || hasOwner || hasSeen || hasRecChannel || hasQuality;
    if (!hasAnyKv && !hasHistory) return null;

    return (
      <div style={{ display: "grid", gap: 12 }}>
        {hasAnyKv && (
          <div className="kv">
            {hasRecChannel && (
              <LockGate locked={!canSeeIntelligence} ctaText="Disponível no HBX Lead+/Pro">
                <div className="row dn-kv-row">
                  <span className="k">Canal recomendado</span>
                  <span className="v">
                    <CanalIcon canal={recChannel!} size="sm" />{" "}
                    <TypedText text={humanize(recChannel)} speed={46} delay={0} />
                  </span>
                </div>
              </LockGate>
            )}
            {hasQuality && (
              <div className="row dn-kv-row">
                <span className="k">Qualidade de contato</span>
                <span className="v">
                  <span className={"tag" + (li!.contactQuality === "blocked" ? " red" : "")}>
                    {humanize(li!.contactQuality)}
                  </span>
                </span>
              </div>
            )}
            {hasReturnAt && (
              <div className="row dn-kv-row">
                <span className="k">Próximo retorno</span>
                <span className={"v chip" + (n.returnAt ? "" : " is-empty")}>
                  <TypedText text={fmtDate(n.returnAt)} speed={50} delay={0} />
                </span>
              </div>
            )}
            {hasLastContact && (
              <div className="row dn-kv-row">
                <span className="k">Último contato</span>
                <span className={"v chip" + (n.lastContactAt ? "" : " is-empty")}>
                  <TypedText text={fmtDate(n.lastContactAt)} speed={50} delay={40} />
                </span>
              </div>
            )}
            {hasLastMsg && (
              <div className="row dn-kv-row">
                <span className="k">Última mensagem</span>
                <span className="v chip"><TypedText text={fmtDateTime(n.lastMessageAt)} speed={46} delay={80} /></span>
              </div>
            )}
            {hasAttempts && (
              <div className="row dn-kv-row">
                <span className="k">Tentativas</span>
                <span className={"v chip" + (n.attemptCount! > 0 ? "" : " is-empty")}>
                  <TypedText text={String(n.attemptCount)} speed={50} delay={120} />
                </span>
              </div>
            )}
            {hasSeen && (
              <div className="row dn-kv-row">
                <span className="k">Visto</span>
                <span className="v chip"><TypedText text={`${n.timesSeen}×`} speed={50} delay={140} /></span>
              </div>
            )}
            {hasOwner && (
              <div className="row dn-kv-row">
                <span className="k">Responsável</span>
                <span className="v" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <Av name={n.owner!.name!} size={18} />
                  <TypedText text={n.owner!.name!} speed={50} delay={160} />
                </span>
              </div>
            )}
          </div>
        )}
        {hasHistory && renderHistory()}
      </div>
    );
  }

  function renderActions() {
    if (!actions) return null;
    return <div className="dn-actions">{actions}</div>;
  }

  // ── Mapa de seções secundárias ───────────────────────────────────────────

  const sectionMap: Record<string, React.ReactNode> = {
    detalhes: !loading ? renderDetalhes() : null,
    intelligence: !loading ? renderIntelligence() : null,
    origin: !loading ? renderOrigin() : null,
    dates: !loading ? renderDates() : null,
  };

  const secondarySections = CARD_SECONDARY.map(k => sectionMap[k]).filter(Boolean);

  // Zona 1 premium: score + teaser (só mostrar box se tem conteúdo)
  const scoreNode = renderScore();
  const teaserNode = renderOpportunityTeaser();
  const hasZone1Intel = Boolean(scoreNode || teaserNode);

  // Costura: só mostra se zona 2 tem conteúdo relevante
  const hasZone2 = Boolean(actions || n?.returnAt || n?.attemptCount != null || n?.owner?.name || n?.valueLabel || n?.value || n?.sale);

  return (
    <div className="dn-root">

      {/* ── Título com fechar ─────────────────────────────────────────── */}
      <h3>
        {title}
        {onClose && (
          <span className="x" onClick={onClose} role="button" aria-label="Fechar painel">✕</span>
        )}
      </h3>

      {/* ── Empty state ───────────────────────────────────────────────── */}
      {!n && (
        <div className="ctx-empty">
          <span className="ctx-empty__icon">←</span>
          <span className="ctx-empty__hint">{emptyHint || "Selecione um item para ver os detalhes."}</span>
        </div>
      )}

      {/* ── Conteúdo ─────────────────────────────────────────────────── */}
      {n && (
        <>
          {lightboxSrc && <PhotoLightbox src={lightboxSrc} name={n.name || undefined} onClose={() => setLightboxSrc(null)} />}

          {/* ── ZONA 1 "Quem é" ─────────────────────────────────────── */}
          <div className="dn-zone dn-zone--1">

            {/* Header: avatar + nome + canais */}
            <div className="dn-header">
              <div className="ctx-hero">
                <span
                  onClick={() => { if (n.avatarUrl) setLightboxSrc(n.avatarUrl); }}
                  style={{ cursor: n.avatarUrl ? "zoom-in" : "default", display: "inline-flex" }}
                >
                  <Av name={n.name || "—"} src={n.avatarUrl ?? undefined} online={n.online} size={56} />
                </span>
                <div className="ident">
                  <div className="ident-top">
                    <span className="company" style={{ flex: 1, minWidth: 0 }}>
                      <TypedText text={n.name || "—"} speed={62} delay={0} />
                    </span>
                    {n.enriched && (
                      <span className="dn-crown" title="Lead enriquecido" aria-label="Lead enriquecido">
                        <I d={ICONS.crown} size={15} />
                      </span>
                    )}
                    {crownSlot && <>{crownSlot}</>}
                    {heroAction && <>{heroAction}</>}
                  </div>
                  {(n.segment || !n.city) && (
                    <div className="sub sub--seg">
                      <TypedText text={n.segment || "—"} speed={50} delay={180} />
                    </div>
                  )}
                  {n.city && (
                    <div className="sub sub--loc">
                      <I d={ICONS.mapin} size={11} />{" "}
                      <TypedText text={buildLocationLine(n.city, n.state, n.address)} speed={46} delay={300} />
                    </div>
                  )}
                  <div className="ctx-tags">
                    {n.statusLabel && <span className="tag">{n.statusLabel}</span>}
                    {n.doNotCall && <span className="tag red">Não ligar</span>}
                    {n.leadTemperature && (
                      <span className={"tag" + (n.leadTemperature === "quente" ? " red" : n.leadTemperature === "morno" ? " warn" : "")}>
                        {humanize(n.leadTemperature)}
                      </span>
                    )}
                    {renderStatusChip()}
                    {loading && !n.statusLabel && !n.leadTemperature && (
                      <span className="dn-skel dn-skel-pill" />
                    )}
                  </div>
                </div>
              </div>

              {/* Fileira dos canais tri-cor */}
              <ChannelRow
                n={n}
                onWaExternal={onWaOpenExternal ?? undefined}
                onWaInternal={onWaOpenInternal ?? undefined}
                waQrActive={waQrActive}
                waCanInternal={waCanInternal}
                onDelete={onDelete}
                canSeeIntelligence={canSeeIntelligence}
              />
            </div>

            {/* Score ring + teaser — premium (só se há dados) */}
            {hasZone1Intel && (
              <div className="dn-zone1-intel">
                {scoreNode}
                {teaserNode}
              </div>
            )}

            {/* Contatos + empresa */}
            {renderContacts()}

          </div>

          {/* ── COSTURA "O que fazer" ─────────────────────────────────── */}
          {hasZone2 && (
            <div className="dn-zone-sep">
              <span className="dn-zone-sep__label">O que fazer</span>
            </div>
          )}

          {/* ── ZONA 2 "O que fazer" ──────────────────────────────────── */}
          {hasZone2 && (
            <div className="dn-zone dn-zone--2">
              {loading ? (
                <div className="kv">
                  <div className="row"><span className="k">Etapa</span><span className="v"><span className="dn-skel dn-skel-pill" /></span></div>
                  <div className="row"><span className="k">Próxima ação</span><span className="v"><span className="dn-skel dn-skel-md dn-skel-w60" /></span></div>
                  <div className="row"><span className="k">Valor</span><span className="v"><span className="dn-skel dn-skel-sm dn-skel-w45" /></span></div>
                </div>
              ) : (
                <>
                  {renderKvMain()}
                  {renderSale()}
                  {renderObs()}
                  {renderActions()}
                </>
              )}
            </div>
          )}

          {/* ── SEPARADOR + CHEVRON "Mais detalhes" ─────────────────── */}
          {secondarySections.length > 0 && (
            <>
              <div className="sep" />
              <button
                className={"dn-expand-btn" + (expanded ? " is-open" : "")}
                type="button"
                onClick={() => setExpanded(o => !o)}
                aria-expanded={expanded}
              >
                <ChevronDown />
                Mais detalhes
              </button>
            </>
          )}

          {/* ── SEÇÕES SECUNDÁRIAS (sob o chevron) ───────────────────── */}
          {expanded && secondarySections.map((section, idx) => (
            <React.Fragment key={idx}>{section}</React.Fragment>
          ))}
        </>
      )}

    </div>
  );
}

// ── Compat: inline WA button ──────────────────────────────────────────────────

import { WhatsAppActionButton } from "@/components/hbx/whatsapp-action";

export function LegacyWaButton({
  phone,
  name,
  qrActive,
  canInternal,
  onOpenExternal,
  onOpenInternal,
  startBusy,
  startError,
}: {
  phone?: string | null;
  name?: string | null;
  qrActive: boolean;
  canInternal: boolean;
  onOpenExternal: () => void;
  onOpenInternal: () => void;
  startBusy?: boolean;
  startError?: string | null;
}) {
  return (
    <WhatsAppActionButton
      phone={phone}
      name={name}
      qrActive={qrActive}
      canInternal={canInternal}
      onOpenExternal={onOpenExternal}
      onOpenInternal={onOpenInternal}
      startBusy={startBusy}
      startError={startError}
    />
  );
}
