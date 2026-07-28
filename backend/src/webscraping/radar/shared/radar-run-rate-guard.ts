// Guard-rail da REFUNDAÇÃO F1 (28/07): teto de CRIAÇÃO de runs por empresa/minuto.
// A família de incidentes "645 runs se cancelando em 4,5min" (23/07=800, 27/07=645,
// 28/07=652) nasceu de front disparando POST em loop. A fila agora é server-side,
// mas a porta continua protegida contra qualquer cliente futuro que volte a metralhar.
// In-memory de propósito: janela de 60s não precisa sobreviver a restart.

const WINDOW_MS = 60_000;
const createsByCompany = new Map<number, number[]>();

function maxPerMinute(): number {
  const parsed = Number.parseInt(String(process.env.HBX_RADAR_RUN_CREATES_PER_MIN ?? '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
}

/** true = pode criar (e a criação foi contada); false = estourou o teto do minuto. */
export function tryRegisterRunCreation(companyId: number): boolean {
  const now = Date.now();
  const cap = maxPerMinute();
  const recent = (createsByCompany.get(companyId) || []).filter((at) => now - at < WINDOW_MS);
  if (recent.length >= cap) {
    createsByCompany.set(companyId, recent);
    return false;
  }
  recent.push(now);
  createsByCompany.set(companyId, recent);
  return true;
}

/** Só para testes: zera a janela. */
export function resetRunCreationWindow() {
  createsByCompany.clear();
}
