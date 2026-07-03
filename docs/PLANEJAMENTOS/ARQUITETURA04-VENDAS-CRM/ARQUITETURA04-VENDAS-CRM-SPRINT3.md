# SPRINT3 — Comissões em módulo próprio (P1) — FRENTE FINANCEIRA

> **REGRA DA CASA: frente financeira (preço/cobrança/comissão) = Opus edita DIRETO com revisão
> obrigatória do diff pelo dono. NÃO delegar este sprint a subagente.**
> LEI DO VENDEDOR intocada: só Admin vê valores; vendedor nunca vê motivo financeiro.

## Problema

O dinheiro do vendedor (comissão, payout, receivable, caso de cancelamento) vive dentro do god-file
`vendas.service.ts` (9.719 linhas) misturado com board, e-mail e relatório. Qualquer mudança de funil
passa pelo arquivo que calcula pagamento — erro de merge aqui quebra confiança do time de vendas.
O módulo `commissions/` JÁ existe (`HbxCommissionSyncService` mora lá).

## Objetivo

Movimentação de código, **zero mudança de comportamento, endpoint, payload ou schema**. Snapshots de
comissão no `VendasLead` FICAM onde estão neste sprint (split de tabela é decisão separada, não tomada).

## Escopo — métodos a mover de `vendas.service.ts` para `commissions/vendas-commissions.service.ts` (novo)

| Método | Linha atual | Rota servida |
|---|---|---|
| `getCommissionSummaryForUser` | L4329 | GET `/vendas/commission/summary` |
| `createCommissionPayoutForUser` | L3582 | POST `/vendas/commission/payout` |
| `cancelCommissionPayoutForUser` | L3813 | POST `/vendas/commission/payout/:id/cancel` |
| `getCommissionPayoutDetailForUser` | L3955 | GET `/vendas/commission/payout/:id` |
| `getMyCommissionProfileForUser` | L8899 | GET `/vendas/me/commission-profile` |
| `listCancellationCasesForUser` | L1111 | GET `/vendas/cancellation-cases` |
| `resolveCancellationCaseForUser` | L1155 | PATCH `/vendas/lead/:id/cancellation-case` |

+ os helpers privados que SÓ eles usam (mapear com grep antes de mover; helper compartilhado com
board/relatório fica no vendas e é importado/injetado — não duplicar).

`VendasService` mantém métodos com o mesmo nome delegando 1-linha para o service novo (fachada) —
`vendas.controller.ts` NÃO muda. `VendasModule` já importa `CommissionsModule`; registrar o service
novo lá e exportar.

## Passos

1. Grep de dependências de cada método (helpers privados, models Prisma tocados:
   `VendasCommissionPayout`, `VendasCommissionReceivable`, campos `commission*` e
   `cancellationCase*` do `VendasLead`).
2. Mover método a método, com o teste correspondente de `vendas.service.test.ts` migrando junto.
3. Fachada de delegação no `VendasService`.
4. Diff final para revisão do dono: deve ler como "recortar e colar + delegação", nenhuma linha de
   lógica alterada. Qualquer linha que precisou mudar além de import/this → justificar uma a uma.

## Guardrails

- Nenhum valor, percentual, cap, arredondamento ou condição de status muda.
- `applyCommissionCap` e catálogo (`commercial-plan-catalog`) continuam sendo a fonte.
- Sem migration. Sem mudança em DTO.
- Sincronização recorrente (`HbxCommissionSyncService`, `runWeeklySalesProfileSuggestions` NÃO é
  comissão — não tocar).

## Checks e aceite

- `cd backend && npm run build` verde; testes de comissão (movidos) + testes restantes do vendas verdes.
- Diff revisado e aprovado pelo dono ANTES de publicar.
- Smoke manual: resumo de comissão e detalhe de payout idênticos antes/depois (mesma empresa de teste,
  credenciais em `.test-login.local.md`, localhost:3001, Chrome).

## Rollback

`git revert` — movimentação pura.
