import { Injectable } from '@nestjs/common';
import type { ActorKindUserLike } from '../access/actor-kind';
import { PrismaService } from '../prisma/prisma.service';
import { LogisticaOccurrenceService } from './logistica-occurrence.service';
import { LogisticaRecorrenciaService } from './logistica-recorrencia.service';

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
  ) {
    super(prisma);
  }

  override gerarDia(companyId: number, dateInput?: string) {
    return this.occurrences.materialize(companyId, {
      operationalDate: dateInput,
      sourceDates: dateInput ? [dateInput] : undefined,
    });
  }

  override getDiaPreview(companyId: number, dateInput?: string, _actor?: ActorKindUserLike) {
    return this.occurrences.preview(companyId, dateInput);
  }
}
