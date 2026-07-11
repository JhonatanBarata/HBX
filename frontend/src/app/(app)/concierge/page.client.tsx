"use client";

// MISSÃO F — CONCIERGE IA (RELEASE-20X S5). Busca do Radar guiada por conversa:
// o cliente DIZ o que procura ("20 dentistas em Curitiba"), a IA local só
// preenche slots (JSON estrito no backend), o CÓDIGO valida cidade/cota/custo e
// mostra o resumo — a busca só dispara com CLIQUE no botão Confirmar (token
// single-use do servidor). Contratos (todos sob /concierge, gate 'concierge'):
//   GET /concierge · POST /concierge/message · POST /concierge/slot
//   POST /concierge/confirm · GET /concierge/draft/:id/status · POST /concierge/reset
// O formulário manual do Radar fica SEMPRE linkado no rodapé (fallback vivo).
// Visual 100% em classe central (concierge.css) — zero hex/inline.

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import { I, ICONS } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";

// ── Tipos (espelham o backend) ───────────────────────────────────────────────
type Chip =
  | { kind: "slot"; field: "targetSegment" | "city" | "desiredCount"; label: string; value: string }
  | { kind: "reset"; label: string };

type Preview = {
  requestedQuantity: number;
  quantity: number;
  clamped: boolean;
  blocked: boolean;
  costCredits: number | null;
  mode: "track" | "debit" | null;
};

type Draft = {
  id: string;
  state: string;
  status: string;
  slots: { targetSegment: string | null; city: string | null; state: string | null; desiredCount: number | null; channels: string[] };
  missingFields: string[];
  preview: Preview | null;
  confirmToken: string | null;
  runId: string | null;
  transcript: { role: "user" | "assistant"; content: string }[];
};

type ApiReply = {
  ok?: boolean;
  code?: string;
  draft?: Draft | null;
  reply?: string;
  chips?: Chip[];
  aiOnline?: boolean;
  run?: { status: string; delivered: number; target: number; progress: number; terminal: boolean; message: string | null };
};

type Msg = { dir: "in" | "out"; text: string };

export function ConciergeClient() {
  const [loading, setLoading] = useState(true);
  const [disabled, setDisabled] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [chips, setChips] = useState<Chip[]>([]);
  const [aiOnline, setAiOnline] = useState(true);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [run, setRun] = useState<ApiReply["run"] | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scrollDown = useCallback(() => {
    requestAnimationFrame(() => {
      const el = bodyRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  const applyReply = useCallback((res: ApiReply | null) => {
    if (!res) return;
    if (res.code === "feature_disabled") { setDisabled(true); return; }
    if (res.draft !== undefined) setDraft(res.draft ?? null);
    if (typeof res.aiOnline === "boolean") setAiOnline(res.aiOnline);
    setChips(res.chips ?? []);
    if (res.reply) setMsgs((prev) => [...prev, { dir: "in", text: res.reply! }]);
  }, []);

  // Bootstrap: reidrata o rascunho ativo (sobrevive reload) + chips de sugestão.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await apiFetch<ApiReply>("/concierge");
        if (!alive) return;
        if (res?.code === "feature_disabled") { setDisabled(true); return; }
        if (res?.draft) {
          setDraft(res.draft);
          const restored: Msg[] = (res.draft.transcript || []).map((t) => ({ dir: t.role === "user" ? "out" : "in", text: t.content }));
          setMsgs(restored);
        } else if (res?.reply) {
          setMsgs([{ dir: "in", text: res.reply }]);
        }
        setChips(res?.chips ?? []);
        if (typeof res?.aiOnline === "boolean") setAiOnline(res.aiOnline);
      } catch {
        setMsgs([{ dir: "in", text: "Não consegui carregar agora. Recarregue a página ou use o formulário do Radar." }]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Poll do resultado quando há busca disparada.
  useEffect(() => {
    if (!draft?.runId || run?.terminal) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    const tick = async () => {
      try {
        const res = await apiFetch<ApiReply>(`/concierge/draft/${encodeURIComponent(draft.id)}/status`);
        if (res?.run) {
          setRun(res.run);
          if (res.run.terminal && pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        }
      } catch { /* mantém o poll */ }
    };
    void tick();
    pollRef.current = setInterval(() => { void tick(); }, 4000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [draft?.runId, draft?.id, run?.terminal]);

  useEffect(() => { scrollDown(); }, [msgs, scrollDown]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMsgs((prev) => [...prev, { dir: "out", text }]);
    setBusy(true);
    try {
      const res = await apiFetch<ApiReply>("/concierge/message", {
        method: "POST",
        body: JSON.stringify({ draftId: draft?.id, message: text }),
      });
      applyReply(res);
    } catch (e) {
      setMsgs((prev) => [...prev, { dir: "in", text: e instanceof Error ? e.message : "Falhou. Tente de novo." }]);
    } finally {
      setBusy(false);
    }
  }

  async function clickChip(chip: Chip) {
    if (busy) return;
    setBusy(true);
    try {
      if (chip.kind === "reset") {
        const res = await apiFetch<ApiReply>("/concierge/reset", { method: "POST", body: JSON.stringify({}) });
        setDraft(null);
        setRun(null);
        setMsgs(res?.reply ? [{ dir: "in", text: res.reply }] : []);
        setChips(res?.chips ?? []);
        return;
      }
      setMsgs((prev) => [...prev, { dir: "out", text: chip.label }]);
      const res = await apiFetch<ApiReply>("/concierge/slot", {
        method: "POST",
        body: JSON.stringify({ draftId: draft?.id, field: chip.field, value: chip.field === "desiredCount" ? Number(chip.value) : chip.value }),
      });
      applyReply(res);
    } catch (e) {
      setMsgs((prev) => [...prev, { dir: "in", text: e instanceof Error ? e.message : "Falhou. Tente de novo." }]);
    } finally {
      setBusy(false);
    }
  }

  // Confirmação HUMANA — o único caminho que dispara a busca.
  async function confirmar() {
    if (!draft?.id || !draft.confirmToken || confirming) return;
    setConfirming(true);
    try {
      const res = await apiFetch<ApiReply>("/concierge/confirm", {
        method: "POST",
        body: JSON.stringify({ draftId: draft.id, confirmToken: draft.confirmToken }),
      });
      applyReply(res);
    } catch (e) {
      setMsgs((prev) => [...prev, { dir: "in", text: e instanceof Error ? e.message : "Não consegui confirmar. Revise e tente de novo." }]);
    } finally {
      setConfirming(false);
    }
  }

  const preview = draft?.status === "active" ? draft?.preview : null;
  const showConfirm = Boolean(preview && !preview.blocked && draft?.confirmToken);
  const executed = draft?.status === "executed";

  if (disabled) {
    return (
      <div className="work cg-work">
        <div className="cg-wrap">
          <Head />
          <div className="panel cg-off">
            <I d={ICONS.help} size={16} />
            <span>O Concierge ainda não está liberado para esta instalação.</span>
            <Link className="btn-ghost btn-xs" href="/vendas">Ir para Vendas</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="work cg-work">
      <div className="cg-wrap">
        <Head />

        <div className="panel cg-panel">
          <div className="cg-chat" ref={bodyRef}>
            {loading ? (
              <div className="hint">Carregando…</div>
            ) : (
              <>
                {msgs.map((m, i) => (
                  <div key={i} className={"cg-msg" + (m.dir === "out" ? " is-out" : "")}>
                    <span className="cg-msg__bubble">{m.text}</span>
                  </div>
                ))}
                {busy && <div className="cg-msg"><span className="cg-msg__bubble is-typing">…</span></div>}
              </>
            )}
          </div>

          {!loading && chips.length > 0 && !executed && (
            <div className="cg-chips">
              {chips.map((chip, i) => (
                <button key={i} type="button" className="cg-chip" disabled={busy} onClick={() => void clickChip(chip)}>
                  {chip.label}
                </button>
              ))}
            </div>
          )}

          {showConfirm && preview && (
            <div className="cg-preview">
              <div className="cg-preview__facts">
                <span className="cg-preview__qty">{preview.quantity}</span>
                <span className="cg-preview__what">
                  {draft?.slots.targetSegment} · {draft?.slots.city}{draft?.slots.state ? ` - ${draft.slots.state}` : ""}
                </span>
                {preview.costCredits != null && (
                  <span className="cg-preview__cost">
                    {preview.costCredits} crédito{preview.costCredits === 1 ? "" : "s"}
                    {preview.mode === "track" ? " (só medição)" : ""}
                  </span>
                )}
              </div>
              <button type="button" className="btn-teal" disabled={confirming} onClick={() => void confirmar()}>
                {confirming ? "Disparando…" : "Confirmar busca"}
              </button>
            </div>
          )}

          {executed && (
            <div className="cg-run">
              <span className="cg-run__label">
                {run?.terminal
                  ? `Pronto: ${run.delivered} lead${run.delivered === 1 ? "" : "s"} entregue${run.delivered === 1 ? "" : "s"}.`
                  : `Buscando… ${run ? `${run.delivered}/${run.target}` : ""}`}
              </span>
              <div className="cg-run__actions">
                <Link className="btn-teal btn-xs" href="/vendas">Ver leads</Link>
                <button type="button" className="btn-ghost btn-xs" disabled={busy} onClick={() => void clickChip({ kind: "reset", label: "Nova busca" })}>
                  Nova busca
                </button>
              </div>
            </div>
          )}

          {!executed && (
            <form className="cg-composer" onSubmit={(e) => { e.preventDefault(); void send(); }}>
              <input
                className="field-dark"
                value={input}
                maxLength={500}
                placeholder={aiOnline ? 'Ex.: "20 clínicas odontológicas em Curitiba"' : "IA indisponível — use os botões acima"}
                onChange={(e) => setInput(e.target.value)}
                disabled={busy || loading}
                aria-label="Diga o que você procura"
              />
              <button type="submit" className="cg-send" disabled={busy || loading || !input.trim()} aria-label="Enviar">
                <I d={ICONS.send} size={16} />
              </button>
            </form>
          )}
        </div>

        <div className="cg-foot">
          <I d={ICONS.search} size={12} />
          <span>Prefere preencher na mão?</span>
          <Link href="/vendas" className="cg-foot__link">Abrir a busca do Radar</Link>
        </div>
      </div>
    </div>
  );
}

function Head() {
  return (
    <div className="cg-head">
      <span className="cg-head__badge"><I d={ICONS.concierge} size={20} /></span>
      <div>
        <div className="cg-head__title">Concierge IA</div>
        <div className="cg-head__sub">Diga o que procura — eu monto a busca, mostro o custo e você confirma.</div>
      </div>
      <span className="cg-hot">Novo</span>
    </div>
  );
}
