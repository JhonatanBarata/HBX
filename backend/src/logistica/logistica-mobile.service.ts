import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LogisticaOccurrenceService } from './logistica-occurrence.service';
import { type LogisticaActor, LogisticaOperacaoService } from './logistica-operacao.service';
import { LogisticaService } from './logistica.service';
import { LogisticaAgendaService } from './logistica-agenda.service';

export type MaterializeMobileOccurrencesInput = {
  operationalDate?: string;
  sourceDates?: string[];
};

type MobilePaymentInstruction = {
  formaPagamento: string;
  metodoPadrao: string | null;
};

function positiveInt(value: unknown): number | null {
  const parsed = Math.trunc(Number(value || 0));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Contrato canônico consumido pelo APK.
 *
 * O endpoint histórico de rota omite todos os campos comerciais do motorista,
 * corretamente, mas forma/método de recebimento são instruções operacionais:
 * sem eles o motorista não consegue registrar Pix, dinheiro ou fiado. Este
 * adapter mantém preços, saldos e limites protegidos e acrescenta somente o
 * mínimo necessário para concluir a entrega corretamente.
 *
 * A materialização recebe separadamente data operacional e datas de origem.
 * Assim uma regra recorrente continua sendo agenda/histórico, enquanto a
 * ocorrência concreta entra na rota que o motorista está montando hoje.
 */
@Injectable()
export class LogisticaMobileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logistica: LogisticaService,
    private readonly occurrences: LogisticaOccurrenceService,
    private readonly operacao: LogisticaOperacaoService,
    private readonly agenda: LogisticaAgendaService = null as any,
  ) {}

  async getRoute(companyId: number, date: string | undefined, actor: LogisticaActor) {
    if (!companyId) throw new BadRequestException('Empresa não identificada.');
    const route: any = await this.logistica.listRota(companyId, date, actor);
    const items: any[] = Array.isArray(route?.items) ? route.items : [];
    const customerIds: string[] = Array.from(
      new Set<string>(
        items
          .map((item: any) => String(item?.cliente?.id || '').trim())
          .filter((id: string) => id.length > 0),
      ),
    );

    const [profiles, config] = await Promise.all([
      customerIds.length
        ? this.prisma.customerProfile.findMany({
            where: { companyId, id: { in: customerIds } },
            select: { id: true, formaPagamento: true, metodoPadrao: true },
          })
        : Promise.resolve([]),
      this.prisma.logisticaConfig.findUnique({
        where: { companyId },
        select: {
          moduloFinanceiroAtivo: true,
          pixChave: true,
          pixNome: true,
          pixCidade: true,
        },
      }),
    ]);

    const paymentByCustomer = new Map<string, MobilePaymentInstruction>(
      profiles.map((profile): [string, MobilePaymentInstruction] => [
        profile.id,
        {
          formaPagamento: profile.formaPagamento ?? 'aberto',
          metodoPadrao: profile.metodoPadrao ?? null,
        },
      ]),
    );
    const moduloFinanceiroAtivo = config?.moduloFinanceiroAtivo === true;
    const pix = moduloFinanceiroAtivo && config?.pixChave
      ? { chave: config.pixChave, nome: config.pixNome ?? null, cidade: config.pixCidade ?? null }
      : null;

    return {
      ...route,
      moduloFinanceiroAtivo,
      pix,
      items: items.map((item: any) => {
        const customerId = String(item?.cliente?.id || '').trim();
        const payment = paymentByCustomer.get(customerId);
        return {
          ...item,
          cliente: {
            ...(item?.cliente || {}),
            formaPagamento: payment?.formaPagamento ?? item?.cliente?.formaPagamento ?? 'aberto',
            metodoPadrao: payment?.metodoPadrao ?? item?.cliente?.metodoPadrao ?? null,
          },
        };
      }),
    };
  }

  async materialize(
    companyId: number,
    input: MaterializeMobileOccurrencesInput,
    actor: LogisticaActor,
  ) {
    if (!companyId) throw new BadRequestException('Empresa não identificada.');
    const actorWhere = await this.operacao.whereForActor(actor);
    const actorUserId = positiveInt(actor?.id);
    const driverUserId = positiveInt((actorWhere as any)?.entregadorId) ?? actorUserId;

    const materializeInput = {
      operationalDate: input?.operationalDate,
      sourceDates: Array.isArray(input?.sourceDates) ? input.sourceDates : undefined,
      driverUserId,
      actorUserId,
    };
    if (this.agenda && await this.agenda.isAgendaV2Active(companyId)) {
      return this.agenda.materializeForRoute(companyId, materializeInput);
    }
    return this.occurrences.materialize(companyId, materializeInput);
  }
}
