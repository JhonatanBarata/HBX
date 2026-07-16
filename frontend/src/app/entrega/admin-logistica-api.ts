import { apiFetch } from '@/lib/api';
import { getRota, type PlanejarRotaResult, type RotaResult } from './entrega-api';

export type AdminRouteResult = RotaResult & {
  routeStatus?: 'PLANNED' | 'INITIALIZING' | 'ACTIVE' | 'COMPLETED' | 'REFUNDING' | 'FAILED' | null;
  routeMode?: 'ESSENTIAL' | 'TRACKED' | null;
};

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

export type PrepareAdminRouteResult = {
  operationalDate: string;
  sourceDates: string[];
  movedPending: number;
  materialized: number;
  skipped: number;
  plan: PlanejarRotaResult;
};

export type AdminRouteHistoryDay = {
  date: string;
  label: string;
  total: number;
  delivered: number;
  cancelled: number;
  pending: number;
  immutable: boolean;
  status: 'PENDENTE' | 'CONCLUÍDA';
};

export async function getAdminRoute(date?: string): Promise<AdminRouteResult> {
  const query = date ? `?date=${encodeURIComponent(date)}` : '';
  try {
    const result = await apiFetch<AdminRouteResult>(`/logistica/admin-route/route${query}`);
    // Mantém a cápsula/cache offline já consolidada no produto. O retorno
    // administrativo continua sendo a fonte da tela; esta leitura é só aquecimento.
    void getRota(date).catch(() => undefined);
    return result;
  } catch (adminError) {
    // Sem rede, o SW/app nativo pode ainda possuir exatamente a rota iniciada no
    // contrato legado. O Admin tem visão integral, então este fallback é seguro.
    try {
      return await getRota(date) as AdminRouteResult;
    } catch {
      throw adminError;
    }
  }
}

export function getAdminRouteAdjustments(date?: string): Promise<AdminRouteAdjustments> {
  const query = date ? `?date=${encodeURIComponent(date)}` : '';
  return apiFetch<AdminRouteAdjustments>(`/logistica/admin-route/adjustments${query}`);
}

export function prepareAdminRoute(payload: PrepareAdminRoutePayload): Promise<PrepareAdminRouteResult> {
  return apiFetch<PrepareAdminRouteResult>('/logistica/admin-route/prepare', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function startAdminRoute(payload: PrepareAdminRoutePayload): Promise<PlanejarRotaResult> {
  return apiFetch<PlanejarRotaResult>('/logistica/admin-route/start', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function retryAdminDeliveryLater(deliveryId: string): Promise<{ id: string; rotaOrdem: number }> {
  return apiFetch<{ id: string; rotaOrdem: number }>(
    `/logistica/admin-route/deliveries/${encodeURIComponent(deliveryId)}/retry-later`,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

export function getAdminRouteHistory(days = 7): Promise<{ days: AdminRouteHistoryDay[] }> {
  return apiFetch<{ days: AdminRouteHistoryDay[] }>(
    `/logistica/admin-route/history?days=${encodeURIComponent(String(days))}`,
  );
}
