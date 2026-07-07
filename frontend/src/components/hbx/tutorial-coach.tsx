"use client";

// Motor de COACHMARK do tutorial (ordem do dono 14/06): tour estilo jogo que
// destaca um elemento REAL do app (sidebar/topbar) com um "buraco" de luz, um
// balão de texto, e avança quando a pessoa clica no alvo certo. Roda por cima do
// shell PERSISTENTE via portal pro <body> e SOBREVIVE à navegação — por isso
// consegue levar a pessoa de Leads → Vendas → Atendimento (clicar muda a rota,
// o coach segue). Tem passo central, passo "limpo" (resumo com typewriter, sem
// escurecer) e passo final (planos + "falar com a HBX").
//
// LEI DO DONO "uma coisa sai pra outra entrar": toda troca de passo faz o balão
// SAIR (fade/escala) e só então o próximo ENTRAR — nunca corte seco. O holofote
// DESLIZA de um alvo pro outro (CSS).
//
// AS 5 LEIS: visual 100% em classe central (.tut-* no screens.css). Aqui só
// entram estilos de POSIÇÃO/tamanho (top/left/width/height) — dinâmicos por
// natureza (rect do alvo) e NÃO são props visuais, então não pesam na catraca.

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type CoachStep = {
  id: string;
  // Rota a que o passo pertence; se não for um passo de clique-no-menu, o coach
  // garante navegar pra cá ao entrar.
  route?: string;
  // Seletor CSS do alvo (ex.: '[data-tut="pele"]'). Ausente = passo central.
  target?: string;
  title: string;
  body: string;
  // 'click' = espera o clique REAL no alvo (jogo). 'next' = botão "Continuar".
  gate?: "click" | "next";
  cta?: string;
  // body escrito letra a letra.
  typewriter?: boolean;
  // sem escurecer a tela; balão no rodapé-centro (resumos de Dashboard/Relatórios).
  plain?: boolean;
  // imagem ilustrativa acima do título (ex.: meta.webp no passo do Meta).
  image?: string;
  // passo final: tela de planos + "ficou dúvida".
  final?: boolean;
  // passo-pergunta com decisão real (ex.: "configurar IA/Bot agora?"). Renderiza
  // dois botões (sim/depois) e chama onChoice antes de avançar.
  choice?: "ai-bot";
};

type Rect = { top: number; left: number; width: number; height: number } | null;

const FIND_TIMEOUT_MS = 4000;
const LEAVE_MS = 200;

function prefersReducedMotion() {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Escreve o texto letra a letra; remonta (key=step.id) a cada passo. Respeita
// reduced-motion (mostra tudo de uma vez).
function Typewriter({ text, speed = 17 }: { text: string; speed?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion()) {
      const t = window.setTimeout(() => setN(text.length), 0);
      return () => window.clearTimeout(t);
    }
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setN(i);
      if (i >= text.length) window.clearInterval(id);
    }, speed);
    return () => window.clearInterval(id);
  }, [text, speed]);
  return <>{text.slice(0, n)}<span className="tut-caret" aria-hidden /></>;
}

export function TutorialCoach({
  steps,
  onDone,
  onSkip,
  onAskHelp,
  onSupport,
  onChoice,
  exitTo = "/dashboard",
}: {
  steps: CoachStep[];
  onDone?: () => void;
  onSkip?: () => void;
  onAskHelp?: () => Promise<void>;
  // Botão "Suporte" verde no passo 0: abre WhatsApp do suporte no modo escolhido pelo usuário.
  onSupport?: () => void;
  // Decisão real de um passo-pergunta (step.choice): o host salva a escolha
  // (ex.: ai_bot_interest) antes de o coach avançar.
  onChoice?: (choice: "ai-bot", value: "yes" | "no") => Promise<void> | void;
  // Pra onde mandar ao Pular/Finalizar. Tour completo (1º acesso) = "/dashboard".
  // Tour de UM módulo = null → fica na própria tela (a pessoa pediu "como usar
  // ESTA tela"; jogar pro dashboard seria estranho).
  exitTo?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname() || "";
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect>(null);
  const [missing, setMissing] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [help, setHelp] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [choiceBusy, setChoiceBusy] = useState<"yes" | "no" | null>(null);
  const rafRef = useRef<number | null>(null);
  // Altura REAL do balão (medida), pra travar a posição dentro da viewport. O corte
  // embaixo vinha de estimar a altura num número fixo — texto maior estourava.
  const balloonRef = useRef<HTMLDivElement | null>(null);
  const [balloonH, setBalloonH] = useState(0);

  const step = steps[i];
  const isLast = i >= steps.length - 1;

  // Troca de passo com a lei "sai antes, entra depois": fade-out do balão →
  // muda o passo → o novo entra com pop-in.
  function go(next: number | "done") {
    setLeaving(true);
    window.setTimeout(() => {
      if (next === "done") { onDone?.(); return; }
      setI(next);
      setLeaving(false);
    }, prefersReducedMotion() ? 0 : LEAVE_MS);
  }
  function advance() { go(isLast ? "done" : Math.min(steps.length - 1, i + 1)); }
  // Sair do tour (Pular/ESC) nunca deixa a pessoa numa /tutorial vazia: leva pro
  // exitTo (Dashboard no tour completo; null = fica onde está, nos tours de módulo).
  function skip() { if (exitTo) router.push(exitTo); (onSkip || onDone)?.(); }

  // ESC encerra o tour.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") skip(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Garante a rota do passo (exceto passos de clique-no-menu, onde o próprio
  // clique navega).
  useEffect(() => {
    if (step?.route && step.gate !== "click" && pathname !== step.route) {
      router.push(step.route);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  // Localiza o alvo, segue sua posição (rAF) e arma o "clique pra avançar".
  useEffect(() => {
    let active = true;
    if (!step?.target) {
      // Passo central/limpo: tira o holofote.
      Promise.resolve().then(() => { if (active) { setRect(null); setMissing(false); } });
      return () => { active = false; };
    }
    Promise.resolve().then(() => { if (active) setMissing(false); });

    let el: Element | null = null;
    let onHit: ((e: Event) => void) | null = null;
    const startedAt = Date.now();

    const track = () => {
      if (!active) return;
      if (!el) {
        el = document.querySelector(step.target!);
        if (!el) {
          if (Date.now() - startedAt > FIND_TIMEOUT_MS) { setMissing(true); return; }
          rafRef.current = requestAnimationFrame(track);
          return;
        }
        try { (el as HTMLElement).scrollIntoView({ block: "nearest", inline: "nearest" }); } catch { /* ok */ }
        if (step.gate !== "next") {
          onHit = () => { window.setTimeout(advance, 60); };
          el.addEventListener("click", onHit, { once: true });
        }
      }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      rafRef.current = requestAnimationFrame(track);
    };
    track();

    return () => {
      active = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (el && onHit) el.removeEventListener("click", onHit);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, step?.target, step?.gate]);

  // Alvo sumiu (cargo/plano não tem) → pula o passo sem travar o jogo.
  useEffect(() => {
    if (!missing) return;
    const t = window.setTimeout(() => advance(), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missing]);

  // Mede a altura real do balão a cada render (antes do paint). setState no mesmo
  // valor é no-op no React, então rodar sem deps NÃO causa loop nem custo relevante —
  // e pega crescimento por texto/typewriter/troca de passo sem estimar nada. (O
  // aviso de "loop infinito" do exhaustive-deps é falso-positivo por isso.)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = balloonRef.current;
    if (el) setBalloonH(el.offsetHeight);
  });

  if (!step || typeof document === "undefined") return null;

  async function ask() {
    if (!onAskHelp) return;
    setHelp("sending");
    try { await onAskHelp(); setHelp("sent"); }
    catch { setHelp("error"); }
  }

  // Passo-pergunta (step.choice): salva a decisão via host e só então avança.
  // Best-effort: falha de rede não trava o tour.
  async function pick(value: "yes" | "no") {
    if (!step.choice || choiceBusy) return;
    setChoiceBusy(value);
    try { await onChoice?.(step.choice, value); } catch { /* escolha é best-effort */ }
    setChoiceBusy(null);
    advance();
  }
  function closeFinal() { if (exitTo) router.push(exitTo); onDone?.(); }

  const PAD = 8;
  const spotlit = !!step.target && !!rect && !step.plain;
  const centered = !step.plain && !spotlit; // boas-vindas / final / enquanto acha alvo

  // Posição do balão: ao lado do alvo (à direita se o alvo está à esquerda;
  // senão abaixo), com TRAVA vertical final pelos 2 ramos — nunca corta embaixo
  // nem em cima. Usa a altura MEDIDA (balloonH), não estimativa.
  const balloon: { left: number; top: number } = { left: 0, top: 0 };
  if (spotlit && rect) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const M = 12;
    const W = Math.min(330, vw - 24);
    const H = balloonH || 240; // 1º paint sem medida ainda → fallback; useLayoutEffect corrige antes de pintar
    if (rect.left < vw * 0.34) {
      // alvo à esquerda → balão à direita dele, topo alinhado
      balloon.left = Math.min(rect.left + rect.width + 16, vw - W - M);
      balloon.top = rect.top - 4;
    } else {
      // alvo à direita → balão abaixo; sem espaço abaixo → acima do alvo
      balloon.left = Math.min(Math.max(M, rect.left + rect.width / 2 - W / 2), vw - W - M);
      const below = rect.top + rect.height + 16;
      balloon.top = below + H > vh - M ? rect.top - H - 16 : below;
    }
    // Trava final: mantém o balão inteiro dentro da viewport (vale pros 2 ramos —
    // era o furo do ramo esquerdo, que não clampava o rodapé → cortava no 7/10).
    balloon.top = Math.min(Math.max(M, balloon.top), Math.max(M, vh - H - M));
  }

  const balloonClass = "tut-balloon"
    + (centered ? " is-centered" : "")
    + (step.plain ? " is-plain" : "")
    + (leaving ? " is-leaving" : "");

  const node = (
    <div className="tut-coach" role="dialog" aria-modal="true" aria-label="Tutorial guiado">
      {spotlit && rect && (
        <div
          className="tut-spot"
          style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }}
          aria-hidden
        />
      )}
      {centered && <div className={"tut-veil" + (leaving ? " is-leaving" : "")} aria-hidden />}

      <div
        key={step.id}
        ref={balloonRef}
        className={balloonClass}
        style={spotlit ? { left: balloon.left, top: balloon.top, maxHeight: "calc(100dvh - 24px)", overflowY: "auto" } : undefined}
      >
        <div className="tut-balloon__head">
          <span className="tut-balloon__step">{i + 1} / {steps.length}</span>
          <button className="tut-balloon__skip" onClick={skip} type="button">Pular tour</button>
        </div>

        {step.image && (
          // Ilustração do tutorial (ex.: Meta) — não é LCP, <img> simples basta.
          // eslint-disable-next-line @next/next/no-img-element
          <img className="tut-img" src={step.image} alt="" />
        )}

        <strong className="tut-balloon__title">{step.title}</strong>
        <p className="tut-balloon__body">
          {step.typewriter ? <Typewriter key={step.id} text={step.body} /> : step.body}
        </p>

        {step.choice ? (
          <div className="tut-choice__row">
            <button className="tut-btn" onClick={() => pick("yes")} type="button" disabled={choiceBusy !== null}>
              {choiceBusy === "yes" ? "Salvando…" : "Configurar agora"}
            </button>
            <button className="tut-btn tut-btn--ghost" onClick={() => pick("no")} type="button" disabled={choiceBusy !== null}>
              {choiceBusy === "no" ? "Salvando…" : "Depois"}
            </button>
          </div>
        ) : step.final ? (
          <div className="tut-final">
            <div className="tut-final__row">
              <button
                className="tut-help-btn"
                onClick={ask}
                type="button"
                disabled={help === "sending" || help === "sent"}
              >
                {help === "sent" ? "Recado enviado ✓" : help === "sending" ? "Enviando…" : help === "error" ? "Tentar de novo" : "Falar com suporte"}
              </button>
              <button className="tut-balloon__skip" onClick={closeFinal} type="button">Finalizar</button>
            </div>
            {help === "sent" && <span className="tut-final__note">A HBX vai te chamar. Pode fechar e usar o sistema. 🙂</span>}
          </div>
        ) : (
          <div className="tut-balloon__foot">
            {i === 0 && onSupport && (
              <button className="tut-btn tut-btn--support" onClick={onSupport} type="button">Suporte</button>
            )}
            {step.gate === "next" || centered || step.plain ? (
              <button className="tut-btn" onClick={advance} type="button">
                {step.cta || (isLast ? "Concluir" : "Continuar")} →
              </button>
            ) : (
              <span className="tut-hint">
                <span className="tut-hint__dot" aria-hidden /> Clique no destaque para seguir
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
