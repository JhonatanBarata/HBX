"use client";

import type { CSSProperties } from "react";

import type { VendasLead } from "@/app/(app)/vendas/page.client";
import { CANAL_LABEL, CanalIcon } from "@/components/hbx/canal-icon";
import { vendasEngagementMeta } from "@/components/hbx/detalhes-negocio";
import { Av, I, ICONS } from "@/components/hbx/shell";
import { formatBrPhoneDisplay, onlyDigits } from "@/lib/br-phone";
import { formatBrCnpj } from "@/lib/br-document";
import { formatCityName, formatCityUf } from "@/lib/br-cidade";
import { formatCompanyName } from "@/lib/br-empresa";
import type { RadarChannel } from "@/lib/radar-channel-presence";
import { vendasCanais } from "@/lib/vendas-channels";
import { buildWaLink } from "@/lib/wa-link";

const ETAPAS: Record<string, string> = {
  novo: "Sem contato",
  contato: "Contato feito",
  retorno: "Respondeu",
  qualificado: "Ligação marcada",
  encerrado: "Fechado",
};

function etapaLabel(status: string | null | undefined): string {
  return ETAPAS[String(status || "").toLowerCase()] || "Sem contato";
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

function valorNegocio(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function prioridadeLabel(lead: VendasLead): string {
  if (lead.block === "closed") return "Fechado";
  if (lead.block === "overdue") return "Agora";
  if (lead.block === "today") return "Hoje";
  if (!lead.returnAt) return "Sem data";
  const date = new Date(lead.returnAt);
  return Number.isNaN(date.getTime())
    ? "Sem data"
    : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function temperaturaLabel(value: string | null | undefined): string {
  const text = String(value || "").trim();
  return text ? `${text.charAt(0).toLocaleUpperCase("pt-BR")}${text.slice(1).toLocaleLowerCase("pt-BR")}` : "—";
}

export function VendasLeadPreview({
  lead,
  canViewValues,
  onClose,
  onExpand,
  onSchedule,
}: {
  lead: VendasLead | null;
  canViewValues: boolean;
  onClose: () => void;
  onExpand: () => void;
  onSchedule: () => void;
}) {
  if (!lead) {
    return (
      <aside className="vnd-lead-peek hbx-panel-shell__context is-empty" aria-label="Lead">
        <header className="vnd-lead-peek__head">
          <span>Lead</span>
        </header>
        <div className="vnd-lead-peek__empty">
          <span className="vnd-lead-peek__empty-icon" aria-hidden="true"><I d={ICONS.vendas} size={20} /></span>
          <strong>Selecione um lead</strong>
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
  // Mesma régua da lista (LEI "padronizar = IGUALAR"): a cidade sai saneada
  // pelo catálogo do IBGE e o telefone pela máscara única de leitura.
  const cidade = formatCityUf(lead.city, lead.state) || "—";
  const cidadeSo = formatCityName(lead.city, lead.state) || "—";
  const meta = [lead.segment, cidade !== "—" ? cidade : null].filter(Boolean).join(" · ") || "Empresa";
  const cnpj = lead.cnpj ? (formatBrCnpj(lead.cnpj) || lead.cnpj) : "—";
  const etapa = etapaLabel(lead.status);
  const engagement = vendasEngagementMeta(lead.engagement, lead.conversation);
  const dealValue = lead.product?.priceLabel || valorNegocio(lead.saleValue) || "—";
  const dealSupporting = lead.product?.name || lead.nextAction || "—";
  const lastRecord = lead.lastResult || lead.shortNote || null;
  const nome = formatCompanyName(lead.name);

  return (
    <aside className="vnd-lead-peek hbx-panel-shell__context has-lead" aria-label={nome || "Lead"} aria-live="polite">
      <header className="vnd-lead-peek__head">
        <span>Lead</span>
        <span className="vnd-lead-peek__head-actions">
          <span className="vnd-lead-peek__state">{etapa}</span>
          <button type="button" className="vnd-lead-peek__close" onClick={onClose} aria-label="Fechar">✕</button>
        </span>
      </header>

      <div className="vnd-lead-peek__body">
        <section className="vnd-lead-peek__hero">
          <Av name={nome || "Lead"} size={48} />
          <span className="vnd-lead-peek__identity">
            <strong title={nome || undefined}>{nome || "—"}</strong>
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

        <section className="vnd-lead-peek__deal">
          <span>
            <small>{canViewValues ? "Potencial do negócio" : "Produto"}</small>
            <strong>{canViewValues ? dealValue : (lead.product?.name || "—")}</strong>
            <em>{dealSupporting}</em>
          </span>
          {/* Mesma gramática da célula ao lado: rótulo em cima, valor embaixo.
              Era um círculo de 52px abrigando "AGORA" + "PRIORIDADE" em caixa
              alta — texto de tamanho variável dentro de caixa de tamanho fixo,
              que é a definição do defeito. */}
          <b><small>Prioridade</small><strong>{prioridadeLabel(lead)}</strong></b>
        </section>

        <section className="vnd-lead-peek__minis">
          <span><small>Responsável</small><strong>{lead.owner?.name || "Sem responsável"}</strong></span>
          <span><small>Último contato</small><strong>{dataContato(lead.lastContactAt)}</strong></span>
          <span><small>Engajamento</small><strong>{engagement.label}</strong></span>
        </section>

        <section className="vnd-lead-peek__next">
          <span className="vnd-lead-peek__next-icon"><I d={ICONS.bolt} size={17} /></span>
          <span>
            <small>Próximo passo</small>
            <strong>{lead.nextAction || "—"}</strong>
            <em>{etapa}</em>
          </span>
          <I d={ICONS.arrow} size={14} />
        </section>

        <section className="vnd-lead-peek__facts">
          <span><small>CNPJ</small><strong className="hbx-mono">{cnpj}</strong></span>
          <span><small>Cidade</small><strong>{cidadeSo}</strong></span>
          {telefone && <span><small>Telefone</small><strong className="hbx-mono">{formatBrPhoneDisplay(telefone)}</strong></span>}
          <span><small>Temperatura</small><strong>{temperaturaLabel(lead.leadTemperature)}</strong></span>
        </section>

        {lastRecord && (
          <section className="vnd-lead-peek__record">
            <small>Último registro</small>
            <strong>{lastRecord}</strong>
          </section>
        )}
      </div>

      <footer className="vnd-lead-peek__footer">
        {links.whatsapp ? (
          <a className="vnd-lead-peek__quick is-whatsapp" href={links.whatsapp} target="_blank" rel="noopener noreferrer" aria-label="Abrir WhatsApp" title="WhatsApp">
            <I d={ICONS.msg} size={17} />
          </a>
        ) : (
          <span className="vnd-lead-peek__quick is-disabled" aria-label="WhatsApp indisponível"><I d={ICONS.msg} size={17} /></span>
        )}
        <button type="button" className="vnd-lead-peek__quick" onClick={onSchedule} disabled={lead.block === "closed"} aria-label="Agendar disparo" title="Agendar disparo">
          <I d={ICONS.clock} size={17} />
        </button>
        <button type="button" className="vnd-lead-peek__expand" onClick={onExpand}>
          <I d={ICONS.vendas} size={15} />
          Abrir ficha
        </button>
      </footer>
    </aside>
  );
}
