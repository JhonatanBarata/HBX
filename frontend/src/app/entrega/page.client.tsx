"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { getToken } from "@/lib/api";

// ================================================================
// HOME / VITRINE do app de entrega (M1) — SÓ prova o Design System.
// Dado ESTÁTICO/falso. As telas reais (Hoje / Rota c/ swipe / Chegada c/
// stepper) são o M4 e NÃO são construídas aqui.
//
// Aqui já ficam prontos, pro M3/M4 plugar:
//  - reuso da sessão/JWT existente (getToken → sem token, vai pro /login);
//  - captura do beforeinstallprompt → botão "Instalar" (add à home);
//  - hook de Screen Wake Lock (pronto; SÓ é ativado quando a ROTA iniciar,
//    o que é M3/M4 — aqui não acorda a tela à toa).
// ================================================================

// Tipos mínimos p/ APIs que ainda não estão no lib.dom padrão (evita `any`,
// mantém o tsc estrito verde). Não são polyfills — só a forma do contrato.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
type WakeLockSentinelLike = { release: () => Promise<void> };
type WakeLockLike = { request: (type: "screen") => Promise<WakeLockSentinelLike> };

// Hook de Wake Lock: mantém a tela acesa DURANTE a rota (o entregador vive
// olhando a parada atual). Fica pronto aqui; a rota (M3/M4) chama enable().
function useWakeLock() {
  const sentinel = useRef<WakeLockSentinelLike | null>(null);

  const enable = useCallback(async () => {
    try {
      const nav = navigator as Navigator & { wakeLock?: WakeLockLike };
      if (!nav.wakeLock) return false;
      sentinel.current = await nav.wakeLock.request("screen");
      return true;
    } catch {
      return false;
    }
  }, []);

  const disable = useCallback(async () => {
    try {
      await sentinel.current?.release();
    } catch {
      /* já liberado */
    }
    sentinel.current = null;
  }, []);

  // Solta o lock ao desmontar (nunca segura a tela depois de sair da rota).
  useEffect(() => {
    return () => {
      void sentinel.current?.release().catch(() => {});
    };
  }, []);

  return { enable, disable };
}

export function EntregaHome() {
  const router = useRouter();
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  // Hook pronto p/ o M4; referenciado pra não quebrar o build "no-unused".
  const wakeLock = useWakeLock();

  // AUTH: reusa a sessão do app. Sem token → login existente (não inventa auth).
  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);

  // Captura o prompt de instalação (Chrome/Android). Guardado pra disparar no
  // clique do botão "Instalar".
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const onInstalled = () => setInstallEvent(null);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const onInstall = useCallback(async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  }, [installEvent]);

  // Feedback físico (Lei nº4): buzina curta. Guarda o hook do wakeLock vivo p/
  // o M4 sem ativá-lo agora (a rota que liga a tela sempre acesa).
  const onDemoTap = useCallback(() => {
    if ("vibrate" in navigator) navigator.vibrate(12);
    void wakeLock;
  }, [wakeLock]);

  return (
    <div className="ent-app">
      <header className="ent-head">
        <div>
          <div className="ent-head-title">Hoje</div>
          <div className="ent-head-sub">quinta, 4 de julho</div>
        </div>
        {installEvent ? (
          <button type="button" className="ent-chip is-on" onClick={onInstall}>
            Instalar
          </button>
        ) : null}
      </header>

      <section className="ent-progress" aria-label="Progresso do dia">
        <div className="ent-progress-row">
          <div className="ent-progress-count">
            <b>3</b>/12
          </div>
          <div className="ent-progress-eta">
            término
            <strong>16:40</strong>
          </div>
        </div>
        <div className="ent-progress-bar">
          <div className="ent-progress-fill" style={{ width: "25%" }} />
        </div>
      </section>

      <article className="ent-stop-card" onClick={onDemoTap}>
        <span className="ent-stop-badge">Parada 3</span>
        <div className="ent-stop-name">Padaria Pão Quente</div>
        <div className="ent-stop-addr">Rua das Flores, 128 — Centro</div>
        <div className="ent-stop-items">
          <b>4</b>
          <span>galões de 20L</span>
        </div>
      </article>

      <div className="ent-dots" aria-hidden="true">
        <span className="ent-dot" />
        <span className="ent-dot" />
        <span className="ent-dot is-on" />
        <span className="ent-dot" />
        <span className="ent-dot" />
      </div>

      <section className="ent-stop-card">
        <div className="ent-stop-name">Quantos galões?</div>
        <div className="ent-stepper">
          <button type="button" className="ent-stepper-btn" aria-label="Menos um">
            −
          </button>
          <div className="ent-stepper-val">4</div>
          <button type="button" className="ent-stepper-btn" aria-label="Mais um">
            +
          </button>
        </div>
        <div className="ent-chips">
          <button type="button" className="ent-chip is-on">
            Dinheiro
          </button>
          <button type="button" className="ent-chip">
            Pix
          </button>
          <button type="button" className="ent-chip">
            Pendura
          </button>
        </div>
      </section>

      <div className="ent-actionbar">
        <button type="button" className="ent-btn ent-btn--secondary">
          Navegar
        </button>
        <button type="button" className="ent-btn ent-btn--primary" onClick={onDemoTap}>
          Entregue
        </button>
      </div>
    </div>
  );
}
