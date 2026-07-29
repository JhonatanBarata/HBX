import { BadRequestException, ForbiddenException, HttpException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreditWalletService } from '../credits/credit-wallet.service';
import { CreditActionConfigService } from '../credits/credit-action-config.service';
import { CREDIT_ACTION_KEYS } from '../credits/credit-action-catalog';
import { isAdminTierActor } from '../access/actor-kind';

/**
 * MODO PASSEIO (29/07) — comercial do passeio do APK.
 *
 * Desenho de propósito MENOR que o da rota (sem claim/lease/reconciliador):
 * 1 passeio = 1 débito idempotente na carteira, chaveado pelo tourId que o
 * APK gera (H.uuid) e persiste no aparelho. Retry de rede com o MESMO tourId
 * nunca cobra duas vezes — `wallet.debit` já é idempotente por usageKey.
 *
 * Gate de acesso (ordem do dono 29/07): admin (ADMIN/USERMASTER/master) usa
 * sempre; papel comum (funcionário) SÓ com `passeioEquipe` ligado na config —
 * porque iniciar passeio come crédito da empresa. Fail-closed no servidor:
 * esconder a entrada no APK é cortesia, a trava é aqui.
 *
 * Débito feito não estorna ao encerrar cedo (mesma regra da rota). O preço
 * vem do catálogo (`passeio_tour`) via resolveEffective — o dono edita no
 * /master e o próximo passeio obedece; mode 'free' pula a cobrança inteira.
 */

// Mesmo formato do H.uuid() do APK (uuid v4 ou fallback hbx-<ts>-<hex>).
const TOUR_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9-]{7,79}$/;

function passeioIndisponivel(): HttpException {
  // Mensagem neutra de propósito (LEI DO VENDEDOR): papel operacional também
  // lê — o fato aparece, o dinheiro da empresa não.
  return new HttpException(
    {
      statusCode: 402,
      code: 'PASSEIO_INDISPONIVEL',
      reason: 'creditos',
      message: 'O passeio não pôde ser liberado. Fale com o responsável pela conta.',
    },
    402,
  );
}

@Injectable()
export class LogisticaPasseioService {
  private readonly logger = new Logger(LogisticaPasseioService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: CreditWalletService,
    private readonly actionConfig: CreditActionConfigService,
  ) {}

  async iniciar(
    companyId: number,
    user: { id?: unknown; role?: unknown; isSystemMaster?: unknown },
    tourIdRaw: unknown,
  ): Promise<{ ok: true; debitado: number }> {
    const tourId = String(tourIdRaw || '').trim();
    if (!TOUR_ID_RE.test(tourId)) throw new BadRequestException('Identificador do passeio inválido.');

    if (!isAdminTierActor(user as any)) {
      const cfg = await this.prisma.logisticaConfig.findFirst({
        where: { companyId },
        select: { passeioEquipe: true },
      });
      if (!cfg?.passeioEquipe) {
        throw new ForbiddenException('O Modo passeio não está liberado para a equipe. Fale com o administrador.');
      }
    }

    const definition = await this.actionConfig.resolveEffective(CREDIT_ACTION_KEYS.PASSEIO_TOUR);
    if (!definition) throw new Error('Contrato de crédito do Modo Passeio inválido.');
    if (definition.mode !== 'debit' || !(definition.cost > 0)) return { ok: true, debitado: 0 };

    const usageKey = `passeio:company:${companyId}:tour:${tourId}`;
    const actorUserId = Number(user?.id) || null;
    const result = await this.wallet.debit(companyId, definition.cost, {
      actionKey: CREDIT_ACTION_KEYS.PASSEIO_TOUR,
      usageKey,
      userId: actorUserId,
      metadata: { tourId },
    });

    if (result.debited !== definition.cost || result.partial) {
      // Track-first: saiu dinheiro parcial e a ação não vai acontecer → devolve
      // antes de recusar (mesmo desenho do bloco Essencial).
      if (result.debited > 0) {
        try {
          await this.wallet.refund(companyId, {
            usageKey,
            userId: actorUserId,
            metadata: { reason: 'passeio_insufficient_balance', tourId },
          });
        } catch (error) {
          this.logger.error(
            `[logistica] estorno do passeio falhou company=${companyId} usageKey=${usageKey}: ${String(
              (error as Error)?.message || error,
            )}`,
          );
        }
      }
      throw passeioIndisponivel();
    }

    return { ok: true, debitado: definition.cost };
  }
}
