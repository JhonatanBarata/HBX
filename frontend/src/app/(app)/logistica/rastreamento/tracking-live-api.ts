"use client";

import { apiFetch } from "@/lib/api";

export type TrackingSignalStatus = "ONLINE" | "STOPPED" | "NO_SIGNAL";
export type TrackingSessionStatus = "ACTIVE" | "ENDED";
export type TrackingHistoryEventType = "START" | "ARRIVAL" | "END";

export interface TrackingPosition {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  speedKmh: number;
  capturedAt: string;
}

export interface TrackingLiveRoute {
  sessionId: string;
  routeId: string;
  driver: {
    id: number;
    nome: string | null;
  };
  status: TrackingSignalStatus;
  sessionStatus: TrackingSessionStatus;
  startedAt: string;
  endedAt: string | null;
  lastPosition: TrackingPosition | null;
  completedDeliveries: number;
  remainingDeliveries: number;
  totalDeliveries: number;
}

export interface TrackingHistoryPoint extends TrackingPosition {
  eventType: string | null;
  deliveryId: string | null;
}

export interface TrackingHistoryEvent {
  type: TrackingHistoryEventType;
  deliveryId: string | null;
  capturedAt: string;
}

// PR27072026 F1/F3 (ROTA 3 NÍVEIS) — nível do plano no MOMENTO da consulta
// (não é o nível em que a rota nasceu — grandfathering: downgrade não some com
// rota ATIVA em andamento, ver logistica-tracking.service.ts#getLive). Ausente
// em respostas antigas de cache = tratar como ADVANCED no consumo (mesmo
// grandfathering do resto do app).
export type LogisticaNivel = "BASIC" | "ADVANCED" | "FULL";

export interface TrackingLiveResponse {
  nivel?: LogisticaNivel;
  // 24/08 — `full` MORREU da resposta: rastreamento é de todos (toda rota é
  // TRACKED); o gate de plano saiu do backend e desta tela.
  routes: TrackingLiveRoute[];
}

export interface TrackingHistoryResponse {
  sessionId: string;
  routeId: string;
  startedAt: string;
  endedAt: string | null;
  points: TrackingHistoryPoint[];
  events: TrackingHistoryEvent[];
}

export interface TrackingCreditStatement {
  month: string;
  balanceCredits: number;
  totals: {
    essentialCredits: number;
    trackedDeliveries: number;
    trackedCredits: number;
    paidTrackedCredits: number;
    bonusCredits: number;
  };
  trackedDeliveries: Array<{
    claimId: string;
    routeId: string;
    trackingSessionId: string;
    deliveryId: string;
    credits: number;
    paidCredits: number;
    completedAt: string;
  }>;
  bonuses: Array<{
    sourceMonth: string;
    eligiblePaidCredits: number;
    bonusCredits: number;
    status: string;
    grantedAt: string | null;
    expiresAt: string | null;
  }>;
}

// F3 (27/07) — link público "acompanhe sua entrega" por parada da rota
// (GET /logistica/tracking/routes/:id/share-links, Admin). Lista vazia quando o
// segredo do link não está configurado no backend (fail-closed).
export interface TrackingShareLink {
  deliveryId: string;
  token: string;
  url: string;
  clienteNome: string | null;
  status: string;
}

export function getRouteShareLinks(routeId: string): Promise<{ links: TrackingShareLink[] }> {
  return apiFetch<{ links: TrackingShareLink[] }>(
    `/logistica/tracking/routes/${encodeURIComponent(routeId)}/share-links`,
  );
}

export function getTrackingLive(): Promise<TrackingLiveResponse> {
  return apiFetch<TrackingLiveResponse>("/logistica/tracking/live");
}

export function getTrackingHistory(sessionId: string): Promise<TrackingHistoryResponse> {
  return apiFetch<TrackingHistoryResponse>(
    `/logistica/tracking/sessions/${encodeURIComponent(sessionId)}/history?limit=500`,
  );
}

export function getTrackingCreditStatement(month: string): Promise<TrackingCreditStatement> {
  return apiFetch<TrackingCreditStatement>(
    `/logistica/creditos/extrato?month=${encodeURIComponent(month)}`,
  );
}
