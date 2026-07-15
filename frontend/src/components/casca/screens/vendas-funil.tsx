"use client";

// MOBILE-CASCA/W2 — modo FUNIL (mockup aprovado 1). Toolbar compacta
// (Lista|Quadro + Modo foco + "+ Novo"), grupos por bloco real do backend
// (Hoje/Atrasados/Agendados/Fechados — GET /vendas/board, MESMO endpoint do
// desktop), linhas densas 56–64px, ≥8 visíveis. Card → CascaSheet do negócio.
// "Modo foco" nasce DE NOVO como takeover da casca (CascaView) — o
// VendasModoFoco velho foi deletado no W0; PROIBIDO ressuscitar.

import React, { useCallback, useEffect, useState } from "react";

import { CanalIcon, type Canal } from "@/components/hbx/canal-icon";
import { vendasEngagementMeta } from "@/components/hbx/detalhes-negocio";
import { GlassPill, useGlassPill } from "@/components/hbx/glass-pill";
import { summarizeLeadContacts } from "@/components/hbx/lead-contact-summary";
import { Av, I, ICONS } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";
import { showCascaToast } from "@/lib/casca-toast";

import { CascaLoading } from "../loading";
import { CascaSheet } from "../transitions";
import { NegocioSheet } from "./negocio-sheet";
import { ModoSegment, type Modo } from "./vendas";
import { VendasFocoMobile } from "./vendas-foco";
import {
  BLOCK_ORDER_MOBILE,
  fmtMoneyMobile,
  normalizeStageMobile,
  STAGE_ORDER_MOBILE,
  vendasLeadToDetail,
  vendasLeadValueLabel,
  type VendasBoardResponse,
  type VendasLeadMobile,
} from "./vendas-types";

type Vista = "lista" | "quadro";

// Fileira compacta dos 6 canais dentro do lead da lista — MESMA tri-cor do
// DetalhesNegocio (getCanalState): acende só quando o dado foi de fato achado
// ("active"), fica cinza quando ausente ("missing") ou ainda não verificado
// ("unverified"). Espelha o card grande, sem duplicar o visual (classes centrais
// chan-ico--on/off/missing).
const CANAIS_MINI: Canal[] = ["whatsapp", "telefone", "email", "instagram", "facebook", "site"];

function canalStateMobile(card: VendasLeadMobile, canal: Canal): "active" | "missing" | "unverified" {
  const li = card.leadIntelligence;
  switch (canal) {
    case "whatsapp": {
      if (!card.phone) return "missing";
      const ws = li?.whatsappStatus;
      if (ws === "confirmed") return "active";
      if (ws === "missing" || ws === "invalid") return "missing";
      return "unverified";
    }
    case "telefone":
      return card.phone ? "active" : "missing";
    case "email": {
      if (card.email) return "active";
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
      if (card.website) return "active";
      const ws2 = li?.websiteStatus;
      if (ws2 === "confirmed" || ws2 === "present") return "active";
      if (ws2 === "none") return "missing";
      return "unverified";
    }
    default:
      return "unverified";
  }
}

function rowValueLabel(card: VendasLeadMobile, canViewValues: boolean): string {
  if (!canViewValues) return "";
  return vendasLeadValueLabel(card, true) || "R$ 0";
}

function CanaisMiniRow({ card }: { card: VendasLeadMobile }) {
  return (
    <span className="vnd-m__row-canais" aria-label="Canais do lead">
      {CANAIS_MINI.map(canal => {
        const st = canalStateMobile(card, canal);
        const cls = st === "active" ? "chan-ico--on" : st === "missing" ? "chan-ico--missing" : "chan-ico--off";
        return (
          <span key={canal} className={cls}>
            <CanalIcon canal={canal} size="md" />
          </span>
        );
      })}
    </span>
  );
}

function ContactSummaryMobile({ card }: { card: VendasLeadMobile }) {
  const summary = summarizeLeadContacts(card);
  if (summary.total === 0) return null;
  return (
    <span className="lead-contact-summary vnd-m__contact-summary">
      <span><b>Principal</b> · {summary.primary}</span>
      {summary.extra > 0 ? <small>+{summary.extra} contatos</small> : null}
    </span>
  );
}

function fmtWhenMobile(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const today = new Date();
  const sameDay = (a: Date, b: Date) => a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  if (sameDay(d, today)) return "Hoje";
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (sameDay(d, tomorrow)) return "Amanhã";
  return d.toLocaleDateString("pt-BR");
}

export function VendasFunilMobile({ modo, onModoChange }: { modo: Modo; onModoChange: (m: Modo) => void }) {
  const [board, setBoard] = useState<VendasBoardResponse>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [vista, setVista] = useState<Vista>("lista");
  const [foco, setFoco] = useState(false);
  const [sel, setSel] = useState<VendasLeadMobile | null>(null);

  const [novoOpen, setNovoOpen] = useState(false);
  const [novoForm, setNovoForm] = useState({ name: "", phone: "" });
  const [novoBusy, setNovoBusy] = useState(false);
  const [novoMsg, setNovoMsg] = useState<string | null>(null);

  // Glass Pill de Lista|Quadro (Lei nº2) — hook ANTES de qualquer early return
  // (loading/loadError/foco abaixo): regra de hooks, nunca condicional.
  const vistaGp = useGlassPill<HTMLButtonElement>(vista);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<VendasBoardResponse>("/vendas/board");
      setBoard(res);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Falha ao carregar o funil.");
    } finally {
      setLoading(false);
    }
  }, []);

  // IIFE async: mantém a chamada de load() FORA do corpo síncrono do efeito
  // (react-hooks/set-state-in-effect); load só faz setState após o await.
  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  const todos = board ? BLOCK_ORDER_MOBILE.flatMap(b => board.blocks?.[b.key] || []) : [];
  const canViewValues = board?.canViewValues !== false;

  async function criarLead() {
    const name = novoForm.name.trim();
    if (!name || novoBusy) return;
    setNovoBusy(true);
    setNovoMsg(null);
    try {
      await apiFetch("/vendas/manual", {
        method: "POST",
        body: JSON.stringify({ name, phone: novoForm.phone.trim() || undefined }),
      });
      setNovoForm({ name: "", phone: "" });
      setNovoOpen(false);
      showCascaToast("Negócio criado.");
      await load();
    } catch (err) {
      setNovoMsg(err instanceof Error ? err.message : "Não consegui criar o negócio.");
    } finally {
      setNovoBusy(false);
    }
  }

  if (loading) return <CascaLoading caption="Carregando funil…" />;

  if (loadError) {
    return (
      <div className="casca-fallback">
        <p className="casca-fallback__msg">{loadError}</p>
      </div>
    );
  }

  if (foco) {
    return (
      <VendasFocoMobile
        leads={todos}
        initialId={sel?.id ?? todos[0]?.id ?? null}
        canViewValues={canViewValues}
        onClose={() => setFoco(false)}
        onChanged={load}
      />
    );
  }

  const empty = todos.length === 0;

  return (
    <div className="vnd-m__body">
      {/* FIX4: painel de comando único (.casca-command, casca.css) — mesma
          moldura do modo Buscar, simétrico. Linha 1 = toolbar, linha 2 = stats. */}
      <div className="casca-command">
        <div className="vnd-m__toolbar">
          <ModoSegment modo={modo} onChange={onModoChange} />
          {/* Lista|Quadro — mesma Lei nº2: Glass Pill, não background instantâneo. */}
          <div className="casca-segment vnd-m__mini-segment glass-pill-track" role="tablist" aria-label="Visualização">
            <GlassPill {...vistaGp} />
            <button type="button" role="tab" ref={vistaGp.itemRef("lista")} aria-selected={vista === "lista"} className={"casca-segment__item glass-pill-item" + (vista === "lista" ? " is-on" : "")} onClick={() => setVista("lista")}>
              <I d={ICONS.list} size={14} />
            </button>
            <button type="button" role="tab" ref={vistaGp.itemRef("quadro")} aria-selected={vista === "quadro"} className={"casca-segment__item glass-pill-item" + (vista === "quadro" ? " is-on" : "")} onClick={() => setVista("quadro")}>
              <I d={ICONS.grid} size={14} />
            </button>
          </div>
          <button type="button" className="vnd-m__tool-btn" onClick={() => setFoco(true)} disabled={empty} title="Modo foco" aria-label="Modo foco">
            <I d={ICONS.bolt} size={16} />
          </button>
          <button type="button" className="vnd-m__tool-btn vnd-m__tool-btn--primary" onClick={() => setNovoOpen(true)} title="Novo negócio" aria-label="Novo negócio">
            <I d={ICONS.plus} size={16} />
          </button>
        </div>

        <div className="vnd-m__stats">
          {board?.summary.total ?? 0} no funil · {board?.summary.overdue ?? 0} atrasados · {board?.summary.closed ?? 0} fechados
        </div>
      </div>

      {empty ? (
        <div className="vnd-m__empty">
          <I d={ICONS.vendas} size={28} />
          <p>Nenhum negócio ainda. Puxe leads em Buscar ou crie um manual.</p>
        </div>
      ) : vista === "lista" ? (
        <div className="vnd-m__list">
          {BLOCK_ORDER_MOBILE.map(({ key, label }) => {
            const items = board?.blocks?.[key] || [];
            if (items.length === 0) return null;
            return (
              <div className="vnd-m__group" key={key}>
                <div className="vnd-m__group-head">{label} · {items.length}</div>
                {items.map(card => (
                  <button type="button" key={card.id} className="vnd-m__row" onClick={() => setSel(card)}>
                    <Av name={card.name || "?"} size={42} />
                    <span className="vnd-m__row-main">
                      <span className="vnd-m__row-name"><span className="vnd-m__row-name-txt">{card.name || "Sem nome"}</span></span>
                      <span className="vnd-m__row-sub">
                        {card.statusLabel} · {vendasEngagementMeta(card.engagement, card.conversation).label} · {fmtWhenMobile(card.returnAt)}
                      </span>
                      <ContactSummaryMobile card={card} />
                      <CanaisMiniRow card={card} />
                    </span>
                    <span className="vnd-m__row-value" data-zero={String(rowValueLabel(card, canViewValues) !== "" && rowValueLabel(card, canViewValues) === "R$ 0")}>{rowValueLabel(card, canViewValues)}</span>
                    <span className="vnd-m__row-chevron"><I d={ICONS.arrow} size={16} /></span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="vnd-m__list">
          {STAGE_ORDER_MOBILE.map(({ key, label }) => {
            const items = todos.filter(card => normalizeStageMobile(card.status) === key);
            if (items.length === 0) return null;
            return (
              <div className="vnd-m__group" key={key}>
                <div className="vnd-m__group-head">{label} · {items.length}</div>
                {items.map(card => (
                  <button type="button" key={card.id} className="vnd-m__row" onClick={() => setSel(card)}>
                    <Av name={card.name || "?"} size={42} />
                    <span className="vnd-m__row-main">
                      <span className="vnd-m__row-name"><span className="vnd-m__row-name-txt">{card.name || "Sem nome"}</span></span>
                      <span className="vnd-m__row-sub">
                        {vendasEngagementMeta(card.engagement, card.conversation).label} · {card.city || "—"}{card.state ? `/${card.state}` : ""}
                      </span>
                      <ContactSummaryMobile card={card} />
                      <CanaisMiniRow card={card} />
                    </span>
                    <span className="vnd-m__row-value" data-zero={String(rowValueLabel(card, canViewValues) !== "" && rowValueLabel(card, canViewValues) === "R$ 0")}>{rowValueLabel(card, canViewValues)}</span>
                    <span className="vnd-m__row-chevron"><I d={ICONS.arrow} size={16} /></span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}

      <NegocioSheet
        open={Boolean(sel)}
        detail={sel ? vendasLeadToDetail(sel) : null}
        conversationLeadId={sel?.id ?? null}
        onConversationChanged={load}
        onClose={() => setSel(null)}
      />

      {/* "+ Novo" pela central da casca (CascaSheet — LEI: nada abre/fecha
          seco). NÃO usa .hbx-veil/.hbx-modal (camada do desktop, sem IR/VOLTAR). */}
      <CascaSheet open={novoOpen} title="Novo lead" onClose={() => setNovoOpen(false)}>
        <div className="vnd-m__filters">
          <label className="vnd-m__filter-label">Nome</label>
          <input
            className="field-dark"
            placeholder="Nome"
            value={novoForm.name}
            onChange={(e) => setNovoForm(f => ({ ...f, name: e.target.value }))}
          />
          <label className="vnd-m__filter-label">Telefone (opcional)</label>
          <input
            className="field-dark"
            placeholder="Telefone"
            value={novoForm.phone}
            onChange={(e) => setNovoForm(f => ({ ...f, phone: e.target.value }))}
          />
          {novoMsg ? <p className="vnd-m__sheet-msg">{novoMsg}</p> : null}
          <div className="vnd-m__novo-acts">
            <button type="button" className="btn-ghost" onClick={() => setNovoOpen(false)}>Cancelar</button>
            <button type="button" className="btn-teal" onClick={criarLead} disabled={novoBusy || !novoForm.name.trim()}>
              {novoBusy ? "Criando…" : "Criar"}
            </button>
          </div>
        </div>
      </CascaSheet>
    </div>
  );
}

export { fmtMoneyMobile };
