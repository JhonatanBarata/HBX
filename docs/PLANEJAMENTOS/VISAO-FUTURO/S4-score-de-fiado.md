# S4 — SCORE DE FIADO NA FICHA (DORMENTE — flag OFF)

> Frente VISAO-FUTURO, 11/07/2026. "Esse cliente merece fiado?" respondido com o dado que já
> nasce dentro do sistema. O histórico vira o ativo que prende o tenant no HBX.

## O que construir
1. **Cálculo** (SEM persistência, SEM migration — computa on-the-fly): método novo em
   `backend/src/logistica/logistica.service.ts` (a S2 já terminou de mexer nesse arquivo; puxe o estado atual)
   `scoreFiadoCliente(companyId, customerProfileId)` usando `FinanceiroCharge` do cliente
   (`customerProfileId`, `sourceModule` logistica_*): pontualidade = comparar `dueDate` × `paidAt`/`status`.
   Fórmula v1 simples e explicável (sem IA): começa em 100; atraso leve (≤7d) −5 cada; atraso grave (>7d) −15 cada;
   charge vencida EM ABERTO hoje −20 cada; pagamentos em dia +2 (teto 100, piso 0). Mínimo de histórico:
   com menos de 3 charges fechadas → retornar `score: null` com `motivo: 'historico_insuficiente'`.
   Retornar também os insumos (qtd em dia, qtd atrasadas, em aberto vencido) pro front mostrar o porquê.
   ⚠️ Cobrança mensal: entregas `aguardando_fechamento` NÃO são atraso (ainda não viraram charge) — ignorar.
2. **Endpoint**: `GET /logistica/clientes/:id/score` em `backend/src/logistica/logistica.controller.ts`
   (⚠️ arquivo quente de sessão paralela — edit cirúrgico, bloco novo isolado). Guards iguais aos vizinhos
   de valor: `@Admin()` + fail-closed `moduloFinanceiroAtivo` (LEI DO VENDEDOR — valores só pro admin).
3. **Flag global** `HBX_SCORE_FIADO_ENABLED` default OFF (arquivo `logistica-score.flags.ts`, formato credits.flags.ts):
   OFF → endpoint responde 404 (mesmo padrão dos endpoints de crédito com feature OFF).
4. **UI mínima**: selo na seção "Conta" da ficha (`frontend/src/app/entrega/clientes/page.client.tsx`,
   seção `:1245-1299` — a S2 pode ter deslocado linhas; localizar pela âncora `contaSecRef`/“Conta”).
   Selo: "Fiado: 87/100" com cor por faixa usando CLASSES/TOKENS existentes da skin entrega (nada de hex novo);
   `score null` → não renderiza nada. Buscar o score junto do extrato (mesmo gate `moduloFinanceiroAtivo` +
   silencioso em 404 = feature OFF).

## O que NÃO fazer
- NÃO criar tabela/campo (zero migration). NÃO usar `HbxRecoveryCustomer.paymentHistoryScore` (só cobre
  quem entrou no funil de dívida — enviesado contra o cliente; o score geral computa de FinanceiroCharge).
- NÃO mostrar score pra role não-admin. NÃO decidir/bloquear nada automaticamente (v1 é informativo;
  o teto continua sendo `limiteFiado` manual).
- NÃO tocar: app.module.ts, shell.tsx, globals.css, financeiro-tenant/, logistica.module.ts.
- NÃO commitar; NÃO criar branch.

## Testes (node:test co-locado, Prisma mock — padrão logistica.service.test.ts)
`logistica-score.test.ts` (ou dentro do teste do service): (1) flag OFF → 404/no-op; (2) histórico
insuficiente → null; (3) cliente pontual → score alto; (4) atrasos graves derrubam; (5) vencida em aberto pesa mais.

## Critérios de aceite
1. Sem a env: NADA muda (endpoint 404, ficha sem selo, zero custo de query).
2. tsc backend verde; testes novos verdes; lint front verde.
