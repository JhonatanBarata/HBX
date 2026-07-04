# RBAC / Hierarquia de Papéis — Sprint 5
## Redactor único da Lei do Vendedor (máscara de valores num só ponto de saída)

> Último sprint: é o mais trabalhoso e depende do `resolveActorKind` (sprint 3).

## Contexto verificado

- A Lei do Vendedor (só Admin/Dono vê valores; funcionário nunca vê motivo financeiro)
  está implementada HOJE em pontos manuais espalhados:
  - `backend/src/modules/module-access-policy.ts:44` (`presentModuleBlockForRole` —
    motivo financeiro de bloqueio vira mensagem neutra p/ não-ADMIN). Bem feito; vira
    caso do redactor.
  - `backend/src/vendas/vendas.service.ts:8805` (dono não vê % do vendedor — a lei também
    protege NO SENTIDO INVERSO).
  - `backend/src/financeiro/financeiro.service.ts:673` e `:4313` (gerente barrado —
    `canViewBilling=false`).
  - `backend/src/inbox/inbox.service.ts` (visão do gerente peneirada do dono/master).
  - Flags de visibilidade em `team-policy.types.ts` (`TeamPolicyVisibility`,
    `sellerVisible` no catálogo).
- Padrão do problema: cada tela nova reimplementa a máscara à mão. Uma esquecida = valor
  vazado pra vendedor, ou billing vazado pra gerente.

## Por quê ($)

A Lei do Vendedor é regra comercial do dono — vazamento de valor/comissão pra pessoa
errada é dano de confiança dentro da empresa cliente (churn). Hoje o custo de CADA tela
nova inclui reimplementar a lei; centralizar zera esse custo marginal e torna violação
detectável por teste.

## Escopo

1. Criar em `backend/src/access/` o redactor: `redactForKind(kind: ActorKind, payload, regras)`
   com regras declarativas por tipo de dado (não por tela):
   - `vendedor`: nunca vê motivo financeiro de bloqueio, valores de plano/cobrança,
     comissão de terceiros, % de comissão alheio.
   - `gerente`: tudo do time, NUNCA billing/plano e NUNCA dados do dono/master
     (regra do dono já codificada no inbox: "admin nunca vaza pra nenhum user").
   - `dono`: não vê % do vendedor onde a lei manda (caso vendas.service:8805).
   - `master`: sem redação (superfície própria).
2. Migrar os pontos existentes para o redactor UM POR VEZ, começando pelo
   `presentModuleBlockForRole` (menor risco, já é função pura com teste).
3. **Teste de contrato por papel** (o entregável mais valioso): bateria que serializa as
   respostas dos endpoints sensíveis (módulos bloqueados, card de venda, policy do time,
   inbox) para os 4 papéis e falha se aparecer campo proibido (regex de campos:
   `price|amount|commission|billing|plan` — lista explícita no teste).
4. Documentar em `docs/Rules/BACKEND.md` (1 parágrafo): "máscara de papel = redactor em
   access/, não máscara manual em service" — só depois do redactor estar no ar.

## Fora de escopo
- Mudar O QUE cada papel vê (a lei é do dono; aqui só se centraliza o COMO).
- Frontend (continua recebendo payload já redigido — contrato não muda).

## Riscos e guardrails
- Redator genérico demais que corta campo legítimo → cada migração compara resposta
  antes/depois por papel (diff de JSON) e o teste de contrato congela o resultado.
- NUNCA aplicar redação em rota interna/máquina (owner-tickets, internal) — redactor é
  para resposta de usuário autenticado com papel.

## Aceite
- `presentModuleBlockForRole` + máscaras de vendas/financeiro/inbox importam do redactor.
- Teste de contrato por papel verde; provar vermelho injetando campo proibido de propósito.
- Zero máscara manual nova em service (regra escrita no BACKEND.md).

## Checks
- `cd backend && npm run build`
- Testes: módulos tocados + bateria de contrato nova
- Smoke localhost:3001: vendedor (sem valores), gerente (sem billing), dono, master
