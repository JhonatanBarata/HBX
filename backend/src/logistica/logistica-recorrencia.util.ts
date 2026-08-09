/**
 * PEÇAS PURAS DO VÍNCULO (ClienteProduto) — extraídas de
 * `logistica-recorrencia.service.ts` na faxina F1 (09/08).
 *
 * 🔴 POR QUE ELAS SAÍRAM DO SERVIÇO: quando o gerador V1 morreu, o
 * `LogisticaRecorrenciaService` passou a chamar a Agenda V2 direto — ou seja,
 * passou a INJETAR `LogisticaAgendaService`. E o agenda.service importava estas
 * funções DE LÁ: os dois arquivos se importariam, e ciclo de import é fatal com
 * o `emitDecoratorMetadata` do Nest (o `design:paramtypes` do construtor sai
 * `undefined` e a DI quebra em RUNTIME, com o build verde). O aviso já estava
 * escrito no serviço desde 26/07 ("injetar serviços um no outro criaria ciclo
 * de DI") — a faxina obedeceu movendo a peça pura, não criando o ciclo.
 *
 * O serviço RE-EXPORTA tudo daqui: quem já importava de
 * `logistica-recorrencia.service.ts` (rota-modelo, fechamento-dia, testes)
 * continua funcionando sem tocar em nada.
 */

/** Valor unitário: preço acordado > preço do produto > precoPadrao do cliente > 0. */
export function resolveValorUnit(v: {
  precoAcordado?: number | null;
  product?: { price?: number | null; priceCents?: number | null } | null;
  customerProfile?: { precoPadrao?: number | null } | null;
}): number {
  if (v.precoAcordado != null && Number.isFinite(v.precoAcordado)) return Math.max(0, v.precoAcordado);
  const p = v.product;
  if (p) {
    if (typeof p.priceCents === 'number') return Math.max(0, p.priceCents / 100);
    if (typeof p.price === 'number') return Math.max(0, p.price);
  }
  const padrao = v.customerProfile?.precoPadrao;
  if (typeof padrao === 'number') return Math.max(0, padrao);
  return 0;
}

export function parseDateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  // Um "YYYY-MM-DD" puro (o que a UI manda em ?date=) DEVE ser lido no fuso LOCAL,
  // não como UTC-midnight — senão, num fuso atrás de UTC (Brasília -3), "2026-07-06"
  // vira 05/07 21:00 local e o dia da rota escorrega pro dia anterior. Datas com
  // hora/offset explícitos seguem o parse padrão.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const day = Number(m[3]);
    const d = new Date(y, mo - 1, day, 0, 0, 0, 0);
    // FIX (BUG 4, 11/07) — round-trip: "2026-13-40" ou "2026-02-30" são datas de
    // calendário IMPOSSÍVEIS mas bem-formadas; sem este check, o overflow do JS Date
    // as ROLA silenciosamente pro dia/mês seguinte (mês 13 = jan do ano seguinte,
    // dia 40 rola pro mês seguinte) e getTime() nunca vira NaN — a data rolada
    // passava como válida e podia materializar Entrega/PATCH proximaData no dia
    // ERRADO. Se o que voltou não bate com y/mo/day pedidos, é rollover → inválida.
    if (Number.isNaN(d.getTime()) || d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== day) {
      return null;
    }
    return d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ── O VÍNCULO É PREÇO, NÃO AGENDA (F2, 09/08) ───────────────────────────────────
/**
 * 🔴 O QUE `ClienteProduto` É DEPOIS DA F2: "este cliente leva N do produto Y,
 * neste local, por este preço". SÓ ISSO. `diasSemana`/`frequenciaDias`/
 * `proximaData` do vínculo eram a agenda V1 — a agenda mora inteira em
 * `LogisticaPlanoEntrega` (dia, frequência e o cursor `proximaData` DELE, que
 * continua vivo e não tem nada a ver com este arquivo).
 *
 * Este snapshot existe pro cadastro sincronizar o ITEM da visita: mudar o
 * produto/quantidade/preço/local de um vínculo tem que chegar nos planos ativos
 * do cliente, senão o cadastro e a rota discordam.
 */
export interface VinculoItemSnapshot {
  id: string;
  customerProfileId: string;
  localId: string | null;
  productId: number;
  qtdPadrao: number;
  ativo: boolean;
  /** Já resolvido (precoAcordado > catálogo > precoPadrao do cliente). */
  valorUnit: number;
}

// Função de MÓDULO (recebe o prisma) de propósito: serviço injetado em serviço,
// aqui, é o ciclo de DI descrito no topo deste arquivo.
export async function carregarVinculoItemSnapshot(
  prisma: { clienteProduto: { findFirst: (args: any) => Promise<any> } },
  companyId: number,
  id: string,
): Promise<VinculoItemSnapshot | null> {
  if (!companyId || !id) return null;
  const row = await prisma.clienteProduto.findFirst({
    where: { id: String(id).trim(), companyId },
    select: {
      id: true,
      customerProfileId: true,
      localId: true,
      productId: true,
      qtdPadrao: true,
      ativo: true,
      precoAcordado: true,
      product: { select: { price: true, priceCents: true } },
      customerProfile: { select: { precoPadrao: true } },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    customerProfileId: row.customerProfileId,
    localId: row.localId ?? null,
    productId: row.productId,
    qtdPadrao: Math.max(1, Math.trunc(Number(row.qtdPadrao) || 1)),
    ativo: row.ativo !== false,
    valorUnit: resolveValorUnit(row),
  };
}
