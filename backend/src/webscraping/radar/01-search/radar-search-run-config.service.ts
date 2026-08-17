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
    // 27/06: subido 35s→90s. Sob 20 motores concorrentes a fonte estrangula e a busca passa de 35s →
    // morria por timeout ANTES de salvar (medido: SP×padarias = 10 leads NOVOS por busca, perdidos no
    // timeout). 90s deixa a maioria completar sem capar motor (respeita "teto 20"). Ajustável por env.
    return Math.max(5_000, parsePositiveIntegerEnv('HBX_SEARCH_BATCH_TIMEOUT_MS', 90_000));
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

  /**
   * LOTE 2 item 5 (17/08 — PR17082026-FAXINA-DA-BUSCA-RFB-PRIMEIRO): a frase dizia só o número
   * entregue, então o dono não conseguia separar "cidade pobre na Receita" de "a busca falhou" —
   * e era exatamente essa a leitura de "pesquisa suja". Agora cita o disponível real da base e o
   * que cada lane somou.
   *
   * `lanes` é o 3º parâmetro OPCIONAL de propósito: quem chama com 2 argumentos
   * (06-presentation/radar-run-presenter.service.ts:363 e o host de radar-webscraping-core:630,
   * que não têm as lanes na mão) continua recebendo EXATAMENTE a frase de antes, byte por byte.
   */
  buildSearchRunInsufficientMessage(
    foundCount: number,
    attempts: number,
    lanes?: {
      rfbDisponivel?: number | null;
      rfbEntregues?: number | null;
      webEntregues?: number | null;
    } | null,
  ) {
    const base = `Busca parcial: ${foundCount} contatos encontrados. O motor tentou ${attempts} lotes, mas nao atingiu a meta.`;
    if (!lanes) return base;
    // Cada número é opcional por conta própria: o count da base tem orçamento de 8s e degrada
    // pra `null`, e a contagem por lane depende do delegate de itens existir. Número ausente
    // some da frase — nunca vira "null" nem 0 inventado na tela do dono.
    const disponivel = lanes.rfbDisponivel == null ? null : Math.max(0, safeInteger(lanes.rfbDisponivel));
    const daReceita = lanes.rfbEntregues == null ? null : Math.max(0, safeInteger(lanes.rfbEntregues));
    const daWeb = lanes.webEntregues == null ? null : Math.max(0, safeInteger(lanes.webEntregues));
    const partes: string[] = [];
    if (disponivel != null) partes.push(`A Receita tem ${disponivel} nessa cidade`);
    if (daReceita != null) partes.push(disponivel != null ? `entreguei ${daReceita}` : `A Receita entregou ${daReceita}`);
    if (daWeb != null) partes.push(`a web completou +${daWeb}`);
    if (!partes.length) return base;
    return `${base} ${partes.join('; ')}.`;
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

  // Texto da sugestão de expansão quando a oferta esgota (não é cota). Fala humana, sem jargão.
  buildExpansionSuggestionHeadline(city: string, segment: string, deliveredCount: number) {
    const place = String(city || '').trim() || 'a cidade';
    const what = String(segment || '').trim() || 'contatos';
    return `${place} tem cerca de ${Math.max(0, safeInteger(deliveredCount))} ${what} com contato. Quer continuar?`;
  }

  buildExpansionWidenReachLabel(nextRadiusKm: number | null) {
    if (!nextRadiusKm || nextRadiusKm <= 0) return null;
    return `Ampliar alcance (+${Math.trunc(nextRadiusKm)} km, cidades vizinhas)`;
  }

  buildExpansionWidenSegmentLabel(neighborSegments: string[]) {
    if (!Array.isArray(neighborSegments) || !neighborSegments.length) return null;
    return 'Incluir segmentos parecidos';
  }
}
