# S2 — COBRANÇA POR WHATSAPP COM PIX (DORMENTE — flag OFF + toggle por tenant OFF)

> Frente VISAO-FUTURO, 11/07/2026. "O sistema que cobra por você": hoje a cobrança do cliente
> final NASCE MUDA — `lancarCobranca` cria o charge e ninguém avisa o devedor. A assinatura
> recorrente de ENTREGA já existe (`ClienteProduto` frequenciaDias/diasSemana + `gerarDia` +
> cron `gerarDiaAutomatico`) — NÃO recriar nada disso. O que falta é a VOZ da cobrança.

## O que construir
1. **Aviso de cobrança ao lançar**: quando um `FinanceiroCharge` de cliente final nasce `pending`
   (fluxos `lancarCobranca` em `backend/src/logistica/logistica.service.ts:1233-1344` e `fecharMes`
   `:1359+`), enfileirar mensagem WhatsApp pro cliente final: valor, referência (entrega/fatura do mês)
   e **PIX copia-e-cola** (BR Code EMV do tenant — a geração a partir de `LogisticaConfig.pixChave/pixNome/pixCidade`
   JÁ existe no app; localizar e reusar a função, não reimplementar).
2. **Lembrete de vencimento**: scheduler diário (novo `logistica-cobranca-aviso.service.ts`, clonar a anatomia de
   `backend/src/contabil/obligation-scheduler.service.ts` — OnModuleInit + setInterval + guard `running` +
   teto/dia em memória) que varre charges `pending` de `sourceModule` logistica_* com `dueDate` = hoje
   e manda 1 lembrete. Vencido DEPOIS disso é papel do hbx-recovery existente (não duplicar régua).
3. **Idempotência dura**: 1 aviso por (chargeId, tipo) — persistir marca (ver §schema) para nunca reenviar
   (restart do container não pode reenviar).
4. **Opt-out por cliente**: campo novo `CustomerProfile.avisarCobranca Boolean @default(true)` — respeitar
   também o consentimento: NÃO enviar se o cliente não tem telefone (`phoneNormalized` null).
5. **Toggles**: flag global `HBX_COBRANCA_WHATS_ENABLED` (arquivo novo `backend/src/logistica/logistica-cobranca.flags.ts`,
   copiar o formato de `backend/src/credits/credits.flags.ts`) **default OFF** + toggle por tenant
   `LogisticaConfig.cobrancaWhatsAtiva Boolean @default(false)`. Combinar `flagEnv() && cfg.cobrancaWhatsAtiva`
   (padrão canônico: `logistica.service.ts:196`).
6. **UI mínima** (só o pedido, zero textão):
   - Ajustes da entrega (`frontend/src/app/entrega/ajustes/page.client.tsx`): card "Cobrança por WhatsApp"
     com o toggle do tenant (admin; aparece só se o front receber do config que a feature global está ligada —
     expor no GET /logistica/config um `cobrancaWhatsDisponivel` derivado da env, padrão que o config já usa
     pra outros derivados; conferir `logistica-config.service`).
   - Ficha do cliente (`frontend/src/app/entrega/clientes/page.client.tsx`, editor `ClienteEditor:552`,
     perto da seção financeiro `:1178-1243`): toggle "Avisar cobrança no WhatsApp" (avisarCobranca).

## Regras duras (WhatsApp — cicatriz de chip banido)
- Envio EXCLUSIVAMENTE via `conversations.queueOutboundForCompany(companyId, {...})`
  (`backend/src/messaging/conversations.service.ts:463`) com `senderType:'system'` e
  `sourceModule:'logistica_cobranca'` (system passa o gate anti-bot `:518`; NUNCA usar
  `webwhats-bridge.sendText` direto).
- Teto diário por empresa em memória (ex.: 50 avisos/dia) + parar a varredura da empresa ao atingir
  (padrão `obligation-scheduler.service.ts:19,318-349`). Sem retry próprio, sem loop: falhou, marca falha e segue.
- Sem chip operacional (`hasOperationalSession` já é checado dentro do queueOutbound) → aviso não sai e
  NÃO é marcado como enviado (pode tentar no próximo tick do lembrete; o aviso "ao lançar" perdido vira
  lembrete no vencimento — aceitável, documentar no código).

## Schema (migration FORMAL — arquivo em backend/prisma/migrations/<timestamp>_logistica_cobranca_whats/,
## NUNCA runtime-ensure; o dono aplica na VPS depois)
- `CustomerProfile.avisarCobranca Boolean @default(true)`
- `LogisticaConfig.cobrancaWhatsAtiva Boolean @default(false)`
- Marca de idempotência do aviso: tabela pequena `LogisticaCobrancaAviso` (id, companyId, chargeId,
  tipo enum-string 'lancamento'|'vencimento', sentAt, @@unique([chargeId, tipo])) — simples e à prova de restart.

## O que NÃO fazer
- NÃO mexer na assinatura/recorrência existente (`logistica-recorrencia.service.ts`) nem no fluxo de
  confirmação de entrega além do hook de aviso pós-charge.
- NÃO tocar Mercado Pago (o PIX aqui é a chave direta do tenant, taxa zero).
- NÃO criar caminho paralelo de cobrança: o charge continua nascendo EXATAMENTE onde nasce hoje.
- NÃO registrar nada em backend/src/app.module.ts (providers novos entram em logistica.module.ts).
- NÃO commitar; NÃO criar branch; NÃO tocar arquivos da frente Financeiro paralela
  (backend/src/financeiro-tenant/, frontend/src/app/(app)/financeiro/, shell.tsx, globals.css).
- logistica.controller.ts está quente (sessão paralela): edits cirúrgicos mínimos se precisar; preferir
  expor toggles pelo PATCH /logistica/config existente (whitelist de campos no service).

## Testes (padrão node:test co-locado, ver logistica.service.test.ts — Prisma mock injetável)
- `logistica-cobranca-aviso.service.test.ts`: (1) flag OFF global → tick no-op; (2) toggle tenant OFF → pula empresa;
  (3) idempotência — 2 ticks não duplicam aviso; (4) opt-out do cliente respeitado; (5) teto diário para a empresa.
- Rodar: cd backend && npm run build && node --test dist/src/logistica/logistica-cobranca-aviso.service.test.js
  (conferir path exato do dist; existem scripts test:* como referência no package.json).

## Critérios de aceite
1. Com `HBX_COBRANCA_WHATS_ENABLED` ausente: deploy 100% inerte (nenhum envio, nenhum comportamento novo,
   scheduler dorme). Toggle do tenant sem a env: no-op.
2. Migration é ARQUIVO no repo; nada aplicado em banco por runtime.
3. tsc backend verde (cd backend && npx tsc --noEmit), testes novos verdes, front lint verde se tocou front.
4. Mensagem em PT-BR curta: valor + referência + PIX copia-e-cola (sem textão, sem emoji forçado).
