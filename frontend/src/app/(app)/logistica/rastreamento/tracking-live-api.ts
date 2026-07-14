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

export interface TrackingLiveResponse {
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

export function getTrackingLive(): Promise<TrackingLiveResponse> {
  return apiFetch<TrackingLiveResponse>("/logistica/tracking/live");
}

export function getTrackingHistory(sessionId: string): Promise<TrackingHistoryResponse> {
  return apiFetch<TrackingHistoryResponse>(
    `/logistica/tracking/sessions/${encodeURIComponent(sessionId)}/history?limit=500`,
  );
}
