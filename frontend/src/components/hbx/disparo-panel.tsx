"use client";

// PAINEL DE DISPAROS (dono, 30/07/2026) — mora na sidebar INTERCALANDO com o
// cartão de créditos, e SÓ existe quando o bot de prospecção está ativo.
// Linguagem: COR diz o estado (verde = funcionando, âmbar = atenção, vermelho =
// erro) — zero textão. Clique abre a central de regras (.hbx-veil, Lei nº2).
// O mesmo painel é o dono do ALERTA DE LEAD QUENTE: quando um lead demonstra
// interesse, o painel pulsa, o sistema inteiro respira uma cor por 1s e um
// aviso sobe no topo — clicar abre o cliente com o Detalhes aberto (reusa o
// contrato sessionStorage "hbx:vendas-focus-lead" que a Agenda já usa).
//
// Dados: GET /vendas/automation/live-status (o MESMO contrato da tela
// /automacao — nenhum endpoint novo), que já traz nextScheduledAt,
// nextEligibleLeadName, contadores, campanha (regras), hotLead e coldGate
// (blindagem do disparo frio). Guardado por BotArmedGuard no backend: 402/403
// aqui significa "bot não ativo" → o painel simplesmente não existe.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { apiFetch, getToken, type ApiError } from "@/lib/api";
import { STATUS_LABEL, fmtWhen, type ProspLive, type ProspCampaign } from "@/lib/use-prospecting-config";
import { I, ICONS } from "@/components/hbx/shell";

type ColdGateSnapshot = {
  enabled: boolean;
  maxPerDay: number;
  minSpacingMinutes: number;
  similarityPct: number;
  sentToday: number;
  remainingToday: number;
  nextAllowedColdAt: string | null;
  lastBlock: { reason: string; at: string } | null;
};

type HotLead = { leadId: string; leadName: string | null; at: string };

export type DisparoLive = ProspLive & {
  hotLead?: HotLead | null;
  coldGate?: ColdGateSnapshot | null;
  // S4 (B11): disparos com hora marcada — existem com ou sem campanha.
  agendadosFuturos?: number;
  proximoAgendadoAt?: string | null;
};

const HOT_SEEN_KEY = "hbx:hotlead-seen";
const POLL_ACTIVE_MS = 10_000;
const POLL_IDLE_MS = 60_000;

function useDisparoLive() {
  const [live, setLive] = useState<DisparoLive | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!getToken()) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = () => {
      apiFetch<DisparoLive>("/vendas/automation/live-status")
        .then((res) => {
          if (!alive) return;
          setLive(res ?? null);
          setUnavailable(false);
          timer = setTimeout(tick, POLL_ACTIVE_MS);
        })
        .catch((err: unknown) => {
          if (!alive) return;
          const status = Number((err as ApiError)?.status || 0);
          // 402/403/404 = bot não ativo pra esta conta — painel não existe.
          setLive(null);
          setUnavailable(status === 402 || status === 403 || status === 404);
          timer = setTimeout(tick, POLL_IDLE_MS);
        });
    };
    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return { live, unavailable };
}

type Tone = "ok" | "warn" | "err";

function deriveTone(live: DisparoLive): Tone {
  const status = String(live.status || "");
  if (status === "erro" || live.lastError || live.coldGate?.lastBlock?.reason === "cold_copy_similar") return "err";
  const filaVazia = (live.pendingJobs ?? 0) === 0;
  if (status === "dormindo" || filaVazia || live.cooldownActive || live.coldGate?.remainingToday === 0) return "warn";
  return "ok";
}

function formatCountdown(targetIso: string | null | undefined, now: number): string | null {
  if (!targetIso) return null;
  const target = new Date(targetIso).getTime();
  if (!Number.isFinite(target)) return null;
  const delta = Math.max(0, Math.floor((target - now) / 1000));
  if (delta === 0) return "agora";
  const h = Math.floor(delta / 3600);
  const m = Math.floor((delta % 3600) / 60);
  const s = delta % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function variantList(live: DisparoLive): string[] {
  const raw = live.campaign?.firstContactVariants;
  return Array.isArray(raw) ? raw.filter((v: unknown): v is string => typeof v === "string" && Boolean(String(v).trim())) : [];
}

// ── O cartão da sidebar ──────────────────────────────────────────────────────

function DisparoSidebarCard({ live, hotPulse, onOpen }: { live: DisparoLive; hotPulse: boolean; onOpen: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const tone = deriveTone(live);
  const targetIso =
    live.cooldownActive && live.nextAllowedSendAt && (!live.nextScheduledAt || live.nextAllowedSendAt > live.nextScheduledAt)
      ? live.nextAllowedSendAt
      : live.nextScheduledAt;
  const countdown = formatCountdown(targetIso, now);
  const sent = live.sentToday ?? 0;
  const limit = Math.max(1, live.dailyLimit ?? 1);
  const pct = Math.min(100, Math.round((sent / limit) * 100));

  return (
    <button
      type="button"
      className={`plan-card disparo-card is-${tone}${hotPulse ? " disparo-card--hot" : ""}`}
      onClick={onOpen}
      aria-label={`Painel de disparos. Estado ${STATUS_LABEL[live.status] || live.status}. ${sent} de ${limit} hoje.`}
    >
      <span className="disparo-card__head">
        <span className="disparo-card__orb" aria-hidden="true" />
        <span className="disparo-card__label">Disparos</span>
        <strong className="disparo-card__count">{sent}/{limit}</strong>
      </span>
      <span className="disparo-card__timer" aria-hidden="true">{countdown ?? "—"}</span>
      <span className="disparo-card__next">
        {live.nextEligibleLeadName || STATUS_LABEL[live.status] || live.status}
      </span>
      <span className="disparo-card__bar" aria-hidden="true">
        <span className="disparo-card__bar-fill" style={{ width: `${pct}%` }} />
      </span>
    </button>
  );
}

// ── Central de regras (overlay) ──────────────────────────────────────────────

function RuleRow({ icon, label, value, tone }: { icon: string[]; label: string; value: React.ReactNode; tone?: Tone }) {
  return (
    <div className={"disparo-rule" + (tone ? ` is-${tone}` : "")}>
      <span className="disparo-rule__icon"><I d={icon} size={15} /></span>
      <span className="disparo-rule__label">{label}</span>
      <span className="disparo-rule__value">{value}</span>
    </div>
  );
}

function DisparoRulesModal({ live, onClose }: { live: DisparoLive; onClose: () => void }) {
  const tone = deriveTone(live);
  const campaign: ProspCampaign = live.campaign || {};
  const cold = live.coldGate || null;
  const variants = variantList(live);
  const [sampleIndex, setSampleIndex] = useState(() => (variants.length ? Math.floor(Math.random() * variants.length) : 0));
  const shuffle = useCallback(() => {
    if (variants.length <= 1) return;
    setSampleIndex((prev) => {
      let next = prev;
      while (next === prev) next = Math.floor(Math.random() * variants.length);
      return next;
    });
  }, [variants.length]);

  const sent = live.sentToday ?? 0;
  const limit = Math.max(1, live.dailyLimit ?? 1);
  const proximo = fmtWhen(live.nextScheduledAt);
  const frioLiberaAs = cold?.nextAllowedColdAt ? fmtWhen(cold.nextAllowedColdAt) : null;

  return (
    <div className="hbx-veil" onClick={onClose} role="presentation">
      <div className="hbx-modal disparo-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Regras de disparo">
        <div className={`disparo-modal__head is-${tone}`}>
          <span className="disparo-card__orb" aria-hidden="true" />
          <strong>{STATUS_LABEL[live.status] || live.status}</strong>
          <button type="button" className="round-btn disparo-modal__close" onClick={onClose} aria-label="Fechar">
            <I d={ICONS.plus} size={14} />
          </button>
        </div>

        <div className={`disparo-modal__next is-${tone}`}>
          <span className="disparo-modal__next-label">Próximo</span>
          <strong className="disparo-modal__next-name">{live.nextEligibleLeadName || "—"}</strong>
          <span className="disparo-modal__next-when">{proximo || "—"}</span>
        </div>

        <div className="disparo-modal__rules">
          <RuleRow icon={ICONS.clock} label="Ritmo" value={`~${campaign.intervalMinutes ?? "—"} min ±${campaign.intervalVarianceMinutes ?? 0}`} />
          <RuleRow icon={ICONS.agenda} label="Janela" value={`${campaign.workingHoursStart || "—"}–${campaign.workingHoursEnd || "—"}`} />
          <RuleRow icon={ICONS.send} label="Hoje" value={`${sent}/${limit}`} tone={sent >= limit ? "warn" : undefined} />
          {cold && (
            <RuleRow
              icon={ICONS.users}
              label="1º contato"
              value={`${cold.sentToday}/${cold.maxPerDay} · ${cold.minSpacingMinutes} min entre${frioLiberaAs ? ` · libera ${frioLiberaAs}` : ""}`}
              tone={cold.remainingToday === 0 ? "warn" : undefined}
            />
          )}
          {cold && (
            <RuleRow icon={ICONS.filter} label="Anti-carimbo" value={`≥${cold.similarityPct}% igual = bloqueia`} />
          )}
          <RuleRow
            icon={ICONS.msg}
            label="Mensagens"
            value={variants.length > 0 ? `${variants.length} variantes · sorteio sem repetir` : "padrão do motor"}
          />
        </div>

        {variants.length > 0 && (
          <div className="disparo-modal__sample">
            <div className="disparo-modal__sample-head">
              <span>Sorteio do momento</span>
              <button type="button" className="round-btn" onClick={shuffle} aria-label="Sortear outra mensagem">
                <I d={ICONS.scrape} size={13} />
              </button>
            </div>
            <p className="disparo-modal__sample-text">{variants[sampleIndex] || variants[0]}</p>
          </div>
        )}

        {(live.lastError || cold?.lastBlock) && (
          <div className="disparo-modal__error">
            <span className="disparo-card__orb" aria-hidden="true" />
            <span>{live.lastError || `Bloqueio: ${cold?.lastBlock?.reason}`}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Alerta de lead quente ────────────────────────────────────────────────────

function readHotSeen(): number {
  try {
    return new Date(localStorage.getItem(HOT_SEEN_KEY) || 0).getTime() || 0;
  } catch {
    return 0;
  }
}

function markHotSeen(at: string) {
  try {
    localStorage.setItem(HOT_SEEN_KEY, at);
  } catch { /* sem storage */ }
}

function HotLeadToast({ hot, onOpen, onDismiss }: { hot: HotLead; onOpen: () => void; onDismiss: () => void }) {
  return (
    <div className="hot-toast" role="alert">
      <button type="button" className="hot-toast__body" onClick={onOpen}>
        <span className="hot-toast__flame"><I d={ICONS.automacao} size={16} /></span>
        <span className="hot-toast__text">
          <strong>{hot.leadName || "Lead"}</strong>
          <small>respondeu — abrir agora</small>
        </span>
        <I d={ICONS.arrow} size={15} />
      </button>
      <button type="button" className="hot-toast__x" onClick={onDismiss} aria-label="Dispensar aviso">
        <I d={ICONS.plus} size={12} />
      </button>
    </div>
  );
}

// ── O rotator créditos ↔ disparos ────────────────────────────────────────────

export function CreditDisparoRotator({ credits }: { credits: React.ReactNode }) {
  const router = useRouter();
  const { live } = useDisparoLive();
  const [modalOpen, setModalOpen] = useState(false);
  const [hot, setHot] = useState<HotLead | null>(null);
  // face visível: alterna sozinha a cada 8s quando as DUAS existem.
  const [face, setFace] = useState<"credits" | "disparo">("credits");

  // S4 CORREÇÃO DO NOTURNO (B11): o painel deixou de depender de campanha rodando.
  // O modo do dono é MANUAL — a cena Tagliágua (lead perguntou "como que funciona ?"
  // e ninguém viu) aconteceu com campanha parada. Agora acende também quando existe
  // disparo AGENDADO no futuro ou lead QUENTE esperando resposta.
  const panelActive = Boolean(
    live && (live.campaign?.status === "running" || (live.agendadosFuturos ?? 0) > 0 || live.hotLead),
  );
  const hasCredits = Boolean(credits);

  useEffect(() => {
    if (!panelActive || !hasCredits) return;
    const t = setInterval(() => {
      setFace((prev) => (prev === "credits" ? "disparo" : "credits"));
    }, 8_000);
    return () => clearInterval(t);
  }, [panelActive, hasCredits]);

  // Lead quente novo (mais recente que o último visto) → dispara o ritual:
  // pulso no painel + respiro de cor no sistema inteiro (1s) + aviso no topo.
  // setState dentro do rAF (não no corpo do effect) — regra dura de lint do repo.
  useEffect(() => {
    if (!panelActive) return;
    const candidate = live?.hotLead;
    if (!candidate?.leadId || !candidate.at) return;
    if (new Date(candidate.at).getTime() <= readHotSeen()) return;
    const id = requestAnimationFrame(() => setHot(candidate));
    return () => cancelAnimationFrame(id);
  }, [panelActive, live?.hotLead?.at, live?.hotLead]);

  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hot) return;
    const root = document.documentElement;
    root.classList.add("hbx-hot-flash");
    // painel vira a face visível na hora do alerta — o pulso é dele.
    const id = requestAnimationFrame(() => setFace("disparo"));
    flashTimer.current = setTimeout(() => root.classList.remove("hbx-hot-flash"), 1_000);
    return () => {
      cancelAnimationFrame(id);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      root.classList.remove("hbx-hot-flash");
    };
  }, [hot?.at, hot]);

  const openHotLead = useCallback(() => {
    if (!hot) return;
    markHotSeen(hot.at);
    try {
      sessionStorage.setItem("hbx:vendas-focus-lead", hot.leadId);
    } catch { /* sem storage */ }
    setHot(null);
    router.push("/vendas");
  }, [hot, router]);

  const dismissHot = useCallback(() => {
    if (hot) markHotSeen(hot.at);
    setHot(null);
  }, [hot]);

  // Sem bot ativo: comportamento de sempre (só créditos, ou nada).
  if (!panelActive || !live) return <>{credits}</>;

  const disparoCard = (
    <DisparoSidebarCard live={live} hotPulse={Boolean(hot)} onOpen={() => setModalOpen(true)} />
  );

  return (
    <>
      {hasCredits ? (
        <div className={"credit-disparo-flip" + (face === "disparo" ? " is-disparo" : "")}>
          <div className="credit-disparo-flip__face credit-disparo-flip__face--credits" aria-hidden={face !== "credits"}>
            {credits}
          </div>
          <div className="credit-disparo-flip__face credit-disparo-flip__face--disparo" aria-hidden={face !== "disparo"}>
            {disparoCard}
          </div>
        </div>
      ) : (
        disparoCard
      )}
      {modalOpen && <DisparoRulesModal live={live} onClose={() => setModalOpen(false)} />}
      {hot && <HotLeadToast hot={hot} onOpen={openHotLead} onDismiss={dismissHot} />}
    </>
  );
}
