import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ExternalWebhookLedgerService } from '../integrations/external-webhook-ledger.service';
import {
  LeadgenChange,
  META_PROVIDER,
  MetaLeadAdsService,
} from './meta-lead-ads.service';

// ===========================================================================
// ARQ11 S1 — WORKER da fila durável de Lead Ads (Meta).
// "Nenhum lead pago se perde": o webhook só ENFILEIRA; aqui a gente PROCESSA.
//
// Padrão de cron da casa (obligation-scheduler / webwhats-outbox-consumer):
// setInterval em onModuleInit + flag de gate + guarda `running` + best-effort.
// NÃO usa @nestjs/schedule (dependência ausente no projeto e proibido instalar);
// o repositório inteiro agenda trabalho assim.
//
// Dois ciclos:
//  1) PROCESSAMENTO (a cada ~30s): reclama um lote de eventos received/retry prontos,
//     processa cada um (fetch Graph → map → intake), aplica backoff/dead-letter na falha.
//  2) RECONCILIAÇÃO (1x/dia): por conexão ativa, varre forms/leads da janela de 72h e
//     enfileira todo lead que não tem linha 'processed' no ledger (rede de segurança para
//     o que nunca chegou por webhook — o Meta retém leads 90 dias).
//
// FLAG (default ON — este é o CAMINHO de entrega do lead, não um extra):
//   HBX_META_LEADADS_WORKER_ENABLED = '0'/'false' desliga (kill-switch de emergência).
// ===========================================================================

const PROCESS_TICK_MS = Number(process.env.HBX_META_LEADADS_TICK_MS || '') || 30_000; // 30s
const RECONCILE_TICK_MS = Number(process.env.HBX_META_LEADADS_RECONCILE_MS || '') || 24 * 60 * 60 * 1000; // 24h
const RECONCILE_WINDOW_MS = Number(process.env.HBX_META_LEADADS_RECONCILE_WINDOW_MS || '') || 72 * 60 * 60 * 1000; // 72h
const BATCH_SIZE = Math.max(1, Math.min(100, Number(process.env.HBX_META_LEADADS_BATCH || 20) || 20));
const RUNNER_FLAG = 'HBX_META_LEADADS_WORKER_ENABLED';

@Injectable()
export class MetaLeadAdsWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MetaLeadAdsWorker.name);
  private processTimer: NodeJS.Timeout | null = null;
  private reconcileTimer: NodeJS.Timeout | null = null;
  private processing = false;
  private reconciling = false;

  constructor(
    private readonly service: MetaLeadAdsService,
    private readonly ledger: ExternalWebhookLedgerService,
  ) {}

  private get enabled(): boolean {
    const v = String(process.env[RUNNER_FLAG] ?? '1').trim().toLowerCase();
    return v === '1' || v === 'true';
  }

  onModuleInit() {
    if (this.enabled) {
      this.logger.log(`[meta-leadads] worker LIGADO (${RUNNER_FLAG}) — process ${PROCESS_TICK_MS}ms / reconcile ${RECONCILE_TICK_MS}ms`);
    } else {
      this.logger.log(`[meta-leadads] worker DESLIGADO (${RUNNER_FLAG}=0) — fila não drena`);
    }
    this.processTimer = setInterval(() => {
      void this.processTick().catch((e) =>
        this.logger.warn(`[meta-leadads] process tick falhou: ${String((e as any)?.message || e)}`),
      );
    }, PROCESS_TICK_MS);
    this.processTimer.unref?.();

    this.reconcileTimer = setInterval(() => {
      void this.reconcileTick().catch((e) =>
        this.logger.warn(`[meta-leadads] reconcile tick falhou: ${String((e as any)?.message || e)}`),
      );
    }, RECONCILE_TICK_MS);
    this.reconcileTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.processTimer) clearInterval(this.processTimer);
    if (this.reconcileTimer) clearInterval(this.reconcileTimer);
    this.processTimer = null;
    this.reconcileTimer = null;
  }

  // -------------------------------------------------------------------------
  // 1) PROCESSAMENTO — reclama um lote e processa cada evento.
  // -------------------------------------------------------------------------
  /** Chamável direto (testes/manual). Retorna o placar do lote. */
  async processTick(now: Date = new Date()): Promise<{ claimed: number; created: number; retried: number; dead: number; duplicated: number; skipped: number }> {
    const tally = { claimed: 0, created: 0, retried: 0, dead: 0, duplicated: 0, skipped: 0 };
    if (!this.enabled) return tally;
    if (this.processing) return tally;
    this.processing = true;
    try {
      const batch = await this.ledger.claimBatchForProcessing(META_PROVIDER, BATCH_SIZE, now);
      tally.claimed = batch.length;
      if (batch.length === 0) return tally;

      for (const event of batch) {
        const change = this.changeFromEvent(event);
        if (!change) {
          // Payload inválido/ausente: não dá para reprocessar — manda para dead_letter direto.
          await this.ledger
            .markRetry(META_PROVIDER, (event as any).eventId, 'Payload do evento ausente/ilegível para reprocessamento.', now)
            .catch(() => null);
          tally.skipped += 1;
          continue;
        }

        let outcome: string;
        let exceptionMessage: string | null = null;
        try {
          outcome = await this.service.processLeadgenEvent(change);
        } catch (error) {
          outcome = 'transient_error';
          exceptionMessage = `Exceção no processamento: ${String((error as any)?.message || error)}`;
        }

        if (outcome === 'created') {
          // processLeadgenEvent já marca processed internamente; reforçamos aqui para que o
          // estado terminal da fila seja responsabilidade do worker (a linha saiu de
          // 'processing' no claim — sem isto ficaria presa se o service esquecesse). Idempotente.
          await this.ledger.markProcessed(META_PROVIDER, change.leadgenId).catch(() => null);
          tally.created += 1;
        } else if (outcome === 'duplicate') {
          // Já processado antes: fecha a linha como processada (idempotente).
          await this.ledger.markProcessed(META_PROVIDER, change.leadgenId).catch(() => null);
          tally.duplicated += 1;
        } else if (outcome === 'skipped') {
          // Falha PERMANENTE de dados (sem contato): manda para dead_letter direto (não
          // consome as 8 tentativas — não adianta re-tentar um lead sem telefone/email).
          await this.ledger
            .markDeadLetter(META_PROVIDER, change.leadgenId, 'Lead sem forma de contato — descartado (permanente).')
            .catch(() => null);
          tally.dead += 1;
          tally.skipped += 1;
        } else {
          // transient_error: agenda retry com backoff; ao cruzar o teto vira dead_letter.
          const reason = exceptionMessage || `Falha transitória ao processar o lead (página ${change.pageId || '?'}).`;
          const res = await this.ledger.markRetry(META_PROVIDER, change.leadgenId, reason, now).catch(() => null);
          if (res?.deadLettered) {
            await this.service.markConnectionError(change.pageId, 'Lead em dead-letter após esgotar as tentativas.').catch(() => null);
            tally.dead += 1;
          } else {
            tally.retried += 1;
          }
        }
      }

      if (tally.created || tally.dead || tally.retried) {
        this.logger.log(
          `[meta-leadads] lote — claimed=${tally.claimed} created=${tally.created} retried=${tally.retried} dead=${tally.dead} dup=${tally.duplicated} skipped=${tally.skipped}`,
        );
      }
      return tally;
    } finally {
      this.processing = false;
    }
  }

  // Reconstrói o LeadgenChange a partir do payload guardado no ledger (replay).
  private changeFromEvent(event: any): LeadgenChange | null {
    const payload = event?.payload;
    if (!payload || typeof payload !== 'object') return null;
    const leadgenId = String(payload.leadgenId || '').trim();
    if (!leadgenId) return null;
    return {
      pageId: String(payload.pageId || '').trim(),
      leadgenId,
      formId: payload.formId != null ? String(payload.formId) : null,
      createdTime: payload.createdTime != null ? String(payload.createdTime) : null,
    };
  }

  // -------------------------------------------------------------------------
  // 2) RECONCILIAÇÃO — pesca leads que nunca chegaram por webhook.
  // -------------------------------------------------------------------------
  /** Chamável direto (testes/manual). Retorna quantos eventos novos entraram na fila. */
  async reconcileTick(now: Date = new Date()): Promise<{ scannedConnections: number; scannedLeads: number; injected: number }> {
    const tally = { scannedConnections: 0, scannedLeads: 0, injected: 0 };
    if (!this.enabled) return tally;
    if (this.reconciling) return tally;
    this.reconciling = true;
    try {
      const sinceUnix = Math.floor((now.getTime() - RECONCILE_WINDOW_MS) / 1000);
      const connections = await this.service.listActiveConnectionsForReconciliation();
      for (const conn of connections) {
        tally.scannedConnections += 1;
        const forms = await this.service.listFormsForPage(conn.pageId, conn.accessToken);
        for (const form of forms) {
          const leads = await this.service.listLeadsForForm(form.id, conn.accessToken, sinceUnix);
          for (const lead of leads) {
            tally.scannedLeads += 1;
            if (await this.ledger.wasProcessed(META_PROVIDER, lead.id)) continue;

            const change: LeadgenChange = {
              pageId: conn.pageId,
              leadgenId: lead.id,
              formId: form.id,
              createdTime: lead.createdTime,
            };
            const claim = await this.ledger
              .recordReceived(META_PROVIDER, lead.id, change, {
                companyId: conn.companyId,
                eventType: 'reconciliation',
                signatureStatus: 'valid',
              })
              .catch(() => null);
            if (claim && !claim.duplicate) tally.injected += 1;
          }
        }
      }
      if (tally.injected) {
        this.logger.log(
          `[meta-leadads] reconciliação — conexões=${tally.scannedConnections} leads=${tally.scannedLeads} injetados=${tally.injected}`,
        );
      }
      return tally;
    } finally {
      this.reconciling = false;
    }
  }
}
