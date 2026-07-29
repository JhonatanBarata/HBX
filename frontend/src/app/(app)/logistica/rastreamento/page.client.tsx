"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { I, ICONS, useCurrentUser } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";
import { isTenantAdmin } from "@/lib/roles";

import {
  getRouteShareLinks,
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
      <details>
        <summary>
          <span>
            <strong>Créditos e bônus</strong>
            <small>{statement ? `${statement.balanceCredits} disponíveis` : "Carregando…"}</small>
          </span>
          <I d={ICONS.chevronDown} size={15} />
        </summary>

        <div className="log-credit-statement__content">
          <label className="log-credit-statement__month">
            <span>Competência</span>
            <input
              type="month"
              value={month}
              max={currentMonth()}
              onChange={(event) => onMonthChange(event.target.value)}
            />
          </label>

          {error ? <div className="log-credit-statement__error" role="alert">{error}</div> : null}
          {!statement && !error ? <div className="log-credit-statement__loading">Carregando extrato…</div> : null}
          {statement ? (
            <>
              <div className="log-credit-statement__cards">
                <article>
                  <span>Saldo</span>
                  <strong>{statement.balanceCredits}</strong>
                  <small>créditos</small>
                </article>
                <article>
                  <span>Essencial</span>
                  <strong>{statement.totals.essentialCredits}</strong>
                  <small>bloco(s)</small>
                </article>
                <article>
                  <span>Rastreada</span>
                  <strong>{statement.totals.trackedCredits}</strong>
                  <small>{statement.totals.trackedDeliveries} entrega(s)</small>
                </article>
                <article className="is-bonus">
                  <span>Bônus</span>
                  <strong>+{statement.totals.bonusCredits}</strong>
                  <small>competência</small>
                </article>
              </div>

              <div className="log-credit-statement__deliveries">
                <strong>Conclusões rastreadas</strong>
                {statement.trackedDeliveries.length === 0 ? <span>Nenhuma nesta competência.</span> : null}
                {statement.trackedDeliveries.slice(0, 6).map((delivery) => (
                  <div key={delivery.claimId}>
                    <span>{formatDateTime(delivery.completedAt)}</span>
                    <b>#{delivery.routeId.slice(0, 8).toUpperCase()}</b>
                    <small>{delivery.credits} cr. · {delivery.paidCredits} pago</small>
                  </div>
                ))}
              </div>

              <div className="log-credit-statement__bonus-list">
                <strong>Bônus mensais</strong>
                {statement.bonuses.length === 0 ? <span>Nenhum bônus processado ainda.</span> : null}
                {statement.bonuses.slice(0, 4).map((bonus) => (
                  <div key={bonus.sourceMonth}>
                    <span>{bonus.sourceMonth}</span>
                    <b>+{bonus.bonusCredits} cr.</b>
                    <small>{bonus.status === "GRANTED" ? "Concedido" : "Processando"}</small>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </details>
    </section>
  );
}

/**
 * PR29072026 — "por que não vejo a entrega que está acontecendo?"
 *
 * A rota do dia carrega o MODO congelado (`ensureRoute` decide uma vez por
 * motorista+data e não revisita, mesmo que a config mude depois). ESSENTIAL não
 * abre sessão de rastreamento, então esta página fica eternamente vazia com o
 * celular online — sem dizer por quê. Aqui a tela vai buscar esse fato.
 *
 * `routeMode` só é devolvido pra plateia de cobrança (admin), que é quem abre
 * esta página. Falha de rede = null = tela igual à de antes (nunca inventa causa).
 */
function useRotaEssencialHoje(): boolean {
  const [essencial, setEssencial] = useState(false);

  // Sem parâmetro e sem condição: hook tem que rodar na MESMA ordem em todo
  // render, e esta página tem returns antecipados (carregando / acesso restrito
  // / portão do Full) antes do ponto onde a resposta é usada.
  useEffect(() => {
    let cancelado = false;
    apiFetch<{ routeMode?: "ESSENTIAL" | "TRACKED" | null; items?: unknown[] }>("/logistica/rota")
      .then((rota) => {
        if (cancelado) return;
        // Só acusa com PROVA positiva: existe rota no dia E ela é Essencial.
        setEssencial(rota?.routeMode === "ESSENTIAL" && (rota.items?.length ?? 0) > 0);
      })
      .catch(() => { /* rede fora não inventa causa: segue sem explicação */ });
    return () => { cancelado = true; };
  }, []);

  return essencial;
}

export function LogisticaTrackingLiveClient() {
  const user = useCurrentUser();
  const admin = isTenantAdmin(user);
  // No topo, com os outros hooks: a página tem returns antecipados, e hook não
  // pode nascer depois de um `return`. Só é LIDO no estado vazio, lá embaixo.
  const rotaEssencialHoje = useRotaEssencialHoje();
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

  // F3 (27/07) — "Copiar links": um clique copia TODOS os links públicos de
  // acompanhamento da rota selecionada ("Cliente — url" por linha), pronto pra
  // colar no WhatsApp. Só no plano Full (o link público é recurso Full).
  const [copyLinksState, setCopyLinksState] = useState<"idle" | "loading" | "done" | "empty" | "error">("idle");
  const copyShareLinks = async (routeId: string) => {
    if (copyLinksState === "loading") return;
    setCopyLinksState("loading");
    try {
      const { links } = await getRouteShareLinks(routeId);
      if (!links.length) {
        setCopyLinksState("empty");
      } else {
        const texto = links
          .map((link) => `${(link.clienteNome || "Cliente").trim()} — ${link.url}`)
          .join("\n");
        await navigator.clipboard.writeText(texto);
        setCopyLinksState("done");
      }
    } catch {
      setCopyLinksState("error");
    }
    window.setTimeout(() => setCopyLinksState("idle"), 2500);
  };

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
      <section className="log-live-stage">
        <main className="log-live-map-main hbx-card-enter" aria-label="Mapa do rastreamento">
          {showFullGate ? (
            <div className="log-live-map log-live-map--empty">
              <span className="plano-selo">Disponível no Full</span>
              <strong>Rastreamento ao vivo</strong>
              <span>Posição, trajeto e ETA em tempo real.</span>
            </div>
          ) : selectedRoute ? (
            <>
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

              <div className="log-live-map-frame">
                <TrackingLiveMap
                  sessionId={selectedRoute.sessionId}
                  driverName={driverName(selectedRoute)}
                  points={selectedHistory?.points ?? []}
                  currentPosition={selectedRoute.lastPosition}
                />

                <div className="log-live-map-hud">
                  <span>
                    <small>Última posição</small>
                    <strong>{formatClock(selectedRoute.lastPosition?.capturedAt)} · {relativeUpdate(selectedRoute.lastPosition?.capturedAt, nowMs)}</strong>
                  </span>
                  <span>
                    <small>GPS</small>
                    <strong>
                      {selectedRoute.lastPosition
                        ? `${selectedRoute.lastPosition.latitude.toFixed(5)}, ${selectedRoute.lastPosition.longitude.toFixed(5)}`
                        : "Aguardando sinal"}
                    </strong>
                  </span>
                  <span>
                    <small>Trajeto</small>
                    <strong>{historyLoading ? "Atualizando…" : `${selectedHistory?.points.length ?? 0} posições`}</strong>
                  </span>
                </div>
              </div>
            </>
          ) : (
            <TrackingLiveMap
              sessionId="aguardando-rota"
              driverName="Rastreamento HBX"
              points={[]}
              currentPosition={null}
            />
          )}
        </main>

        <aside className="log-live-command" aria-label="Painel do rastreamento">
          <header className="log-live-command__head">
            <span>
              <strong>Rastreamento ao vivo</strong>
              <small>{updatedAtMs > 0 ? `Atualizado às ${new Date(updatedAtMs).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "Aguardando atualização"}</small>
            </span>
            <span className="log-live-command__actions">
              <button
                type="button"
                className="log-live-icon-btn"
                onClick={() => void loadAll(false)}
                disabled={loading || refreshing}
                title="Atualizar"
                aria-label="Atualizar rastreamento"
              >
                <span className={refreshing ? "log-live-spin" : undefined} aria-hidden>↻</span>
              </button>
              <Link href="/logistica" className="log-live-icon-btn" title="Rotas" aria-label="Abrir rotas">
                <I d={ICONS.logistica} size={15} />
              </Link>
            </span>
          </header>

          <div className="log-live-command__body">
            {error ? (
              <div className="log-live-alert" role="alert">
                <div>
                  <strong>{live ? "Atualização interrompida" : "Falha no rastreamento"}</strong>
                  <span>{error}</span>
                </div>
                <button type="button" className="log-live-compact-btn" onClick={() => void loadAll(false)}>Tentar novamente</button>
              </div>
            ) : null}

            {showFullGate ? (
              <div className="log-live-gate">
                <strong>Plano Full</strong>
                <span>Habilite o rastreamento para acompanhar motoristas e entregas no mapa.</span>
              </div>
            ) : (
              <>
                {loading && !live ? (
                  <div className="log-live-loading" aria-label="Carregando rastreamento">
                    <span /><span /><span /><span />
                  </div>
                ) : null}

                {live ? <TrackingKpis routes={routes} /> : null}

                <section className="log-live-routes" aria-label="Motoristas e rotas">
                  <div className="log-live-routes__head">
                    <strong>Motoristas</strong>
                    <span>{routes.length} rota(s)</span>
                  </div>
                  {noRoutes ? (
                    <div className="log-live-routes__empty">
                      <I d={ICONS.mapin} size={18} />
                      <span>Nenhuma rota rastreada agora</span>
                      {/* 🔴 PR29072026 (bug do dono, 29/07) — ele estava "conectado,
                          com rota iniciando, olhando pro celular online" e a tela só
                          dizia "Posição ainda não recebida". MEDIDO: a rota do dia
                          nasceu ESSENTIAL às 21:21:45 e ele ligou a Rastreada às
                          21:23:30 — 1m45s DEPOIS. O modo congela por rota/dia
                          (ensureRoute), e Essencial não abre sessão de rastreamento.
                          O estado existia e não tinha voz; agora tem. */}
                      {rotaEssencialHoje ? (
                        <small className="log-live-routes__empty-why">
                          A rota de hoje é Essencial — só a Rastreada envia posição.
                          O modo é travado no dia: trocar agora vale da próxima rota.
                        </small>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="log-live-routes__list">
                    {routes.map((route) => {
                      const completed = Math.max(0, route.completedDeliveries);
                      const total = Math.max(route.totalDeliveries, completed + Math.max(0, route.remainingDeliveries));
                      const progress = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
                      return (
                        <button
                          type="button"
                          className={`log-live-route${route.sessionId === selectedRoute?.sessionId ? " is-selected" : ""}`}
                          key={route.sessionId}
                          onClick={() => selectRoute(route.sessionId)}
                          aria-pressed={route.sessionId === selectedRoute?.sessionId}
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
                </section>

                {selectedRoute ? (
                  <section className="log-live-history">
                    <div className="log-live-history__head">
                      <span>
                        <strong>Histórico</strong>
                        <small>Início {formatDateTime(selectedRoute.startedAt)}</small>
                      </span>
                      {live?.full === true ? (
                        <button
                          type="button"
                          className="log-live-compact-btn"
                          onClick={() => void copyShareLinks(selectedRoute.routeId)}
                          disabled={copyLinksState === "loading"}
                        >
                          {copyLinksState === "idle" && "Copiar links"}
                          {copyLinksState === "loading" && "Copiando…"}
                          {copyLinksState === "done" && "Copiado!"}
                          {copyLinksState === "empty" && "Sem links"}
                          {copyLinksState === "error" && "Falhou"}
                        </button>
                      ) : null}
                    </div>
                    {historyError ? (
                      <div className="log-live-history-error" role="alert">
                        <span>{historyError}</span>
                        <button type="button" className="log-live-compact-btn" onClick={() => void loadHistory(selectedRoute.sessionId, true)}>Recarregar</button>
                      </div>
                    ) : null}
                    {historyLoading && !selectedHistory ? <span className="log-live-history__loading">Carregando histórico…</span> : null}
                    {!historyLoading && historyEvents.length === 0 ? (
                      <span className="log-live-history__empty">Aguardando eventos da rota.</span>
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
                  </section>
                ) : null}

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
              </>
            )}
          </div>
        </aside>
      </section>
    </div>
  );
}
