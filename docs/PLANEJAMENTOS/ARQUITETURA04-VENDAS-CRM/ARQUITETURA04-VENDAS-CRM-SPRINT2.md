# SPRINT2 — Worker de prospecção restart-safe (P0.5)

> Executar DEPOIS do SPRINT1 (mesmo arquivo, `vendas-automation.service.ts`) — nunca em paralelo.

## Problema (evidência no código)

- `processDueJob` marca o job `sending` (L4031) e SÓ DEPOIS espera o typing delay de 8–20s
  (`await setTimeout`, L4038) antes de enfileirar no outbox.
- `findNextDueJob` (L3077) só pega `status: 'scheduled'`.
- Não existe recovery no boot (`onModuleInit` só liga o timer).
- Consequência: `npm run publish` (que o dono roda várias vezes ao dia) reiniciando o backend dentro
  da janela de 8–20s deixa o job **órfão em `sending` para sempre** — lead nunca contatado e
  `buildLiveStatus` (L1554 conta `sending`) mentindo "enviando".
- Segunda réplica do backend = segundo `setInterval` = **duplo envio no mesmo chip** (risco de ban).
  Hoje é 1 réplica, mas o guard atual é só a flag in-process `workerRunning`.

Padrão pronto na casa: `webscraping/hbx-engine-pool.service.ts` L509 — no boot, solta leases órfãos
do `HbxEngineLock`. Copiar a ideia, não necessariamente a tabela.

## Objetivo

1. Job nunca fica órfão após restart.
2. Claim de job atômico — dois processos (ou dois ciclos sobrepostos) nunca processam o mesmo job.
3. **REGRA DE OURO: na dúvida, NÃO reenviar.** Reenvio duplicado de 1º contato é exatamente o tipo de
   comportamento que baniu chip em junho. Fail-closed sempre.

## Passos

1. **Recovery no boot** (`onModuleInit`, antes de ligar o timer): buscar jobs `sending` com
   `updatedAt < now - 2min`. Para cada um, checar idempotência ANTES de decidir:
   - Existe mensagem outbound com `variables.jobId = job.id` enfileirada/enviada (procurar na tabela
     de outbox/mensagens que `queueOutboundForCompany` alimenta)? → marcar `sent` + `sentAt` (o envio
     aconteceu; NUNCA reenviar).
   - Não existe? → voltar para `scheduled` com o MESMO `scheduledAt` (o cursor de agenda re-espaça
     sozinho) e `classification: 'recovered_after_restart'` no errorMessage/classification para rastro.
   - Qualquer ambiguidade (não deu pra provar que não enviou) → `failed` +
     `classification: 'orphaned_restart_ambiguous'`, SEM reenvio automático. Aparece no live-status
     como falha, humano decide.
2. **Claim atômico**: trocar a transição `scheduled → sending` por
   `updateMany({ where: { id, status: 'scheduled' }, data: { status: 'sending' } })` e só prosseguir
   se `count === 1`. (Optimistic claim; dispensa `FOR UPDATE SKIP LOCKED` e funciona com o Prisma
   atual. Se `count === 0`, outro processo pegou — pular sem erro.)
3. **Timer periódico de varredura** (mesmo ciclo do worker): repetir a checagem do passo 1 a cada N
   ciclos (ex.: a cada 20 ciclos ≈ 5min) para `sending` velho — cobre crash sem restart limpo.
4. Teste unitário: job em `sending` órfão com e sem outbound correspondente → caminhos `sent`,
   `scheduled` e `failed` cobertos. Teste do claim: segundo claim no mesmo job retorna 0 e não processa.

## Fora de escopo (registrar como dívida, não fazer)

- Tirar o typing delay do caminho do loop (hoje serializa TODAS as campanhas do ciclo — com o volume
  atual não dói; resolver quando doer, com concorrência por empresa + cap).
- Lease global multi-réplica formal (tabela de lease) — o claim atômico do passo 2 já protege o job;
  lease de worker inteiro só quando houver 2ª réplica de fato.

## Guardrails

- Não mexer em NENHUMA regra de safety (warm-up, disjuntores, triagem fail-closed, horário).
- Não mudar a ordem "marca sending → delay → envia" sem necessidade — o recovery cobre a janela.
- Nenhum endpoint muda.

## Checks e aceite

- `cd backend && npm run build` + testes do vendas-automation verdes.
- Simulação manual em dev: derrubar o processo durante o typing delay → subir → job recuperado no
  estado certo (documentar qual caminho caiu).
- Live-status não mostra "enviando" eterno com job órfão plantado.

## Rollback

Refactor de código + comportamento novo só no boot/claim. `git revert`. Sem migration.
