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
  mode: "free" | "debit" | null;
};

type Draft = {
  id: string;
  state: string;
  status: string;
  // placeLabel: rótulo do lugar já pronto pelo servidor — a cidade canônica do
  // IBGE às vezes já vem "Cidade - UF", e colar a UF de novo aqui produzia
  // "Vitória das Missões - RS - RS" (print do dono, 31/07).
  slots: { targetSegment: string | null; city: string | null; state: string | null; desiredCount: number | null; channels: string[]; placeLabel?: string | null };
  missingFields: string[];
  preview: Preview | null;
  confirmToken: string | null;
  runId: string | null;
  transcript: { role: "user" | "assistant"; content: string }[];
};

type Suggestions = { segments: string[]; city: string | null; state: string | null };

type ApiReply = {
  ok?: boolean;
  code?: string;
  draft?: Draft | null;
  reply?: string;
  chips?: Chip[];
  aiOnline?: boolean;
  suggestions?: Suggestions;
  run?: { status: string; delivered: number; target: number; progress: number; terminal: boolean; message: string | null };
};

type Msg = { dir: "in" | "out"; text: string };

// Semente vinda do cockpit do lead ("Buscar parecidos" — LEAD-COCKPIT). Monta a
// frase natural do que o dono quer buscar a partir do segmento/cidade do lead.
// Cidade sai como "Cidade - UF" (mesmo formato do próprio Concierge). Campo
// faltando → adapta; tudo vazio → "" (o chamador ignora o seed).
/** Mesma regra do servidor (`formatPlaceLabel`): só cola a UF se ela não estiver no fim. */
function placeLabelOf(slots: Draft["slots"] | undefined | null): string {
  if (!slots) return "";
  if (slots.placeLabel) return slots.placeLabel;
  const city = String(slots.city || "").trim();
  const uf = String(slots.state || "").trim().toUpperCase();
  if (!city) return uf;
  if (!uf) return city;
  return city.split(" - ").pop()?.trim().toUpperCase() === uf ? city : `${city} - ${uf}`;
}

function buildConciergeSeedPhrase(seed: { targetSegment?: string; city?: string; state?: string } | null | undefined): string {
  const seg = String(seed?.targetSegment || "").trim();
  const city = String(seed?.city || "").trim();
  const uf = String(seed?.state || "").trim();
  const local = city ? `${city}${uf ? ` - ${uf}` : ""}` : "";
  if (seg && local) return `Quero mais empresas de ${seg} em ${local}`;
  if (seg) return `Quero mais empresas de ${seg}`;
  if (local) return `Quero mais empresas em ${local}`;
  return "";
}

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
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
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
    // Semente do cockpit ("Buscar parecidos" — LEAD-COCKPIT), lida ANTES do
    // bootstrap. Chave single-use: sempre consumida numa visita. Se presente,
    // "Buscar parecidos" é intenção explícita de uma busca NOVA deste lead —
    // não reidratamos o rascunho antigo; resetamos e semeamos com segmento+cidade.
    let seedText = "";
    try {
      const raw = sessionStorage.getItem("hbx:concierge-seed");
      if (raw) {
        sessionStorage.removeItem("hbx:concierge-seed");
        seedText = buildConciergeSeedPhrase(JSON.parse(raw));
      }
    } catch { seedText = ""; }

    (async () => {
      try {
        const res = await apiFetch<ApiReply>("/concierge");
        if (!alive) return;
        if (res?.code === "feature_disabled") { setDisabled(true); return; }
        // Com semente, o rascunho antigo é descartado logo abaixo (reset) —
        // não restaura transcript pra não piscar a conversa velha.
        if (!seedText) {
          if (res?.draft) {
            setDraft(res.draft);
            const restored: Msg[] = (res.draft.transcript || []).map((t) => ({ dir: t.role === "user" ? "out" : "in", text: t.content }));
            setMsgs(restored);
          } else if (res?.reply) {
            setMsgs([{ dir: "in", text: res.reply }]);
          }
        }
        setChips(res?.chips ?? []);
        if (typeof res?.aiOnline === "boolean") setAiOnline(res.aiOnline);
        if (res?.suggestions) setSuggestions(res.suggestions);
      } catch {
        if (!seedText) setMsgs([{ dir: "in", text: "Não consegui carregar agora. Recarregue a página ou use o formulário do Radar." }]);
      } finally {
        if (alive) setLoading(false);
      }

      // Semeadura: reseta o rascunho atual (inclusive uma busca CONCLUÍDA que
      // sobrevive ao reload) e injeta a frase do lead pelo caminho normal
      // (POST /concierge/message). NÃO dispara busca — a busca real só sai no
      // Confirmar. Fail-soft: erro → dica pra digitar.
      if (!alive || !seedText) return;
      setBusy(true);
      try {
        let seedDraftId: string | undefined;
        try {
          const reset = await apiFetch<ApiReply>("/concierge/reset", { method: "POST", body: JSON.stringify({}) });
          if (!alive) return;
          seedDraftId = reset?.draft?.id;
          setDraft(reset?.draft ?? null);
          setRun(null);
        } catch { /* segue mesmo sem reset — o backend cria rascunho novo na mensagem */ }
        setMsgs([{ dir: "out", text: seedText }]);
        const seeded = await apiFetch<ApiReply>("/concierge/message", {
          method: "POST",
          body: JSON.stringify({ draftId: seedDraftId, message: seedText }),
        });
        if (alive) applyReply(seeded);
      } catch (e) {
        if (alive) setMsgs((prev) => [...prev, { dir: "in", text: e instanceof Error ? e.message : "Não consegui iniciar a partir do lead. Digite abaixo o que procura." }]);
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => { alive = false; };
  }, [applyReply]);

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

  async function send(textArg?: string) {
    const text = (textArg ?? input).trim();
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

  // Passo VIVO do guia — deriva da máquina de estados do servidor.
  const guideStep = executed ? 4 : draft?.state === "PREVIEW" ? 3 : draft?.state === "COLLECT_LOCATION" ? 2 : 1;

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

        <div className="cg-layout">
        <Guide
          step={guideStep}
          runTerminal={Boolean(run?.terminal)}
          draft={draft}
          aiOnline={aiOnline}
          suggestions={suggestions}
          busy={busy || loading || executed}
          onExample={(text) => void send(text)}
        />

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
                  {draft?.slots.targetSegment} · {placeLabelOf(draft?.slots)}
                </span>
                {preview.costCredits != null && (
                  <span className="cg-preview__cost">
                    {preview.costCredits} crédito{preview.costCredits === 1 ? "" : "s"}
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
                placeholder={aiOnline ? "" : "IA indisponível — use os botões acima"}
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

// ============================================================================
// GUIA INTELIGENTE (lado esquerdo) — não é manual: ele ACOMPANHA a conversa.
// Passo atual vem da máquina de estados do servidor; "Já entendi" espelha os
// slots ao vivo; os exemplos usam o RAMO da própria empresa (OOBE) e, ao
// clicar, entram como mensagem de verdade. Some no mobile (concierge.css).
// ============================================================================
const GUIDE_STEPS = [
  { n: 1, label: "Diga o que procura" },
  { n: 2, label: "Confirme a cidade" },
  { n: 3, label: "Revise e confirme" },
  { n: 4, label: "Leads no Radar" },
];

function Guide({ step, runTerminal, draft, aiOnline, suggestions, busy, onExample }: {
  step: number;
  runTerminal: boolean;
  draft: Draft | null;
  aiOnline: boolean;
  suggestions: Suggestions | null;
  busy: boolean;
  onExample: (text: string) => void;
}) {
  const slots = draft?.slots;
  const hasAnySlot = Boolean(slots && (slots.targetSegment || slots.city || slots.desiredCount != null || slots.channels.length));

  const city = suggestions?.city || "Curitiba";
  const seg0 = suggestions?.segments?.[0] || "clínicas odontológicas";
  const seg1 = suggestions?.segments?.[1] || "padarias";
  const examples = [
    `20 ${seg0} em ${city}`,
    `10 ${seg1} em ${city} com whatsapp`,
    "50 restaurantes em São Paulo",
  ];

  const tip = !aiOnline
    ? "IA fora do ar — os botões continuam funcionando."
    : step === 1
      ? "Fale do seu jeito — tipo de empresa, cidade e quantos."
      : step === 2
        ? "Só cidades do Brasil por enquanto."
        : step === 3
          ? "Nada é gasto antes do seu OK."
          : runTerminal
            ? "Prontinho — os leads estão no Radar."
            : "Buscando… pode sair da tela, nada se perde.";

  return (
    <aside className="panel cg-guide">
      <div className="cg-guide__sec">Como funciona</div>
      <ol className="cg-gsteps">
        {GUIDE_STEPS.map((s) => (
          <li key={s.n} className={"cg-gstep" + (step === s.n ? " is-active" : step > s.n ? " is-done" : "")}>
            <span className="cg-gstep__dot">{step > s.n ? <I d={ICONS.check} size={11} /> : s.n}</span>
            <span className="cg-gstep__label">{s.label}</span>
          </li>
        ))}
      </ol>

      {hasAnySlot && slots && (
        <>
          <div className="cg-guide__sec">Já entendi</div>
          <dl className="cg-gslots">
            <div className="cg-gslot"><dt>Segmento</dt><dd className={slots.targetSegment ? "is-on" : ""}>{slots.targetSegment || "—"}</dd></div>
            <div className="cg-gslot"><dt>Cidade</dt><dd className={slots.city ? "is-on" : ""}>{slots.city ? placeLabelOf(slots) : "—"}</dd></div>
            <div className="cg-gslot"><dt>Quantos</dt><dd className={slots.desiredCount != null ? "is-on" : ""}>{slots.desiredCount ?? "—"}</dd></div>
            {slots.channels.length > 0 && (
              <div className="cg-gslot"><dt>Canais</dt><dd className="is-on">{slots.channels.join(", ")}</dd></div>
            )}
          </dl>
        </>
      )}

      {step === 1 && !hasAnySlot && (
        <>
          <div className="cg-guide__sec">Experimente</div>
          <div className="cg-gexamples">
            {examples.map((text) => (
              <button key={text} type="button" className="cg-gexample" disabled={busy} onClick={() => onExample(text)}>
                “{text}”
              </button>
            ))}
          </div>
        </>
      )}

      <div className="cg-guide__tip">
        <I d={ICONS.bolt} size={11} />
        <span>{tip}</span>
      </div>
    </aside>
  );
}

function Head() {
  return (
    <div className="cg-head">
      <span className="cg-head__badge"><I d={ICONS.concierge} size={20} /></span>
      <div>
        <div className="cg-head__title">Concierge IA</div>
      </div>
      <span className="cg-hot">Novo</span>
    </div>
  );
}
