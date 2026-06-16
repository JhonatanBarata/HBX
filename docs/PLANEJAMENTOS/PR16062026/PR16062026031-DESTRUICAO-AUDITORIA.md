# PR16062026031 — DESTRUIÇÃO (auditoria primeiro): mapear regra morta de cobrança

> Lê o **023**. Ordem do dono: "achei um monte de porta morta ou porta que tinha outra porta".
> **Este bloco é READ-ONLY.** Não apaga nada — só **mapeia** e prova o que está morto. A 032 executa.
> Regra de segurança: **só some o que a auditoria provar sem chamador vivo.**

## OBJETIVO
Produzir uma lista (no rodapé deste doc) do que é regra de cobrança **morta, duplicada ou
indireção inútil** ("porta atrás de porta"), com **evidência** (grep mostrando 0 chamador vivo) e
**veredito** (apagar / fundir / manter).

## ONDE CAÇAR (candidatos já vistos — confirmar cada um)
1. **`selectPlanForUser` / `POST /commercial-plans/select`** — caminho de troca que **não está
   ligado na tela** e que cortava acesso no clique. Depois do 027/028/029, vira porta morta.
   Provar quem ainda chama `/commercial-plans/select` no front.
2. **Ramo "reuse" de `createSubscriptionForUser`** (~linha 3209) — re-sincroniza a assinatura antiga
   e **ignora o plano novo** (no-op silencioso). Depois do 028, ver o que sobra e some.
3. **Chaves legadas** em `COMMERCIAL_PLAN_KEYS`: `LEGACY_VENDAS='hbx_vendas'`,
   `LEGACY_VENDAS_IA='hbx_vendas_ia'`, `LEGACY_RECOVERY='hbx_recovery'` + os ramos delas em
   `normalizeCommercialPlanKey`. Mortas como **plano** (só sobrevivem numa migration de histórico).
4. **`requestFullPlan` / `POST /commercial-plans/request-full`** — substituído pela tela de contato
   (024/025). Confirmar se algum front ainda chama depois do 024.
5. **Inconsistências de redirect**: `redirectTo: '/dashboard/planos'` vs `/planos` vs `/dashboard/financeiro`
   espalhados (`BOT_IA_PLAN_REQUIRED_PAYLOAD`, `assertEntitlementForUser`, etc.). Listar e padronizar.
6. **Dois caminhos pra mesma coisa** (a "porta com outra porta"): mapear módulo+entitlement sendo
   sincronizados em **dois** lugares (`commercial-plans.service` `syncPlanModulesTx`/`syncEntitlementsTx`
   **e** `financeiro.service` `syncPaidPlanModulesTx`/`syncPaidCommercialEntitlementsTx`). Decidir um
   `applyPlanChange` único (o dos 028/029) e marcar o resto pra fundir.
7. **`createMockSubscriptionForUser`** e ramos `isMockPaymentsProvider` interleaved — manter (é o
   dev/mock), mas anotar se há mock vazando em caminho de produção.

## ⚠️ NÃO CONFUNDIR (colisão de nome real)
`hbx_recovery` é **DUAS coisas**: (a) chave legada de **plano** (morta) e (b) **módulo do bot de
Recovery** — vivíssimo em `messaging.service.ts`, `whatsapp.controller.ts`,
`whatsapp-credentials.util.ts`, `modules.service.ts`. **A 032 só remove o (a). O (b) NUNCA se toca.**
Para cada candidato, o grep tem que separar "uso como plano" de "uso como módulo".

## COMO PROVAR MORTO
Para cada candidato: `Grep` por todos os chamadores (front + back), separar histórico (migration)
de runtime. Só marcar "apagar" se: 0 chamador de runtime **e** nenhum contrato de tela depende.
Anexar a evidência (arquivo:linha) na tabela abaixo.

## ENTREGÁVEL (preencher aqui, não apagar nada ainda)
| # | Item | Evidência (0 chamador?) | Veredito | Bloco que remove |
|---|------|--------------------------|----------|------------------|
| 1 | `/commercial-plans/select` | _(preencher)_ | _(apagar/fundir/manter)_ | 032 |
| 2 | reuse no-op do createSubscription | | | 032/028 |
| 3 | chaves legadas hbx_vendas* | | | 032 |
| 4 | `request-full` | | | 032 |
| 5 | redirects divergentes | | | 032 |
| 6 | dupla sync módulo/entitlement | | | 028/029 |

## NÃO FAZER
- Não apagar nada neste bloco (read-only).
- Não tocar no **módulo** `hbx_recovery`.
- Não mexer em migration de histórico (só registrar que é histórico).

## CHECKS
Nenhum build (não muda código). Saída = a tabela preenchida com evidências.

## DEPENDE DE
Idealmente roda **depois** de 026–029 (aí "porta morta" já é morta de fato). Pode começar o
levantamento antes, mas só conclui veredito com os caminhos novos no lugar.

## STATUS
Planejado 16/06.
