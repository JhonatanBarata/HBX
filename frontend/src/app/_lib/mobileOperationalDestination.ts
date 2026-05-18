import { apiFetch } from "./api";
import { toMobileRoute } from "./mobileRoutes";

type VendasBoardPayload = {
  summary?: {
    total?: number | null;
    today?: number | null;
    overdue?: number | null;
    scheduled?: number | null;
  } | null;
};

function safeCount(value: unknown) {
  return Math.max(0, Math.trunc(Number(value || 0)));
}

export function mobileDestinationFromVendasBoard(board: VendasBoardPayload | null | undefined) {
  const summary = board?.summary || {};
  const total = safeCount(summary.total);
  const activeQueue = safeCount(summary.today) + safeCount(summary.overdue) + safeCount(summary.scheduled);
  return toMobileRoute(total > 0 || activeQueue > 0 ? "/vendas" : "/radar-digital");
}

export async function fetchMobileOperationalDestination() {
  const board = await apiFetch<VendasBoardPayload>("/vendas/board", { timeoutMs: 12000 }).catch(() => null);
  return mobileDestinationFromVendasBoard(board);
}
