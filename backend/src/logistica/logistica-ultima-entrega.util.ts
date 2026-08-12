/* ---------------------------------------------------------------------------
   ÚLTIMO REGISTRO DO CLIENTE — a data da última entrega REALMENTE concluída.

   🔴 POR QUE ISTO É UM UTIL, E NÃO TRÊS CONSULTAS (12/08, ordem do dono: "assim
   que existir histórico real de trabalho, esse espaço deve mostrar a data da
   última entrega concluída daquele cliente").

   A Montagem de rota lê TRÊS fontes na mesma lista — a agenda (`dia-preview`),
   as paradas avulsas já abertas (`/logistica/rota`) e o rascunho escolhido na
   mão (`/nucleo/clientes`) — e as três desenham o MESMO cartão. Se cada uma
   respondesse "quando foi a última vez" com a sua própria conta, a mesma pessoa
   apareceria com datas diferentes conforme por onde entrou na tela. É a doença
   que esta casa persegue: duas telas (aqui, três listas) escrevendo o mesmo
   fato em lugares diferentes.

   A régua, escrita UMA vez:
     · status === 'entregue'  — cancelada NÃO é registro de trabalho feito;
     · deliveredAt != null    — o carimbo do desfecho, nunca `scheduledAt` (que
                                é marcador de DIA) nem `arrivedAt` (que é a
                                chegada, não a entrega);
     · MAX por cliente        — o mais recente, company-scoped.

   Cliente sem NENHUMA entrega concluída simplesmente não entra no mapa: quem
   pergunta recebe `undefined` e a tela escreve "Pendente". Nada de data zero,
   nada de "hoje" por falta de resposta — inventar data aqui seria dizer ao
   motorista que ele já esteve numa porta onde nunca esteve.
   --------------------------------------------------------------------------- */

/* ⚠️ `entrega: any` de propósito, e NÃO um `groupBy` tipado à mão: assinar o
   delegate com uma forma própria faz o TypeScript comparar estruturalmente com
   as sobrecargas geradas do Prisma e estourar TS2615 ("AND circularly references
   itself") no CHAMADOR — medido aqui em 12/08. O contrato de verdade é o retorno
   da função, que está tipado logo abaixo. */
type PrismaLike = { entrega: any };
type LinhaGroupBy = { customerProfileId: string; _max?: { deliveredAt: Date | null } };

/**
 * MAX(deliveredAt) das entregas CONCLUÍDAS, por cliente. Uma ida ao banco.
 * Devolve só quem tem registro — ausência = nunca houve entrega concluída.
 */
export async function ultimaEntregaPorCliente(
  prisma: PrismaLike,
  companyId: number,
  customerProfileIds: string[],
): Promise<Map<string, Date>> {
  const mapa = new Map<string, Date>();
  const ids = [...new Set((customerProfileIds ?? []).map((v) => String(v ?? '')).filter(Boolean))];
  if (!companyId || !ids.length) return mapa;
  const linhas: LinhaGroupBy[] = await prisma.entrega.groupBy({
    by: ['customerProfileId'],
    where: {
      companyId,
      customerProfileId: { in: ids },
      status: 'entregue',
      deliveredAt: { not: null },
    },
    _max: { deliveredAt: true },
  });
  for (const linha of linhas) {
    const quando = linha?._max?.deliveredAt ?? null;
    if (quando) mapa.set(String(linha.customerProfileId), quando);
  }
  return mapa;
}

/** o que viaja no JSON: ISO ou ausente. Data inválida NÃO vira string. */
export function isoDaUltimaEntrega(quando: Date | null | undefined): string | null {
  if (!quando) return null;
  const t = quando instanceof Date ? quando : new Date(quando as any);
  return Number.isFinite(t.getTime()) ? t.toISOString() : null;
}
