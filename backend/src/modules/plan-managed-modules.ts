import { COMMERCIAL_PLAN_MODULE_KEYS } from '../commercial-plans/commercial-plan-catalog';

// ─── O UNIVERSO DE PLANO — e por que ele virou FONTE ÚNICA em 19/08/2026 ─────
//
// `PLAN_MANAGED_MODULE_KEYS` é a UNIÃO das caixas de todos os planos comerciais
// (hoje: vendas, webscraping, atendimento, cadastro). Chave FORA deste universo
// — `logistica`, `conversas`, `comex`, `empresas`, `contatos`, `produtos`,
// `website`, `bot`, `email` — não tem preço, não entra em plano e, portanto,
// NÃO PODE SER TOCADA POR NENHUM CAMINHO DE COBRANÇA.
//
// 🔴 O DEFEITO QUE ISTO MATA (PR18082026 §3, "PAGAR MATA A LOGÍSTICA"):
// oito caminhos faziam `companyModule.updateMany({ where: { companyId },
// data: { enabled: false } })` — sem filtro nenhum — e depois religavam SÓ as
// chaves do plano. Efeito medido: qualquer empresa que PAGASSE, trocasse de
// plano, vencesse a graça ou fosse reativada perdia `logistica` (e as outras
// chaves fora de plano) para sempre, porque ninguém as religava de volta. O
// caminho `financeiro.service.ts` roda exatamente NO PAGAMENTO — ou seja,
// castigava quem paga.
//
// 🔴 POR QUE ESCOPAR TAMBÉM OS CAMINHOS DE SUSPENSÃO/ARQUIVO, e não só os de
// sync de plano: o bloqueio da empresa suspensa NÃO depende desta coluna. Quem
// nega é o estado da empresa (`evaluateCompanyStatus` + `resolveCompanyModulePolicy`
// → `!status.active` devolve false antes de olhar módulo, em modules.service).
// Zerar a coluna era redundância na ida e AMNÉSIA na volta: reativar religa só o
// plano, e a chave fora de plano nunca mais acende. Escopado, a suspensão segue
// bloqueando tudo e a reativação devolve a empresa como ela era.
//
// ⚠️ A UNIÃO (e não a caixa do plano CORRENTE) é deliberada: escopar ao plano
// corrente removeria a única revogação que existe — MELHOR→LITE precisa derrubar
// `atendimento` e `cadastro`, que estão na união mas não na caixa do LITE.
export const PLAN_MANAGED_MODULE_KEYS: string[] = Array.from(
  new Set(
    Object.values(COMMERCIAL_PLAN_MODULE_KEYS)
      .flat()
      .map((key) => String(key || '').trim().toLowerCase())
      .filter(Boolean),
  ),
).sort();

export const PLAN_MANAGED_MODULE_KEY_SET: ReadonlySet<string> = new Set(PLAN_MANAGED_MODULE_KEYS);

export function isPlanManagedModuleKey(moduleKey: unknown): boolean {
  return PLAN_MANAGED_MODULE_KEY_SET.has(String(moduleKey || '').trim().toLowerCase());
}

// Desliga a camada da empresa APENAS nas chaves de plano. Substitui os 8
// `updateMany` cegos de cobrança/suspensão. Devolve quantas linhas caíram
// (0 quando o catálogo ainda não foi semeado — nunca derruba a transação).
export async function disablePlanManagedCompanyModulesTx(tx: any, companyId: number): Promise<number> {
  const moduleRows = await tx.systemModule.findMany({
    where: { key: { in: PLAN_MANAGED_MODULE_KEYS } },
    select: { id: true },
  });
  if (!moduleRows?.length) return 0;
  const result = await tx.companyModule.updateMany({
    where: { companyId, moduleId: { in: moduleRows.map((row: { id: number }) => row.id) } },
    data: { enabled: false },
  });
  return Number(result?.count || 0);
}
