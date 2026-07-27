import type { PrismaService } from '../prisma/prisma.service';
import { stopLivreWhere } from './logistica-rota-viva.util';
import { saoPauloDateKey } from './logistica-occurrence.service';
import { saoPauloMidnight } from './logistica-agenda-cursor.util';
import { registrarEventoAgenda, formatDDMM } from './logistica-agenda-evento.util';

/**
 * "FECHAMENTO DE CAIXA" (F0, 27/07) — rota/entrega de dia passado que ninguém
 * encerrou se fecha SOZINHA, lazy, no começo de qualquer rotina que monta rota
 * (prepare/start em logistica-admin-route.service.ts, materializeForRoute em
 * logistica-agenda.service.ts). Antes deste fix, a régua de "rota morta"
 * (logistica-rota-viva.util.ts) só era aplicada REATIVAMENTE — quando alguém
 * tentava montar/descartar; uma rota de sexta que ninguém tocou de novo ficava
 * ACTIVE pra sempre, e a entrega presa nela só voltava quando alguém montasse
 * a PRÓXIMA rota daquele dia (podendo ser semanas depois). Aqui a régua é
 * aplicada PROATIVAMENTE, todo dia, pra QUALQUER dia que já passou.
 *
 * Dois passos, dentro de UMA transação:
 *  1) Marca `operationalEndedAt` em toda `LogisticaRoute` de dia passado ainda
 *     "aberta" operacionalmente. NUNCA toca `status` (ciclo comercial/billing é
 *     sagrado — mesmo comentário do `encerrarRota` em logistica-rota.service.ts).
 *  2) Devolve ("volta pro lugar") as entregas `agendada` daqueles dias passados
 *     que a montagem trouxe (agendaOcorrenciaKey OU rotaModeloId) e que NINGUÉM
 *     tocou ainda — MESMO critério de segurança do `descartarMontagem`: sem
 *     startedAt, sem comprovanteConfirmadoAt, sem comprovante, cobrança
 *     pendente/nula, e a parada congelada (se houver) é de rota MORTA
 *     (`stopLivreWhere`, a MESMA régua, direto no WHERE — nada de reimplementar
 *     o critério de "rota viva" pela terceira vez).
 *
 * NÃO mexe em `LogisticaPlanoEntrega.proximaData` — sob o novo contrato (F0,
 * ver generateDay) o cursor SÓ avança no desfecho (confirmar/cancelar). Uma
 * entrega presa aqui nunca foi desfecho: `proximaData` já está exatamente
 * onde deveria (na origem, ou antes dela) e a próxima janela do plano gera a
 * ocorrência nova sozinha — não existe "devolver" porque nada tinha avançado.
 *
 * Idempotente e barato: sem rota velha aberta nem entrega pendurada, o custo é
 * duas queries que não acham nada.
 */

const STATUS_ROTA_ABERTA = ['ACTIVE', 'INITIALIZING', 'PLANNED'] as const;

export interface EncerrarDiasAnterioresResumo {
  rotasEncerradas: number;
  entregasCanceladas: number;
}

export async function encerrarDiasAnteriores(
  prisma: PrismaService,
  companyId: number,
  hojeISO: string,
): Promise<EncerrarDiasAnterioresResumo> {
  if (!companyId || !/^\d{4}-\d{2}-\d{2}$/.test(String(hojeISO || ''))) {
    return { rotasEncerradas: 0, entregasCanceladas: 0 };
  }
  const inicioDeHoje = saoPauloMidnight(hojeISO);

  // Eventos do extrato SÓ depois do commit (contrato do evento.util): erro de
  // INSERT dentro da tx abortaria o fechamento inteiro no Postgres, e o
  // fechamento roda no caminho crítico de TODA montagem de rota.
  const fechamento = await prisma.$transaction(async (tx: any) => {
    const rotasEncerradas = await tx.logisticaRoute.updateMany({
      where: {
        companyId,
        routeDate: { lt: hojeISO },
        operationalEndedAt: null,
        status: { in: [...STATUS_ROTA_ABERTA] },
      },
      data: { operationalEndedAt: new Date() },
    });

    const presas = await tx.entrega.findMany({
      where: {
        companyId,
        status: 'agendada',
        scheduledAt: { lt: inicioDeHoje },
        startedAt: null,
        comprovanteConfirmadoAt: null,
        comprovantes: { none: {} },
        AND: [
          { OR: [{ agendaOcorrenciaKey: { not: null } }, { rotaModeloId: { not: null } }] },
          { OR: [{ cobrancaStatus: 'pendente' }, { cobrancaStatus: null }] },
          stopLivreWhere(hojeISO),
        ],
      },
      select: { id: true, customerProfileId: true, scheduledAt: true },
      take: 500,
    });

    let entregasCanceladas = 0;
    if (presas.length) {
      const ids = presas.map((row: { id: string }) => row.id);
      const canceladas = await tx.entrega.updateMany({
        // Re-checa status DENTRO da transação — mesma defesa do descartarMontagem:
        // nunca sobrescreve uma entrega que virou 'entregue' no meio.
        where: { companyId, id: { in: ids }, status: 'agendada' },
        data: {
          status: 'cancelada',
          agendaOcorrenciaKey: null,
          rotaOrdem: null,
          etaAt: null,
          startedAt: null,
        },
      });
      entregasCanceladas = canceladas.count;
    }

    return { rotasEncerradas: rotasEncerradas.count, entregasCanceladas, presas };
  });

  for (const row of fechamento.presas as Array<{ id: string; customerProfileId: string; scheduledAt: Date | null }>) {
    await registrarEventoAgenda(prisma, {
      companyId,
      customerProfileId: row.customerProfileId,
      entregaId: row.id,
      tipo: 'CANCELADA_FECHAMENTO',
      paraTexto: formatDDMM(saoPauloDateKey(row.scheduledAt)),
      origem: 'fechamento',
      actorUserId: null,
    });
  }

  return { rotasEncerradas: fechamento.rotasEncerradas, entregasCanceladas: fechamento.entregasCanceladas };
}
