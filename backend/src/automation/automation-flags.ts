// S20 (MOTOR-ÚNICO) — leitura compartilhada da família de flags
// `HBX_AUTOMATION_*` com FALLBACK pra flag legada (mapa em CONTRATO.md §5.1,
// nomes finais fixados na S20 — ver docs/PLANEJAMENTOS/PR20072026-MOTOR-UNICO/
// S20-backend-orfaos-flags-ddl.md item 2).
//
// Regra: lê a flag NOVA primeiro; se ausente/vazia, cai pra flag VELHA (warn
// de deprecado, UMA vez por processo — várias destas flags são lidas em
// getters chamados a cada request/tick, um warn por chamada viraria spam de
// log). A flag velha NÃO é apagada nesta sprint (README linha 85: fallback
// até um publish futuro decidir remover de vez).
//
// FONTE ÚNICA deste padrão — qualquer novo ponto de leitura de flag da
// família `HBX_AUTOMATION_*` deve importar daqui, não reimplementar o
// fallback inline (evita 7 cópias divergentes do mesmo `['true','1',...]`).

const warnedOnce = new Set<string>();

function truthy(raw: unknown): boolean {
  return ['true', '1', 'yes', 'on'].includes(String(raw ?? '').trim().toLowerCase());
}

export function automationFlag(newName: string, legacyName: string): boolean {
  const rawNew = process.env[newName];
  if (rawNew !== undefined && String(rawNew).trim() !== '') {
    return truthy(rawNew);
  }
  const rawLegacy = process.env[legacyName];
  if (rawLegacy !== undefined && String(rawLegacy).trim() !== '') {
    const warnKey = `${newName}<-${legacyName}`;
    if (!warnedOnce.has(warnKey)) {
      warnedOnce.add(warnKey);
      // eslint-disable-next-line no-console
      console.warn(
        `[automation] flag legada ${legacyName} em uso — migrar para ${newName} (S20, MOTOR-ÚNICO). Fallback ativo, warn único por processo.`,
      );
    }
    return truthy(rawLegacy);
  }
  return false;
}
