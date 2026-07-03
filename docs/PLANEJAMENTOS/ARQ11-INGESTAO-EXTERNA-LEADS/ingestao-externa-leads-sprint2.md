# Arq. nº11 — Ingestão Externa de Leads — Sprint 2: speed-to-lead + origem real + tela admin

Data do plano: 01/07/2026 · Depende de: Sprint 1 (endpoint subscribe-webhook) · Destrava: valor visível pro cliente

## Contexto (auditado no código em 01/07/2026)
- `intakeAdvertisingLead` cria o card e PARA: não chama `syncLeadToInboxAgenda` (o fluxo manual chama —
  `vendas.service.ts:7803`) e não notifica ninguém. Card quente que ninguém vê.
- O lead entra com `sourceType: 'manual'` e a origem real é carimbada num SEGUNDO write best-effort
  (`stampAdvertisingOrigin`, `vendas.service.ts:7307`) — o próprio comentário admite migration possivelmente
  ausente (`leadTemperature`).
- **Furo que não estava na análise original: NÃO EXISTE tela.** Grep no `frontend/src` por
  `integrations/meta|meta/connections|MetaLead|leadgen`: zero telas — só copy de marketing na landing.
  Hoje configurar conexão Meta = curl/Postman na API.

## Por que ($)
Speed-to-lead é a alavanca de conversão mais barata que existe: o dado clássico (Lead Response
Management / HBR) mostra ~21x mais chance de qualificar contatando em 5 min vs 30 min. O lead já foi
pago; avisar o vendedor na hora multiplica o retorno do mesmo CPL. E sem tela o canal nem é vendável —
nenhum admin de cliente vai configurar via curl.

## Escopo IN
1. **`sourceType` real de anúncio**: aceitar `'anuncio'` (ou `'ads'`) em `createOrUpdateLead`;
   `intakeAdvertisingLead` passa origem + temperatura num write só; aposentar `stampAdvertisingOrigin`.
   ANTES: mapear todos os usos de `sourceType` (filtros, relatórios, `formatSourceLabel`, timeline) para
   não quebrar tela/estatística. Manter fallback enquanto a migration de `leadTemperature` não estiver
   confirmada no VPS.
2. **Pós-criação do card**: chamar `syncLeadToInboxAgenda` + notificar o responsável —
   registro de agenda/inbox + push existente. Opcional atrás de flag: mensagem interna via motor
   WhatsApp pro vendedor ("lead de anúncio chegou: {nome} {telefone}").
   **Guardrail Webwhats: isso é ENVIO DE MENSAGEM comum — proibido tocar conexão/sessão/reconexão.**
3. **Tela admin de integração Meta** (frontend, área de integrações do admin):
   - lista conexões com saúde: `lastEventAt`, `lastLeadAt`, `lastError`, assinatura do webhook;
   - criar/editar: pageId, pageName, token (write-only + preview), responsável default, status;
   - ações: "assinar webhook" (endpoint do Sprint 1), pausar/reativar, excluir.
   - **5 Leis do Design System**: tudo em token/classe do `frontend/src/app/hbx-theme/`, zero hex solto
     (`check-pele.mjs` reprova).
4. **Metadata de campanha estruturada**: `campaignName`/`formId`/`adId` saem do `shortNote` improvisado e
   vão para metadata do evento de timeline (relatório futuro "qual campanha converte" nasce de graça).

## Escopo OUT
Round-robin de atribuição (entra com a entrega única no Sprint 3) · painel de dead-letter (Sprint 4).

## Arquivos
- `backend/src/vendas/vendas.service.ts` — sourceType novo + intake com sync/notificação
- `backend/src/meta-lead-ads/meta-lead-ads.service.ts` — passar metadata estruturada
- `frontend/src/...` (área admin de integrações) — tela nova com tokens hbx-theme
- Testes: intake com sourceType novo; snapshot do label de origem

## Checks
- `cd backend && npm run typecheck` + testes.
- Frontend: lint com `check-pele.mjs` verde; teste manual no chrome `localhost:3001`
  (credenciais em `.test-login.local.md`).

## Critérios de aceite
1. Lead de teste do Meta → card com origem "anúncio" (label correto na tela) + evento na inbox/agenda +
   notificação ao responsável em <1 min.
2. Um write só: nenhum card de anúncio passa por update pós-criação para origem/temperatura.
3. Admin configura conexão inteira pela tela (sem curl), inclusive assinar webhook, e vê saúde/último erro.
