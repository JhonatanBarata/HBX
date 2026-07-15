"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { API_LIFECYCLE_EVENT, type ApiLifecycleDetail } from "@/lib/api";
import styles from "./lead-pull-progress-overlay.module.css";

type StageKey = "prepare" | "whatsapp" | "policy" | "vendas" | "finalize";
type PullPhase = "running" | "success" | "partial";

type CardMeta = {
  key: string;
  name: string;
  location: string;
  segment: string;
  source: string;
};

type MutableSession = {
  token: number;
  expectedTotal: number;
  cards: CardMeta[];
  startedIds: string[];
  completedIds: Set<string>;
  failedIds: Set<string>;
  currentId: string | null;
  currentIndex: number;
  currentCard: CardMeta | null;
  stage: StageKey;
  fraction: number;
  phase: PullPhase;
  leaving: boolean;
  errorMessage: string | null;
  startedAt: number;
  finishedAt: number | null;
};

type PullView = {
  phase: PullPhase;
  leaving: boolean;
  total: number;
  completed: number;
  failed: number;
  processed: number;
  percent: number;
  stage: StageKey;
  currentIndex: number;
  currentCard: CardMeta | null;
  errorMessage: string | null;
  elapsedMs: number;
};

type StageDefinition = {
  key: StageKey;
  label: string;
  detail: string;
};

const STAGES: StageDefinition[] = [
  { key: "prepare", label: "Preparando card", detail: "Lendo os dados selecionados" },
  { key: "whatsapp", label: "Verificando WhatsApp", detail: "Checando o contato no servidor" },
  { key: "policy", label: "Validando acesso e crédito", detail: "Aplicando regras da equipe" },
  { key: "vendas", label: "Criando card em Vendas", detail: "Importando dados e responsável" },
  { key: "finalize", label: "Atualizando a carteira", detail: "Confirmando a entrega" },
];

const SEND_TO_VENDAS_RE = /\/webscraping\/radar\/leads\/([^/?#]+)\/send-to-vendas(?:[/?#]|$)/;
const CHECKBOX_SELECTOR = ".row-dense__pick input[type='checkbox'], .be-card__pick input[type='checkbox']";

function normalizeText(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function textOf(root: Element | null, selector: string) {
  return normalizeText(root?.querySelector(selector)?.textContent);
}

function cardMetaFromContainer(container: Element | null): CardMeta | null {
  if (!container) return null;
  const checkbox = container.querySelector<HTMLInputElement>("input[aria-label^='Selecionar ']");
  const ariaName = normalizeText(checkbox?.getAttribute("aria-label")).replace(/^Selecionar\s+/i, "");
  const name = ariaName || textOf(container, ".row-dense__name, .be-card__name") || "Card selecionado";
  const location = textOf(container, ".row-dense__loc, .be-card__loc");
  const segment = textOf(container, ".row-dense__seg, .be-card__seg");
  const source = textOf(container, ".radar-origin-badge");
  return {
    key: [name, location, segment].join("|").toLocaleLowerCase("pt-BR"),
    name,
    location,
    segment,
    source,
  };
}

function cardMetaFromCheckbox(input: HTMLInputElement) {
  return cardMetaFromContainer(input.closest(".row-dense, .be-card"));
}

function collectCheckedCards(root: ParentNode): CardMeta[] {
  const cards: CardMeta[] = [];
  const seen = new Set<string>();
  root.querySelectorAll<HTMLInputElement>(CHECKBOX_SELECTOR).forEach(input => {
    if (!input.checked) return;
    const card = cardMetaFromCheckbox(input);
    if (!card || seen.has(card.key)) return;
    seen.add(card.key);
    cards.push(card);
  });
  return cards;
}

function mergeSelectionOrder(ordered: CardMeta[], checked: CardMeta[]) {
  const checkedByKey = new Map(checked.map(card => [card.key, card]));
  const merged: CardMeta[] = [];
  const seen = new Set<string>();
  for (const card of ordered) {
    const current = checkedByKey.get(card.key);
    if (!current || seen.has(current.key)) continue;
    seen.add(current.key);
    merged.push(current);
  }
  for (const card of checked) {
    if (seen.has(card.key)) continue;
    seen.add(card.key);
    merged.push(card);
  }
  return merged;
}

function stageIndex(stage: StageKey) {
  return Math.max(0, STAGES.findIndex(item => item.key === stage));
}

function buildView(session: MutableSession, now = Date.now()): PullView {
  const total = Math.max(1, session.expectedTotal, session.startedIds.length);
  const completed = session.completedIds.size;
  const failed = session.failedIds.size;
  const processed = completed + failed;
  const currentPending = Boolean(
    session.currentId
      && !session.completedIds.has(session.currentId)
      && !session.failedIds.has(session.currentId),
  );
  let percent = Math.round(((processed + (currentPending ? session.fraction : 0)) / total) * 100);
  if (session.phase === "success") percent = 100;
  else percent = Math.min(99, Math.max(0, percent));
  const endAt = session.finishedAt || now;
  return {
    phase: session.phase,
    leaving: session.leaving,
    total,
    completed,
    failed,
    processed,
    percent,
    stage: session.stage,
    currentIndex: session.currentIndex,
    currentCard: session.currentCard,
    errorMessage: session.errorMessage,
    elapsedMs: Math.max(0, endAt - session.startedAt),
  };
}

function formatElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function plural(count: number, one: string, many: string) {
  return count === 1 ? one : many;
}

function CloudArrowIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M14.5 34.5H12a8 8 0 0 1-1.3-15.9A13.5 13.5 0 0 1 36.4 16a9.5 9.5 0 0 1-.9 18.5H33" />
      <path d="M24 20v17m0 0-6-6m6 6 6-6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 8v5" />
      <path d="M12 17h.01" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

function stageState(view: PullView, index: number) {
  if (view.phase === "success") return "done";
  const active = stageIndex(view.stage);
  if (view.phase === "partial" && index === active) return "error";
  if (index < active) return "done";
  if (index === active) return "active";
  return "pending";
}

function stageDetailText(view: PullView, stage: StageDefinition, state: string) {
  if (state === "active") {
    return view.total > 1
      ? `Card ${Math.max(1, view.currentIndex)} de ${view.total}`
      : "Em andamento";
  }
  if (state === "done") return "Concluído";
  if (state === "error") return "Interrompido";
  return stage.detail;
}

export function LeadPullProgressOverlay() {
  const [view, setView] = useState<PullView | null>(null);

  useEffect(() => {
    let alive = true;
    let session: MutableSession | null = null;
    let selectionOrder: CardMeta[] = [];
    let sessionToken = 0;
    let stageTimers: number[] = [];
    let finalizeTimer: number | null = null;
    let leaveTimer: number | null = null;
    let closeTimer: number | null = null;
    let clockTimer: number | null = null;
    let selectAllTimer: number | null = null;

    function clearStageTimers() {
      stageTimers.forEach(timer => window.clearTimeout(timer));
      stageTimers = [];
    }

    function clearLifecycleTimers() {
      if (finalizeTimer != null) window.clearTimeout(finalizeTimer);
      if (leaveTimer != null) window.clearTimeout(leaveTimer);
      if (closeTimer != null) window.clearTimeout(closeTimer);
      if (clockTimer != null) window.clearInterval(clockTimer);
      finalizeTimer = null;
      leaveTimer = null;
      closeTimer = null;
      clockTimer = null;
    }

    function sync(now = Date.now()) {
      if (!alive) return;
      setView(session ? buildView(session, now) : null);
    }

    function beginSession(expectedTotal: number, cards: CardMeta[]) {
      clearStageTimers();
      clearLifecycleTimers();
      sessionToken += 1;
      session = {
        token: sessionToken,
        expectedTotal: Math.max(1, expectedTotal),
        cards,
        startedIds: [],
        completedIds: new Set<string>(),
        failedIds: new Set<string>(),
        currentId: null,
        currentIndex: 0,
        currentCard: cards[0] || null,
        stage: "prepare",
        fraction: 0,
        phase: "running",
        leaving: false,
        errorMessage: null,
        startedAt: Date.now(),
        finishedAt: null,
      };
      sync();
      clockTimer = window.setInterval(() => sync(), 250);
    }

    function beginLeaving() {
      if (!session) return;
      session.leaving = true;
      sync();
      closeTimer = window.setTimeout(() => {
        clearStageTimers();
        clearLifecycleTimers();
        session = null;
        sync();
      }, 360);
    }

    function finishAfterIdle() {
      if (finalizeTimer != null) window.clearTimeout(finalizeTimer);
      finalizeTimer = window.setTimeout(() => {
        if (!session || session.currentId) return;
        session.finishedAt = Date.now();
        const processed = session.completedIds.size + session.failedIds.size;
        const allExpectedFinished = processed >= session.expectedTotal;
        session.phase = session.failedIds.size === 0 && allExpectedFinished ? "success" : "partial";
        session.leaving = false;
        if (session.phase === "success") session.stage = "finalize";
        session.fraction = session.phase === "success" ? 1 : 0;
        sync();
        if (clockTimer != null) {
          window.clearInterval(clockTimer);
          clockTimer = null;
        }
        leaveTimer = window.setTimeout(beginLeaving, session.phase === "success" ? 1450 : 2600);
      }, 520);
    }

    function scheduleStage(token: number, leadId: string, delay: number, stage: StageKey, fraction: number) {
      const timer = window.setTimeout(() => {
        if (!session || session.token !== token || session.currentId !== leadId || session.phase !== "running") return;
        session.stage = stage;
        session.fraction = fraction;
        sync();
      }, delay);
      stageTimers.push(timer);
    }

    function startRequest(leadId: string) {
      if (!session || session.leaving || session.phase === "success" || session.phase === "partial") {
        beginSession(1, []);
      }
      if (!session) return;
      if (finalizeTimer != null) {
        window.clearTimeout(finalizeTimer);
        finalizeTimer = null;
      }
      clearStageTimers();
      if (!session.startedIds.includes(leadId)) session.startedIds.push(leadId);
      session.expectedTotal = Math.max(session.expectedTotal, session.startedIds.length);
      session.currentId = leadId;
      session.currentIndex = session.startedIds.indexOf(leadId) + 1;
      session.currentCard = session.cards[session.currentIndex - 1] || session.currentCard || null;
      session.stage = "prepare";
      session.fraction = 0.08;
      session.phase = "running";
      session.leaving = false;
      session.errorMessage = null;
      sync();
      const token = session.token;
      scheduleStage(token, leadId, 180, "whatsapp", 0.23);
      scheduleStage(token, leadId, 720, "policy", 0.46);
      scheduleStage(token, leadId, 1280, "vendas", 0.72);
      scheduleStage(token, leadId, 2050, "finalize", 0.91);
    }

    function completeRequest(leadId: string, ok: boolean, errorMessage?: string | null) {
      if (!session) return;
      clearStageTimers();
      if (ok) {
        session.completedIds.add(leadId);
        session.stage = "finalize";
      } else {
        session.failedIds.add(leadId);
        session.errorMessage = normalizeText(errorMessage) || "O servidor interrompeu esta entrega.";
      }
      session.currentId = null;
      session.fraction = 0;
      sync();
      finishAfterIdle();
    }

    function inferButtonCards(button: HTMLButtonElement, scope: Element, bulk: boolean) {
      if (bulk) {
        const checked = collectCheckedCards(scope);
        return mergeSelectionOrder(selectionOrder, checked);
      }
      const ownContainer = button.closest(".row-dense, .be-card");
      const selectedContainer = scope.querySelector(".row-dense--sel, .be-card--sel");
      const card = cardMetaFromContainer(ownContainer || selectedContainer);
      return card ? [card] : [];
    }

    function handleDocumentClick(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target : null;
      const button = target?.closest("button") as HTMLButtonElement | null;
      if (!button) return;

      const buttonText = normalizeText(button.textContent);
      if (/^(Selecionar|Desmarcar) todos$/i.test(buttonText)) {
        if (selectAllTimer != null) window.clearTimeout(selectAllTimer);
        const scope = button.closest(".vnd-layer--buscar, .leads-page") || document;
        selectAllTimer = window.setTimeout(() => {
          selectionOrder = collectCheckedCards(scope);
        }, 0);
        return;
      }

      if (button.disabled || !/^Puxar(?:\s|$|\u2026)/i.test(buttonText) || /^Puxando/i.test(buttonText)) return;
      const scope = button.closest(".vnd-layer--buscar, .leads-page");
      if (!scope) return;
      if (session && session.phase === "running" && !session.leaving) return;
      const bulk = button.matches("[data-tut='leads-puxar']") || /selecionados/i.test(buttonText);
      const parsedCount = Number(buttonText.match(/\((\d+)\)/)?.[1] || 0);
      const cards = inferButtonCards(button, scope, bulk);
      const expectedTotal = bulk ? Math.max(1, parsedCount || cards.length) : 1;
      beginSession(expectedTotal, cards);
    }

    function handleDocumentChange(event: Event) {
      const input = event.target instanceof HTMLInputElement ? event.target : null;
      if (!input || input.type !== "checkbox" || !input.matches(CHECKBOX_SELECTOR)) return;
      const card = cardMetaFromCheckbox(input);
      if (!card) return;
      selectionOrder = selectionOrder.filter(item => item.key !== card.key);
      if (input.checked) selectionOrder.push(card);
    }

    function handleApiLifecycle(event: Event) {
      const detail = (event as CustomEvent<ApiLifecycleDetail>).detail;
      if (!detail?.path || detail.method !== "POST") return;
      const match = detail.path.match(SEND_TO_VENDAS_RE);
      if (!match) return;
      let leadId = match[1];
      try { leadId = decodeURIComponent(leadId); } catch { /* id já utilizável */ }
      if (detail.phase === "start") {
        startRequest(leadId);
        return;
      }
      completeRequest(
        leadId,
        detail.phase === "success",
        detail.phase === "error" ? detail.message : null,
      );
    }

    document.addEventListener("click", handleDocumentClick, true);
    document.addEventListener("change", handleDocumentChange, true);
    window.addEventListener(API_LIFECYCLE_EVENT, handleApiLifecycle as EventListener);

    return () => {
      alive = false;
      document.removeEventListener("click", handleDocumentClick, true);
      document.removeEventListener("change", handleDocumentChange, true);
      window.removeEventListener(API_LIFECYCLE_EVENT, handleApiLifecycle as EventListener);
      if (selectAllTimer != null) window.clearTimeout(selectAllTimer);
      clearStageTimers();
      clearLifecycleTimers();
    };
  }, []);

  if (!view || typeof document === "undefined") return null;

  const activeStageIndex = stageIndex(view.stage);
  const successful = view.phase === "success";
  const partial = view.phase === "partial";
  const leaving = view.leaving;
  const title = successful
    ? `${plural(view.completed, "Lead adicionado", "Leads adicionados")}`
    : partial
      ? view.completed > 0
        ? "Processo concluído parcialmente"
        : "Não foi possível puxar"
      : view.total > 1
        ? "Puxando leads…"
        : "Puxando lead…";
  const subtitle = successful
    ? `${view.completed} ${plural(view.completed, "card entrou", "cards entraram")} no seu funil.`
    : partial
      ? view.errorMessage || "Alguns cards não foram entregues."
      : "O HBX está validando cada card e enviando para o seu funil.";
  const serverLabel = successful ? "Confirmado" : partial ? "Processo encerrado" : "Servidor ativo";
  const radius = 74;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - view.percent / 100);

  return createPortal(
    <div
      className={`hbx-veil ${styles.veil} ${leaving ? styles.leaving : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="lead-pull-progress-title"
      aria-describedby="lead-pull-progress-subtitle"
    >
      <section
        className={`${styles.modal} ${successful ? styles.success : ""} ${partial ? styles.partial : ""}`}
        aria-busy={!successful && !partial}
      >
        <header className={styles.header}>
          <span className={styles.heroIcon}>
            {successful ? <CheckIcon /> : partial ? <ErrorIcon /> : <CloudArrowIcon />}
          </span>
          <div className={styles.heading}>
            <span className={styles.eyebrow}>Pipeline de pesquisa</span>
            <h2 id="lead-pull-progress-title">{title}</h2>
            <p id="lead-pull-progress-subtitle">{subtitle}</p>
          </div>
          <span className={styles.serverBadge}>
            <span className={styles.serverDot} /> {serverLabel}
          </span>
        </header>

        <div className={styles.body}>
          <div className={styles.progressColumn}>
            <div className={styles.progressRing} aria-label={`${view.percent}% concluído`}>
              <svg viewBox="0 0 180 180" aria-hidden="true">
                <circle className={styles.ringTrack} cx="90" cy="90" r={radius} />
                <circle
                  className={styles.ringValue}
                  cx="90"
                  cy="90"
                  r={radius}
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                />
              </svg>
              <div className={styles.progressValue} aria-live="polite">
                <strong>{view.percent}%</strong>
                <span>{view.completed}/{view.total} {plural(view.total, "card", "cards")}</span>
              </div>
            </div>
            <div className={styles.progressCaption}>
              <span className={styles.captionDot} />
              Cada card só entra na contagem após confirmação do servidor.
            </div>
          </div>

          <div className={styles.stages}>
            {STAGES.map((stage, index) => {
              const state = stageState(view, index);
              return (
                <div key={stage.key} className={`${styles.stage} ${styles[`stage_${state}`]}`}>
                  <span className={styles.stageRail} aria-hidden="true">
                    <span className={styles.stageDot}>
                      {state === "done" ? <CheckIcon /> : state === "error" ? <ErrorIcon /> : null}
                    </span>
                  </span>
                  <span className={styles.stageCopy}>
                    <strong>{stage.label}</strong>
                    <small>{stageDetailText(view, stage, state)}</small>
                  </span>
                  {state === "active" && <span className={styles.stageSpinner} aria-hidden="true" />}
                </div>
              );
            })}
          </div>
        </div>

        <div className={styles.currentCard}>
          <span className={styles.currentLabel}>{successful ? "Resultado" : partial ? "Último card processado" : "Processando agora"}</span>
          <div className={styles.currentMain}>
            <strong>{view.currentCard?.name || (view.total > 1 ? `Card ${Math.max(1, view.currentIndex)} de ${view.total}` : "Card selecionado")}</strong>
            <span>{view.currentCard?.segment || "Dados comerciais"}</span>
          </div>
          <div className={styles.currentMeta}>
            {view.currentCard?.location && <span>{view.currentCard.location}</span>}
            {view.currentCard?.source && <span>Fonte: {view.currentCard.source}</span>}
            {!view.currentCard?.location && !view.currentCard?.source && <span>Importação protegida pelo HBX</span>}
          </div>
        </div>

        <footer className={styles.footer}>
          <div className={styles.metric}>
            <span>Tempo decorrido</span>
            <strong>{formatElapsed(view.elapsedMs)}</strong>
          </div>
          <div className={styles.metric}>
            <span>Entregues</span>
            <strong>{view.completed} de {view.total}</strong>
          </div>
          <div className={styles.metric}>
            <span>Etapa atual</span>
            <strong>{successful ? "Concluído" : partial ? "Interrompido" : STAGES[activeStageIndex]?.label || "Processando"}</strong>
          </div>
          <div className={`${styles.outcome} ${successful ? styles.outcomeSuccess : partial ? styles.outcomePartial : ""}`}>
            {successful ? <><CheckIcon /> Concluído</> : partial ? <><ErrorIcon /> Parcial</> : <><span className={styles.outcomePulse} /> Em andamento</>}
          </div>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
