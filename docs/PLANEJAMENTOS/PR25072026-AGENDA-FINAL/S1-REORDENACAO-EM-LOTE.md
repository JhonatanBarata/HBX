# S1 — Reordenação em lote (matar os ~190 UPDATEs)

**Dor:** reordenar um dia de 95 paradas hoje faz 2×95 = ~190 `UPDATE` um a um dentro da
transação (`writeRouteOrder`) e `compactRouteOrders` faz o mesmo. Pool do Prisma já foi
derrubado por padrão parecido em 23/07 (pool-storm COUNT RFB). A S2 (importar sequência) chama
exatamente esse caminho — por isso S1 vem primeiro.

## Arquivos

- `backend/src/logistica/logistica-agenda.service.ts` — funções no fim do arquivo:
  - `writeRouteOrder` (~linha 2218) — ALVO principal
  - `compactRouteOrders` (~linha 2197) — ALVO secundário
  - `makeOrderSlot` (~linha 2183) — **NÃO MEXER** (roda com N pequeno, 1 inserção)

## Restrição que molda a solução

`schema.prisma` linha ~1555: `@@unique([rotaModeloId, ordem])`. Não dá pra escrever a ordem
final direto (colisão transitória). O padrão atual de 2 passes (offset 10000 → final) está
CERTO — o problema é fazer cada passe linha a linha. A correção é manter os 2 passes, cada um
virando **1 statement**:

## Mudança — `writeRouteOrder`

```ts
async function writeRouteOrder(
  tx: any,
  rows: Array<{ id: string; planoEntregaId: string | null; ordem: number }>,
  requested: string[],
) {
  const byPlan = new Map(rows.map((row) => [String(row.planoEntregaId), row]));
  const ids: string[] = [];
  for (const planoId of requested) {
    const row = byPlan.get(planoId);
    if (!row) throw new BadRequestException('Plano inválido na ordem.');
    ids.push(row.id);
  }
  const ords = ids.map((_, index) => index + 1);
  // Passe 1: tira todo mundo da faixa 1..N num statement só (mesmo shift = sem colisão).
  await tx.logisticaRotaModeloParada.updateMany({
    where: { id: { in: ids } },
    data: { ordem: { increment: 10_000 } },
  });
  // Passe 2: ordem final num statement só (destinos 1..N não colidem com a faixa 10000+).
  await tx.$executeRaw`
    UPDATE "LogisticaRotaModeloParada" AS p
    SET "ordem" = t.ord
    FROM unnest(${ids}::text[], ${ords}::int[]) AS t(id, ord)
    WHERE p."id" = t.id
  `;
}
```

**Antes de escrever:** confirmar o nome real da tabela e das colunas no SQL das migrations
(`grep -r "LogisticaRotaModeloParada" backend/prisma/migrations/ | head`). Se houver `@@map`,
usar o nome mapeado. Manter `updatedAt`? — `$executeRaw` NÃO atualiza `updatedAt` automático;
adicionar `"updatedAt" = now()` no SET (a versão antiga via Prisma atualizava).

## Mudança — `compactRouteOrders`

Mesmo padrão: passe 1 vira `updateMany` com `increment: 10_000` filtrado por
`{ rotaModeloId: routeId }`; passe 2 vira o mesmo `$executeRaw` com unnest usando a lista
ordenada por `[ordem asc, createdAt asc]` já buscada no início da função.

## O que NÃO fazer

- NÃO mexer na validação de `reorderDay` (lista completa, sem repetição) — ela é o freio lógico.
- NÃO remover os 2 passes achando que 1 UPDATE só resolve — a unique `(rotaModeloId, ordem)`
  é checada por linha dentro do statement; colisão transitória derruba.
- NÃO tocar em `makeOrderSlot` nem em `syncRouteMirror`.

## Prova (gate da sprint)

1. `cd backend && npm run build` — verde.
2. Local (`npm run up`, localhost:3001, empresa de teste com agendaV2 ligada): criar um dia com
   ≥10 planos, arrastar/reordenar pela tela. A ordem tem que persistir após F5 e o espelho
   (`paradasJson`) tem que bater — conferir pelo GET `logistica/agenda/dias/:dia`.
3. Contar queries: subir backend local com log de query do Prisma
   (`DATABASE_LOG=query` ou temporariamente `log: ['query']` no PrismaService — REVERTER depois)
   e confirmar que o reorder de N paradas gera **2 escritas**, não 2×N.
4. Testar os 3 modos do `reorderDay`: `planoIds` (lista inteira), `posicao`, `depoisDePlanoId`.
5. Caso de erro: mandar `planoIds` com um id a menos → tem que voltar 400 "A ordem precisa
   conter todos os planos deste dia" e NÃO escrever nada.
