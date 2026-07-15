"use strict";

// Parser puro do payload /engines/status (sem rede). Recebe o JSON do dashboard de motores e
// devolve o estado normalizado — reaproveitado pelo LOCAL e pelo VPS pra pintar igual.
// Extraído do server.js (Sprint 5, slice seguro). CommonJS puro, zero-dependência, byte-a-byte.
function parseEngineCapacity(data) {
  const engines = Array.isArray(data.engines) ? data.engines : [];
  const config = data.capacityConfig || {};
  const aliveStates = new Set(["online", "standby", "busy", "running", "active"]);
  const aliveFromEngines = engines.filter((e) => aliveStates.has(String(e.status || "").toLowerCase())).length;
  const alive = aliveFromEngines || Math.trunc(Number(data.capacity?.runningCount || data.capacity?.activeEngineCount || 0));
  // Teto REAL = quanto o Governor pode subir (maxCount), não os motores registrados agora.
  // Nunca menor que os vivos (evita "teto 1 com 2 vivos" em config local inconsistente).
  const ceiling = Math.max(1, Math.trunc(Number(config.maxCount || engines.length || 1)), alive);
  const warm = Math.max(0, Math.trunc(Number(config.warmMin || 0)));
  const governorOn = Boolean(config.governorEnabled);
  const queue = Math.trunc(Number(data.capacity?.queuedCount || 0));
  const operationalStatus = String(data.capacity?.operationalStatus || "unknown");
  // Elástico de verdade = governor ligado E teto acima do warm (dá pra crescer).
  const elastic = governorOn && ceiling > Math.max(warm, alive);
  let reason;
  if (!governorOn) reason = "Governor desligado — capacidade fixa, não cresce sozinho.";
  else if (ceiling <= warm) reason = `Teto igual ao warm (${ceiling}) — sem folga pra crescer.`;
  else if (queue > 0 && alive >= ceiling) reason = "Fila cheia e no teto — pode precisar de mais capacidade.";
  else if (queue > 0) reason = "Fila com trabalho — o Governor está subindo motores até o teto.";
  else reason = `Fila vazia — fica no warm (${warm || alive}). Sobe sozinho até ${ceiling} quando encher.`;
  // Campos novos do contrato Elástica Pura (25/06): elasticEnabled, running, physicalMax,
  // memoryPressurePercent, memoryHeadroomEngines.
  const elasticEnabled = data.elasticEnabled != null ? Boolean(data.elasticEnabled) : governorOn;
  const running = data.running != null ? Math.trunc(Number(data.running)) : alive;
  const physicalMax = data.physicalMax != null ? Math.trunc(Number(data.physicalMax)) : ceiling;
  const memoryPressurePercent = data.memoryPressurePercent != null ? Math.round(Number(data.memoryPressurePercent)) : null;
  const memoryHeadroomEngines = data.memoryHeadroomEngines != null ? Math.trunc(Number(data.memoryHeadroomEngines)) : null;
  return { ok: true, alive, warm, ceiling, queue, operationalStatus, elastic, governorOn, reason, elasticEnabled, running, physicalMax, memoryPressurePercent, memoryHeadroomEngines };
}

module.exports = { parseEngineCapacity };
