// ================================================================
// LOGÍSTICA (desktop) — contratos do ADMIN-ROUTE que a montagem de rota usa.
//
// Nasceu dentro do app de celular (/entrega) e mudou de casa em 06/08, quando
// a view mobile do navegador foi apagada. Veio SÓ o que tem consumidor vivo:
// `getAdminRouteAdjustments` (o que existe pra montar hoje) e
// `prepareAdminRoute` (monta sem iniciar) — os dois do route-builder.tsx.
// O resto (getAdminRoute/startAdminRoute/history/retry-later) era da tela do
// motorista e foi embora com ela; os ENDPOINTS seguem no backend, servindo o
// aplicativo — nada foi desligado no servidor.
// ================================================================

import { apiFetch } from '@/lib/api';

export type AdminAdjustmentDay = {
  date: string;
  label: string;
  isToday: boolean;
  customers: number;
  items: number;
};

export type AdminPendingDelivery = {
  id: string;
  sourceDate: string | null;
  customerName: string;
  localLabel: string | null;
  quantity: number;
  items: Array<{ name: string; quantity: number }>;
};

export type AdminRouteAdjustments = {
  operationalDate: string;
  today: {
    existingStops: number;
    expectedStops: number;
    totalStops: number;
    missingGps: number;
  };
  days: AdminAdjustmentDay[];
  pending: AdminPendingDelivery[];
};

export type PrepareAdminRoutePayload = {
  operationalDate?: string;
  sourceDates?: string[];
  pendingDeliveryIds?: string[];
  origemLat?: number;
  origemLng?: number;
};

/** O plano devolvido pelo prepare (mesmo formato do POST /logistica/rota/iniciar). */
export type PlanoDeRota = {
  date: string;
  total: number;
  routeId?: string | null;
  // 24/08 — NÃO remover: sobreviveu à morte do modo Essencial de propósito.
  // A semântica é "a rota abre sessão de telemetria" (sessão viva) — toda rota
  // é TRACKED, então hoje vem sempre true, mas o campo segue no contrato.
  trackingRequired: boolean;
  trackingSessionId?: string | null;
  trackingStatus?: 'ACTIVE' | 'ENDED' | null;
  semCoordenada: number;
  distanciaTotalKm: number;
  terminoPrevisto: string | null;
  velocidadeMediaKmH: number;
  tempoParadaMin: number;
  paradas: Array<{
    id: string;
    rotaOrdem: number;
    etaAt: string | null;
    semCoordenada: boolean;
    lat: number | null;
    lng: number | null;
    status: string;
    nome: string | null;
  }>;
};

export type PrepareAdminRouteResult = {
  operationalDate: string;
  sourceDates: string[];
  movedPending: number;
  materialized: number;
  skipped: number;
  plan: PlanoDeRota;
};

function localDateKey(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export async function getAdminRouteAdjustments(date?: string): Promise<AdminRouteAdjustments> {
  const query = date ? `?date=${encodeURIComponent(date)}` : '';
  try {
    return await apiFetch<AdminRouteAdjustments>(`/logistica/admin-route/adjustments${query}`);
  } catch {
    const operationalDate = date || localDateKey();
    return {
      operationalDate,
      today: { existingStops: 0, expectedStops: 0, totalStops: 0, missingGps: 0 },
      days: [],
      pending: [],
    };
  }
}

export function prepareAdminRoute(payload: PrepareAdminRoutePayload): Promise<PrepareAdminRouteResult> {
  return apiFetch<PrepareAdminRouteResult>('/logistica/admin-route/prepare', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
