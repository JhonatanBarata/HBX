import { Injectable } from '@nestjs/common';
import type { ActorKindUserLike } from '../access/actor-kind';
import { PrismaService } from '../prisma/prisma.service';
import { LogisticaOccurrenceService } from './logistica-occurrence.service';
import {
  isoDow,
  LogisticaRecorrenciaService,
  parseDateOrNull,
} from './logistica-recorrencia.service';
import { LogisticaAgendaService } from './logistica-agenda.service';

/**
 * Mantém todo o CRUD legado de ClienteProduto, mas troca os dois pontos de
 * materialização (preview + gerar-dia) pelo motor de ocorrências. Assim o cron,
 * o painel antigo e o novo HBX Mobile compartilham a mesma idempotência:
 * recorrência/data de origem nunca vira uma segunda Entrega silenciosa.
 */
@Injectable()
export class LogisticaRecorrenciaOccurrenceService extends LogisticaRecorrenciaService {
  constructor(
    prisma: PrismaService,
    private readonly occurrences: LogisticaOccurrenceService,
    private readonly agenda: LogisticaAgendaService,
  ) {
    super(prisma);
  }

  override async gerarDia(companyId: number, dateInput?: string): Promise<any> {
    if (await this.agenda.isAgendaV2Active(companyId)) {
      return this.agenda.generateDay(companyId, dateInput);
    }
    return this.occurrences.materialize(companyId, {
      operationalDate: dateInput,
      sourceDates: dateInput ? [dateInput] : undefined,
    });
  }

  override async getDiaPreview(
    companyId: number,
    dateInput?: string,
    _actor?: ActorKindUserLike,
  ): Promise<any> {
    if (await this.agenda.isAgendaV2Active(companyId)) {
      const date = parseDateOrNull(dateInput) ?? new Date();
      const preview = await this.agenda.getDayPreview(companyId, isoDow(date), dateInput);
      return {
        date: preview.date,
        clientes: preview.paradas.map((stop: any) => ({
          customerProfileId: stop.customerProfileId,
          nome: stop.cliente?.nome || 'Cliente',
          localId: stop.localId ?? null,
          localApelido: stop.local?.apelido ?? null,
          lat: stop.local?.lat ?? null,
          lng: stop.local?.lng ?? null,
          geoFonte: stop.local?.geoFonte ?? null,
          itens: (stop.itens ?? []).map((item: any) => ({
            productId: item.productId,
            nome: item.nome || 'Produto',
            qtd: item.qtd,
            valorUnit: Number(item.valorUnit || 0),
          })),
          observacoes: stop.instrucoes ?? null,
          agendaPlanoId: stop.planoEntregaId,
        })),
      };
    }
    return this.occurrences.preview(companyId, dateInput);
  }
}
