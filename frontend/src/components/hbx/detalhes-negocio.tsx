"use client";

// DetalhesNegocio — componente ÚNICO de detalhe do negócio (Vendas + Atendimento + Radar/Leads).
// 1 edição aqui reflete nas 3 telas (regra "sem legado" do dono 21/06/2026).
//
// Uso:
//   <DetalhesNegocio detail={obj} onClose={() => setSel(null)} heroAction={<Btn />} actions={<BotoesVendas ... />} />
//
// Cada tela MAPEIA seu objeto bruto para NegocioDetail antes de passar.
// Campos ausentes → a linha/seção some automaticamente.
//
// Design System: zero cor/hex/inline visual — só classes centrais/tokens.
// Inline style apenas para layout (display/gap/padding/width/flex).

import React, { useState } from "react";

import { Av, I, ICONS } from "@/components/hbx/shell";
import { CanalIcon } from "@/components/hbx/canal-icon";

// ── Modelo normalizado ────────────────────────────────────────────────────────

/** Evento de histórico / timeline */
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
  /** valor formatado ("R$ 1.200") — preferir valueLabel; value (number) mantido para compat */
  valueLabel?: string | null;
  /** @deprecated use valueLabel */
  value?: number | null;
  commissionLabel?: string | null;          // ex.: "Comissão calculada"
  commissionValueLabel?: string | null;     // ex.: "R$ 240"
  setupLabel?: string | null;               // ex.: "Implantação: R$ 800"
  /** @deprecated passado diretamente — use commissionValueLabel */
  commissionStatusLabel?: string | null;
  /** @deprecated use commissionValueLabel */
  commissionAmount?: number | null;
  setupValue?: number | null;
  setupCommissionStatusLabel?: string | null;
  setupCommissionAmount?: number | null;
};

export type NegocioDetail = {
  id: string;
  name?: string | null;
  avatarUrl?: string | null;
  online?: boolean;

  // Contato
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  channel?: string | null;

  // Localização / perfil
  city?: string | null;
  state?: string | null;
  segment?: string | null;

  // Etapa / estado
  statusLabel?: string | null;
  doNotCall?: boolean;
  leadTemperature?: string | null;          // "frio" | "morno" | "quente"

  // Métricas
  /** valor já formatado (ex: "R$ 1.200") */
  valueLabel?: string | null;
  /** @deprecated use valueLabel */
  value?: string | null;
  productName?: string | null;
  rating?: number | null;
  reviews?: number | null;
  opportunityScore?: number | null;         // 0–100

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

  // Canais (inteligência)
  leadIntelligence?: {
    whatsappStatus?: string | null;
    emailStatus?: string | null;
    websiteStatus?: string | null;
    instagramUrl?: string | null;
    facebookUrl?: string | null;
  } | null;

  // Venda (somente Vendas preenche)
  sale?: NegocioSale | null;

  // Histórico (timeline/events)
  history?: NegocioDetailHistory[] | null;

  // Observações (somente Atendimento preenche diretamente — Vendas usa shortNote)
  observations?: string | null;
};

// ── Props ─────────────────────────────────────────────────────────────────────

export type DetalhesNegocioProps = {
  /** objeto normalizado; null = empty state */
  detail?: NegocioDetail | null;

  /** @deprecated use detail */
  negocio?: NegocioDetail | null;

  /** título do painel (default "Detalhes do negócio") */
  title?: string;

  /** quando presente, exibe o botão ✕ no cabeçalho */
  onClose?: () => void;

  /** slot no canto superior direito do hero (ex.: WhatsAppActionButton) */
  heroAction?: React.ReactNode;

  /** slot de ações específico da tela (botões, forms) */
  actions?: React.ReactNode;

  /** texto do empty state (quando detail é null) */
  emptyHint?: string;

  // ── Props de compatibilidade (mantidas para não quebrar uso atual) ───────────

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

  /** quando a tela controla o textarea externamente (Atendimento) */
  obsDraft?: string;
  onObsChange?: (v: string) => void;
  onObsSave?: () => void;
  obsBusy?: boolean;
  onToggleDoNotCall?: () => void;

  /** label da seção de histórico (padrão: "Histórico") */
  historyLabel?: string;

  /** slot extra após os canais e antes do KV */
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

// ── Componente ────────────────────────────────────────────────────────────────

export function DetalhesNegocio({
  detail,
  negocio,
  title = "Detalhes do negócio",
  onClose,
  heroAction,
  actions,
  emptyHint,
  // compat WA props
  waPhone,
  waName,
  waQrActive = false,
  waCanInternal = false,
  onWaOpenExternal,
  onWaOpenInternal,
  waStartBusy,
  waStartError,
  // obs props
  obsDraft,
  onObsChange,
  onObsSave,
  obsBusy,
  onToggleDoNotCall,
  historyLabel = "Histórico",
  kvExtra,
}: DetalhesNegocioProps) {
  // `negocio` is the deprecated alias — support both
  const n = detail !== undefined ? detail : (negocio !== undefined ? negocio : null);

  // Aba interna: 0 = últimas interações, 1 = histórico completo
  const [internalTab, setInternalTab] = useState(0);

  // Inline WA button (compat legado): se heroAction não foi passado mas as props wa* foram
  const hasLegacyWa = Boolean(onWaOpenExternal || onWaOpenInternal);

  return (
    <div className="dn-root">
      {/* ── Header ───────────────────────────────────────────── */}
      <h3>
        {title}
        {onClose && (
          <span className="x" onClick={onClose} role="button" aria-label="Fechar painel">✕</span>
        )}
      </h3>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <div className="ctx-hero">
        <Av
          name={n?.name || "—"}
          src={n?.avatarUrl ?? undefined}
          online={n?.online}
          size={56}
        />
        <div className="ident">
          <div className="ident-top">
            <span className="company" style={{ flex: 1, minWidth: 0 }}>
              {n?.name || (n ? "—" : title)}
            </span>
            {/* Slot heroAction: ex.: WhatsAppActionButton */}
            {heroAction && n && <>{heroAction}</>}
            {/* Compat: inline WA button quando heroAction não foi passado */}
            {!heroAction && hasLegacyWa && n && (
              <LegacyWaButton
                phone={waPhone ?? n.phone}
                name={waName ?? n.name}
                qrActive={waQrActive}
                canInternal={waCanInternal}
                onOpenExternal={onWaOpenExternal ?? (() => {})}
                onOpenInternal={onWaOpenInternal ?? (() => {})}
                startBusy={waStartBusy}
                startError={waStartError}
              />
            )}
          </div>
          {n && (
            <>
              <div className="sub sub--seg">{n.segment || n.city || "—"}</div>
              {n.city && n.segment && (
                <div className="sub sub--loc">
                  <I d={ICONS.mapin} size={11} /> {n.city}{n.state ? `, ${n.state}` : ""}
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
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Score de oportunidade ─────────────────────────────── */}
      {n && n.opportunityScore != null && n.opportunityScore > 0 && (
        <div className="ctx-score">
          <div className="ctx-score-head">
            <span className="ctx-score-label">Oportunidade</span>
            <span className="ctx-score-num">{n.opportunityScore}<small>/100</small></span>
          </div>
          <div className="ctx-score-track">
            <div className="ctx-score-fill" style={{ width: `${n.opportunityScore}%` }} />
          </div>
        </div>
      )}

      {/* ── Telefone (pílula) ─────────────────────────────────── */}
      {n?.phone ? (
        <a href={`tel:${n.phone.replace(/[^\d+]/g, "")}`} className="ctx-phone">
          <CanalIcon canal="telefone" /> {n.phone}
        </a>
      ) : n ? (
        <div className="dn-no-phone">Sem telefone neste card.</div>
      ) : null}

      {/* ── Selos de canal (6 CanalIcon agrupados) ───────────── */}
      {n && (
        <div className="ctx-channels">
          {/* WhatsApp: indicador de status */}
          {n.leadIntelligence?.whatsappStatus === "confirmed" && n.phone ? (
            <CanalIcon canal="whatsapp" size="xl" />
          ) : n.phone && !n.leadIntelligence ? (
            <a href={`tel:${n.phone.replace(/[^\d+]/g, "")}`} aria-label="Telefone">
              <CanalIcon canal="telefone" size="xl" />
            </a>
          ) : null}
          {(n.email || n.leadIntelligence?.emailStatus === "confirmed" || n.leadIntelligence?.emailStatus === "probable") && (
            n.email
              ? <a href={`mailto:${n.email}`} aria-label="E-mail"><CanalIcon canal="email" size="xl" /></a>
              : <CanalIcon canal="email" size="xl" />
          )}
          {n.leadIntelligence?.instagramUrl && (
            <a href={n.leadIntelligence.instagramUrl} target="_blank" rel="noopener noreferrer" aria-label="Instagram">
              <CanalIcon canal="instagram" size="xl" />
            </a>
          )}
          {n.leadIntelligence?.facebookUrl && (
            <a href={n.leadIntelligence.facebookUrl} target="_blank" rel="noopener noreferrer" aria-label="Facebook">
              <CanalIcon canal="facebook" size="xl" />
            </a>
          )}
          {n.website && (
            <a href={n.website.startsWith("http") ? n.website : `https://${n.website}`} target="_blank" rel="noopener noreferrer" aria-label="Site">
              <CanalIcon canal="site" size="xl" />
            </a>
          )}
        </div>
      )}

      {/* ── Site (pílula) ─────────────────────────────────────── */}
      {n?.website && (
        <a
          href={n.website.startsWith("http") ? n.website : `https://${n.website}`}
          target="_blank"
          rel="noopener noreferrer"
          className="ctx-phone ctx-phone--site"
          style={{ marginTop: 4 }}
        >
          <CanalIcon canal="site" /> {n.website}
        </a>
      )}

      {/* ── Slot extra (entre canais e KV) ────────────────────── */}
      {kvExtra}

      {/* ── Bloco KV de campos comuns ─────────────────────────── */}
      {n && (
        <div className="kv">
          {/* Valor — preferir valueLabel; fallback para value (compat) */}
          {(n.valueLabel != null || n.value != null) && (
            <div className="row">
              <span className="k">Valor</span>
              <span className="v is-strong">{n.valueLabel ?? n.value ?? "—"}</span>
            </div>
          )}
          {n.productName && (
            <div className="row"><span className="k">Produto</span><span className="v">{n.productName}</span></div>
          )}
          {n.channel && (
            <div className="row">
              <span className="k" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                <I d={ICONS.msg} size={13} /> Canal
              </span>
              <span className="v"><span className="chan wa">{n.channel}</span></span>
            </div>
          )}
          {n.email && !n.channel && (
            <div className="row">
              <span className="k" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                <I d={ICONS.mail} size={13} /> E-mail
              </span>
              <span className="v">{n.email}</span>
            </div>
          )}
          {n.rating != null && (
            <div className="row">
              <span className="k">Avaliação</span>
              <span className="v">★ {n.rating.toFixed(1)}{n.reviews ? ` · ${n.reviews} avaliações` : ""}</span>
            </div>
          )}
          {n.nextAction && (
            <div className="row"><span className="k">Próxima ação</span><span className="v">{n.nextAction}</span></div>
          )}
          {n.lastResult && (
            <div className="row"><span className="k">Último resultado</span><span className="v">{n.lastResult}</span></div>
          )}
          {(n.returnAt !== undefined) && (
            <div className="row">
              <span className="k">Próximo retorno</span>
              <span className={"v" + (n.returnAt ? "" : " is-empty")}>{fmtDate(n.returnAt)}</span>
            </div>
          )}
          {(n.lastContactAt !== undefined) && (
            <div className="row">
              <span className="k">Último contato</span>
              <span className={"v" + (n.lastContactAt ? "" : " is-empty")}>{fmtDate(n.lastContactAt)}</span>
            </div>
          )}
          {n.lastMessageAt !== undefined && (
            <div className="row"><span className="k">Última mensagem</span><span className="v">{fmtDateTime(n.lastMessageAt)}</span></div>
          )}
          {n.attemptCount != null && (
            <div className="row">
              <span className="k">Tentativas</span>
              <span className={"v hbx-mono" + (n.attemptCount > 0 ? "" : " is-empty")}>{n.attemptCount}</span>
            </div>
          )}
          {n.timesSeen != null && n.timesSeen > 1 && (
            <div className="row"><span className="k">Visto</span><span className="v hbx-mono">{n.timesSeen}×</span></div>
          )}
          {n.botActive !== undefined && n.botActive !== null && (
            <div className="row"><span className="k">Bot</span><span className="v">{n.botActive ? "Ativo" : "Inativo"}</span></div>
          )}
          {n.humanAssigned !== undefined && n.humanAssigned !== null && (
            <div className="row"><span className="k">Atendimento humano</span><span className="v">{n.humanAssigned ? "Sim" : "Não"}</span></div>
          )}
          {n.owner?.name && (
            <div className="row">
              <span className="k">Responsável</span>
              <span className="v" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                <Av name={n.owner.name} size={18} />{n.owner.name}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Bloco de venda (só Vendas preenche) ──────────────── */}
      {n?.sale && n.sale.status !== "none" && (
        <div className="kv">
          <div className="row">
            <span className="k">Venda</span>
            <span className="v">
              <span className={"tag" + (n.sale.status === "sale_confirmed" ? " teal" : n.sale.status === "canceled" ? " warn" : "")}>
                {n.sale.statusLabel || n.sale.status}
              </span>
            </span>
          </div>
          {/* Valor formatado — preferir valueLabel, fallback para value (number) */}
          <div className="row">
            <span className="k">Valor fechado</span>
            <span className="v hbx-mono">
              {n.sale.valueLabel ?? (n.sale.value != null ? fmtMoney(n.sale.value) : "—")}
            </span>
          </div>
          <div className="row">
            <span className="k">Comissão</span>
            <span className="v">
              {n.sale.commissionLabel ?? n.sale.commissionStatusLabel ?? "—"}
              {n.sale.commissionValueLabel && (
                <span className="hbx-mono" style={{ marginLeft: 6 }}>{n.sale.commissionValueLabel}</span>
              )}
              {!n.sale.commissionValueLabel && n.sale.commissionAmount != null && (
                <span className="hbx-mono" style={{ marginLeft: 6 }}>{fmtMoney(n.sale.commissionAmount)}</span>
              )}
            </span>
          </div>
          {/* Implantação */}
          {n.sale.setupLabel && (
            <div className="row"><span className="k">Implantação</span><span className="v">{n.sale.setupLabel}</span></div>
          )}
          {!n.sale.setupLabel && n.sale.setupValue != null && n.sale.setupValue > 0 && (
            <React.Fragment>
              <div className="row">
                <span className="k">Implantação</span>
                <span className="v">{fmtMoney(n.sale.setupValue)}</span>
              </div>
              <div className="row">
                <span className="k">Comissão implantação</span>
                <span className="v">
                  {n.sale.setupCommissionStatusLabel || "—"}
                  {n.sale.setupCommissionAmount != null
                    ? ` · ${fmtMoney(n.sale.setupCommissionAmount)}`
                    : ""}
                </span>
              </div>
            </React.Fragment>
          )}
        </div>
      )}

      {/* ── Observação (shortNote) ────────────────────────────── */}
      {n && onObsChange && (
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
      {n && !onObsChange && n.shortNote && (
        <div className="ctx-note">
          <span className="ctx-note-lbl"><I d={ICONS.doc} size={12} /> Observação</span>
          <p className="ctx-note-txt">{n.shortNote}</p>
        </div>
      )}

      {/* ── Slot de ações (rodapé por tela) ───────────────────── */}
      {actions && (
        <div className="dn-actions">
          {actions}
        </div>
      )}

      <div className="sep" />

      {/* ── Histórico / timeline ──────────────────────────────── */}
      {n && (
        <div className="dn-history">
          {n.history && n.history.length > 3 ? (
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
            <>
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
            </>
          )}
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────── */}
      {!n && (
        <div className="ctx-empty">
          <span className="ctx-empty__icon">←</span>
          <span className="ctx-empty__hint">{emptyHint || "Selecione um item para ver os detalhes."}</span>
        </div>
      )}
    </div>
  );
}

// ── Compat: inline WA button (substituto quando heroAction não é passado) ─────
// Importado do whatsapp-action para não quebrar uso legado dos props wa*.

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
