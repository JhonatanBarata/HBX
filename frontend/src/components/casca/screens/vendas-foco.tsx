"use client";

// MOBILE-CASCA/W2 — MODO FOCO: nasce DE NOVO (o VendasModoFoco velho foi
// deletado no W0 — regra 2 do dono, PROIBIDO ressuscitar código antigo).
// Takeover da casca (como o chat do W3): <CascaView> mostrando 1 card por vez,
// swipe ←/→ entre negócios, ações rápidas (zap/ligar/avançar etapa). Escopo
// mínimo digno; sair = VOLTAR (onClose do CascaView já anima e desmonta).

import React, { useState } from "react";

import { I, ICONS } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";
import { showCascaToast } from "@/lib/casca-toast";
import { buildWaLink, buildWaMessage } from "@/lib/wa-link";

import { CascaView } from "../transitions";
import { vendasLeadValueLabel, type VendasLeadMobile } from "./vendas-types";

const SWIPE_PX = 60;

export function VendasFocoMobile({
  leads,
  initialId,
  canViewValues,
  onClose,
  onChanged,
}: {
  leads: VendasLeadMobile[];
  initialId: string | null;
  canViewValues: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const startIdx = Math.max(0, leads.findIndex(l => l.id === initialId));
  const [idx, setIdx] = useState(startIdx === -1 ? 0 : startIdx);
  const [busy, setBusy] = useState(false);
  const [dragX, setDragX] = useState(0);
  const dragStart = React.useRef<number | null>(null);

  const card = leads[idx] ?? null;

  function go(delta: number) {
    setIdx(i => Math.max(0, Math.min(leads.length - 1, i + delta)));
  }

  function onPointerDown(e: React.PointerEvent) {
    dragStart.current = e.clientX;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (dragStart.current == null) return;
    setDragX(e.clientX - dragStart.current);
  }
  function endDrag() {
    if (dragStart.current == null) return;
    dragStart.current = null;
    if (dragX <= -SWIPE_PX) go(1);
    else if (dragX >= SWIPE_PX) go(-1);
    setDragX(0);
  }

  async function avancarEtapa() {
    if (!card || busy) return;
    const ORDER = ["novo", "contato", "retorno", "qualificado", "encerrado"];
    const cur = ORDER.includes(card.status) ? card.status : "novo";
    const next = ORDER[Math.min(ORDER.length - 1, ORDER.indexOf(cur) + 1)];
    if (next === cur) return;
    setBusy(true);
    try {
      await apiFetch(`/vendas/lead/${encodeURIComponent(card.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: next }),
      });
      showCascaToast("Etapa avançada.");
      onChanged();
    } catch {
      showCascaToast("Não consegui avançar a etapa.");
    } finally {
      setBusy(false);
    }
  }

  if (!card) {
    return (
      <CascaView title="Modo foco" onClose={onClose}>
        <div className="casca-fallback">
          <p className="casca-fallback__msg">Nenhum negócio pra focar.</p>
        </div>
      </CascaView>
    );
  }

  const waLink = buildWaLink(card.phone, { text: buildWaMessage({ name: card.name, segment: card.segment, city: card.city }) });
  const telHref = card.phone ? `tel:${card.phone.replace(/[^\d+]/g, "")}` : null;

  return (
    <CascaView title={`Foco · ${idx + 1}/${leads.length}`} onClose={onClose}>
      <div className="vnd-foco">
        <div
          className="vnd-foco__card"
          data-swipe-opt-out="true"
          style={{ transform: `translateX(${dragX}px)` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <h2 className="vnd-foco__name">{card.name || "Sem nome"}</h2>
          <p className="vnd-foco__sub">{card.statusLabel} · {card.city || "—"}{card.state ? `/${card.state}` : ""}</p>
          {canViewValues ? <p className="vnd-foco__value">{vendasLeadValueLabel(card, true) || "R$ 0"}</p> : null}
          {card.shortNote ? <p className="vnd-foco__note">{card.shortNote}</p> : null}
        </div>

        <div className="vnd-foco__nav">
          <button type="button" className="vnd-m__tool-btn" onClick={() => go(-1)} disabled={idx === 0} aria-label="Anterior">
            <I d={ICONS.railCollapse} size={16} />
          </button>
          <span className="vnd-foco__pos">{idx + 1} / {leads.length}</span>
          <button type="button" className="vnd-m__tool-btn" onClick={() => go(1)} disabled={idx === leads.length - 1} aria-label="Próximo">
            <I d={ICONS.railExpand} size={16} />
          </button>
        </div>

        <div className="vnd-m__sheet-acts vnd-foco__acts">
          {waLink ? (
            <a className="vnd-m__act vnd-m__act--wa" href={waLink} target="_blank" rel="noopener noreferrer">
              <I d={ICONS.atend} size={16} /> WhatsApp
            </a>
          ) : (
            <button type="button" className="vnd-m__act" disabled><I d={ICONS.atend} size={16} /> WhatsApp</button>
          )}
          {telHref ? (
            <a className="vnd-m__act" href={telHref}><I d={ICONS.phone} size={16} /> Ligar</a>
          ) : (
            <button type="button" className="vnd-m__act" disabled><I d={ICONS.phone} size={16} /> Ligar</button>
          )}
          <button type="button" className="vnd-m__act vnd-m__act--primary" onClick={avancarEtapa} disabled={busy}>
            <I d={ICONS.check} size={16} /> {busy ? "Avançando…" : "Avançar etapa"}
          </button>
        </div>
      </div>
    </CascaView>
  );
}
