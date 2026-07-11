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

// ── Classificador PURO do comando de voz (exportado p/ testar sem browser) ────
// VIÉS DE SEGURANÇA MÁXIMO: "entregue" dispara AÇÃO LIVE E IRREVERSÍVEL (marca
// entregue + WhatsApp ao cliente no chip do tenant + cobrança). O positivo só
// pode nascer de um COMANDO DELIBERADO — nunca de uma palavra solta que apareça
// em conversa/pergunta/negação de terceiro perto do celular escutando.
//
// Histórico das armadilhas (revisão adversarial 11/07):
//   · substring: "não FOI entregue" caía no positivo "entregue";
//   · palavra solta "entregue" em fala curta: "foi entregue?", "esse já
//     entreguei" (outra parada), rádio de fundo — todos confirmavam;
//   · negação coloquial BR "num"/"nem" ("num foi entregue") escapava e confirmava.
//
// Regra atual (à prova dessas): normaliza (sem acento) e exige, pro POSITIVO, os
// DOIS pedaços do comando juntos — um VERBO DE CONFIRMAÇÃO ("confirmar"/"confirma"/
// "confirmado"…) E uma palavra de ENTREGA ("entrega"/"entregue"…), sem NENHUMA
// negação. Ambiente não junta os dois: "foi entregue?" não tem verbo de
// confirmação; "confirma o pedido de amanhã" não tem palavra de entrega. O
// NEGATIVO (→ nao_entregue) é negação + palavra de entrega. O resto → null.
// UX: o motorista confirma dizendo "confirmar entrega" (a folha mostra a dica).
const VOZ_NEG_TOKENS = ["nao", "num", "nem", "nunca", "jamais", "negativo"];
const VOZ_CONFIRMA_TOKENS = ["confirmar", "confirma", "confirmado", "confirmada", "confirmei", "confirmo"];
const VOZ_ENTREGA_TOKENS = ["entrega", "entregue", "entreguei", "entregou", "entregar"];

export function normalizarTranscript(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "") // tira acento (não → nao)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function classificarComandoVoz(transcriptRaw: string): "entregue" | "nao_entregue" | null {
  const t = normalizarTranscript(transcriptRaw);
  if (!t) return null;
  const palavras = t.split(" ");
  const tem = (arr: readonly string[]) => arr.some((w) => palavras.includes(w));

  const temNegacao = tem(VOZ_NEG_TOKENS);
  const ehPergunta = String(transcriptRaw).includes("?"); // pergunta ("foi entregue?") ≠ comando
  const temEntrega = tem(VOZ_ENTREGA_TOKENS);

  // Negação REAL + palavra de entrega → motorista relatando falha ("não/num/nem entregue").
  if (temNegacao && temEntrega) return "nao_entregue";
  // Negação sem entrega, ou pergunta → nunca confirma (freio); não abre nada.
  if (temNegacao || ehPergunta) return null;
  // POSITIVO só com comando DELIBERADO de 2 partes: verbo de confirmação + entrega.
  if (tem(VOZ_CONFIRMA_TOKENS) && temEntrega) return "entregue";
  return null;
}

// Anti-duplo-disparo: depois de casar uma palavra, ignora novos matches por
// ~2s (a mesma fala/eco não dispara a ação 2×).
const DEBOUNCE_MS = 2000;

export interface UseVozComandoOpts {
  /** Liga/desliga o reconhecimento (folha aberta, fora do sub-fluxo "não entregue", toggle do motorista…). */
  ativo: boolean;
  /** Comando deliberado de confirmação: verbo (confirmar/confirma…) + "entrega/entregue", sem negação. Ex.: "confirmar entrega". */
  onEntregue: () => void;
  /** Negação + entrega: "não/num/nem entregue", "não entreguei". */
  onNaoEntregue: () => void;
}

export interface UseVozComandoResult {
  /** false em navegador sem SpeechRecognition/webkitSpeechRecognition — no-op total. */
  suportado: boolean;
  /** true enquanto o reconhecimento está de fato escutando (pro ícone pulsar). */
  ouvindo: boolean;
}

/**
 * Hook fino: ouve o comando deliberado "confirmar entrega" (verbo de confirmação
 * + palavra de entrega → onEntregue) e negação de entrega ("não/num/nem entregue"
 * → onNaoEntregue) enquanto `ativo`. pt-BR, contínuo, só resultado final. Palavra
 * solta ("entregue") NÃO confirma — é ação live. Para sozinho no silêncio → religa
 * no `onend` enquanto
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
        const transcript = res[0]?.transcript ?? "";
        if (!transcript || Date.now() < bloqueadoAteRef.current) continue;
        const comando = classificarComandoVoz(transcript);
        if (!comando) continue;
        bloqueadoAteRef.current = Date.now() + DEBOUNCE_MS;
        if (comando === "nao_entregue") onNaoEntregueRef.current();
        else onEntregueRef.current();
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
