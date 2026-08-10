import type { PrismaService } from '../prisma/prisma.service';

/**
 * ⛔ A LEI DO DESAPARECER (10/08/2026, lei ABSOLUTA do dono)
 *
 * > *"Rota criada q não foi processada, e já passou do dia de voltar o crédito, ela
 * > DESAPARECE. Não era pra ter faxina."*
 *
 * **"Faxina" é sintoma de arquitetura errada.** Se alguém precisa varrer dado morto,
 * o sistema guardou o que nunca devia ter ficado. Aqui o não-processado EXPIRA — não
 * existe operação de limpeza, existe uma passada diária que é a própria lei rodando.
 *
 * O que a lei mata (medido em produção, company 41, 10/08 03h): 353 entregas para UM
 * dia de trabalho — 320 canceladas em 37 materializações —, mais de 1.000 canceladas
 * órfãs no acumulado, 7 rotas ACTIVE de dias passados e 3 sessões de rastreamento
 * penduradas. Tudo isso é o par gerar⇄limpar rodando em laço, cada volta deixando uma
 * camada.
 *
 * ## A janela: 24 h (§F0 do plano)
 * O dono disse "já passou o dia de voltar o crédito", e o crédito volta em MINUTOS —
 * medido: `PREPARED_ROUTE_STALE_MS` = 5 min no ESSENTIAL (com o reconciliador rodando
 * a cada 5 min) e `REFUND_LEASE_MS` = 90 s no TRACKED. As 24 h são folga por cima
 * disso E são a janela que ele VÊ na tela: no histórico, a rota cancelada sem registro
 * nenhum aparece em vermelho por 24 h e some junto com o crédito (§F5).
 *
 * ## O que NUNCA some
 * Tudo que foi PROCESSADO: entregue, cobrado, com comprovante, com claim de crédito,
 * com ponto de rastreamento, com parada congelada em rota. Isso é história e fica pra
 * sempre. A lei fala do que **nunca aconteceu** — e a trava dura é o dinheiro: linha
 * com claim em estado não-terminal (DEBITED/PROCESSING/REFUNDING) espera o
 * reconciliador, nunca some com o crédito no ar.
 *
 * ## Por que DELETE e não soft-delete
 * Porque a ordem foi "DESAPARECE". Soft-delete é exatamente o lixo que se acumula com
 * outro nome — e todo relatório voltaria a varrer 3,5× mais linhas do que existe de
 * trabalho, que é o custo que esta lei existe pra matar. O extrato da agenda
 * (`LogisticaAgendaEvento`) NÃO é apagado: evento é história de DECISÃO ("fulano
 * cancelou o dia às 00:44"), não linha morta de operação.
 */
export const JANELA_EXPURGO_MS = 24 * 60 * 60 * 1000;

/** Claims nestes estados = dinheiro AINDA NO AR. Enquanto houver um, a linha fica. */
const CLAIM_NAO_TERMINAL = ['DEBITED', 'PROCESSING', 'REFUNDING'] as const;

export interface ExpurgoResumo {
  entregasApagadas: number;
  rotasApagadas: number;
  sessoesEncerradas: number;
}

/** Tamanho do LOTE: nunca um DELETE gigante de uma vez — passada que trava o banco
 *  vira passada que alguém desliga. */
const EXPURGO_LOTE = 500;
/**
 * Quantos lotes por empresa numa passada. 🔴 Medido em produção na 1ª passada real
 * (10/08): a company 41 tinha 900 elegíveis e a 48 tinha 1.871 — com um lote só, o
 * passivo levaria DIAS pra sumir, e "some daqui a 4 dias" não é a lei que o dono
 * escreveu, é faxina parcelada. 20 lotes = até 10.000 linhas por empresa por dia,
 * em pedaços de 500: esvazia o passivo já na primeira noite e continua sem travar
 * o banco. O teto existe pra um tenant absurdo não segurar a fila dos outros.
 */
const EXPURGO_LOTES_POR_PASSADA = 20;

/**
 * Roda a lei numa empresa. Idempotente e barata: sem nada a expirar, são três
 * consultas que não acham nada.
 *
 * A ordem importa: as PARADAS congeladas (`LogisticaRouteStop`) são `onDelete:
 * Restrict` na entrega, então a rota morta sai primeiro e leva os stops dela; só
 * então as entregas ficam livres pra sumir.
 */
export async function expurgarNaoProcessado(
  prisma: PrismaService,
  companyId: number,
  agora: Date = new Date(),
): Promise<ExpurgoResumo> {
  const resumo: ExpurgoResumo = { entregasApagadas: 0, rotasApagadas: 0, sessoesEncerradas: 0 };
  if (!companyId) return resumo;
  // Lotes até esgotar (ver EXPURGO_LOTES_POR_PASSADA): o passivo tem que sumir na
  // primeira noite, não em parcelas diárias.
  for (let volta = 0; volta < EXPURGO_LOTES_POR_PASSADA; volta += 1) {
    const passo = await umLote(prisma, companyId, agora, volta === 0);
    resumo.entregasApagadas += passo.entregasApagadas;
    resumo.rotasApagadas += passo.rotasApagadas;
    resumo.sessoesEncerradas += passo.sessoesEncerradas;
    // nada mais a expirar nesta empresa: sai sem pagar outra consulta à toa.
    if (!passo.entregasApagadas && !passo.rotasApagadas) break;
  }
  return resumo;
}

/** Um lote: até `EXPURGO_LOTE` entregas e rotas. `encerrarSessoes` só na 1ª volta —
 *  é um `updateMany` idempotente que não precisa repetir a cada lote. */
async function umLote(
  prisma: PrismaService,
  companyId: number,
  agora: Date,
  encerrarSessoes: boolean,
): Promise<ExpurgoResumo> {
  const resumo: ExpurgoResumo = { entregasApagadas: 0, rotasApagadas: 0, sessoesEncerradas: 0 };
  const corte = new Date(agora.getTime() - JANELA_EXPURGO_MS);
  const p = prisma as any;

  /* 1. ROTA QUE NUNCA RODOU. Nenhuma parada dela virou entrega ('entregue'), nenhum
     claim de crédito existe (claim = dinheiro tocou nela; ali a rota é história e
     fica). `createdAt` e não `routeDate`: a régua é "quando ela foi criada", que é o
     que o relógio do estorno mede. */
  const rotasMortas = await p.logisticaRoute.findMany({
    where: {
      companyId,
      createdAt: { lt: corte },
      stops: { none: { delivery: { status: 'entregue' } } },
      // as DUAS famílias de claim (o modo essencial e o rastreado): claim é o
      // registro do débito, e apagar rota com claim apagaria a ponta do dinheiro.
      essentialClaims: { none: {} },
      trackedCreditClaims: { none: {} },
    },
    select: { id: true },
    take: EXPURGO_LOTE,
  });
  if (rotasMortas.length) {
    const ids = rotasMortas.map((r: { id: string }) => r.id);
    // stops primeiro: eles seguram a entrega por Restrict.
    await p.logisticaRouteStop.deleteMany({ where: { companyId, routeId: { in: ids } } });
    const apagadas = await p.logisticaRoute.deleteMany({ where: { companyId, id: { in: ids } } });
    resumo.rotasApagadas = apagadas.count;
  }

  /* 2. ENTREGA QUE NUNCA ACONTECEU. Cancelada, velha o bastante, e sem UM ÚNICO
     sinal de vida. Cada linha do `where` é uma pergunta do tipo "isso aqui chegou a
     existir pra alguém?" — basta uma responder sim pra ela ficar. */
  const mortas = await p.entrega.findMany({
    where: {
      companyId,
      status: 'cancelada',
      updatedAt: { lt: corte },
      // nunca saiu, nunca chegou, nunca foi confirmada
      startedAt: null,
      arrivedAt: null,
      deliveredAt: null,
      comprovanteConfirmadoAt: null,
      receiptMethod: null,
      cobrancaStatus: 'pendente',
      // e ninguém pendurou nada nela
      comprovantes: { none: {} },
      logisticaRouteStop: { is: null },
      logisticaTrackingPoints: { none: {} },
      logisticaTrackingEvents: { none: {} },
      logisticaTrackedCreditClaims: { none: {} },
    },
    select: { id: true },
    take: EXPURGO_LOTE,
  });
  if (mortas.length) {
    const ids = mortas.map((e: { id: string }) => e.id);
    /* 🔴 A COBRANÇA NÃO TEM FK (é chave de idempotência, `FinanceiroCharge.entregaId`
       sem relação dura): o Prisma não a enxerga no `where` acima, e uma entrega com
       cobrança lançada É processada. Sem esta consulta o expurgo apagaria a ponta
       de um dinheiro que continua no banco. */
    const comCobranca = await p.financeiroCharge.findMany({
      where: { companyId, entregaId: { in: ids } },
      select: { entregaId: true },
    });
    const proibidos = new Set(comCobranca.map((c: { entregaId: string | null }) => String(c.entregaId || '')));
    const livres = ids.filter((id: string) => !proibidos.has(id));
    if (livres.length) {
      // itens e comprovantes são Cascade; histórico do cliente é SetNull.
      const apagadas = await p.entrega.deleteMany({ where: { companyId, id: { in: livres } } });
      resumo.entregasApagadas = apagadas.count;
    }
  }

  /* 3. SESSÃO DE RASTREAMENTO PENDURADA. Aqui é CARIMBO, não delete: a sessão tem
     trilha (pontos, eventos) e a trilha é história de onde o motorista andou. O que
     estava errado era ela ficar ACTIVE pra sempre — 3 delas na company 41, uma de
     07/08 ainda "ativa" três dias depois. */
  if (encerrarSessoes) {
    const encerradas = await p.logisticaTrackingSession.updateMany({
      where: { companyId, status: 'ACTIVE', startedAt: { lt: corte } },
      data: { status: 'ENDED', endedAt: agora },
    });
    resumo.sessoesEncerradas = encerradas.count;
  }

  return resumo;
}

/**
 * A ocorrência foi CANCELADA por gente há pouco? (F2.4 — "cancelar vale")
 *
 * Sem isto, o dia cancelado renascia sozinho no primeiro `generateDay` — e como o
 * gerador roda no boot do backend, **todo publish ressuscitava o dia que o dono
 * acabou de cancelar**. Foi o que aconteceu na madrugada de 10/08: ele cancelou às
 * 00:44, o deploy das 03:08 recriou as 51, e a conclusão natural pra quem está na
 * tela é "o app não obedece".
 *
 * A régua é a MESMA janela do expurgo, de propósito: enquanto a cancelada existe (24
 * h, em vermelho no histórico), a decisão humana vale; passada a janela ela some do
 * banco e a agenda volta a poder gerar aquele dia — que a essa altura já é passado.
 */
export async function ocorrenciaCanceladaRecente(
  prisma: PrismaService,
  companyId: number,
  occurrenceKey: string,
  agora: Date = new Date(),
): Promise<boolean> {
  if (!companyId || !occurrenceKey) return false;
  const corte = new Date(agora.getTime() - JANELA_EXPURGO_MS);
  const achada = await (prisma as any).entrega.findFirst({
    where: {
      companyId,
      agendaOcorrenciaKeyOrigem: occurrenceKey,
      status: 'cancelada',
      updatedAt: { gte: corte },
    },
    select: { id: true },
  });
  return !!achada;
}

export { CLAIM_NAO_TERMINAL };
