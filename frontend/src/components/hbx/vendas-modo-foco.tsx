"use client";

// Modo Foco — overlay full-screen mobile para /vendas.
// Percorre a fila hoje+atrasados 1 a 1; swipe horizontal avança/volta.
// Renderizado via portal em document.body (cobre header + tab-bar do app-shell).
// Reagendar/Observação/Encerrar = sheets INLINE que gravam pelos MESMOS endpoints
// do page e avançam pro próximo SEM sair do foco. Fechar abre o FecharVendaModal.

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { I, ICONS, WhatsAppMark } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";
import {
  type AgendaBoard,
  type AgendaLead,
  buildFocusQueue,
  leadUrgencyLabel,
} from "@/lib/vendas-agenda";

// ── Props ─────────────────────────────────────────────────────────────────────

export type VendasModoFocoProps = {
  board: AgendaBoard;
  startLeadId?: string;
  onExit: () => void;
  onWhatsApp: (lead: AgendaLead) => void;
  onCall: (lead: AgendaLead) => void;
  // Abre o FecharVendaModal por cima do foco. `onConfirmed` é ligado ao onDone do
  // modal (sucesso real = venda concluída): só então avança + conta como fechado.
  // Cancelar (✕/clique fora) NÃO chama onConfirmed → volta ao mesmo lead.
  onWinSale: (lead: AgendaLead, onConfirmed: () => void) => void;
  // Disparado após uma gravação inline (reagendar/observação/encerrar) para o
  // page recarregar o board. Não desmonta o foco.
  onMutated?: () => void;
};

// ── Ring de score (SVG sem gradiente) ────────────────────────────────────────

function ScoreRing({ score }: { score: number | null | undefined }) {
  const val = Math.max(0, Math.min(100, score ?? 0));
  const R = 22;
  const C = 2 * Math.PI * R;
  const dash = C * (val / 100);
  return (
    <svg className="vf-score-ring" viewBox="0 0 52 52" width={52} height={52} aria-hidden="true">
      <circle className="vf-score-ring__track" cx={26} cy={26} r={R} fill="none" strokeWidth={4} />
      <circle
        className="vf-score-ring__arc"
        cx={26} cy={26} r={R}
        fill="none"
        strokeWidth={4}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${C}`}
        transform="rotate(-90 26 26)"
      />
      <text className="vf-score-ring__num" x={26} y={26} textAnchor="middle" dominantBaseline="central">
        {val}
      </text>
    </svg>
  );
}

// ── End state ─────────────────────────────────────────────────────────────────

type SessionStats = { worked: number; rescheduled: number; closed: number };

function FocusEndState({
  overdueCount,
  stats,
  onAttack,
  onExit,
}: {
  overdueCount: number;
  stats: SessionStats;
  onAttack: () => void;
  onExit: () => void;
}) {
  return (
    <div className="vf-end">
      <div className="vf-end__ring" aria-hidden="true">
        <svg viewBox="0 0 64 64" width={72} height={72}>
          <circle className="vf-end__track" cx={32} cy={32} r={28} fill="none" strokeWidth={4} />
          <circle className="vf-end__arc" cx={32} cy={32} r={28} fill="none" strokeWidth={4}
            strokeLinecap="round" strokeDasharray="176 176" transform="rotate(-90 32 32)" />
          <text className="vf-end__check" x={32} y={32} textAnchor="middle" dominantBaseline="central">✓</text>
        </svg>
      </div>
      <h2 className="vf-end__title">Fila do dia zerada</h2>
      <p className="vf-end__sub">Você trabalhou todos os leads de hoje e atrasados.</p>
      <div className="vf-end__stats">
        <div className="vf-end__stat">
          <span className="vf-end__stat-val">{stats.worked}</span>
          <span className="vf-end__stat-lbl">trabalhados</span>
        </div>
        <div className="vf-end__stat">
          <span className="vf-end__stat-val">{stats.rescheduled}</span>
          <span className="vf-end__stat-lbl">reagendados</span>
        </div>
        <div className="vf-end__stat">
          <span className="vf-end__stat-val">{stats.closed}</span>
          <span className="vf-end__stat-lbl">fechados</span>
        </div>
      </div>
      <div className="vf-end__acts">
        {overdueCount > 0 && (
          <button className="btn-teal vf-end__cta" type="button" onClick={onAttack}>
            Atacar os atrasados ({overdueCount})
          </button>
        )}
        <button className="btn-ghost vf-end__back" type="button" onClick={onExit}>
          Voltar ao funil
        </button>
      </div>
    </div>
  );
}

// ── Sheet helpers (datas) ─────────────────────────────────────────────────────

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function plusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toDateInputValue(d);
}

// Mesmos motivos do popup "Sem Interesse" do page (contrato com o backend).
const ENCERRAR_MOTIVOS: { status: string; label: string }[] = [
  { status: "no_answer", label: "Não atendeu" },
  { status: "voicemail", label: "Caixa postal" },
  { status: "not_interested_product", label: "Não quer produto" },
];

type SheetKind = null | "reschedule" | "note" | "close";

// ── Componente principal ──────────────────────────────────────────────────────

export function VendasModoFoco({
  board,
  startLeadId,
  onExit,
  onWhatsApp,
  onCall,
  onWinSale,
  onMutated,
}: VendasModoFocoProps) {
  // Fila = SNAPSHOT na montagem (lazy init). Não recalcula quando o board recarrega
  // após onMutated — assim cada ação avança o idx em exatamente 1 (sem pular leads
  // quando o reagendado/encerrado sai da fila no próximo loadBoard).
  const [queue] = useState<AgendaLead[]>(() => buildFocusQueue(board));
  const startIdx = startLeadId
    ? Math.max(0, queue.findIndex(l => l.id === startLeadId))
    : 0;

  const [idx, setIdx] = useState(startIdx);
  const [stats, setStats] = useState<SessionStats>({ worked: 0, rescheduled: 0, closed: 0 });

  // Sheet inline aberta + estado dos formulários
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [busy, setBusy] = useState(false);
  const [sheetErr, setSheetErr] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [noteText, setNoteText] = useState("");
  const [closeMotivo, setCloseMotivo] = useState("");

  // Montagem (portal SSR-safe)
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const lead: AgendaLead | undefined = queue[idx];
  const n = queue.length;
  const isDone = idx >= n;

  // Conta atrasados na fila original
  const overdueCount = queue.filter(l => l.block === "overdue").length;

  // ── Swipe ──────────────────────────────────────────────────────────────────
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  function handleTouchStart(e: React.TouchEvent) {
    if (sheet) return; // não navegar com sheet aberta
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx) * 0.8) return;
    if (dx < 0) setIdx(i => (i < n ? i + 1 : i));
    if (dx > 0) setIdx(i => (i > 0 ? i - 1 : i));
  }

  // Lock scroll quando aberto
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // ── Helpers de avanço ───────────────────────────────────────────────────────
  function closeSheet() {
    setSheet(null);
    setSheetErr(null);
    setRescheduleDate("");
    setNoteText("");
    setCloseMotivo("");
  }

  function advanceWorked(extra?: Partial<SessionStats>) {
    setStats(s => ({
      worked: s.worked + 1,
      rescheduled: s.rescheduled + (extra?.rescheduled ?? 0),
      closed: s.closed + (extra?.closed ?? 0),
    }));
    setIdx(i => i + 1);
  }

  // ── Gravações inline (mesmos endpoints/formatos do page) ────────────────────
  async function confirmReschedule() {
    if (!lead || !rescheduleDate || busy) return;
    setBusy(true);
    setSheetErr(null);
    try {
      // PATCH /vendas/lead/:id { returnAt } — mesmo formato do page (hora T09:00:00).
      const body: Record<string, unknown> = { returnAt: new Date(`${rescheduleDate}T09:00:00`).toISOString() };
      if (noteText.trim()) body.shortNote = noteText.trim().slice(0, 280);
      await apiFetch(`/vendas/lead/${encodeURIComponent(lead.id)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      onMutated?.();
      closeSheet();
      advanceWorked({ rescheduled: 1 });
    } catch (err) {
      setSheetErr(err instanceof Error ? err.message : "Falha ao reagendar.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmNote() {
    // Campo vazio é VÁLIDO = limpar a nota (PATCH shortNote: ""). Só barra se ocupado.
    if (!lead || busy) return;
    setBusy(true);
    setSheetErr(null);
    try {
      // PATCH /vendas/lead/:id { shortNote } — mesmo formato do page (corte 280).
      await apiFetch(`/vendas/lead/${encodeURIComponent(lead.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ shortNote: noteText.trim().slice(0, 280) }),
      });
      onMutated?.();
      closeSheet();
      advanceWorked();
    } catch (err) {
      setSheetErr(err instanceof Error ? err.message : "Falha ao salvar a observação.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmClose() {
    if (!lead || !closeMotivo || busy) return;
    setBusy(true);
    setSheetErr(null);
    try {
      // POST /vendas/lead/:id/negativar { status } — mesmo endpoint do page.
      await apiFetch(`/vendas/lead/${encodeURIComponent(lead.id)}/negativar`, {
        method: "POST",
        body: JSON.stringify({ status: closeMotivo }),
      });
      onMutated?.();
      closeSheet();
      advanceWorked();
    } catch (err) {
      setSheetErr(err instanceof Error ? err.message : "Falha ao encerrar o lead.");
    } finally {
      setBusy(false);
    }
  }

  // Fechar venda — abre o FecharVendaModal por cima (callback do page). Só avança
  // + conta como fechado quando o modal sinaliza SUCESSO (onConfirmed = onDone do
  // modal). Cancelar (✕/clique fora) não chama onConfirmed → fica no mesmo lead.
  function handleWinSale(l: AgendaLead) {
    onWinSale(l, () => advanceWorked({ closed: 1 }));
  }

  // Reinicia atacando só os atrasados
  function handleAttackOverdue() {
    const firstOverdue = queue.findIndex(l => l.block === "overdue");
    setIdx(firstOverdue >= 0 ? firstOverdue : 0);
    setStats({ worked: 0, rescheduled: 0, closed: 0 });
  }

  if (!mounted) return null;

  // ── Conteúdo ─────────────────────────────────────────────────────────────────
  let content: React.ReactNode;

  if (queue.length === 0 || isDone) {
    content = (
      <div className="vf-overlay" role="dialog" aria-modal="true" aria-label="Modo foco">
        <div className="vf-topbar">
          <button className="vf-exit" type="button" onClick={onExit} aria-label="Sair do Modo foco">
            <span className="vf-exit__x">✕</span> Sair
          </button>
          <span className="vf-topbar__title"><I d={ICONS.bolt} size={15} /> Modo foco</span>
          <span className="vf-topbar__counter" aria-label="Posição na fila" />
        </div>
        <FocusEndState
          overdueCount={overdueCount}
          stats={stats}
          onAttack={handleAttackOverdue}
          onExit={onExit}
        />
      </div>
    );
  } else {
    const urgency = leadUrgencyLabel(lead);
    const score = (lead as AgendaLead & { opportunityScore?: number | null }).opportunityScore;

    content = (
      <div
        className="vf-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Modo foco"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Topbar */}
        <div className="vf-topbar">
          <button className="vf-exit" type="button" onClick={onExit} aria-label="Sair do Modo foco">
            <span className="vf-exit__x">✕</span> Sair
          </button>
          <span className="vf-topbar__title"><I d={ICONS.bolt} size={15} /> Modo foco</span>
          <span className="vf-topbar__counter" aria-label={`Lead ${idx + 1} de ${n}`}>{idx + 1} / {n}</span>
        </div>

        {/* Faixa de urgência */}
        <div className={"vf-urgency vf-urgency--" + urgency.tone}>
          <div className="vf-urgency__left">
            <span className="vf-urgency__label">{urgency.label}</span>
          </div>
          <ScoreRing score={score} />
        </div>

        {/* Card do lead */}
        <div className="vf-card">
          <div className="vf-card__head">
            <h2 className="vf-card__name">{lead.name || "—"}</h2>
            <div className="vf-card__meta">
              {[lead.segment, lead.city].filter(Boolean).join(" · ") || "—"}
            </div>
          </div>

          <div className="vf-card__chips">
            <span className="vf-chip vf-chip--stage">{lead.statusLabel || "—"}</span>
          </div>

          <div className="vf-card__facts">
            {lead.phone && (
              <div className="vf-fact">
                <span className="vf-fact__key">Telefone</span>
                <span className="vf-fact__val">{lead.phone}</span>
              </div>
            )}
            {lead.nextAction && (
              <div className="vf-fact">
                <span className="vf-fact__key">Próximo passo</span>
                <span className="vf-fact__val">{lead.nextAction}</span>
              </div>
            )}
            {lead.lastContactAt && (
              <div className="vf-fact">
                <span className="vf-fact__key">Último contato</span>
                <span className="vf-fact__val">{new Date(lead.lastContactAt).toLocaleDateString("pt-BR")}</span>
              </div>
            )}
          </div>

          {lead.shortNote && (
            <div className="vf-card__note">
              <span className="vf-card__note-label">Por que agora</span>
              <p className="vf-card__note-text">{lead.shortNote}</p>
            </div>
          )}
        </div>

        {/* Ações grandes */}
        <div className="vf-actions-primary">
          <button
            type="button"
            className="vf-btn-wa"
            onClick={() => onWhatsApp(lead)}
            aria-label="Abrir WhatsApp"
          >
            <WhatsAppMark size={20} />
            WhatsApp
          </button>
          <button
            type="button"
            className="vf-btn-call"
            onClick={() => onCall(lead)}
            aria-label="Ligar"
          >
            <I d={ICONS.phone} size={20} />
            Ligar
          </button>
        </div>

        {/* Ações de resultado */}
        <div className="vf-actions-result">
          <button type="button" className="vf-res-btn" onClick={() => { setSheetErr(null); setRescheduleDate(""); setNoteText(""); setSheet("reschedule"); }}>
            <I d={ICONS.clock} size={15} /> Reagendar
          </button>
          <button type="button" className="vf-res-btn" onClick={() => { setSheetErr(null); setNoteText(lead.shortNote ?? ""); setSheet("note"); }}>
            <I d={ICONS.doc} size={15} /> Observação
          </button>
          <button type="button" className="vf-res-btn vf-res-btn--win" onClick={() => handleWinSale(lead)}>
            <I d={ICONS.money} size={15} /> Fechar
          </button>
          <button type="button" className="vf-res-btn vf-res-btn--cold" onClick={() => { setSheetErr(null); setCloseMotivo(""); setSheet("close"); }}>
            Encerrar
          </button>
        </div>

        {/* Footer — dots + próximo */}
        <div className="vf-footer">
          <div className="vf-dots" aria-hidden="true">
            {queue.map((_, i) => (
              <span
                key={i}
                className={"vf-dot" + (i === idx ? " vf-dot--on" : i < idx ? " vf-dot--done" : "")}
              />
            ))}
          </div>
          {idx < n - 1 ? (
            <button
              type="button"
              className="vf-next"
              onClick={() => setIdx(i => i + 1)}
              aria-label="Próximo lead"
            >
              Próximo lead →
            </button>
          ) : (
            // Último lead: caminho de saída sem ser obrigado a registrar resultado
            // nele. Leva direto ao end-state ("Fila do dia zerada").
            <button
              type="button"
              className="vf-next"
              onClick={() => setIdx(n)}
              aria-label="Concluir fila"
            >
              Concluir fila ✓
            </button>
          )}
        </div>

        {/* ── Sheets inline (bottom sheet) ────────────────────────────────── */}
        {sheet && (
          <div className="vf-sheet-veil" onClick={e => { if (e.target === e.currentTarget && !busy) closeSheet(); }}>
            <div className="vf-sheet" role="dialog" aria-modal="true">
              <div className="vf-sheet__grip" aria-hidden="true" />

              {sheet === "reschedule" && (
                <>
                  <h3 className="vf-sheet__title">Reagendar — {lead.name || "lead"}</h3>
                  {sheetErr && <div className="vf-sheet__err">{sheetErr}</div>}
                  <div className="vf-sheet__chips">
                    <button type="button" className={"vf-sheet-chip" + (rescheduleDate === plusDays(0) ? " is-on" : "")} onClick={() => setRescheduleDate(plusDays(0))}>Hoje</button>
                    <button type="button" className={"vf-sheet-chip" + (rescheduleDate === plusDays(1) ? " is-on" : "")} onClick={() => setRescheduleDate(plusDays(1))}>Amanhã</button>
                    <button type="button" className={"vf-sheet-chip" + (rescheduleDate === plusDays(3) ? " is-on" : "")} onClick={() => setRescheduleDate(plusDays(3))}>+3 dias</button>
                  </div>
                  <label className="vf-sheet__label">Ou escolha a data</label>
                  <input className="field-dark vf-sheet__input" type="date" value={rescheduleDate}
                    onChange={e => setRescheduleDate(e.target.value)} aria-label="Data do retorno" />
                  <label className="vf-sheet__label">Observação (opcional)</label>
                  <textarea className="field-dark vf-sheet__input" rows={2} maxLength={280}
                    placeholder="Ex.: cliente pediu pra mandar fotos"
                    value={noteText} onChange={e => setNoteText(e.target.value)} />
                  <div className="vf-sheet__foot">
                    <button type="button" className="btn-ghost" onClick={closeSheet} disabled={busy}>Cancelar</button>
                    <button type="button" className="btn-teal" onClick={confirmReschedule} disabled={!rescheduleDate || busy}>
                      {busy ? "Salvando…" : "Reagendar e seguir"}
                    </button>
                  </div>
                </>
              )}

              {sheet === "note" && (
                <>
                  <h3 className="vf-sheet__title">Observação — {lead.name || "lead"}</h3>
                  {sheetErr && <div className="vf-sheet__err">{sheetErr}</div>}
                  <textarea className="field-dark vf-sheet__input" rows={4} maxLength={280} autoFocus
                    placeholder="O que ficou combinado / por que segue no funil… (vazio limpa a nota)"
                    value={noteText} onChange={e => setNoteText(e.target.value)} />
                  <div className="vf-sheet__foot">
                    <button type="button" className="btn-ghost" onClick={closeSheet} disabled={busy}>Cancelar</button>
                    <button type="button" className="btn-teal" onClick={confirmNote} disabled={busy}>
                      {busy ? "Salvando…" : noteText.trim() ? "Salvar e seguir" : "Limpar e seguir"}
                    </button>
                  </div>
                </>
              )}

              {sheet === "close" && (
                <>
                  <h3 className="vf-sheet__title">Encerrar — motivo?</h3>
                  {sheetErr && <div className="vf-sheet__err">{sheetErr}</div>}
                  <div className="vf-sheet__motivos">
                    {ENCERRAR_MOTIVOS.map(opt => (
                      <button key={opt.status} type="button"
                        className={"vf-sheet-motivo" + (closeMotivo === opt.status ? " is-on" : "")}
                        onClick={() => setCloseMotivo(opt.status)} disabled={busy}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <div className="vf-sheet__foot">
                    <button type="button" className="btn-ghost" onClick={closeSheet} disabled={busy}>Cancelar</button>
                    <button type="button" className="btn-teal" onClick={confirmClose} disabled={!closeMotivo || busy}>
                      {busy ? "Enviando…" : "Encerrar e seguir"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return createPortal(content, document.body);
}
