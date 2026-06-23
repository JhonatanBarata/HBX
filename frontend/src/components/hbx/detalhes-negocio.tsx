"use client";

// ┌─────────────────────────────────────────────────────────────────────────────┐
// │  DetalhesNegocio — card unificado (3 telas: Vendas, Atendimento, Leads)    │
// │                                                                             │
// │  ORDEM DAS SEÇÕES (CARD_PRIMARY / CARD_SECONDARY)                          │
// │  Para reordenar ou ocultar seções por tela/status no futuro:               │
// │    1. Edite os arrays CARD_PRIMARY e CARD_SECONDARY abaixo.                │
// │    2. Cada entrada é uma chave do objeto `sections` no render.             │
// │    3. CARD_PRIMARY = sempre visível; CARD_SECONDARY = sob o chevron.       │
// │  Não há ordem por status agora — uma ordem padrão única.                   │
// └─────────────────────────────────────────────────────────────────────────────┘

// REGRA SAGRADA: o efeito de máquina de escrever vive nas classes
// .dn-root / .dn-kv-row / .dn-skel (transitions.css + kit.css).
// NÃO editar essas classes. Todo campo novo entra na estrutura .dn-kv-row
// para herdar o efeito automaticamente.

import React, { useEffect, useState } from "react";

import { Av, I, ICONS, PhotoLightbox } from "@/components/hbx/shell";
import { CanalIcon, type Canal, toCanal } from "@/components/hbx/canal-icon";
import { useWaOpenMode } from "@/lib/wa-open-mode";

// ── Ordem configurável das seções ─────────────────────────────────────────────
// Seções primárias: sempre visíveis abaixo do header
const CARD_PRIMARY: string[] = [
  "score",
  "contacts",
  "kv_main",
  "sale",
  "obs",
];

// Seções secundárias: ocultas sob o chevron "ver tudo"
const CARD_SECONDARY: string[] = [
  "intelligence",
  "origin",
  "dates",
  "history",
  "actions",
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
  if (src === "webscraping") return "Radar Digital";
  if (src === "manual") return "Manual";
  if (src) return src.charAt(0).toUpperCase() + src.slice(1);
  return "—";
}

// ── TypedText — efeito de digitação letra por letra ───────────────────────────

// Core remonta via key={text} no wrapper — sem reset de state no effect
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
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"
          style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.16s" }}>
          <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {label}
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

// ── Fileira dos 6 ícones de canal — SEMPRE presentes ─────────────────────────

const CANAIS_ORDEM: Canal[] = ["whatsapp", "telefone", "email", "instagram", "facebook", "site"];

function ChannelRow({
  n,
  onWaExternal,
  onWaInternal,
  waQrActive,
  waCanInternal,
  onDelete,
}: {
  n: NegocioDetail;
  onWaExternal?: () => void;
  onWaInternal?: () => void;
  waQrActive?: boolean;
  waCanInternal?: boolean;
  onDelete?: () => void;
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

  function hasData(canal: Canal): boolean {
    switch (canal) {
      case "whatsapp":
        return Boolean(n.phone && (li?.whatsappStatus === "confirmed" || !li));
      case "telefone":
        return Boolean(n.phone);
      case "email":
        return Boolean(n.email || li?.emailStatus === "confirmed" || li?.emailStatus === "probable");
      case "instagram":
        return Boolean(li?.instagramUrl);
      case "facebook":
        return Boolean(li?.facebookUrl);
      case "site":
        return Boolean(n.website || li?.websiteStatus === "confirmed");
      default:
        return false;
    }
  }

  return (
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
        const active = hasData(canal);
        const href = active ? getHref(canal) : null;
        const isExternal = canal === "instagram" || canal === "facebook" || canal === "site" || canal === "whatsapp";

        if (!active) {
          return (
            <span key={canal} className="chan-ico--off" aria-label={`Sem ${canal}`}>
              <CanalIcon canal={canal} size="xl" />
            </span>
          );
        }

        // WhatsApp: usa modo interno/externo quando callbacks disponíveis
        if (canal === "whatsapp" && (onWaExternal || onWaInternal)) {
          return (
            <span key={canal} style={{ cursor: "pointer" }}
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
              target={isExternal ? "_blank" : undefined}
              rel={isExternal ? "noopener noreferrer" : undefined}
              aria-label={canal.charAt(0).toUpperCase() + canal.slice(1)}
            >
              <CanalIcon canal={canal} size="xl" />
            </a>
          );
        }

        return (
          <span key={canal}>
            <CanalIcon canal={canal} size="xl" />
          </span>
        );
      })}
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
  waPhone,
  waName,
  waQrActive = false,
  waCanInternal = false,
  onWaOpenExternal,
  onWaOpenInternal,
  waStartBusy,
  waStartError,
  obsDraft,
  onObsChange,
  onObsSave,
  obsBusy,
  onToggleDoNotCall,
  historyLabel = "Histórico",
  kvExtra,
  onDelete,
}: DetalhesNegocioProps) {
  const n = detail !== undefined ? detail : (negocio !== undefined ? negocio : null);
  const [internalTab, setInternalTab] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const hasLegacyWa = Boolean(onWaOpenExternal || onWaOpenInternal);

  const li = n?.leadIntelligence;
  const recChannel = li?.recommendedChannel ? toCanal(li.recommendedChannel) : null;

  // ── Renderizadores de seção ───────────────────────────────────────────────

  function renderScore() {
    if (!n) return null;
    if (n.opportunityScore == null || n.opportunityScore <= 0) return null;
    return (
      <div className="ctx-score">
        <div className="ctx-score-head">
          <span className="ctx-score-label">Oportunidade</span>
          <span className="ctx-score-num">{n.opportunityScore}<small>/100</small></span>
        </div>
        <div className="ctx-score-track">
          <div className="ctx-score-fill" style={{ width: `${n.opportunityScore}%` }} />
        </div>
      </div>
    );
  }

  function renderContacts() {
    if (!n) return null;
    return (
      <div style={{ display: "grid", gap: 6 }}>
        {/* Telefone hero */}
        {n.phone ? (
          <a href={`tel:${n.phone.replace(/[^\d+]/g, "")}`} className="ctx-phone">
            <CanalIcon canal="telefone" /> {n.phone}
          </a>
        ) : !loading ? (
          <div className="dn-no-phone muted-note">Sem telefone neste card.</div>
        ) : null}

        {/* Site hero */}
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

        {/* Canal recomendado */}
        {recChannel && (
          <div className="row dn-kv-row">
            <span className="k">Canal recomendado</span>
            <span className="v">
              <CanalIcon canal={recChannel} size="sm" />{" "}
              <TypedText text={recChannel.charAt(0).toUpperCase() + recChannel.slice(1)} speed={46} delay={0} />
            </span>
          </div>
        )}

        {/* Endereço */}
        {n.address && (
          <div className="row dn-kv-row">
            <span className="k">Endereço</span>
            <span className="v"><TypedText text={n.address} speed={42} delay={40} /></span>
          </div>
        )}

        {/* CNPJ */}
        {n.cnpj && (
          <div className="row dn-kv-row">
            <span className="k">CNPJ</span>
            <span className="v hbx-mono"><TypedText text={n.cnpj} speed={46} delay={60} /></span>
          </div>
        )}

        {/* E-mail */}
        {n.email && !n.channel && (
          <div className="row dn-kv-row">
            <span className="k" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <I d={ICONS.mail} size={13} /> E-mail
            </span>
            <span className="v"><TypedText text={n.email} speed={44} delay={40} /></span>
          </div>
        )}

        {/* Canal registrado */}
        {n.channel && (
          <div className="row dn-kv-row">
            <span className="k" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <I d={ICONS.msg} size={13} /> Canal
            </span>
            <span className="v"><span className="chan wa"><TypedText text={n.channel} speed={46} delay={40} /></span></span>
          </div>
        )}

        {/* Qualidade de contato */}
        {li?.contactQuality && li.contactQuality !== "review" && (
          <div className="row dn-kv-row">
            <span className="k">Qualidade de contato</span>
            <span className="v">
              <span className={"tag" + (li.contactQuality === "blocked" ? " red" : "")}>
                {li.contactQuality === "blocked" ? "Bloqueado" : li.contactQuality}
              </span>
            </span>
          </div>
        )}

        {/* isInInbox */}
        {n.isInInbox === true && (
          <div className="row dn-kv-row">
            <span className="k">No Atendimento</span>
            <span className="v"><span className="tag teal">Conversa ativa</span></span>
          </div>
        )}

        {/* Slot extra */}
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
            <span className="k">Próxima ação</span>
            <span className="v"><TypedText text={n.nextAction} speed={46} delay={80} /></span>
          </div>
        )}
        {n.lastResult && (
          <div className="row dn-kv-row">
            <span className="k">Último resultado</span>
            <span className="v"><TypedText text={n.lastResult} speed={46} delay={100} /></span>
          </div>
        )}
        {n.returnAt !== undefined && (
          <div className="row dn-kv-row">
            <span className="k">Próximo retorno</span>
            <span className={"v" + (n.returnAt ? "" : " is-empty")}>
              <TypedText text={fmtDate(n.returnAt)} speed={50} delay={120} />
            </span>
          </div>
        )}
        {n.lastContactAt !== undefined && (
          <div className="row dn-kv-row">
            <span className="k">Último contato</span>
            <span className={"v" + (n.lastContactAt ? "" : " is-empty")}>
              <TypedText text={fmtDate(n.lastContactAt)} speed={50} delay={160} />
            </span>
          </div>
        )}
        {n.lastMessageAt !== undefined && (
          <div className="row dn-kv-row">
            <span className="k">Última mensagem</span>
            <span className="v"><TypedText text={fmtDateTime(n.lastMessageAt)} speed={46} delay={200} /></span>
          </div>
        )}
        {n.attemptCount != null && (
          <div className="row dn-kv-row">
            <span className="k">Tentativas</span>
            <span className={"v hbx-mono" + (n.attemptCount > 0 ? "" : " is-empty")}>
              <TypedText text={String(n.attemptCount)} speed={50} delay={240} />
            </span>
          </div>
        )}
        {n.timesSeen != null && n.timesSeen > 1 && (
          <div className="row dn-kv-row">
            <span className="k">Visto</span>
            <span className="v hbx-mono"><TypedText text={`${n.timesSeen}×`} speed={50} delay={260} /></span>
          </div>
        )}
        {n.botActive !== undefined && n.botActive !== null && (
          <div className="row dn-kv-row">
            <span className="k">Bot</span>
            <span className="v"><TypedText text={n.botActive ? "Ativo" : "Inativo"} speed={50} delay={280} /></span>
          </div>
        )}
        {n.humanAssigned !== undefined && n.humanAssigned !== null && (
          <div className="row dn-kv-row">
            <span className="k">Atendimento humano</span>
            <span className="v"><TypedText text={n.humanAssigned ? "Sim" : "Não"} speed={50} delay={300} /></span>
          </div>
        )}
        {n.owner?.name && (
          <div className="row dn-kv-row">
            <span className="k">Responsável</span>
            <span className="v" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <Av name={n.owner.name} size={18} />
              <TypedText text={n.owner.name} speed={50} delay={320} />
            </span>
          </div>
        )}
      </div>
    );
  }

  function renderSale() {
    if (!n || !n.sale || n.sale.status === "none") return null;
    const s = n.sale;
    return (
      <div className="kv">
        <div className="row dn-kv-row">
          <span className="k">Venda</span>
          <span className="v">
            <span className={"tag" + (s.status === "sale_confirmed" ? " teal" : s.status === "canceled" ? " warn" : "")}>
              {s.statusLabel || s.status}
            </span>
          </span>
        </div>
        <div className="row dn-kv-row">
          <span className="k">Valor fechado</span>
          <span className="v hbx-mono">
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
        {s.commissionNote && (
          <div className="row dn-kv-row">
            <span className="k">Nota</span>
            <span className="v"><TypedText text={s.commissionNote} speed={42} delay={80} /></span>
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
              {onToggleDoNotCall && (
                <button className="btn-ghost" onClick={onToggleDoNotCall}>
                  {n.doNotCall ? "Liberar contato" : "Não ligar mais"}
                </button>
              )}
              {onObsSave && (
                <button className="btn-teal" style={{ minHeight: 36 }} disabled={obsBusy} onClick={onObsSave}>
                  {obsBusy ? "Salvando…" : "Salvar"}
                </button>
              )}
            </div>
          </div>
        )}
        {!loading && !onObsChange && n.shortNote && (
          <div className="ctx-note">
            <span className="ctx-note-lbl"><I d={ICONS.doc} size={12} /> Observação</span>
            <p className="ctx-note-txt">
              <TypedText text={n.shortNote} speed={32} delay={360} />
            </p>
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

    return (
      <div style={{ display: "grid", gap: 10 }}>
        <span className="ctx-note-lbl" style={{ paddingTop: 2 }}>Inteligência do lead</span>

        {hasLeadReasonTags && (
          <div className="dn-chip-row">
            {(li.leadReasonTags as string[]).map(tag => (
              <span key={tag} className="tag">{tag.replace(/_/g, " ")}</span>
            ))}
          </div>
        )}

        {hasPainType && (
          <div className="row dn-kv-row">
            <span className="k">Tipo de dor</span>
            <span className="v"><TypedText text={li.painType!} speed={46} delay={0} /></span>
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
            <TypedText text={fmtSourceLabel(n.sourceType, n.primarySource)} speed={46} delay={0} />
          </span>
        </div>
      </div>
    );
  }

  function renderDates() {
    if (!n) return null;
    if (!n.createdAt && !n.updatedAt) return null;
    return (
      <div className="kv">
        {n.createdAt && (
          <div className="row dn-kv-row">
            <span className="k">Criado em</span>
            <span className="v"><TypedText text={fmtDateTime(n.createdAt)} speed={46} delay={0} /></span>
          </div>
        )}
        {n.updatedAt && (
          <div className="row dn-kv-row">
            <span className="k">Atualizado em</span>
            <span className="v"><TypedText text={fmtDateTime(n.updatedAt)} speed={46} delay={40} /></span>
          </div>
        )}
      </div>
    );
  }

  function renderHistory() {
    if (!n) return null;
    return (
      <div className="dn-history">
        {loading ? (
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
        ) : n.history && n.history.length > 3 ? (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>Últimas interações</h3>
              <span
                className="link"
                style={{ fontWeight: 700, fontSize: "0.72rem", cursor: "pointer" }}
                onClick={() => setInternalTab(internalTab === 0 ? 1 : 0)}
              >
                {internalTab === 0 ? `Ver todas (${n.history.length})` : "← Voltar"}
              </span>
            </div>
            {internalTab === 0 ? (
              <ul className="ctx-timeline">
                {n.history.slice(0, 3).map(ev => (
                  <li className="ctx-tl-item" key={ev.id}>
                    <span className="ctx-tl-dot" aria-hidden="true" />
                    <div className="ctx-tl-body">
                      <span className="ctx-tl-title">
                        {ev.title || "Atualização"}{ev.resultLabel ? ` · ${ev.resultLabel}` : ""}
                      </span>
                      {ev.description && <span className="ctx-tl-desc">{ev.description}</span>}
                      <span className="ctx-tl-when">{fmtDate(ev.createdAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="dn-history-full">
                <h3 style={{ margin: "0 0 8px" }}>{historyLabel}</h3>
                {n.history.map(h => (
                  <div key={h.id} style={{ display: "grid", gap: 3, marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                      <strong style={{ fontSize: "0.76rem" }}>{h.title || "Atualização"}</strong>
                      <small className="sub" style={{ marginTop: 0, whiteSpace: "nowrap" }}>{fmtDateTime(h.createdAt)}</small>
                    </div>
                    {h.description && <span className="sub" style={{ marginTop: 0 }}>{h.description}</span>}
                    {(h.resultLabel || h.returnAt) && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {h.resultLabel && <span className="tag teal">{h.resultLabel}</span>}
                        {h.returnAt && <span className="tag warn">Retorno {fmtDateTime(h.returnAt)}</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="ctx-sec">
            <h3 style={{ margin: 0 }}>{historyLabel}</h3>
            {(!n.history || n.history.length === 0) ? (
              <p className="muted-note">Sem histórico ainda.</p>
            ) : (
              <ul className="ctx-timeline">
                {n.history.map(ev => (
                  <li className="ctx-tl-item" key={ev.id}>
                    <span className="ctx-tl-dot" aria-hidden="true" />
                    <div className="ctx-tl-body">
                      <span className="ctx-tl-title">
                        {ev.title || "Atualização"}{ev.resultLabel ? ` · ${ev.resultLabel}` : ""}
                      </span>
                      {ev.description && <span className="ctx-tl-desc">{ev.description}</span>}
                      <span className="ctx-tl-when">{fmtDate(ev.createdAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderActions() {
    if (!actions) return null;
    return <div className="dn-actions">{actions}</div>;
  }

  // ── Mapa de seções ───────────────────────────────────────────────────────

  const sectionMap: Record<string, React.ReactNode> = {
    score: renderScore(),
    contacts: renderContacts(),
    kv_main: loading
      ? (
        <div className="kv">
          <div className="row"><span className="k">Etapa</span><span className="v"><span className="dn-skel dn-skel-pill" /></span></div>
          <div className="row"><span className="k">Próxima ação</span><span className="v"><span className="dn-skel dn-skel-md dn-skel-w60" /></span></div>
          <div className="row"><span className="k">Próximo retorno</span><span className="v"><span className="dn-skel dn-skel-sm dn-skel-w45" /></span></div>
          <div className="row"><span className="k">Último contato</span><span className="v"><span className="dn-skel dn-skel-sm dn-skel-w45" /></span></div>
          <div className="row"><span className="k">Tentativas</span><span className="v"><span className="dn-skel dn-skel-sm dn-skel-w30" /></span></div>
          <div className="row"><span className="k">Responsável</span><span className="v"><span className="dn-skel dn-skel-sm dn-skel-w60" /></span></div>
        </div>
      )
      : renderKvMain(),
    sale: !loading ? renderSale() : null,
    obs: !loading ? renderObs() : null,
    intelligence: !loading ? renderIntelligence() : null,
    origin: !loading ? renderOrigin() : null,
    dates: !loading ? renderDates() : null,
    history: renderHistory(),
    actions: !loading ? renderActions() : null,
  };

  const primarySections = CARD_PRIMARY.map(k => sectionMap[k]).filter(Boolean);
  const secondarySections = CARD_SECONDARY.map(k => sectionMap[k]).filter(Boolean);

  return (
    <div className="dn-root">

      {/* ── Título com fechar ─────────────────────────────────────────── */}
      <h3>
        {title}
        {onClose && (
          <span className="x" onClick={onClose} role="button" aria-label="Fechar painel">✕</span>
        )}
      </h3>

      {/* ── Empty state — sem item selecionado ───────────────────────── */}
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
          {/* ── HEADER FIXO: avatar + nome + heroAction + coroa + 6 ícones ── */}
          <div className="dn-header">
            <div className="ctx-hero">
              <span
                onClick={() => { if (n.avatarUrl) setLightboxSrc(n.avatarUrl); }}
                style={{ cursor: n.avatarUrl ? "zoom-in" : "default", display: "inline-flex" }}
              >
                <Av
                  name={n.name || "—"}
                  src={n.avatarUrl ?? undefined}
                  online={n.online}
                  size={56}
                />
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
                <div className="sub sub--seg">
                  <TypedText text={n.segment || n.city || "—"} speed={50} delay={180} />
                </div>
                {n.city && n.segment && (
                  <div className="sub sub--loc">
                    <I d={ICONS.mapin} size={11} />{" "}
                    <TypedText text={`${n.city}${n.state ? `, ${n.state}` : ""}`} speed={46} delay={300} />
                  </div>
                )}
                <div className="ctx-tags">
                  {n.statusLabel && <span className="tag">{n.statusLabel}</span>}
                  {n.doNotCall && <span className="tag red">Não ligar</span>}
                  {n.leadTemperature && (
                    <span className={"tag" + (n.leadTemperature === "quente" ? " red" : n.leadTemperature === "morno" ? " warn" : "")}>
                      {n.leadTemperature === "quente" ? "Quente" : n.leadTemperature === "morno" ? "Morno" : "Frio"}
                    </span>
                  )}
                  {n.botActive === true && <span className="tag teal">Bot ativo</span>}
                  {loading && !n.statusLabel && !n.leadTemperature && (
                    <span className="dn-skel dn-skel-pill" />
                  )}
                </div>
              </div>
            </div>

            {/* Fileira dos 6 ícones de canal — SEMPRE presentes */}
            <ChannelRow
              n={n}
              onWaExternal={onWaOpenExternal ?? undefined}
              onWaInternal={onWaOpenInternal ?? undefined}
              waQrActive={waQrActive}
              waCanInternal={waCanInternal}
              onDelete={onDelete}
            />
          </div>

          {/* ── SEÇÕES PRIMÁRIAS (sempre visíveis) ───────────────────── */}
          {primarySections.map((section, idx) => (
            <React.Fragment key={idx}>{section}</React.Fragment>
          ))}

          {/* ── SEPARADOR + CHEVRON ───────────────────────────────────── */}
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
                {expanded ? "Ver menos" : "Ver tudo"}
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

function LegacyWaButton({
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
