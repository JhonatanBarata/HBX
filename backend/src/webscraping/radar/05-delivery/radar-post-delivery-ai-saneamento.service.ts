import { Injectable, Logger, Optional } from '@nestjs/common';
import { AiSaneamentoService } from '../03-enrichment/ai-saneamento.service';

/**
 * Etapa 7 da árvore mestra (02/07, docs/PLANEJAMENTOS/ARVORE-MESTRA/ARVORE-MESTRA.md):
 * "IA 7b saneia+ICP" soldada como disparo PÓS-ENTREGA e SÓ-ADITIVO — o card já foi entregue
 * ao vendedor (via `importRadarLeadToVendasForUser`) quando este serviço roda; ele nunca some
 * nem piora o card entregue, só GANHA um campo opcional (`metadataJson.aiSaneamento`).
 *
 * Semântica travada no briefing (resolve a contradição 7↔8 do desenho): nota baixa NÃO afeta
 * cards já entregues — ela só tem poder de bloquear a PROMOÇÃO ao estoque da fábrica (ver
 * `radar-core-delivery.mixin.ts` → `persistRadarLeadPoolBatch`, quarentena pré-estoque).
 *
 * Reusa `AiSaneamentoService.saneiaComNota()` (Ollama local, degrade gracioso já implementado
 * no serviço — NUNCA joga exceção pra cima). Gate: `HBX_RADAR_AI_SANEAMENTO_ENABLED` default
 * OFF (VPS não tem Ollama garantido; o dono liga local pros testes ao vivo). Timeout curto e
 * falha silenciosa: erro aqui NUNCA vira erro no card (regra absoluta de cards do Radar).
 *
 * Padrão de fila em memória + fire-and-forget copiado de `RadarWebEnrichmentJobService`
 * (mesma pasta de enrichment) — `enqueue` agenda via `setTimeout(...,0)`, `drain` processa
 * sequencialmente sem bloquear a resposta HTTP da entrega.
 */

export type RadarPostDeliveryAiSaneamentoInput = {
  radarLeadId: string;
  name: string;
  city?: string | null;
  state?: string | null;
  segment?: string | null;
};

export type RadarPostDeliveryAiSaneamentoHost = {
  loadRadarLeadPoolRow: (radarLeadId: string) => Promise<{ id: string; metadataJson?: unknown } | null>;
  updateRadarLeadPoolMetadata: (radarLeadId: string, metadataJson: string) => Promise<void>;
  logger?: { warn?: (message: string) => void };
};

export type RadarAiSaneamentoOutcome = {
  status: 'completed' | 'skipped' | 'partial_error';
  reason?: string;
  nota?: number | null;
};

function envEnabled(name: string): boolean {
  return ['true', '1', 'yes', 'on'].includes(String(process.env[name] || '').trim().toLowerCase());
}

function parseMaybeJsonObject(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function compact(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

@Injectable()
export class RadarPostDeliveryAiSaneamentoService {
  private readonly logger = new Logger(RadarPostDeliveryAiSaneamentoService.name);
  private readonly queue: Array<{ input: RadarPostDeliveryAiSaneamentoInput; host: RadarPostDeliveryAiSaneamentoHost }> = [];
  private readonly queuedIds = new Set<string>();
  private active = false;

  constructor(
    @Optional() private readonly aiSaneamento?: AiSaneamentoService,
  ) {}

  private getAiSaneamento() {
    return this.aiSaneamento || new AiSaneamentoService();
  }

  isEnabled(): boolean {
    return envEnabled('HBX_RADAR_AI_SANEAMENTO_ENABLED');
  }

  /**
   * Agenda o saneamento pós-entrega SEM bloquear o caller (a entrega já respondeu ao vendedor).
   * No-op silencioso se a flag estiver OFF ou o lead já estiver na fila. Nunca lança.
   */
  enqueue(input: RadarPostDeliveryAiSaneamentoInput, host: RadarPostDeliveryAiSaneamentoHost) {
    if (!this.isEnabled()) return;
    const radarLeadId = compact(input?.radarLeadId);
    const name = compact(input?.name);
    if (!radarLeadId || !name || this.queuedIds.has(radarLeadId)) return;
    this.queuedIds.add(radarLeadId);
    this.queue.push({ input: { ...input, radarLeadId, name }, host });
    setTimeout(() => {
      void this.drain();
    }, 0);
  }

  async drain() {
    if (this.active) return;
    this.active = true;
    try {
      while (this.queue.length) {
        const job = this.queue.shift();
        if (!job) continue;
        this.queuedIds.delete(job.input.radarLeadId);
        await this.runOne(job.input, job.host).catch((error: any) => {
          const message = String(error?.message || error);
          job.host.logger?.warn?.(`[radar-ai-saneamento] ignorado lead=${job.input.radarLeadId}: ${message}`);
          this.logger.warn(`[radar-ai-saneamento] ignorado lead=${job.input.radarLeadId}: ${message}`);
        });
      }
    } finally {
      this.active = false;
      if (this.queue.length) {
        setTimeout(() => {
          void this.drain();
        }, 0);
      }
    }
  }

  /**
   * Executa o saneamento para 1 lead e persiste o resultado — chamável direto (sem fila) por
   * quem já está fora do caminho síncrono de entrega (ex.: reprocessamento em lote).
   */
  async runOne(
    input: RadarPostDeliveryAiSaneamentoInput,
    host: RadarPostDeliveryAiSaneamentoHost,
  ): Promise<RadarAiSaneamentoOutcome> {
    if (!this.isEnabled()) return { status: 'skipped', reason: 'disabled' };
    const radarLeadId = compact(input?.radarLeadId);
    const name = compact(input?.name);
    if (!radarLeadId || !name) return { status: 'skipped', reason: 'dados_insuficientes' };

    const row = await host.loadRadarLeadPoolRow(radarLeadId).catch(() => null);
    if (!row) return { status: 'skipped', reason: 'card_nao_encontrado' };

    const meta = parseMaybeJsonObject(row.metadataJson);
    // Idempotente: card já saneado não repete a chamada (mesmo padrão do worker manual/batch
    // `aiSaneamentoForMaster` — `aiSaneadoAt` marca "já processado", sem cursor dedicado).
    if (meta?.aiSaneamento?.saneadoAt) return { status: 'skipped', reason: 'ja_saneado' };

    const result = await this.getAiSaneamento().saneiaComNota({
      name,
      city: input.city || null,
      state: input.state || null,
      segmentHint: input.segment || null,
    });

    if (!result.ok) return { status: 'partial_error', reason: 'ia_indisponivel_ou_degradada' };

    // ADITIVO estrito: só grava em metadataJson.aiSaneamento, NUNCA sobrescreve `name`/`segment`
    // do RadarLeadPool nem qualquer campo já lido pelo card do vendedor (regra absoluta de
    // cards: campo novo é sempre opcional; card entregue nunca some/piora).
    const nextMeta = {
      ...meta,
      aiSaneamento: {
        nomeLimpo: result.nomeLimpo,
        segmento: result.segmento,
        nota: result.nota,
        razao: result.razao,
        saneadoAt: Date.now(),
      },
    };
    await host.updateRadarLeadPoolMetadata(radarLeadId, JSON.stringify(nextMeta));
    return { status: 'completed', nota: result.nota };
  }
}
