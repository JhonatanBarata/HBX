import { Injectable } from '@nestjs/common';

function parsePositiveIntegerEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
}

function safeInteger(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

@Injectable()
export class RadarSearchRunConfigService {
  getHbxRunBatchLimit(targetQuantity: number) {
    const configured = parsePositiveIntegerEnv('HBX_SEARCH_RUN_BATCH_LIMIT', 10);
    const smallBatch = Math.min(20, Math.max(10, configured));
    return Math.max(1, Math.min(smallBatch, Math.trunc(Number(targetQuantity || 1))));
  }

  getHbxRunMaxAttempts(targetQuantity: number, batchLimit: number) {
    const fallback = Math.max(8, Math.ceil(Math.max(1, targetQuantity) / Math.max(1, batchLimit)) * 2);
    return Math.max(1, parsePositiveIntegerEnv('HBX_SEARCH_RUN_MAX_ATTEMPTS', fallback));
  }

  getHbxRunMaxEmptyBatches() {
    return Math.max(1, parsePositiveIntegerEnv('HBX_SEARCH_RUN_MAX_EMPTY_BATCHES', 5));
  }

  getHbxRunMaxFailedBatches() {
    return Math.max(1, parsePositiveIntegerEnv('HBX_SEARCH_RUN_MAX_FAILED_BATCHES', 6));
  }

  getHbxRunMaxStalledPartialBatches() {
    return Math.max(1, parsePositiveIntegerEnv('HBX_SEARCH_RUN_MAX_STALLED_PARTIAL_BATCHES', 5));
  }

  getHbxSearchRunRestDelayMs() {
    return Math.max(60_000, parsePositiveIntegerEnv('HBX_SEARCH_RUN_REST_DELAY_MS', 15 * 60_000));
  }

  getHbxSearchRunMaxRestCycles() {
    return Math.max(0, parsePositiveIntegerEnv('HBX_SEARCH_RUN_MAX_REST_CYCLES', 3));
  }

  getHbxSearchRunRestThresholdRatio() {
    const raw = Number(process.env.HBX_SEARCH_RUN_REST_THRESHOLD_RATIO || 0.5);
    if (!Number.isFinite(raw)) return 0.5;
    return Math.max(0.1, Math.min(1, raw));
  }

  getRadarCampaignMaxEmptyBatches() {
    return Math.max(1, parsePositiveIntegerEnv('HBX_RADAR_MAX_EMPTY_BATCHES', 12));
  }

  getRadarCampaignMaxErrorBatches() {
    return Math.max(1, parsePositiveIntegerEnv('HBX_RADAR_MAX_ERROR_BATCHES', 8));
  }

  getHbxBatchTimeoutMs() {
    return Math.max(5_000, parsePositiveIntegerEnv('HBX_SEARCH_BATCH_TIMEOUT_MS', 35_000));
  }

  getHbxSocialBatchTimeoutMs(batchTimeoutMs: number) {
    return Math.max(batchTimeoutMs, parsePositiveIntegerEnv('HBX_SEARCH_SOCIAL_BATCH_TIMEOUT_MS', 120_000));
  }

  getRadarClientRequestTimeoutMs() {
    return Math.max(60_000, parsePositiveIntegerEnv('HBX_RADAR_CLIENT_REQUEST_TIMEOUT_MS', 65_000));
  }

  getRadarPullEngineAttempts(configuredEngineCount: number) {
    return Math.max(1, Math.min(
      configuredEngineCount,
      parsePositiveIntegerEnv('HBX_RADAR_PULL_ENGINE_ATTEMPTS', 1),
    ));
  }

  getHbxRetryDelayMs(consecutiveEngineErrors: number) {
    const delays = [5_000, 15_000, 30_000, 60_000];
    return delays[Math.min(Math.max(1, consecutiveEngineErrors) - 1, delays.length - 1)];
  }

  buildSearchRunProgressMessage(foundCount: number) {
    if (foundCount > 0) {
      return `Encontramos ${foundCount} contatos ate agora. Continuando busca em novos lotes...`;
    }
    return 'Lote processado sem cards aprovados. Continuando busca em novos lotes...';
  }

  buildSearchRunRetryMessage(errorMessage: string, httpStatus: number | null, foundCount: number) {
    const statusText = httpStatus ? `${httpStatus}` : errorMessage;
    const suffix = foundCount > 0
      ? ` Encontramos ${foundCount} contatos ate agora.`
      : '';
    return `Ultimo lote falhou com ${statusText}, tentando novamente...${suffix}`;
  }

  buildSearchRunInsufficientMessage(foundCount: number, attempts: number) {
    return `Busca parcial: ${foundCount} contatos encontrados. O motor tentou ${attempts} lotes, mas nao atingiu a meta.`;
  }

  buildSearchRunNoCardsMessage(attempts: number, lastQuery: string | null | undefined) {
    const query = String(lastQuery || '').trim();
    return `Busca sem contatos aprovados apos ${attempts} lotes.${query ? ` Ultima query: ${query}.` : ''}`;
  }

  buildSearchRunRestMessage(foundCount: number, targetQuantity: number, nextRetryAt: Date) {
    const minutes = Math.max(1, Math.ceil((nextRetryAt.getTime() - Date.now()) / 60_000));
    return `Radar descansando. Encontrei ${foundCount} de ${targetQuantity} card(s); vou retomar esta mesma pesquisa em ${minutes} min.`;
  }

  buildSearchRunFilterReviewMessage(foundCount: number, targetQuantity: number) {
    const target = Math.max(1, safeInteger(targetQuantity, 1));
    const delivered = Math.max(0, Math.min(target, safeInteger(foundCount)));
    const missing = Math.max(0, target - delivered);
    if (delivered > 0) {
      const missingText = missing === 1 ? 'faltou 1' : `faltaram ${missing}`;
      return missing > 0
        ? `Entreguei ${delivered} de ${target} card(s); ${missingText}. Revise alcance ou segmento para completar a meta.`
        : `Entreguei ${delivered} de ${target} card(s).`;
    }
    return 'Nao achei cards suficientes para esse filtro. Tente segmento mais amplo ou alcance maior.';
  }

  getSearchRunRestCount(metricsJson: unknown, parseMaybeJsonObject: (value: unknown) => Record<string, any>) {
    return safeInteger(parseMaybeJsonObject(metricsJson)?.radarRestCount);
  }
}
