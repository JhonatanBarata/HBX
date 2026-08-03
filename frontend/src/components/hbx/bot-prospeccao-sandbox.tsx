"use client";

// BotProspeccaoSandbox — "Teste de conversa" ponta a ponta do disparo frio.
//
// O dono FALA com o bot (joga de lead) e o bot RESPONDE como responderia de
// verdade: roda o MESMO classificador do motor (endpoint /prospecting/simulate,
// sem efeito colateral), respeita o tempo de "digitando…" configurado, abre com
// a mensagem de aquecimento frio (se ligada) e depois o 1º contato, e cada balão
// do bot ganha setas ‹ x/y › pra navegar entre as variantes que ele reveza.
//
// Perspectiva = celular do LEAD: o bot chega à esquerda (recebida), o que o dono
// digita vai à direita (enviada). Pintura só via tokens (whatsapp.css / 5 Leis).

import { useCallback, useRef, useState } from "react";

import { I, ICONS } from "@/components/hbx/shell";
import { WhatsAppPreview, type WAMessage } from "@/components/hbx/whatsapp-preview";
import { apiFetch } from "@/lib/api";
import type { ProspConfigApi, ProspCfg } from "@/lib/use-prospecting-config";

type SimTone = "green" | "yellow" | "red" | "gray";
type OpenerResp = {
  typingSeconds: number;
  typingVarianceSeconds: number;
  preMessageEnabled: boolean;
  preMessageVariants: string[];
  firstContactVariants: string[];
};
type ReplyResp = {
  intent: { kind: string; confidence: number; reasons: string[] };
  typingSeconds: number;
  action: "reply" | "handoff" | "silent";
  tone: SimTone;
  note: string;
  group: string | null;
  variants: string[];
};

type Stage = "idle" | "awaiting_warmup_reply" | "conversation";

function nowTime(): string {
  const d = new Date();
  return d.getHours().toString().padStart(2, "0") + ":" + d.getMinutes().toString().padStart(2, "0");
}

// Lê os valores EFETIVOS da tela (draft → salvo → default) e envia só o que o
// dono mexeu — listas vazias são omitidas pra o backend cair no padrão do motor.
function buildConfigPayload(cfg: ProspConfigApi): Record<string, unknown> {
  const listKeys: (keyof ProspCfg)[] = [
    "preMessageVariants", "firstContactVariants", "positiveReplyVariants", "whatIsItReplyVariants",
    "scheduledReplyVariants", "optOutVariants", "neutralHandoffVariants",
    "handoffGerenteVariants", "handoffGerenteFollowUpVariants",
    "positiveIntentKeywords", "negativeIntentKeywords", "whatIsItIntentKeywords",
    "callbackIntentKeywords", "humanHandoffIntentKeywords",
  ];
  const payload: Record<string, unknown> = {
    preMessageEnabled: cfg.boolVal("preMessageEnabled"),
    typingSeconds: cfg.numVal("typingSeconds"),
    typingVarianceSeconds: cfg.numVal("typingVarianceSeconds"),
  };
  for (const k of listKeys) {
    const cleaned = cfg.listVal(k).map(s => s.trim()).filter(Boolean);
    if (cleaned.length) payload[k as string] = cleaned;
  }
  return payload;
}

export function BotProspeccaoSandbox({ cfg }: { cfg: ProspConfigApi }) {
  const [messages, setMessages] = useState<WAMessage[]>([]);
  const [typing, setTyping] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  const bodyRef = useRef<HTMLDivElement | null>(null);
  const playRef = useRef(0);          // invalida sequências em curso ao reiniciar
  const skipRef = useRef<null | (() => void)>(null);
  const firstContactRef = useRef<string[]>([]); // guardado pra liberar o pitch após o aquecimento

  const scrollDown = useCallback(() => {
    requestAnimationFrame(() => {
      const el = bodyRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  // Espera "digitando…" — pode ser pulada (clique no balão) ou cancelada (reiniciar).
  function sleep(ms: number) {
    return new Promise<void>(resolve => {
      const t = setTimeout(() => { skipRef.current = null; resolve(); }, ms);
      skipRef.current = () => { clearTimeout(t); skipRef.current = null; resolve(); };
    });
  }
  const skipTyping = useCallback(() => { skipRef.current?.(); }, []);

  // Toca um balão do bot: mostra "digitando…" pelo tempo configurado, depois o balão.
  const playBotBubble = useCallback(async (variants: string[], typingSeconds: number) => {
    const token = ++playRef.current;
    if (!variants.length) return;
    setTyping(true);
    scrollDown();
    await sleep(Math.max(300, Math.round((typingSeconds || 0) * 1000)));
    if (token !== playRef.current) return;
    setTyping(false);
    setMessages(prev => [...prev, { dir: "in", text: variants[0], variants, variant: 0, time: nowTime() }]);
    scrollDown();
  }, [scrollDown]);

  const pushNote = useCallback((tone: SimTone, text: string) => {
    setMessages(prev => [...prev, { dir: "in", system: true, tone, text }]);
    scrollDown();
  }, [scrollDown]);

  // (Re)inicia o teste: busca o abre-alas (aquecimento + 1º contato) e toca.
  const start = useCallback(async () => {
    playRef.current++;             // invalida qualquer sequência anterior
    skipRef.current?.();
    setErr(null);
    setBusy(true);
    setStarted(true);
    setTyping(false);
    setMessages([]);
    try {
      const res = await apiFetch<OpenerResp>("/vendas/automation/prospecting/simulate", {
        method: "POST",
        body: JSON.stringify({ mode: "opener", config: buildConfigPayload(cfg) }),
      });
      firstContactRef.current = res?.firstContactVariants || [];
      setBusy(false);
      if (res?.preMessageEnabled && res.preMessageVariants?.length) {
        await playBotBubble(res.preMessageVariants, res.typingSeconds);
        setStage("awaiting_warmup_reply");
      } else {
        await playBotBubble(res.firstContactVariants || [], res.typingSeconds);
        setStage("conversation");
      }
    } catch (e: unknown) {
      setBusy(false);
      setErr((e as { message?: string })?.message || "Não consegui carregar o teste.");
    }
  }, [cfg, playBotBubble]);

  // Dono manda uma mensagem (jogando de lead).
  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy || typing) return;
    setInput("");
    setMessages(prev => [...prev, { dir: "out", text, status: "read", time: nowTime() }]);
    scrollDown();

    // Resposta à mensagem de aquecimento: qualquer resposta humana libera o 1º contato.
    if (stage === "awaiting_warmup_reply") {
      const typingSeconds = cfg.numVal("typingSeconds");
      await playBotBubble(firstContactRef.current, typingSeconds);
      setStage("conversation");
      return;
    }

    setBusy(true);
    try {
      const res = await apiFetch<ReplyResp>("/vendas/automation/prospecting/simulate", {
        method: "POST",
        body: JSON.stringify({ mode: "reply", text, config: buildConfigPayload(cfg) }),
      });
      setBusy(false);
      if (res.action === "reply" && res.variants?.length) {
        await playBotBubble(res.variants, res.typingSeconds);
        pushNote(res.tone, res.note);
      } else {
        // handoff/silent: o bot NÃO responde sozinho — só mostra o que ele faz.
        pushNote(res.tone, res.note);
      }
    } catch (e: unknown) {
      setBusy(false);
      pushNote("gray", (e as { message?: string })?.message || "Não consegui classificar a resposta.");
    }
  }, [input, busy, typing, stage, cfg, playBotBubble, pushNote, scrollDown]);

  const cycleVariant = useCallback((index: number, dir: -1 | 1) => {
    setMessages(prev => prev.map((m, i) => {
      if (i !== index || !m.variants?.length) return m;
      const total = m.variants.length;
      const next = ((m.variant ?? 0) + dir + total) % total;
      return { ...m, variant: next, text: m.variants[next] };
    }));
  }, []);

  const typingSecondsLabel = cfg.numVal("typingSeconds");

  return (
    <div className="bot-sandbox">
      {started && (
        <button type="button" className="bot-sandbox__restart" onClick={start} disabled={busy} title="Reiniciar teste" aria-label="Reiniciar teste">
          <span className="bot-sandbox__restart-glyph" aria-hidden="true">⟳</span> Reiniciar
        </button>
      )}
      {err && <div className="bot-sandbox__err" role="alert">{err}</div>}

      <WhatsAppPreview
        messages={messages}
        typing={typing}
        bodyRef={bodyRef}
        header={{ name: "Lead", status: "online" }}
        onCycleVariant={cycleVariant}
        onSkipTyping={skipTyping}
        typingHint={typingSecondsLabel ? `${typingSecondsLabel}s — toque pra pular` : "toque pra pular"}
        emptyHint={busy ? "Preparando o teste…" : 'Toque em “Começar” pra o bot puxar a conversa como faria com um lead.'}
        footer={
          !started ? (
            <button type="button" className="btn-teal bot-sandbox__cta" onClick={start} disabled={busy}>
              <I d={ICONS.play} size={13} /> Começar o teste
            </button>
          ) : (
            <form
              className="wa-composer-row"
              onSubmit={e => { e.preventDefault(); void send(); }}
            >
              <input
                className="field-dark wa-composer-input"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={stage === "awaiting_warmup_reply" ? "Responda o aquecimento…" : "Responda como o lead…"}
                disabled={typing || busy}
                aria-label="Sua resposta como lead"
              />
              <button type="submit" className="wa-send" disabled={!input.trim() || typing || busy} aria-label="Enviar">
                <I d={ICONS.send} size={16} />
              </button>
            </form>
          )
        }
      />
    </div>
  );
}

export default BotProspeccaoSandbox;
