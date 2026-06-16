# PR16062026032 — DESTRUIÇÃO (executar): remover o que a 031 provou morto

> Lê o **023** + **031**. Só age sobre itens com veredito **"apagar"/"fundir"** e **evidência de 0
> chamador vivo** na tabela do 031. Nada de delete por intuição. Commit pequeno por item.

## OBJETIVO
Limpar a sujeira de regra de cobrança mapeada no 031, **uma porta de cada vez**, preservando o que
é vivo (em especial o **módulo** `hbx_recovery`).

## ORDEM SUGERIDA (cada um é um passo isolado + build verde antes do próximo)
1. **Chaves legadas de plano** (`commercial-plan-catalog.ts`): remover `LEGACY_VENDAS`,
   `LEGACY_VENDAS_IA`, `LEGACY_RECOVERY` de `COMMERCIAL_PLAN_KEYS` e os ramos correspondentes em
   `normalizeCommercialPlanKey` (o fallback `hbx_vendas_ia → melhor` etc.). **Manter** a migration
   `20260428_replace_commercial_package_keys` (histórico). **Não** tocar em nada `hbx_recovery` de
   `messaging`/`whatsapp`/`modules` (é o bot, não o plano).
2. **Porta morta `/commercial-plans/select` + `selectPlanForUser`** (se a 031 confirmou 0 chamador
   após a tela de troca 027): remover endpoint + método + DTO órfão. Se o front ainda usa pro caso
   `same`, **fundir** no fluxo do 027 em vez de apagar.
3. **`request-full` + `requestFullPlan`** (se substituído por 024/025): remover ou fundir no método
   de contato da Implantação (025). Não deixar dois caminhos de "falar com a HBX".
4. **Reuse no-op do `createSubscription`**: depois que o 028 assumiu a troca de assinante, remover o
   ramo que ignorava o plano novo (ou reduzi-lo ao que realmente reusa: assinatura pendente do
   MESMO plano). Cobrir com teste pra não reintroduzir o no-op.
5. **Redirects divergentes**: padronizar `redirectTo` de cobrança num só destino (decidir
   `/dashboard/financeiro` ou `/planos` conforme o front real) e remover os soltos.
6. **Dupla sync módulo/entitlement**: consolidar no `applyPlanChange` único (028/029) e remover a
   cópia que sobrou, mantendo só o caminho de checkout pago + o de troca.

## REGRAS DE SEGURANÇA (PAGAMENTOS.md)
- Nenhuma migration **destrutiva** sem o dono. Remoção de chave morta de catálogo é código, não
  schema — mas se for mexer em coluna, é **aditivo** e só com "go".
- Cada remoção: rodar build + testes de auth/commercial/financeiro antes de seguir.
- Se na hora de apagar aparecer **qualquer** chamador vivo que a 031 não viu → **parar**, anotar na
  tabela do 031 e perguntar ao dono. (Foi exatamente o caso do `hbx_recovery`.)

## NÃO FAZER
- Não apagar nada que não esteja com veredito "apagar/fundir" + evidência na 031.
- Não tocar no módulo `hbx_recovery` do bot.
- Não fazer "refactor amplo" oportunista além da lista do 031.

## CHECKS
`cd backend && npm run prisma:validate && npm run build` + testes
(`commercial-plan-catalog.test.ts`, `auth.service.test.ts`, módulos). Front que importava algo
removido: `cd frontend && npm run lint && npm run build`.

## DEPENDE DE
**031** (lista provada) e os caminhos novos 027–029 no lugar (senão "morto" ainda está vivo).

## STATUS
Planejado 16/06.
