"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CascaLoading, CascaSheet, toggleCascaFullscreen } from "@/components/casca";
import { useCurrentUser } from "@/components/hbx/shell";
import { isTenantAdmin } from "@/lib/roles";

import {
  getAdminRoute,
  getAdminRouteAdjustments,
  getAdminRouteHistory,
  prepareAdminRoute,
  retryAdminDeliveryLater,
  startAdminRoute,
  type AdminRouteAdjustments,
  type AdminRouteHistoryDay,
} from "./admin-logistica-api";
import { ArrivalSheet } from "./ArrivalSheet";
import { EntregaAvulsa, type AvulsaAcao } from "./EntregaAvulsa";
import { EntregaScaffold } from "./EntregaScaffold";
import { EntregaHome } from "./page.client";
import {
  avisarChegando,
  cancelarEntrega,
  distanciaMetros,
  hhmm,
  mapsHref,
  paradasAbertas,
  resumoItens,
  type ComprovantesLocais,
  type ReceiptMethod,
  type RotaItem,
  type RotaResult,
} from "./entrega-api";
import {
  beep,
  buzz,
  getPosicaoUma,
  primeAudio,
  useGeofence,
  useOfflineSync,
  useWakeLock,
} from "./entrega-hooks";
import { getConfig } from "./gestao-api";
import { shellAbrirMaps, shellClearRota, shellDisponivel, shellSetRota } from "./shell-bridge";
import styles from "./admin-page.module.css";

const RotaMapa = dynamic(() => import("./RotaMapa").then((module) => module.RotaMapa), { ssr: false });
const DEFAULT_ARRIVAL_RADIUS_M = 60;

type Feedback = { kind: "ok" | "error"; text: string } | null;

function fullDateLabel(dateKey: string | null | undefined): string {
  if (!dateKey) return "Hoje";
  const date = new Date(`${dateKey}T12:00:00-03:00`);
  if (Number.isNaN(date.getTime())) return "Hoje";
  const value = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function shortDateLabel(dateKey: string | null | undefined): string {
  if (!dateKey) return "—";
  const [year, month, day] = dateKey.split("-");
  return year && month && day ? `${day}/${month}` : dateKey;
}

function routeEnd(items: RotaItem[]): string | null {
  const withEta = items.filter((item) => item.etaAt);
  return withEta.length > 0 ? withEta[withEta.length - 1].etaAt ?? null : null;
}

function stopStatusLabel(status: string): string {
  if (status === "entregue") return "Entregue";
  if (status === "cancelada") return "Não entregue";
  if (status === "em_rota") return "Em rota";
  return "Prevista";
}

function openMap(item: RotaItem): void {
  const url = mapsHref(item.cliente);
  if (shellAbrirMaps(url)) return;
  const opened = window.open(url, "_blank");
  if (opened) {
    try {
      opened.opener = null;
    } catch {
      /* best-effort */
    }
  }
}

export function AdminEntregaHome() {
  const user = useCurrentUser();

  if (!user) {
    return (
      <EntregaScaffold title="Controle logístico">
        <div className="ent-empty">
          <CascaLoading caption="Carregando" />
        </div>
      </EntregaScaffold>
    );
  }

  // Perfis limitados continuam na experiência existente. A árvore de roles será
  // aplicada depois; esta entrega constrói primeiro o produto completo do Admin.
  if (!isTenantAdmin(user) || !user.company?.id) return <EntregaHome />;

  return <AdminRouteWorkspace />;
}

function AdminRouteWorkspace() {
  const wakeLock = useWakeLock();
  const sync = useOfflineSync();
  const loadSequence = useRef(0);
  const nativeArrivalRef = useRef<{
    current: RotaItem | null;
    open: RotaItem[];
    sheetOpen: boolean;
    select: (index: number) => void;
    arrive: () => void;
  } | null>(null);

  const [route, setRoute] = useState<RotaResult | null>(null);
  const [adjustments, setAdjustments] = useState<AdminRouteAdjustments | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<"prepare" | "start" | "delivery" | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(() => new Set());
  const [selectedPending, setSelectedPending] = useState<Set<string>>(() => new Set());
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<AdminRouteHistoryDay[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [arrivalOpen, setArrivalOpen] = useState(false);
  const [arrivedByGps, setArrivedByGps] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [avulsaOpen, setAvulsaOpen] = useState(false);
  const [arrivalRadiusM, setArrivalRadiusM] = useState(DEFAULT_ARRIVAL_RADIUS_M);
  const [lastPlan, setLastPlan] = useState<{ distanceKm: number; endAt: string | null } | null>(null);

  const operationalDate = adjustments?.operationalDate ?? route?.date ?? null;

  const load = useCallback(async (silent = false) => {
    const sequence = ++loadSequence.current;
    if (silent) setRefreshing(true);
    else setLoading(true);
    setFeedback(null);
    try {
      const [nextRoute, nextAdjustments] = await Promise.all([
        getAdminRoute(),
        getAdminRouteAdjustments(),
      ]);
      if (loadSequence.current !== sequence) return;
      setRoute(nextRoute);
      setAdjustments(nextAdjustments);
      setSelectedDates((previous) => {
        const next = new Set(previous);
        next.add(nextAdjustments.operationalDate);
        return next;
      });
      setCurrentIndex((index) => {
        const openCount = paradasAbertas(nextRoute).length;
        return Math.max(0, Math.min(index, Math.max(0, openCount - 1)));
      });
    } catch (error) {
      if (loadSequence.current !== sequence) return;
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Não foi possível carregar a operação." });
    } finally {
      if (loadSequence.current === sequence) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  useEffect(() => {
    void getConfig()
      .then((config) => {
        if (typeof config.raioChegadaM === "number" && config.raioChegadaM > 0) {
          setArrivalRadiusM(config.raioChegadaM);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (sync.sincronizados <= 0) return undefined;
    const timeout = window.setTimeout(() => void load(true), 0);
    return () => window.clearTimeout(timeout);
  }, [sync.sincronizados, load]);

  const allOpenStops = useMemo(() => (route ? paradasAbertas(route) : []), [route]);
  const openStops = useMemo(
    () => allOpenStops.filter((item) => !sync.entregaIdsPendentes.has(item.id)),
    [allOpenStops, sync.entregaIdsPendentes],
  );
  const delivered = useMemo(
    () => route?.items.filter((item) => item.status === "entregue").length ?? 0,
    [route],
  );
  const routeTotal = route?.items.length ?? 0;
  const currentStop = openStops[currentIndex] ?? openStops[0] ?? null;
  const active = Boolean(route?.items.some((item) => item.status === "em_rota"));
  const ready = !active && openStops.length > 0 && openStops.every((item) => typeof item.rotaOrdem === "number");
  const completed = routeTotal > 0 && allOpenStops.length === 0;
  const estimatedEnd = routeEnd(openStops);
  const progressPercent = routeTotal > 0 ? Math.round((delivered / routeTotal) * 100) : 0;
  const missingGps = adjustments?.today.missingGps ?? openStops.filter(
    (item) => typeof item.cliente.lat !== "number" || typeof item.cliente.lng !== "number",
  ).length;

  const selectStop = useCallback((index: number) => {
    const max = Math.max(0, openStops.length - 1);
    setCurrentIndex(Math.max(0, Math.min(max, index)));
  }, [openStops.length]);

  const arrive = useCallback(() => {
    if (!currentStop) return;
    buzz([24, 40, 24]);
    setArrivedByGps(false);
    setArrivalOpen(true);
  }, [currentStop]);

  const arrivalTarget = useMemo(() => {
    if (!active || !currentStop) return null;
    if (typeof currentStop.cliente.lat !== "number" || typeof currentStop.cliente.lng !== "number") return null;
    return {
      id: currentStop.id,
      lat: currentStop.cliente.lat,
      lng: currentStop.cliente.lng,
      raioM: arrivalRadiusM,
    };
  }, [active, currentStop, arrivalRadiusM]);

  const approximation = useMemo(() => {
    if (!route?.avisoChegandoAtivo) return undefined;
    return {
      raioM: route.avisoChegandoDistanciaM ?? 500,
      onAproximar: (id: string) => void avisarChegando(id),
    };
  }, [route]);

  const onGpsArrival = useCallback(() => {
    buzz([24, 40, 24]);
    beep();
    setArrivedByGps(true);
    setArrivalOpen(true);
  }, []);

  const { posicao: livePosition } = useGeofence(
    arrivalTarget,
    active && !arrivalOpen,
    onGpsArrival,
    approximation,
  );

  useEffect(() => {
    nativeArrivalRef.current = {
      current: currentStop,
      open: openStops,
      sheetOpen: arrivalOpen,
      select: selectStop,
      arrive: onGpsArrival,
    };
  }, [currentStop, openStops, arrivalOpen, selectStop, onGpsArrival]);

  useEffect(() => {
    const listener = (event: Event) => {
      const deliveryId = (event as CustomEvent<{ paradaId?: string }>).detail?.paradaId;
      const snapshot = nativeArrivalRef.current;
      if (!deliveryId || !snapshot || snapshot.sheetOpen) return;
      if (snapshot.current?.id === deliveryId) {
        snapshot.arrive();
        return;
      }
      const index = snapshot.open.findIndex((item) => item.id === deliveryId);
      if (index >= 0) {
        snapshot.select(index);
        snapshot.arrive();
      }
    };
    document.addEventListener("hbxshell:chegada", listener);
    return () => document.removeEventListener("hbxshell:chegada", listener);
  }, []);

  useEffect(() => {
    const points = openStops
      .filter((item) => typeof item.cliente.lat === "number" && typeof item.cliente.lng === "number")
      .map((item) => ({
        id: item.id,
        nome: item.cliente.nome ?? "Cliente",
        lat: item.cliente.lat as number,
        lng: item.cliente.lng as number,
      }));
    const trackedActive =
      active && route?.trackingRequired === true && route.trackingStatus === "ACTIVE" && Boolean(route.routeId);

    if (active && points.length > 0 && shellDisponivel()) {
      shellSetRota(arrivalRadiusM, points, {
        routeId: route?.routeId,
        mode: route?.trackingRequired ? "TRACKED" : "ESSENTIAL",
        trackingSessionId: route?.trackingSessionId,
      });
    } else if (!trackedActive) {
      shellClearRota();
    }
    return () => {
      if (!trackedActive) shellClearRota();
    };
  }, [active, openStops, route?.routeId, route?.trackingRequired, route?.trackingSessionId, route?.trackingStatus, arrivalRadiusM]);

  const traceRoute = useCallback(async (closeAdjustments = false) => {
    if (!operationalDate || busy) return;
    setBusy("prepare");
    setFeedback(null);
    let position: { lat: number; lng: number } | undefined;
    try {
      position = await getPosicaoUma();
    } catch {
      position = undefined;
    }
    try {
      const result = await prepareAdminRoute({
        operationalDate,
        sourceDates: Array.from(new Set([operationalDate, ...selectedDates])),
        pendingDeliveryIds: Array.from(selectedPending),
        origemLat: position?.lat,
        origemLng: position?.lng,
      });
      setLastPlan({ distanceKm: result.plan.distanciaTotalKm, endAt: result.plan.terminoPrevisto });
      setSelectedPending(new Set());
      if (closeAdjustments) setAdjustOpen(false);
      await load(true);
      setFeedback({
        kind: "ok",
        text: `Rota pronta para ${shortDateLabel(result.operationalDate)} · ${result.plan.total} parada(s). Traçar não consumiu créditos.`,
      });
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Não foi possível traçar a rota." });
    } finally {
      setBusy(null);
    }
  }, [operationalDate, busy, selectedDates, selectedPending, load]);

  const beginRoute = useCallback(async () => {
    if (!operationalDate || busy) return;
    setBusy("start");
    setFeedback(null);
    buzz(14);
    primeAudio();
    void wakeLock.enable();
    void toggleCascaFullscreen();
    let position: { lat: number; lng: number } | undefined;
    try {
      position = await getPosicaoUma();
    } catch {
      position = undefined;
    }
    try {
      await startAdminRoute({
        operationalDate,
        origemLat: position?.lat,
        origemLng: position?.lng,
      });
      setCurrentIndex(0);
      await load(true);
      setFeedback({ kind: "ok", text: "Rota iniciada. A cópia offline foi preparada; navegue quando decidir." });
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Não foi possível começar a rota." });
    } finally {
      setBusy(null);
    }
  }, [operationalDate, busy, wakeLock, load]);

  const confirmDelivery = useCallback(async (payload: {
    itens: Array<{ id: string; qtdEntregue: number }>;
    novosItens?: Array<{ productId: number; qtdEntregue: number }>;
    receiptMethod?: ReceiptMethod;
    comprovantesLocais?: ComprovantesLocais;
  }) => {
    if (!currentStop || busy) return;
    setBusy("delivery");
    setFeedback(null);
    let position: { lat: number; lng: number; accuracy?: number } | undefined;
    try {
      position = await getPosicaoUma();
    } catch {
      position = undefined;
    }

    const customerLat = currentStop.cliente.lat;
    const customerLng = currentStop.cliente.lng;
    const distanceLimit = Math.max(arrivalRadiusM * 2, 120);
    if (
      position &&
      typeof customerLat === "number" &&
      typeof customerLng === "number" &&
      (position.accuracy == null || position.accuracy <= distanceLimit)
    ) {
      const distance = distanciaMetros(position, { lat: customerLat, lng: customerLng });
      if (distance > distanceLimit && !window.confirm("O GPS está longe do endereço combinado. Confirmar a entrega mesmo assim?")) {
        setBusy(null);
        return;
      }
    }

    try {
      await sync.enqueueConfirmacao(currentStop.id, {
        lat: position?.lat,
        lng: position?.lng,
        accuracy: position?.accuracy,
        receiptMethod: payload.receiptMethod,
        itens: payload.itens,
        novosItens: payload.novosItens,
        comprovantesLocais: payload.comprovantesLocais,
      });
      setArrivalOpen(false);
      setCurrentIndex((index) => Math.max(0, Math.min(index, Math.max(0, openStops.length - 2))));
      await load(true).catch(() => undefined);
      setFeedback({ kind: "ok", text: "Entrega salva. Se estiver offline, o HBX sincronizará a mesma confirmação sem duplicar." });
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Não foi possível salvar a entrega." });
    } finally {
      setBusy(null);
    }
  }, [currentStop, busy, arrivalRadiusM, sync, openStops.length, load]);

  const failDelivery = useCallback(async (reason: string) => {
    if (!currentStop || busy) return;
    setBusy("delivery");
    setFeedback(null);
    try {
      if (reason === "reagendar") {
        await retryAdminDeliveryLater(currentStop.id);
        setFeedback({ kind: "ok", text: "A parada foi movida para o fim da rota para uma nova tentativa." });
      } else {
        await cancelarEntrega(currentStop.id, reason);
        setFeedback({ kind: "ok", text: "Ocorrência registrada. A próxima parada continua disponível." });
      }
      setArrivalOpen(false);
      await load(true);
      setCurrentIndex((index) => Math.max(0, Math.min(index, Math.max(0, openStops.length - 2))));
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Não foi possível registrar a ocorrência." });
    } finally {
      setBusy(null);
    }
  }, [currentStop, busy, load, openStops.length]);

  const openHistory = useCallback(async () => {
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const result = await getAdminRouteHistory(14);
      setHistory(result.days);
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Não foi possível carregar o histórico." });
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const afterAdHoc = useCallback(async (deliveryId: string, action: AvulsaAcao) => {
    if (!operationalDate) return;
    try {
      await prepareAdminRoute({ operationalDate, sourceDates: [operationalDate] });
      const nextRoute = await getAdminRoute(operationalDate);
      setRoute(nextRoute);
      if (action === "agora") {
        const index = paradasAbertas(nextRoute).findIndex((item) => item.id === deliveryId);
        if (index >= 0) setCurrentIndex(index);
      }
      void getAdminRouteAdjustments(operationalDate).then(setAdjustments).catch(() => undefined);
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : "A entrega foi criada, mas a rota não foi recalculada." });
      await load(true).catch(() => undefined);
    }
  }, [operationalDate, load]);

  const toggleDate = useCallback((date: string) => {
    if (date === operationalDate) return;
    setSelectedDates((previous) => {
      const next = new Set(previous);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      if (operationalDate) next.add(operationalDate);
      return next;
    });
  }, [operationalDate]);

  const togglePending = useCallback((id: string) => {
    setSelectedPending((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  if (loading) {
    return (
      <EntregaScaffold title="Controle logístico">
        <div className="ent-empty">
          <CascaLoading caption="Preparando operação" />
        </div>
      </EntregaScaffold>
    );
  }

  const title = active ? "Rota ativa" : completed ? "Rota concluída" : ready ? "Rota pronta" : "Operação de hoje";
  const expectedStops = adjustments?.today.totalStops ?? openStops.length;
  const pendingCount = adjustments?.pending.length ?? 0;

  return (
    <EntregaScaffold
      title="Controle logístico"
      headerActions={
        <div className={styles.topActions}>
          {sync.pendentes > 0 ? (
            <span className={styles.offlineBadge} title={`${sync.pendentes} ação(ões) aguardando sincronização`}>
              ⇅ {sync.pendentes}
            </span>
          ) : null}
          <button type="button" className={styles.topButton} aria-label="Histórico" onClick={() => void openHistory()}>
            ◷
          </button>
          <button
            type="button"
            className={styles.topButton}
            aria-label="Atualizar"
            disabled={refreshing}
            onClick={() => void load(true)}
          >
            {refreshing ? "…" : "↻"}
          </button>
        </div>
      }
    >
      <main className={styles.page}>
        <section className={styles.hero}>
          <div>
            <div className={styles.eyebrow}>{fullDateLabel(operationalDate)}</div>
            <h2 className={styles.title}>{title}</h2>
            <p className={styles.subtitle}>
              {active
                ? "A ordem está congelada para execução. Escolha quando navegar e registre cada parada."
                : completed
                  ? "O passado permanece somente para consulta. Uma nova operação nasce como nova rota."
                  : ready
                    ? "Revise a lista. Começar prepara o offline, congela a rota e aplica a regra comercial."
                    : "Hoje é a data operacional. Recorrências e pendências entram apenas quando você decide."}
            </p>
          </div>

          <div className={styles.metrics}>
            <div className={styles.metric}>
              <strong>{active || ready || completed ? routeTotal : expectedStops}</strong>
              <span>{active ? "paradas no dia" : ready ? "paradas prontas" : completed ? "paradas fechadas" : "previstas"}</span>
            </div>
            <div className={styles.metric}>
              <strong>{active || completed ? `${delivered}/${routeTotal}` : pendingCount}</strong>
              <span>{active || completed ? "concluídas" : "pendências sugeridas"}</span>
            </div>
            <div className={styles.metric}>
              <strong>
                {lastPlan && ready
                  ? `${lastPlan.distanceKm.toFixed(1).replace(".", ",")} km`
                  : estimatedEnd
                    ? hhmm(estimatedEnd)
                    : missingGps}
              </strong>
              <span>{lastPlan && ready ? "distância estimada" : estimatedEnd ? "término estimado" : "sem GPS"}</span>
            </div>
          </div>

          {!active && !completed ? (
            <div className={styles.actions}>
              {ready ? (
                <button type="button" className={styles.primary} disabled={busy != null} onClick={() => void beginRoute()}>
                  {busy === "start" ? "Começando…" : "Começar rota"}
                </button>
              ) : (
                <button type="button" className={styles.primary} disabled={busy != null} onClick={() => void traceRoute()}>
                  {busy === "prepare" ? "Traçando…" : "Traçar melhor rota"}
                </button>
              )}
              <button type="button" className={styles.secondary} disabled={busy != null} onClick={() => setAdjustOpen(true)}>
                Ajustar clientes
              </button>
            </div>
          ) : completed ? (
            <div className={styles.actions}>
              <button type="button" className={styles.secondary} onClick={() => void openHistory()}>
                Ver histórico
              </button>
            </div>
          ) : null}
        </section>

        {feedback ? (
          <div className={feedback.kind === "error" ? styles.error : styles.notice} role="status">
            <strong>{feedback.kind === "error" ? "Atenção" : "Tudo certo"}</strong>
            <span>{feedback.text}</span>
          </div>
        ) : null}

        {pendingCount > 0 && !active && !completed ? (
          <div className={styles.notice}>
            <span aria-hidden="true">↳</span>
            <span>
              <strong>{pendingCount} entrega(s) anterior(es) continuam pendentes.</strong>{" "}
              Elas são sugestões e só entram hoje dentro de <button type="button" className={styles.historyButton} onClick={() => setAdjustOpen(true)}>Ajustar clientes</button>.
            </span>
          </div>
        ) : null}

        {active ? (
          <>
            <section className={styles.card}>
              <div className={styles.progressHead}>
                <strong>{delivered} de {routeTotal} concluídas</strong>
                <span className={styles.muted}>{estimatedEnd ? `término ${hhmm(estimatedEnd)}` : "rota em andamento"}</span>
              </div>
              <div className={styles.progress} aria-label={`${progressPercent}% concluído`}>
                <div className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
              </div>
            </section>

            {openStops.length > 0 ? (
              <RotaMapa
                paradas={openStops}
                indiceAtual={currentIndex}
                onSelecionarParada={selectStop}
                posicaoEntregador={livePosition}
              />
            ) : null}

            {currentStop ? (
              <section className={styles.stopCard}>
                <div className={styles.currentHead}>
                  <span className={styles.stopIndex}>Parada {currentIndex + 1} de {openStops.length}</span>
                  <span className={styles.rowSide}>{currentStop.etaAt ? hhmm(currentStop.etaAt) : "agora"}</span>
                </div>
                <div className={styles.stopName}>{currentStop.cliente.nome ?? "Cliente"}</div>
                <div className={styles.stopAddress}>
                  {[currentStop.cliente.endereco, currentStop.cliente.cidade, currentStop.localApelido]
                    .filter(Boolean)
                    .join(" · ") || "Sem endereço cadastrado"}
                </div>
                <div className={styles.stopItems}>{resumoItens(currentStop)}</div>
                <div className={styles.splitActions}>
                  <button type="button" className={styles.secondary} onClick={() => openMap(currentStop)}>
                    Navegar
                  </button>
                  <button type="button" className={styles.primary} onClick={arrive}>
                    Cheguei
                  </button>
                </div>
              </section>
            ) : (
              <section className={styles.card}>
                <div className={styles.cardHead}>
                  <h2>Rota concluída</h2>
                  <span>✓</span>
                </div>
                <p className={styles.subtitle}>Todas as paradas desta rota foram encerradas.</p>
              </section>
            )}
          </>
        ) : openStops.length > 0 ? (
          <RotaMapa paradas={openStops} indiceAtual={0} onSelecionarParada={() => undefined} posicaoEntregador={null} />
        ) : null}

        {route?.items.length ? (
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2>{active ? "Próximas paradas" : "Lista operacional"}</h2>
              <span>{route.items.length} no dia</span>
            </div>
            <div className={styles.routeList}>
              {route.items.map((item) => {
                const openIndex = openStops.findIndex((stop) => stop.id === item.id);
                const clickable = active && openIndex >= 0;
                return (
                  <button
                    type="button"
                    className={styles.row}
                    key={item.id}
                    disabled={!clickable}
                    onClick={() => clickable && selectStop(openIndex)}
                  >
                    <span className={styles.rowMain}>
                      <span className={styles.rowName}>{item.cliente.nome ?? "Cliente"}</span>
                      <span className={styles.rowSub}>{resumoItens(item)}</span>
                    </span>
                    <span className={styles.rowSide}>
                      {sync.entregaIdsPendentes.has(item.id) ? "Sincronizando" : item.etaAt && openIndex >= 0 ? hhmm(item.etaAt) : stopStatusLabel(item.status)}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : (
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2>Nenhuma parada materializada</h2>
              <span>Hoje</span>
            </div>
            <p className={styles.subtitle}>Traçar cria o rascunho operacional somente para hoje. A agenda recorrente continua independente.</p>
          </section>
        )}
      </main>

      {!loading ? (
        <button type="button" className={styles.fab} aria-label="Adicionar entrega avulsa" onClick={() => setAvulsaOpen(true)}>
          +
        </button>
      ) : null}

      <CascaSheet open={adjustOpen} title="Ajustar clientes" onClose={() => !busy && setAdjustOpen(false)}>
        <div className={styles.sheetBody}>
          <p className={styles.sheetIntro}>
            A rota final será de <strong>{fullDateLabel(operationalDate)}</strong>. Escolher outro dia move apenas aquelas ocorrências para hoje; a agenda futura permanece no dia original.
          </p>

          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h3>Agenda recorrente</h3>
              <span>data de origem</span>
            </div>
            <div className={styles.dayGrid}>
              {(adjustments?.days ?? []).map((day) => {
                const selected = selectedDates.has(day.date) || day.isToday;
                const empty = day.customers === 0 && !day.isToday;
                return (
                  <button
                    type="button"
                    key={day.date}
                    className={`${styles.dayButton} ${selected ? styles.dayOn : ""} ${empty ? styles.dayEmpty : ""}`}
                    disabled={day.isToday || empty || busy != null}
                    onClick={() => toggleDate(day.date)}
                    aria-pressed={selected}
                  >
                    {day.label}
                    <span>{day.isToday ? "hoje" : `${day.customers} cliente(s)`}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h3>Pendências anteriores</h3>
              <span>só entram após escolha</span>
            </div>
            {(adjustments?.pending.length ?? 0) > 0 ? (
              <div className={styles.pendingList}>
                {adjustments?.pending.map((item) => (
                  <label className={styles.checkRow} key={item.id}>
                    <input
                      type="checkbox"
                      checked={selectedPending.has(item.id)}
                      disabled={busy != null}
                      onChange={() => togglePending(item.id)}
                    />
                    <span className={styles.rowMain}>
                      <span className={styles.rowName}>{item.customerName}{item.localLabel ? ` · ${item.localLabel}` : ""}</span>
                      <span className={styles.originText}>
                        {item.sourceDate ? `Prevista em ${shortDateLabel(item.sourceDate)}` : "Sem data original"} · {item.quantity} item(ns)
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <span className={styles.muted}>Nenhuma entrega anterior está pendente.</span>
            )}
          </section>

          <button type="button" className={styles.primary} disabled={busy != null} onClick={() => void traceRoute(true)}>
            {busy === "prepare" ? "Preparando…" : "Aplicar e traçar rota de hoje"}
          </button>
        </div>
      </CascaSheet>

      <CascaSheet open={historyOpen} title="Histórico de rotas" onClose={() => setHistoryOpen(false)}>
        <div className={styles.sheetBody}>
          <p className={styles.sheetIntro}>Rotas passadas são imutáveis. Pendências podem ser trazidas para hoje somente pela decisão em Ajustar clientes.</p>
          {historyLoading ? (
            <div className="ent-empty"><CascaLoading caption="Carregando histórico" /></div>
          ) : history.length > 0 ? (
            <div className={styles.historyList}>
              {history.map((day) => (
                <div className={styles.historyRow} key={day.date}>
                  <span className={styles.rowMain}>
                    <span className={styles.rowName}>{day.label} · {day.status}</span>
                    <span className={styles.historyStats}>{day.delivered} entregue(s) · {day.cancelled} não entregue(s) · {day.pending} pendente(s)</span>
                  </span>
                  <span className={styles.rowSide}>{day.total}</span>
                </div>
              ))}
            </div>
          ) : (
            <span className={styles.muted}>Ainda não existem rotas anteriores neste período.</span>
          )}
        </div>
      </CascaSheet>

      <ArrivalSheet
        open={arrivalOpen && Boolean(currentStop)}
        parada={currentStop}
        moduloFinanceiroAtivo={route?.moduloFinanceiroAtivo ?? false}
        pix={route?.pix ?? null}
        comprovante={route?.comprovante}
        chegouPeloGps={arrivedByGps}
        onEntregue={confirmDelivery}
        onNaoEntregue={failDelivery}
        onClose={() => !busy && setArrivalOpen(false)}
        submitting={busy === "delivery"}
      />

      <EntregaAvulsa
        open={avulsaOpen}
        onClose={() => setAvulsaOpen(false)}
        rotaAtiva={active && openStops.length > 0}
        abertasCount={openStops.length}
        onCriada={afterAdHoc}
      />
    </EntregaScaffold>
  );
}
