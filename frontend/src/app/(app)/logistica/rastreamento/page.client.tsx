"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { I, ICONS, useCurrentUser } from "@/components/hbx/shell";
import { isTenantAdmin } from "@/lib/roles";

import {
  getTrackingCreditStatement,
  getTrackingHistory,
  getTrackingLive,
  type TrackingCreditStatement,
  type TrackingHistoryEvent,
  type TrackingHistoryEventType,
  type TrackingHistoryResponse,
  type TrackingLiveResponse,
  type TrackingLiveRoute,
  type TrackingSignalStatus,
} from "./tracking-live-api";

const TrackingLiveMap = dynamic(() => import("./TrackingLiveMap").then((module) => module.TrackingLiveMap), {
  ssr: false,
});

const POLL_INTERVAL_MS = 15_000;

function currentMonth(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}`;
}

const STATUS_LABEL: Record<TrackingSignalStatus, string> = {
  ONLINE: "Online",
  STOPPED: "Parado",
  NO_SIGNAL: "Sem sinal",
};

const STATUS_PRIORITY: Record<TrackingSignalStatus, number> = {
  ONLINE: 0,
  STOPPED: 1,
  NO_SIGNAL: 2,
};

function driverName(route: TrackingLiveRoute): string {
  return route.driver.nome?.trim() || `Motorista ${route.driver.id}`;
}

function shortRouteId(routeId: string): string {
  return routeId.length > 10 ? routeId.slice(0, 8).toUpperCase() : routeId.toUpperCase();
}

function formatClock(iso: string | null | undefined): string {
  if (!iso) return "Ainda não recebida";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Horário indisponível";
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function relativeUpdate(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return "sem posição";
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return "horário inválido";
  const seconds = Math.max(0, Math.floor((nowMs - timestamp) / 1000));
  if (seconds < 10) return "agora";
  if (seconds < 60) return `há ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `há ${hours} h`;
}

function normalizeHistoryEventType(eventType: string | null): TrackingHistoryEventType | null {
  const normalized = eventType?.trim().toUpperCase();
  if (normalized === "START" || normalized === "SESSION_STARTED") return "START";
  if (normalized === "ARRIVAL" || normalized === "DELIVERY_ARRIVAL") return "ARRIVAL";
  if (normalized === "END" || normalized === "SESSION_ENDED") return "END";
  return null;
}

function historyEventKey(event: TrackingHistoryEvent): string {
  if (event.type === "ARRIVAL") return `${event.type}:${event.deliveryId ?? event.capturedAt}`;
  return event.type;
}

function eventLabel(eventType: TrackingHistoryEventType): string {
  if (eventType === "START") return "Início da rota";
  if (eventType === "ARRIVAL") return "Chegada registrada";
  return "Rota encerrada";
}

function StatusBadge({ status }: { status: TrackingSignalStatus }) {
  return (
    <span className={`log-live-status log-live-status--${status.toLowerCase().replace("_", "-")}`}>
      <span className="log-live-status__dot" aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}

function TrackingKpis({ routes }: { routes: TrackingLiveRoute[] }) {
  const active = routes.filter((route) => route.sessionStatus === "ACTIVE");
  const online = active.filter((route) => route.status === "ONLINE").length;
  const stopped = active.filter((route) => route.status === "STOPPED").length;
  const withoutSignal = active.filter((route) => route.status === "NO_SIGNAL").length;

  return (
    <div className="log-live-kpis" aria-label="Resumo do rastreamento">
      <article className="log-live-kpi hbx-card-enter">
        <span>Rotas ativas</span>
        <strong>{active.length}</strong>
      </article>
      <article className="log-live-kpi hbx-card-enter is-online">
        <span>Online</span>
        <strong>{online}</strong>
      </article>
      <article className="log-live-kpi hbx-card-enter is-stopped">
        <span>Parados</span>
        <strong>{stopped}</strong>
      </article>
      <article className="log-live-kpi hbx-card-enter is-no-signal">
        <span>Sem sinal</span>
        <strong>{withoutSignal}</strong>
      </article>
    </div>
  );
}

function CreditStatement({
  statement,
  month,
  error,
  onMonthChange,
}: {
  statement: TrackingCreditStatement | null;
  month: string;
  error: string | null;
  onMonthChange: (month: string) => void;
}) {
  return (
    <section className="log-credit-statement hbx-card-enter" aria-label="Extrato de créditos da logística">
      <header className="log-credit-statement__head">
        <div>
          <strong>Consumo e bônus</strong>
          <span>Informação comercial exclusiva da administração.</span>
        </div>
        <label>
          <span>Competência</span>
          <input
            type="month"
            value={month}
            max={currentMonth()}
            onChange={(event) => onMonthChange(event.target.value)}
          />
        </label>
      </header>

      {error ? <div className="log-credit-statement__error" role="alert">{error}</div> : null}
      {!statement && !error ? <div className="log-credit-statement__loading">Carregando extrato…</div> : null}
      {statement ? (
        <>
          <div className="log-credit-statement__cards">
            <article>
              <span>Saldo disponível</span>
              <strong>{statement.balanceCredits}</strong>
              <small>créditos</small>
            </article>
            <article>
              <span>Rota Essencial</span>
              <strong>{statement.totals.essentialCredits}</strong>
              <small>bloco(s) debitado(s)</small>
            </article>
            <article>
              <span>Rota Rastreada</span>
              <strong>{statement.totals.trackedCredits}</strong>
              <small>{statement.totals.trackedDeliveries} entrega(s)</small>
            </article>
            <article className="is-bonus">
              <span>Bônus da competência</span>
              <strong>+{statement.totals.bonusCredits}</strong>
              <small>20% dos créditos pagos elegíveis</small>
            </article>
          </div>

          <div className="log-credit-statement__detail">
            <div className="log-credit-statement__table-wrap">
              <table>
                <thead>
                  <tr><th>Conclusão rastreada</th><th>Rota</th><th>Débito</th><th>Pago elegível</th></tr>
                </thead>
                <tbody>
                  {statement.trackedDeliveries.slice(0, 12).map((delivery) => (
                    <tr key={delivery.claimId}>
                      <td>{formatDateTime(delivery.completedAt)}</td>
                      <td>#{delivery.routeId.slice(0, 8).toUpperCase()}</td>
                      <td>{delivery.credits} cr.</td>
                      <td>{delivery.paidCredits} cr.</td>
                    </tr>
                  ))}
                  {statement.trackedDeliveries.length === 0 ? (
                    <tr><td colSpan={4}>Nenhuma entrega rastreada concluída nesta competência.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="log-credit-statement__bonus-list">
              <strong>Bônus mensais</strong>
              {statement.bonuses.length === 0 ? <span>Nenhum bônus processado ainda.</span> : null}
              {statement.bonuses.slice(0, 6).map((bonus) => (
                <div key={bonus.sourceMonth}>
                  <span>{bonus.sourceMonth}</span>
                  <b>+{bonus.bonusCredits} cr.</b>
                  <small>{bonus.status === "GRANTED" ? "Concedido" : "Processando"}</small>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

export function LogisticaTrackingLiveClient() {
  const user = useCurrentUser();
  const admin = isTenantAdmin(user);
  const [live, setLive] = useState<TrackingLiveResponse | null>(null);
  const [history, setHistory] = useState<TrackingHistoryResponse | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const selectedSessionRef = useRef<string | null>(null);
  const liveRequestRef = useRef(0);
  const historyRequestRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [updatedAtMs, setUpdatedAtMs] = useState(0);
  const [statementMonth, setStatementMonth] = useState(currentMonth);
  const [statement, setStatement] = useState<TrackingCreditStatement | null>(null);
  const [statementError, setStatementError] = useState<string | null>(null);

  const loadHistory = useCallback(async (sessionId: string, showLoading: boolean) => {
    const requestId = ++historyRequestRef.current;
    if (showLoading) setHistoryLoading(true);
    setHistoryError(null);
    try {
      const response = await getTrackingHistory(sessionId);
      if (historyRequestRef.current !== requestId || selectedSessionRef.current !== sessionId) return;
      setHistory(response);
    } catch (caught: unknown) {
      if (historyRequestRef.current !== requestId || selectedSessionRef.current !== sessionId) return;
      setHistoryError(caught instanceof Error ? caught.message : "Não foi possível carregar o trajeto.");
      setHistory(null);
    } finally {
      if (historyRequestRef.current === requestId) setHistoryLoading(false);
    }
  }, []);

  const loadAll = useCallback(async (silent: boolean) => {
    const requestId = ++liveRequestRef.current;
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const [liveResult, statementResult] = await Promise.allSettled([
        getTrackingLive(),
        getTrackingCreditStatement(statementMonth),
      ]);
      if (liveResult.status === "rejected") throw liveResult.reason;
      const response = liveResult.value;
      if (liveRequestRef.current !== requestId) return;

      if (statementResult.status === "fulfilled") {
        setStatement(statementResult.value);
        setStatementError(null);
      } else {
        setStatementError(
          statementResult.reason instanceof Error
            ? statementResult.reason.message
            : "Não foi possível carregar o extrato.",
        );
      }

      const currentSelection = selectedSessionRef.current;
      const nextSelection = response.routes.some((route) => route.sessionId === currentSelection)
        ? currentSelection
        : (response.routes.find((route) => route.sessionStatus === "ACTIVE")?.sessionId ?? response.routes[0]?.sessionId ?? null);

      selectedSessionRef.current = nextSelection;
      setSelectedSessionId(nextSelection);
      setLive(response);
      setError(null);
      setUpdatedAtMs(Date.now());

      if (nextSelection) await loadHistory(nextSelection, !silent);
      else {
        historyRequestRef.current += 1;
        setHistory(null);
        setHistoryError(null);
      }
    } catch (caught: unknown) {
      if (liveRequestRef.current !== requestId) return;
      setError(caught instanceof Error ? caught.message : "Não foi possível carregar o rastreamento.");
    } finally {
      if (liveRequestRef.current === requestId) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [loadHistory, statementMonth]);

  useEffect(() => {
    if (!admin) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincronização inicial com API company-scoped.
    void loadAll(false);

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadAll(true);
    }, POLL_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void loadAll(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      liveRequestRef.current += 1;
      historyRequestRef.current += 1;
    };
  }, [admin, loadAll]);

  const routes = useMemo(() => {
    return [...(live?.routes ?? [])].sort((a, b) => {
      if (a.sessionStatus !== b.sessionStatus) return a.sessionStatus === "ACTIVE" ? -1 : 1;
      const signal = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
      if (signal !== 0) return signal;
      return driverName(a).localeCompare(driverName(b), "pt-BR");
    });
  }, [live?.routes]);

  // PR27072026 F1/F3 — rastreamento é EXCLUSIVO do plano Full (ver-mas-não-usar,
  // .plano-selo — kit.css). NUNCA esconde uma rota que já está ATIVA agora
  // (grandfathering: downgrade no meio do dia não cega o admin de uma operação
  // em andamento) — o gate visual só aparece quando não há nada rodando.
  const showFullGate = !!live && live.full === false && !routes.some((route) => route.sessionStatus === "ACTIVE");

  const selectedRoute = routes.find((route) => route.sessionId === selectedSessionId) ?? null;
  const historyEvents = useMemo(() => {
    if (!history || history.sessionId !== selectedSessionId) return [];

    const events: TrackingHistoryEvent[] = [];
    const seen = new Set<string>();
    const addEvent = (event: TrackingHistoryEvent) => {
      const key = historyEventKey(event);
      if (seen.has(key)) return;
      seen.add(key);
      events.push(event);
    };

    history.events.forEach(addEvent);
    history.points.forEach((point) => {
      const type = normalizeHistoryEventType(point.eventType);
      if (!type) return;
      addEvent({ type, deliveryId: point.deliveryId, capturedAt: point.capturedAt });
    });

    return events
      .sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime())
      .slice(-4)
      .reverse();
  }, [history, selectedSessionId]);

  const selectRoute = useCallback((sessionId: string) => {
    selectedSessionRef.current = sessionId;
    setSelectedSessionId(sessionId);
    setHistory(null);
    void loadHistory(sessionId, true);
  }, [loadHistory]);

  if (!user) {
    return (
      <div className="work log-live-work">
        <section className="panel">
          <div className="emp-empty"><span className="emp-empty__text">Carregando painel…</span></div>
        </section>
      </div>
    );
  }

  if (!admin) {
    return (
      <div className="work log-live-work">
        <section className="panel">
          <div className="emp-empty">
            <strong className="emp-empty__title">Acesso restrito</strong>
            <span className="emp-empty__text">O acompanhamento ao vivo está disponível somente para a administração.</span>
            <Link href="/logistica" className="btn-ghost">Voltar para Logística</Link>
          </div>
        </section>
      </div>
    );
  }

  const noRoutes = !loading && !error && routes.length === 0;
  const nowMs = updatedAtMs || 0;
  const selectedHistory = history?.sessionId === selectedSessionId ? history : null;

  return (
    <div className="work log-live-work hbx-page-mobile-enter">
      <section className="panel log-live-panel">
        <div className="panel-head log-live-head">
          <div>
            <h2>Rastreamento ao vivo</h2>
            <p className="log-live-head__subtitle">Posições válidas enviadas pelo app durante rotas rastreadas.</p>
          </div>
          <div className="meta log-live-head__actions">
            {updatedAtMs > 0 ? <span>Atualizado às {new Date(updatedAtMs).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span> : null}
            <button type="button" className="btn-ghost btn-xs" onClick={() => void loadAll(false)} disabled={loading || refreshing}>
              <span className={refreshing ? "log-live-spin" : undefined} aria-hidden>↻</span>
              {refreshing ? "Atualizando…" : "Atualizar"}
            </button>
            <Link href="/logistica" className="btn-ghost btn-xs">
              <I d={ICONS.logistica} size={13} /> Rotas
            </Link>
          </div>
        </div>

        {loading && !live ? (
          <div className="log-live-loading" aria-label="Carregando rastreamento">
            <span /><span /><span /><span />
          </div>
        ) : null}

        {error ? (
          <div className={`log-live-alert${live ? " is-inline" : ""}`} role="alert">
            <div>
              <strong>{live ? "Atualização interrompida" : "Não foi possível abrir o painel"}</strong>
              <span>{error}</span>
            </div>
            <button type="button" className="btn-ghost btn-xs" onClick={() => void loadAll(false)}>Tentar novamente</button>
          </div>
        ) : null}

        {showFullGate ? (
          <div className="emp-empty log-live-empty" aria-label="Recurso do plano Full">
            <span className="plano-selo">Disponível no Full</span>
            <strong className="emp-empty__title">Rastreamento ao vivo é do plano Full</strong>
            <span className="emp-empty__text">
              Posição do motorista, trajeto completo e ETA de cada entrega em tempo real — fale com a HBX para habilitar.
            </span>
          </div>
        ) : (
          <>
        {live ? <TrackingKpis routes={routes} /> : null}

        <CreditStatement
          statement={statement}
          month={statementMonth}
          error={statementError}
          onMonthChange={(month) => {
            if (!month) return;
            setStatement(null);
            setStatementError(null);
            setStatementMonth(month);
          }}
        />

        {noRoutes ? (
          <div className="emp-empty log-live-empty">
            <span className="log-live-empty__icon" aria-hidden><I d={ICONS.mapin} size={24} /></span>
            <strong className="emp-empty__title">Nenhuma rota rastreada agora</strong>
            <span className="emp-empty__text">Quando um motorista iniciar uma Rota Rastreada, a posição e o trajeto aparecerão aqui.</span>
            <button type="button" className="btn-ghost" onClick={() => void loadAll(false)}>Atualizar painel</button>
          </div>
        ) : null}

        {selectedRoute ? (
          <div className="log-live-layout">
            <section className="log-live-map-card hbx-card-enter" aria-label="Mapa da rota selecionada">
              <header className="log-live-map-card__head">
                <div className="log-live-driver-title">
                  <span className="log-live-driver-title__icon"><I d={ICONS.logistica} size={18} /></span>
                  <span>
                    <strong>{driverName(selectedRoute)}</strong>
                    <small>
                      {selectedRoute.sessionStatus === "ACTIVE" ? "Rota ativa" : "Rota encerrada"}
                      {" · "}#{shortRouteId(selectedRoute.routeId)}
                    </small>
                  </span>
                </div>
                <StatusBadge status={selectedRoute.status} />
              </header>

              <TrackingLiveMap
                sessionId={selectedRoute.sessionId}
                driverName={driverName(selectedRoute)}
                points={selectedHistory?.points ?? []}
                currentPosition={selectedRoute.lastPosition}
              />

              <div className="log-live-map-card__meta">
                <div>
                  <span>Última atualização</span>
                  <strong>{formatClock(selectedRoute.lastPosition?.capturedAt)} · {relativeUpdate(selectedRoute.lastPosition?.capturedAt, nowMs)}</strong>
                </div>
                <div>
                  <span>Posição atual</span>
                  <strong>
                    {selectedRoute.lastPosition
                      ? `${selectedRoute.lastPosition.latitude.toFixed(5)}, ${selectedRoute.lastPosition.longitude.toFixed(5)}`
                      : "Aguardando GPS"}
                  </strong>
                </div>
                <div>
                  <span>Trajeto</span>
                  <strong>{historyLoading ? "Atualizando…" : `${selectedHistory?.points.length ?? 0} posições válidas`}</strong>
                </div>
              </div>

              {historyError ? (
                <div className="log-live-history-error" role="alert">
                  <span>{historyError}</span>
                  <button type="button" className="btn-ghost btn-xs" onClick={() => void loadHistory(selectedRoute.sessionId, true)}>Recarregar trajeto</button>
                </div>
              ) : null}

              <div className="log-live-history">
                <div className="log-live-history__head">
                  <strong>Histórico do trajeto</strong>
                  <span>Início {formatDateTime(selectedRoute.startedAt)}</span>
                </div>
                {historyLoading && !selectedHistory ? <span className="log-live-history__loading">Carregando histórico…</span> : null}
                {!historyLoading && historyEvents.length === 0 ? (
                  <span className="log-live-history__empty">O traçado no mapa é atualizado conforme o aparelho envia novas posições.</span>
                ) : null}
                {historyEvents.length > 0 ? (
                  <div className="log-live-history__events">
                    {historyEvents.map((event, index) => (
                      <span key={`${historyEventKey(event)}:${event.capturedAt}:${index}`}>
                        <i aria-hidden />
                        <b>{eventLabel(event.type)}</b>
                        <small>{formatClock(event.capturedAt)}</small>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </section>

            <aside className="log-live-routes" aria-label="Motoristas e rotas">
              <div className="log-live-routes__head">
                <strong>Motoristas</strong>
                <span>{routes.length} rota(s)</span>
              </div>
              <div className="log-live-routes__list">
                {routes.map((route) => {
                  const completed = Math.max(0, route.completedDeliveries);
                  const total = Math.max(route.totalDeliveries, completed + Math.max(0, route.remainingDeliveries));
                  const progress = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
                  return (
                    <button
                      type="button"
                      className={`log-live-route${route.sessionId === selectedRoute.sessionId ? " is-selected" : ""}`}
                      key={route.sessionId}
                      onClick={() => selectRoute(route.sessionId)}
                      aria-pressed={route.sessionId === selectedRoute.sessionId}
                    >
                      <span className="log-live-route__top">
                        <span className="log-live-route__name">{driverName(route)}</span>
                        <StatusBadge status={route.status} />
                      </span>
                      <span className="log-live-route__meta">
                        <span>{route.sessionStatus === "ACTIVE" ? "Rota ativa" : "Encerrada"} · #{shortRouteId(route.routeId)}</span>
                        <span>{relativeUpdate(route.lastPosition?.capturedAt, nowMs)}</span>
                      </span>
                      <span className="log-live-route__progress" aria-hidden="true">
                        <span style={{ width: `${progress}%` }} />
                      </span>
                      <span className="log-live-route__deliveries">
                        <b>{completed} concluída(s)</b>
                        <span>{Math.max(0, route.remainingDeliveries)} restante(s)</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>
          </div>
        ) : null}
          </>
        )}
      </section>
    </div>
  );
}
