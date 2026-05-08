"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch, type ApiFetchError } from "@/app/_lib/api";
import { useRequireAuth } from "@/app/_lib/useRequireAuth";
import styles from "./page.module.css";

type RewardLead = {
  id: string;
  name: string;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  segment?: string | null;
  score?: number | null;
  opportunityReason?: string | null;
  recommendedOffer?: string | null;
};

type ClaimStatus = {
  eligible: boolean;
  alreadyClaimed?: boolean;
  alreadyClaimedInWindow?: boolean;
  availableCount: number;
  minimumRequired: number;
  nextAvailableAt?: string | null;
  secondsUntilNextClaim?: number;
  nonCumulative?: boolean;
  rewardSize?: number;
  reason?: "cooldown" | "insufficient_leads" | "storage_unavailable" | null;
  headline: string;
  title: string;
  description: string;
  ctaLabel: string;
  href: string;
};

type RewardPayload = {
  ok: boolean;
  alreadyClaimed?: boolean;
  alreadyClaimedInWindow?: boolean;
  claimedAt: string | null;
  nextAvailableAt?: string | null;
  secondsUntilNextClaim?: number;
  nonCumulative?: boolean;
  rewardSize?: number;
  items: RewardLead[];
};

function formatLocation(item: RewardLead) {
  const city = String(item.city || "").trim();
  const state = String(item.state || "").trim();
  if (city && state) return `${city}/${state}`;
  return city || state || "Praça não informada";
}

function formatPhone(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "Telefone disponível no card";
  return raw;
}

function getSecondsUntil(nextAvailableAt?: string | null, fallback = 0) {
  if (!nextAvailableAt) return Math.max(0, Math.ceil(Number(fallback || 0)));
  const next = new Date(nextAvailableAt).getTime();
  if (!Number.isFinite(next)) return Math.max(0, Math.ceil(Number(fallback || 0)));
  return Math.max(0, Math.ceil((next - Date.now()) / 1000));
}

function formatDuration(seconds: number) {
  const safe = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  if (hours <= 0) return `${Math.max(1, minutes)}min`;
  return `${hours}h${String(minutes).padStart(2, "0")}min`;
}

export default function NightFactoryRewardClientPage() {
  const hasToken = useRequireAuth();
  const [status, setStatus] = useState<ClaimStatus | null>(null);
  const [reward, setReward] = useState<RewardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clockTick, setClockTick] = useState(0);

  const load = useCallback(async () => {
    if (hasToken !== true) return;
    setLoading(true);
    setError(null);
    try {
      const [statusPayload, rewardPayload] = await Promise.all([
        apiFetch<ClaimStatus>("/night-factory/claim-status", { requireAuth: true, timeoutMs: 12000 }),
        apiFetch<RewardPayload>("/night-factory/my-reward", { requireAuth: true, timeoutMs: 12000 }),
      ]);
      setStatus(statusPayload);
      setReward(rewardPayload?.items?.length ? rewardPayload : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar a recompensa.");
    } finally {
      setLoading(false);
    }
  }, [hasToken]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const nextAvailableAt = status?.nextAvailableAt || reward?.nextAvailableAt || null;
    if (!nextAvailableAt) return undefined;
    const timer = window.setInterval(() => setClockTick((value) => value + 1), 30000);
    return () => window.clearInterval(timer);
  }, [reward?.nextAvailableAt, status?.nextAvailableAt]);

  const rawItems = reward?.items || [];
  const cooldownSeconds = useMemo(() => getSecondsUntil(
    status?.nextAvailableAt || reward?.nextAvailableAt,
    status?.secondsUntilNextClaim || reward?.secondsUntilNextClaim || 0,
  ), [
    clockTick,
    reward?.nextAvailableAt,
    reward?.secondsUntilNextClaim,
    status?.nextAvailableAt,
    status?.secondsUntilNextClaim,
  ]);
  const claimedInWindow = Boolean(status?.alreadyClaimedInWindow || reward?.alreadyClaimedInWindow || cooldownSeconds > 0 && rawItems.length);
  const items = claimedInWindow ? rawItems : [];
  const canRedeem = Boolean(status?.eligible);
  const cooldownLabel = formatDuration(cooldownSeconds);
  const heroTitle = canRedeem
    ? "Missão noturna concluída"
    : claimedInWindow
      ? "Sua recompensa Night Factory"
      : status?.headline || "Missão noturna concluída";
  const heroSubtitle = claimedInWindow
    ? `A recompensa é diária e não acumulativa. Próxima recompensa em ${cooldownLabel}.`
    : canRedeem
      ? "O HBX separou 5 oportunidades para você."
      : status?.description || "A Night Factory ainda está preparando seus leads.";
  const slots = useMemo(() => Array.from({ length: 5 }, (_, index) => items[index] || null), [items]);

  async function redeem() {
    if (!canRedeem || redeeming) return;
    setRedeeming(true);
    setError(null);
    try {
      const payload = await apiFetch<RewardPayload>("/night-factory/redeem", {
        method: "POST",
        requireAuth: true,
        timeoutMs: 20000,
      });
      setReward(payload);
      setStatus((current) => current ? {
        ...current,
        eligible: false,
        alreadyClaimed: true,
        alreadyClaimedInWindow: true,
        nextAvailableAt: payload.nextAvailableAt || current.nextAvailableAt,
        secondsUntilNextClaim: payload.secondsUntilNextClaim || current.secondsUntilNextClaim,
        reason: "cooldown",
      } : current);
      window.dispatchEvent(new Event("night-factory-reward-changed"));
    } catch (err) {
      const apiError = err as ApiFetchError;
      const payload = apiError?.payload && typeof apiError.payload === "object" ? apiError.payload as Partial<ClaimStatus> & { code?: string } : null;
      if (apiError?.status === 409 && payload?.reason === "cooldown") {
        setStatus((current) => current ? {
          ...current,
          eligible: false,
          alreadyClaimed: true,
          alreadyClaimedInWindow: true,
          reason: "cooldown",
          nextAvailableAt: payload.nextAvailableAt || current.nextAvailableAt,
          secondsUntilNextClaim: payload.secondsUntilNextClaim || current.secondsUntilNextClaim,
        } : current);
      }
      setError(err instanceof Error ? err.message : "Não foi possível resgatar agora.");
    } finally {
      setRedeeming(false);
    }
  }

  if (hasToken === null || (hasToken === true && loading)) {
    return (
      <DashboardScaffold title="Night Factory" description="Carregando recompensa.">
        <main className={styles.page}>
          <section className={styles.loadingPanel}>Preparando sua recompensa...</section>
        </main>
      </DashboardScaffold>
    );
  }

  if (!hasToken) return null;

  return (
    <DashboardScaffold title="Night Factory" description="Recompensa premium de leads." hideHeader>
      <main className={styles.page}>
        <section className={styles.hero} aria-labelledby="night-factory-title">
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>Night Factory</span>
            <h1 id="night-factory-title">{heroTitle}</h1>
            <p>{heroSubtitle}</p>
          </div>

          <div className={styles.rewardPanel} data-claimed={claimedInWindow ? "true" : "false"}>
            <div className={styles.vault} aria-hidden="true">
              <span />
              <i />
            </div>
            <div className={styles.rewardPanelCopy}>
              <strong>{claimedInWindow ? "Recompensa diária aberta" : canRedeem ? "5 leads premium liberados" : "Night Factory preparando"}</strong>
              <p>
                {claimedInWindow
                  ? `Próxima recompensa em ${cooldownLabel}. A recompensa é diária e não acumulativa.`
                  : canRedeem
                    ? "Abra a recompensa diária para revelar as oportunidades."
                    : "A Night Factory ainda está preparando seus leads."}
              </p>
            </div>
            {claimedInWindow ? (
              <div className={styles.cooldownBadge}>Próxima recompensa em {cooldownLabel}</div>
            ) : null}
            <div className={styles.slotRow} aria-label="Leads da recompensa">
              {slots.map((slot, index) => (
                <span key={slot?.id || index} data-filled={slot ? "true" : "false"}>
                  {index + 1}
                </span>
              ))}
            </div>
            {canRedeem ? (
              <button type="button" className={styles.primaryAction} onClick={redeem} disabled={redeeming}>
                {redeeming ? "Abrindo recompensa..." : "Abrir recompensa diária"}
              </button>
            ) : (
              <Link className={styles.primaryAction} href="/radar-digital">
                Abrir Radar Digital
              </Link>
            )}
          </div>
        </section>

        {error ? <div className={styles.alert}>{error}</div> : null}

        {claimedInWindow ? (
          <section className={styles.emptyState}>
            <span>Recompensa diária</span>
            <h2>Próxima recompensa em {cooldownLabel}.</h2>
            <p>Você recebe no máximo 5 leads premium por janela de 24 horas. O saldo não acumula.</p>
          </section>
        ) : null}

        {!claimedInWindow && !canRedeem ? (
          <section className={styles.emptyState}>
            <span>Em preparação</span>
            <h2>A Night Factory ainda está preparando seus leads.</h2>
            <p>Assim que houver 5 oportunidades boas, o token aparece no topo do HBX. A recompensa é diária e não acumulativa.</p>
          </section>
        ) : null}

        {items.length ? (
          <section className={styles.cardsGrid} aria-label="Leads premium resgatados">
            {items.slice(0, 5).map((item, index) => (
              <article key={item.id} className={styles.leadCard} style={{ ["--reveal-delay" as string]: `${index * 70}ms` } as CSSProperties}>
                <div className={styles.leadTop}>
                  <span>Card {index + 1}</span>
                  <strong>{Number(item.score || 0)}</strong>
                </div>
                <h2>{item.name || "Lead premium"}</h2>
                <p>{formatLocation(item)}</p>
                <dl>
                  <div>
                    <dt>Segmento</dt>
                    <dd>{item.segment || "Comercial"}</dd>
                  </div>
                  <div>
                    <dt>Telefone</dt>
                    <dd>{formatPhone(item.phone)}</dd>
                  </div>
                  <div>
                    <dt>Motivo</dt>
                    <dd>{item.opportunityReason || "Oportunidade detectada pela Night Factory."}</dd>
                  </div>
                  <div>
                    <dt>Oferta</dt>
                    <dd>{item.recommendedOffer || "HBX Full"}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </section>
        ) : null}
      </main>
    </DashboardScaffold>
  );
}
