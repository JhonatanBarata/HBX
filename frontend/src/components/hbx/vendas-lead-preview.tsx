"use client";

import type { CSSProperties } from "react";

import type { VendasLead } from "@/app/(app)/vendas/page.client";
import { CANAL_LABEL, CanalIcon } from "@/components/hbx/canal-icon";
import { Av, I, ICONS } from "@/components/hbx/shell";
import { formatBrPhone, onlyDigits } from "@/lib/br-phone";
import { formatBrCnpj } from "@/lib/br-document";
import type { RadarChannel } from "@/lib/radar-channel-presence";
import { vendasCanais } from "@/lib/vendas-channels";
import { buildWaLink } from "@/lib/wa-link";

const ETAPAS: Record<string, string> = {
  novo: "Planejar",
  contato: "Automação",
  retorno: "Retorno",
  qualificado: "Negociação",
  encerrado: "Fechado",
};

function etapaLabel(status: string | null | undefined): string {
  return ETAPAS[String(status || "").toLowerCase()] || "Planejar";
}

function linkExterno(value: string | null | undefined): string | null {
  const link = String(value || "").trim();
  if (!link) return null;
  return /^https?:\/\//i.test(link) ? link : `https://${link}`;
}

function linkRede(value: string | null | undefined, rede: "instagram" | "facebook"): string | null {
  const link = String(value || "").trim();
  if (!link) return null;
  if (/^https?:\/\//i.test(link)) return link;
  return `https://${rede}.com/${link.replace(/^@/, "")}`;
}

function dataContato(value: string | null | undefined): string {
  if (!value) return "Sem contato";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sem contato";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function VendasLeadPreview({
  lead,
  onClose,
  onExpand,
}: {
  lead: VendasLead | null;
  onClose: () => void;
  onExpand: () => void;
}) {
  if (!lead) {
    return (
      <aside className="vnd-lead-peek hbx-panel-shell__context" aria-label="Radar HBX">
        <header className="vnd-lead-peek__head">
          <span>Radar HBX</span>
          <span className="vnd-lead-peek__state">Pronto</span>
        </header>
        <div className="vnd-lead-peek__empty">
          <span className="vnd-lead-peek__radar" aria-hidden="true" />
          <strong>Radar pronto</strong>
        </div>
      </aside>
    );
  }

  const intelligence = lead.leadIntelligence;
  const telefone = lead.phone || lead.phones?.find(Boolean) || null;
  const email = lead.email || lead.emails?.find(Boolean) || null;
  const numeroWhatsApp = Object.entries(lead.phonesWhatsapp || {}).find(([, confirmado]) => confirmado)?.[0]
    || (intelligence?.whatsappStatus === "confirmed" ? telefone : null);
  const canais = vendasCanais(lead);
  const links: Partial<Record<RadarChannel, string | null>> = {
    whatsapp: buildWaLink(numeroWhatsApp),
    telefone: telefone ? `tel:${onlyDigits(telefone)}` : null,
    email: email ? `mailto:${email}` : null,
    instagram: linkRede(intelligence?.instagramUrl || lead.ownerInstagram, "instagram"),
    facebook: linkRede(intelligence?.facebookUrl || lead.ownerFacebook, "facebook"),
    site: linkExterno(lead.website),
  };

  const score = Math.max(0, Math.min(100, Math.round(Number(lead.opportunityScore) || 0)));
  const scoreStyle = { "--vnd-lead-score-angle": `${score * 3.6}deg` } as CSSProperties;
  const cidade = lead.city ? `${lead.city}${lead.state ? `/${lead.state}` : ""}` : "—";
  const meta = [lead.segment, cidade !== "—" ? cidade : null].filter(Boolean).join(" · ") || "Empresa";
  const cnpj = lead.cnpj ? (formatBrCnpj(lead.cnpj) || lead.cnpj) : "—";
  const etapa = etapaLabel(lead.status);

  return (
    <aside className="vnd-lead-peek hbx-panel-shell__context has-lead" aria-label={`Detalhes de ${lead.name || "lead"}`} aria-live="polite">
      <header className="vnd-lead-peek__head">
        <span>Detalhes do lead</span>
        <span className="vnd-lead-peek__head-actions">
          <span className="vnd-lead-peek__state">{etapa}</span>
          <button type="button" className="vnd-lead-peek__close" onClick={onClose} aria-label="Fechar detalhes">✕</button>
        </span>
      </header>

      <div className="vnd-lead-peek__body">
        <section className="vnd-lead-peek__hero">
          <Av name={lead.name || "Lead"} size={48} />
          <span className="vnd-lead-peek__identity">
            <strong title={lead.name || undefined}>{lead.name || "—"}</strong>
            <small title={meta}>{meta}</small>
          </span>
          <span
            className={"vnd-lead-peek__score" + (score ? "" : " is-empty")}
            style={scoreStyle}
            role="img"
            aria-label={score ? `Score ${score}` : "Score indisponível"}
          >
            <b>{score || "—"}</b>
          </span>
        </section>

        <section className="vnd-lead-peek__channels" aria-label="Canais encontrados">
          {canais.map((canal) => {
            const href = links[canal];
            const externo = canal === "whatsapp" || canal === "instagram" || canal === "facebook" || canal === "site";
            const icon = <CanalIcon canal={canal} size="lg" />;
            return href ? (
              <a
                key={canal}
                className="vnd-lead-peek__channel"
                href={href}
                target={externo ? "_blank" : undefined}
                rel={externo ? "noopener noreferrer" : undefined}
                title={CANAL_LABEL[canal]}
                aria-label={`Abrir ${CANAL_LABEL[canal]}`}
              >
                {icon}
              </a>
            ) : (
              <span key={canal} className="vnd-lead-peek__channel is-static" title={CANAL_LABEL[canal]}>
                {icon}
              </span>
            );
          })}
          {canais.length === 0 && <span className="vnd-lead-peek__missing">Nenhum canal localizado</span>}
        </section>

        <section className="vnd-lead-peek__facts">
          <span><small>Etapa</small><strong>{etapa}</strong></span>
          <span><small>Responsável</small><strong>{lead.owner?.name || "Sem responsável"}</strong></span>
          <span><small>Último contato</small><strong>{dataContato(lead.lastContactAt)}</strong></span>
        </section>

        <section className="vnd-lead-peek__next">
          <span className="vnd-lead-peek__next-icon"><I d={ICONS.bolt} size={17} /></span>
          <span>
            <small>Próximo passo</small>
            <strong>{lead.nextAction || "Primeiro contato"}</strong>
          </span>
        </section>

        <section className="vnd-lead-peek__facts">
          <span><small>CNPJ</small><strong className="hbx-mono">{cnpj}</strong></span>
          <span><small>Cidade</small><strong>{cidade}</strong></span>
          {telefone && <span><small>Telefone</small><strong className="hbx-mono">{formatBrPhone(telefone)}</strong></span>}
        </section>

        <button type="button" className="vnd-lead-peek__expand" onClick={onExpand}>
          Abrir ficha completa
          <I d={ICONS.arrow} size={16} />
        </button>
      </div>
    </aside>
  );
}
