"use client";

// ================================================================
// VOZ-ENTREGUE (PR09072026) — confirmar entrega por voz, mãos no volante.
// Web Speech API (SpeechRecognition/webkitSpeechRecognition) — nativa no
// Chrome/Android WebView, R$0, sem lib. FEATURE-DETECTED: navegador sem
// suporte → suportado=false e no-op total (a folha de chegada segue 100%
// por toque, nada muda). Tipos do Web Speech API não fazem parte do lib.dom
// padrão do TS — tipados localmente aqui (sem `any` solto).
// ================================================================

import { useEffect, useRef, useState } from "react";

// ---------- tipos mínimos do Web Speech API (fora do lib.dom do TS) ----------
interface SpeechRecognitionAlternativeLike {
  readonly transcript: string;
}
interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionResultListLike {
  readonly length: number;
  readonly [index: number]: SpeechRecognitionResultLike;
}
interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultListLike;
}
interface SpeechRecognitionErrorEventLike {
  readonly error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// Palavra-chave por INCLUSÃO (.includes) — o negativo é testado ANTES do
// positivo porque "não entregue" contém "entregue" dentro da própria frase.
const PALAVRAS_NAO_ENTREGUE = ["não entregue", "nao entregue", "não entreguei"];
const PALAVRAS_ENTREGUE = ["entregue", "confirmar", "confirma"];

// Anti-duplo-disparo: depois de casar uma palavra, ignora novos matches por
// ~2s (a mesma fala/eco não dispara a ação 2×).
const DEBOUNCE_MS = 2000;

export interface UseVozComandoOpts {
  /** Liga/desliga o reconhecimento (folha aberta, fora do sub-fluxo "não entregue", toggle do motorista…). */
  ativo: boolean;
  /** "entregue" / "confirmar" / "confirma". */
  onEntregue: () => void;
  /** "não entregue" / "nao entregue" / "não entreguei". */
  onNaoEntregue: () => void;
}

export interface UseVozComandoResult {
  /** false em navegador sem SpeechRecognition/webkitSpeechRecognition — no-op total. */
  suportado: boolean;
  /** true enquanto o reconhecimento está de fato escutando (pro ícone pulsar). */
  ouvindo: boolean;
}

/**
 * Hook fino: ouve "entregue"/"confirmar"/"confirma" (→ onEntregue) e "não
 * entregue"/variações (→ onNaoEntregue) enquanto `ativo`. pt-BR, contínuo,
 * só resultado final. Para sozinho no silêncio → religa no `onend` enquanto
 * `ativo` continuar true (flag em ref pra não religar depois de desmontar/
 * desligar). `not-allowed` (permissão negada) degrada pra suportado=false —
 * sem ícone morto na tela; demais erros deixam o `onend` religar.
 */
export function useVozComando({ ativo, onEntregue, onNaoEntregue }: UseVozComandoOpts): UseVozComandoResult {
  const [suportado, setSuportado] = useState(() => getSpeechRecognitionCtor() != null);
  const [ouvindo, setOuvindo] = useState(false);

  // Sempre a versão mais nova dos callbacks, sem recriar o reconhecimento a
  // cada render. Sync num effect sem deps (roda a cada commit) em vez de
  // escrever o ref direto no corpo do hook — react-hooks/refs (eslint-
  // plugin-react-hooks 7, regra do React Compiler) reprova mutar ref fora
  // de effect/handler.
  const onEntregueRef = useRef(onEntregue);
  const onNaoEntregueRef = useRef(onNaoEntregue);
  useEffect(() => {
    onEntregueRef.current = onEntregue;
    onNaoEntregueRef.current = onNaoEntregue;
  });

  const ativoRef = useRef(false); // false = não religar no próximo onend.
  const bloqueadoAteRef = useRef(0); // Date.now() até quando ignorar match novo.

  useEffect(() => {
    if (!ativo || !suportado) return;

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return; // defensivo: suportado já cobre isso, mas sem any/cast solto

    ativoRef.current = true;
    const rec = new Ctor();
    rec.lang = "pt-BR";
    rec.continuous = true;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onstart = () => setOuvindo(true);

    rec.onresult = (ev) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        if (!res.isFinal) continue;
        const transcript = (res[0]?.transcript ?? "").toLowerCase();
        if (!transcript || Date.now() < bloqueadoAteRef.current) continue;
        if (PALAVRAS_NAO_ENTREGUE.some((p) => transcript.includes(p))) {
          bloqueadoAteRef.current = Date.now() + DEBOUNCE_MS;
          onNaoEntregueRef.current();
          continue;
        }
        if (PALAVRAS_ENTREGUE.some((p) => transcript.includes(p))) {
          bloqueadoAteRef.current = Date.now() + DEBOUNCE_MS;
          onEntregueRef.current();
        }
      }
    };

    rec.onerror = (ev) => {
      if (ev.error === "not-allowed") {
        // Permissão negada: degrada pra "sem suporte" — some o ícone em vez
        // de deixar um toggle morto na tela (parar sem quebrar).
        ativoRef.current = false;
        setOuvindo(false);
        setSuportado(false);
        return;
      }
      // "no-speech"/"aborted"/outros: best-effort — o onend religa sozinho.
    };

    rec.onend = () => {
      setOuvindo(false);
      if (ativoRef.current) {
        try {
          rec.start();
        } catch {
          /* religou rápido demais (start duplo) — o próximo onend tenta de novo */
        }
      }
    };

    try {
      rec.start();
    } catch {
      /* alguns navegadores rejeitam start() imediato; sem onend nesse caso,
         mas ativo/suportado seguem válidos pro próximo toggle tentar de novo */
    }

    return () => {
      ativoRef.current = false;
      rec.onstart = null;
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      try {
        rec.stop();
      } catch {
        /* já parado */
      }
      setOuvindo(false);
    };
  }, [ativo, suportado]);

  return { suportado, ouvindo };
}
