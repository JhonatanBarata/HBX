import type { PrismaService } from '../prisma/prisma.service';
import { stopLivreWhere } from './logistica-rota-viva.util';
import { saoPauloDateKey } from './logistica-dia.util';
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
 *
 * 09/08 — ALCANCE CORRIGIDO: o passo 2 cobre agora TODA entrega de dia passado
 * que ninguém tocou, tenha ela vindo da agenda ou não (avulsa do "+", painel
 * web, importação). Ver o comentário no `AND` da query: a cláusula que exigia
 * `agendaOcorrenciaKey`/`rotaModeloId` era um ponto cego, não uma proteção.
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
  //
  // 27/07, lição do incidente cobrancaStatus:null — `tx` SEM anotação `any`:
  // o tipo inferido do $transaction deixa o compilador validar cada WHERE
  // contra o schema (null em campo não-nullable vira erro de BUILD, não 400
  // em produção na cara do motorista).
  const fechamento = await prisma.$transaction(async (tx) => {
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
          /* 🔴 09/08 — O PONTO CEGO: aqui exigia-se `agendaOcorrenciaKey` OU
             `rotaModeloId`, ou seja, "só o que a MONTAGEM trouxe". Entrega
             nascida fora da agenda — a avulsa do "+", a que o painel web
             agenda, a importada — não tem nenhum dos dois e ficava 'agendada'
             PARA SEMPRE, invisível: a lista do dia filtra por hoje, então
             ninguém a via, e o fechamento não a alcançava.
             Medido em produção (09/08): das 109 entregas abertas de dias
             passados, **107 eram exatamente essas** (company 5 e a bancada 39,
             `origem` nulo, nenhuma tocada) — e nenhuma delas seria fechada por
             mais montagem que a empresa fizesse.
             A cláusula saiu porque ela não era o que protegia. Quem protege são
             as OUTRAS quatro linhas, e cada uma continua aqui: sem `startedAt`
             (ninguém saiu pra rua), sem comprovante, cobrança 'pendente' (nada
             de dinheiro no meio) e `stopLivreWhere` (nenhuma rota viva a
             reivindica). Dia passado + nada disso = ninguém vai entregar isso
             nunca. Fechar é o desfecho honesto; deixar 'agendada' é um cliente
             que o banco jura que ainda espera. */
          // 27/07 — `cobrancaStatus` é `String @default("pendente")`, NÃO é nullable:
          // o ramo `null` fazia o Prisma recusar a query inteira ("Argument
          // `cobrancaStatus` is missing") e derrubava o fechamento — que roda no começo
          // de TODO prepare/start. Efeito na cara do dono: montar rota parava de
          // funcionar (400 INVALID_INPUT). Linha legada não existe: o default cobre.
          { cobrancaStatus: 'pendente' },
          stopLivreWhere(hojeISO),
        ],
      },
      select: { id: true, customerProfileId: true, scheduledAt: true, agendaOcorrenciaKey: true },
      take: 500,
    });

    let entregasCanceladas = 0;
    if (presas.length) {
      const ids = presas.map((row: { id: string }) => row.id);
      // 🔴 CARIMBA ANTES DE SOLTAR (10/08, F2.1) — o mesmo contrato dos outros dois
      // canceladores em massa: a chave viva sai (é única e travaria o cliente), a
      // ORIGEM fica. Sem isso a vassoura do dia passado apagava a identidade da
      // visita, e é justamente ela que o histórico do não-completado precisa ler.
      for (const row of presas as Array<{ id: string; agendaOcorrenciaKey: string | null }>) {
        if (!row.agendaOcorrenciaKey) continue;
        await tx.entrega.updateMany({
          where: { companyId, id: row.id, status: 'agendada' },
          data: { agendaOcorrenciaKeyOrigem: row.agendaOcorrenciaKey },
        });
      }
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

  // Defaults defensivos: em teste, mocks pobres de $transaction podem devolver
  // undefined — infra de caminho crítico não pode explodir por isso.
  const { rotasEncerradas = 0, entregasCanceladas = 0, presas = [] } = fechamento ?? {};

  for (const row of presas as Array<{ id: string; customerProfileId: string; scheduledAt: Date | null }>) {
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

  return { rotasEncerradas, entregasCanceladas };
}
