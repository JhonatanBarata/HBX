import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { getCreditActionDefinition } from './credit-action-catalog';
import { CreditWalletService } from './credit-wallet.service';
import { CreditsService } from './credits.service';
import { isCreditsFeatureEnabled } from './credits.flags';

// CRÉDITO UNIVERSAL (PR10072026) — MEDIDOR genérico de uso por ação. Camada FINA sobre o que
// já existe: `track` reusa o MESMO escritor de shadow do S2 (`CreditsService.recordShadowDebit`,
// atrás de HBX_CREDITS_SHADOW — uma chavinha só desliga TODA a medição), `debit` reusa o
// `CreditWalletService.debit` (fail-closed, idempotente por usageKey). Nenhuma tabela nova,
// nenhuma env nova: o schema do ledger sempre foi agnóstico de ação (`actionKey` livre).
//
// Contrato: `meter()` é BEST-EFFORT ABSOLUTO — nunca lança, nunca bloqueia o fluxo que mediu.
// Ação que precisa BLOQUEAR sem saldo (fail-closed antes do efeito) NÃO usa o meter — usa o
// caminho assert (lead). Ver credit-action-catalog.ts.
@Injectable()
export class CreditMeterService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CreditMeterService.name);

  constructor(
    private readonly credits: CreditsService,
    private readonly wallet: CreditWalletService,
  ) {}

  // O AiGatewayService é estático sem DI (callers batch instanciam serviços com `new`) —
  // o plug da medição de IA é este listener registrado 1x no boot do módulo de créditos.
  // Sem o módulo carregado (ou destruído em teste), o gateway segue byte-idêntico.
  onModuleInit() {
    AiGatewayService.setUsageListener((usage) => {
      void this.meter({
        companyId: usage.companyId,
        actionKey: usage.actionKey,
        refId: usage.refId,
        units: usage.units,
      });
    });
  }

  onModuleDestroy() {
    AiGatewayService.setUsageListener(null);
  }

  /**
   * Mede 1 uso de uma ação do catálogo para uma empresa. `refId` é a referência idempotente
   * da ação (id da outboundMessage, id da entrega, ref única da chamada de IA) — vira a
   * usageKey no ledger, então retry/replay nunca conta 2x.
   */
  async meter(input: {
    companyId: number;
    actionKey: string;
    refId: string | number;
    userId?: number | null;
    units?: number;
  }): Promise<void> {
    try {
      if (!isCreditsFeatureEnabled()) return;

      const def = getCreditActionDefinition(input?.actionKey);
      if (!def || def.mode === 'free') return;

      const companyId = Math.trunc(Number(input?.companyId || 0));
      if (!Number.isFinite(companyId) || companyId <= 0) return;

      const refId = String(input?.refId ?? '').trim();
      if (!refId) return;

      const units = Math.max(1, Math.trunc(Number(input?.units ?? 1)) || 1);
      const amount = units * Math.max(1, def.cost);

      if (def.mode === 'track') {
        // Mesmo escritor do shadow S2 (respeita HBX_CREDITS_SHADOW; saldo intocado por
        // construção — `debit_shadow` nunca entra no FIFO de saldo).
        await this.credits.recordShadowDebit(companyId, input?.userId ?? null, {
          leadId: refId,
          actionKey: def.key,
          units: amount,
        });
        return;
      }

      // `debit` PÓS-FATO (o efeito já aconteceu — não há como desfazer uma mensagem enviada):
      // debita o que couber, nunca lança. Saldo insuficiente vira warn visível, não bloqueio.
      //
      // TRAVAS (revisão adversarial 10/07):
      // 1. `lead_delivery` é RECUSADO aqui SEMPRE — o único cobrador do lead é o caminho assert
      //    (`assertAndDebitLeadDelivery`, usageKey `enforce:...`, fail-closed ANTES da entrega,
      //    god-mode e teto S4). Aceitar lead aqui criaria um SEGUNDO débito real do mesmo lead
      //    em outro namespace de usageKey.
      // 2. Ação debit futura respeita o MESMO gate por empresa do R1 (`isEnforceActiveForCompany`:
      //    conta credit com módulo ON, enterprise só no cutover 2 chaves) — o kill-switch e o
      //    cutover desarmam o meter igual desarmam o lead.
      if (def.key === 'lead_delivery') {
        this.logger.warn(
          `meter_debit_refused_lead company=${companyId} ref=${refId} — lead debita SÓ pelo caminho assert`,
        );
        return;
      }
      const enforceActive = await this.credits.isEnforceActiveForCompany(companyId);
      if (!enforceActive) return;
      const result = await this.wallet.debit(companyId, amount, {
        actionKey: def.key,
        usageKey: `meter:${def.key}:${refId}`,
        userId: input?.userId ?? null,
      });
      if (result.partial) {
        this.logger.warn(
          `meter_debit_partial company=${companyId} action=${def.key} ref=${refId} debited=${result.debited}/${amount}`,
        );
      }
    } catch (error: any) {
      // Medição nunca pode quebrar/atrasar o fluxo medido.
      this.logger.warn(
        `meter_failed company=${input?.companyId} action=${input?.actionKey} error=${String(error?.message || error)}`,
      );
    }
  }
}
