# PR16062026035 — MASTER: DEGUSTAÇÃO DE PLANO (taste pré-venda com volta automática)

> **Ordem do dono (16/06):** "eu queria acesso a editar planos, não módulos list/lead. Um
> cliente plano barato entra em contato e informa que quer subir pro empresarial — eu deveria
> ter acesso total de dar um 'taste' pro cara por uns dias, até fechar a compra. Colocar o dia
> que volta ao normal." **É uma ideia, não uma recap.** Nada aplicado — só o plano.

## A IDEIA (o que ele quer, em uma frase)
O Master dá **degustação temporária de um plano superior** a uma empresa de plano barato:
liga as features do plano cheio **agora**, **de graça**, com **data marcada pra voltar ao
normal**. Se a venda fechar antes, vira upgrade pago de verdade. Se não fechar, **volta sozinho**
no dia. É a ponte de venda — não cobra nada durante o taste.

## POR QUE ISSO NÃO EXISTE (e não confundir com o que já tem)
Três coisas parecidas existem e **nenhuma** é isto:
1. **Trial de cadastro** — Lead + cartão, vira `pending_checkout`. É funil de signup, não upsell.
2. **Mudar plano** (`PUT modules/master/company/:id/plan`, `modules.controller.ts:591`) —
   **permanente**, redefine entitlements pra sempre. Não tem volta automática nem data.
3. **Upgrade pago** (trilha 028, `PR16062026000-INDEX.md`) — **cobra a diferença** e sobe.
   É o que acontece *quando a venda fecha*, não o "taste" antes.

O novo é um **override TEMPORÁRIO de tier, grátis, reversível por data**. Catálogo de planos
já é editável em Sistema → Planos; isto é diferente: é elevação por EMPRESA com prazo.

## COMO CONSTRUIR (reaproveita trilhos que já existem — não inventa)

### 1. Estado (migration)
Campos novos em `Company`: `tastePlanKey` (plano elevado), `tasteRevertsAt` (data da volta),
`tastePreviousPlanKey` (pra onde cai de volta), `tasteReason`, `tasteGrantedByUserId`.

### 2. Conceder (backend, endpoint master novo)
`POST modules/master/company/:companyId/plan-taste { planKey, revertsAt, reason }` (`MasterGuard`):
- guarda `tastePreviousPlanKey = selectedPlanKey` atual e os campos `taste*`;
- eleva `selectedPlanKey = planKey` **reaproveitando o mesmo caminho de entitlements do "mudar
  plano"** (não duplicar — extrair o miolo que o `PUT .../plan` já usa pra acender módulos);
- **não cria cobrança** — a empresa segue na cobrança do plano barato, ganha as features do cheio
  de graça até o dia da volta;
- audita (cai na `auditTimeline` que o detalhe já mostra).

### 3. Voltar automático (o "dia que volta ao normal")
- **Sweep periódico** no mesmo padrão que já roda: `setInterval` tipo o `billingGraceSweep`
  (`financeiro.service.ts:88`) / `orphanCleanup` (`companies.service.ts:51`). No tick: empresas
  com `tasteRevertsAt <= now` → restaura `selectedPlanKey = tastePreviousPlanKey`, limpa os
  `taste*`, **reaplica entitlements**, audita, avisa o dono (e-mail/alerta master).
- **Reforço lazy:** o `company-operational-status.service` já deriva estado de datas
  (`:819` lista `trialEndsAt`/`courtesyEndsAt`/…); incluir `tasteRevertsAt` ali pra a volta
  valer no próximo acesso mesmo se o sweep atrasar.

### 4. Painel Master (front)
- Bloco **"Degustação de plano"** na aba Comercial de `janela-empresas.tsx`: escolher o plano
  a degustar, **data de volta**, motivo; banner "degustando Full até DD/MM"; botão "encerrar
  agora"; **tag "degustação"** na lista de empresas.
- **Pré-requisito de tela:** esse bloco precisa aparecer numa empresa List/Lead — que é
  justamente quem está atrás da régua `isFull` hoje (`janela-empresas.tsx:596`). Então
  **soltar o painel do Master da régua** (mostrar os controles comerciais em qualquer plano)
  é o que destrava dar taste pra quem está no plano barato. Sem isso, a tela do alvo está vazia.

### 5. Fechar a venda
Quando o cliente paga, o Master faz o **upgrade real** (trilha 028) — permanente + cobra. O
taste é só a ponte: ou converte em venda, ou expira e volta ao plano barato.

## RESTRIÇÕES (PAGAMENTOS.md — valem mesmo com autorização)
Backend é a verdade da autorização; tudo auditado; **o taste NÃO cobra** e NÃO mexe na cobrança
do plano atual; reversão determinística por data; **não reintroduzir trial sem cartão** (isto
não é trial de signup — é override de tier numa empresa existente); vendedor (role USER) nunca
vê valor/cobrança; visual só em token/classe central (5 Leis). Toca plano/entitlements →
**construir só com ordem do dono na tarefa**.

## ESTADO
Planejado. Nada aplicado. Esperando o "go".
