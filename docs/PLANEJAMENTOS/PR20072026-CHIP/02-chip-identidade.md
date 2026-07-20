# Worker 02 — BLOCO A: matar o vazamento de identidade de chip (NÚCLEO)

## Rodar DEPOIS do Worker 01 (compartilham `vendas-automation.service.ts`).

## Problema (cadeia provada — memória `incidente-chip-vazado-20-07`)
Envio manual da vendedora saiu pelo chip do dono porque a **identidade se perde na CRIAÇÃO da
conversa**, não no dispatch (o dispatch já é per-user por design). Cadeia:
1. As 9 conversas nasceram como shells pela ponte agenda↔vendas **sem** `whatsappConnectionSessionId`
   / `sourceTenantKey` / `assignedUserId` (a sessão app-side da vendedora não estava `active` na
   hora — drift banco×motor). Conversa criada por INBOUND estampa a sessão certa (conversa 2524
   provou); a criada pela fila não.
2. `inbox.service.ts#sendMessage` (~8241-8340) monta `outboundPayload` **sem userId/sessão** — a
   identidade de quem clicou serve só pro guard de permissão e é descartada.
3. `conversations.service.ts#queueOutboundForCompany` copia `whatsappConnectionSessionId` da
   conversa (null) pro `companyMessage` (create ~745-760).
4. Dispatch com selector null → `webwhats-bridge.service.ts#resolveCurrentWebwhatsSession`
   (~906-983), passo 4b, cai no **fallback cego** `findFirst({companyId, status:'active'}, connectedAt desc)`
   = "chip mais recente da empresa" = o do dono.

145 de 390 conversas da empresa 5 estão sem vínculo → volta a vazar quando o dono reconectar.

## Princípio
Identidade SEMPRE presente no envio; e o fallback cego morre para envio (fail-closed). Mensagem
parada é recuperável; mensagem no chip errado **não tem git revert**.

## Mudanças

### A1 — fallback cego fail-closed para ENVIO
`backend/src/messaging/webwhats-bridge.service.ts`, `resolveCurrentWebwhatsSession` (~906-983).
Adicionar um parâmetro de intenção (ex.: `opts?: { strict?: boolean }` no selector, ou um método
`resolveForSend`) tal que, no caminho de **envio**, o passo 4b (`findFirst` qualquer-chip-ativo,
linhas ~977-982) **NÃO** rode → retorna `null`.
- **Manter passo 4a** (ponteiro explícito `company.currentWhatsappConnectionSession`, ~948-975): é o
  modo SHARED legítimo (empresa aponta 1 chip do pool).
- **Manter passos 1-3** (sessionId > tenantKey > userId).
- Para LEITURA/sync (backfill de conversa, avatar, read receipts), preservar o comportamento atual
  (lenient) — passar `strict:false`/default. Mapear os chamadores de `sendText`/`sendMedia`
  (bridge) vs. os de leitura e threadar a flag. Chamadores de envio: `messaging.service.ts`
  (dispatch ~8760-8960 via `hasOperationalSession`/`sendText`), `messaging.service.ts:2309`
  (self-alert), e o próprio `sendText`/`sendMedia` do bridge.
- **Não** quebrar `hasOperationalSession` para leitura; o strict é só pra ESCOLHER o chip de saída.

Se a modelagem de flag ficar arriscada, a alternativa mínima e segura: no `sendText`/`sendMedia` do
bridge, se `resolveCurrentWebwhatsSession` cair no passo 4b (sem identidade e sem ponteiro),
**abortar o envio** com erro claro `Sem chip vinculado a esta conversa` em vez de mandar pelo chip
aleatório. O importante: **envio sem identidade resolvida NÃO usa chip de terceiro.**

### A2 — identidade viaja no envio manual
`backend/src/inbox/inbox.service.ts#sendMessage` (~8241-8340).
- Incluir a identidade do viewer no `outboundPayload` (ex.: `senderUserId: Number(user?.id)`).
- Se a conversa **não** tem `whatsappConnectionSessionId`: resolver a sessão ativa **do viewer**
  (reusar `ensureWebwhatsSessionFromCompany(company, userId)` que já existe ~588-625 — ele busca a
  sessão do usuário). Se o banco disser que não há (drift), tolerar mas preferir o motor quando
  possível; se nada, **erro claro** "Seu WhatsApp não está conectado — conecte antes de enviar",
  **NUNCA** cair pro chip da empresa/de terceiro.
- Quando resolver, **persistir na conversa** (`companyConversation.update` setando
  `whatsappConnectionSessionId`, `sourceTenantKey`, `sourcePhoneNormalized`) — 1º envio adota a
  conversa órfã. Idempotente (só grava se estava null).

### A3 — create do companyMessage aceita identidade do payload
`backend/src/messaging/conversations.service.ts#queueOutboundForCompany`, create do `companyMessage`
(~744-760). Hoje só copia da conversa. Passar a aceitar `sessionId`/`senderUserId` vindos do payload
como fonte quando a conversa estiver órfã (fallback: conversa → payload → null). Não regredir o caso
que já funciona (conversa com sessão).

### A4 — shells da fila nascem com dono de chip (ou não nascem órfãos)
`backend/src/vendas/vendas-conversation.service.ts` (`resolveCreationSession` ~236-270 e
`createOrLinkConversationForUser` ~292-345) e o ponto da ponte agenda↔vendas que cria a shell de
prospecção. Em modo **individual**, se não há sessão do vendedor resolvível, **não criar shell
órfã**: erro "Chip do vendedor não conectado". Conferir o motor antes de recusar (drift). Em modo
shared, seguir o ponteiro da empresa (comportamento atual).

### A5 — campanha do bot sai pelo chip de quem a criou
`backend/src/vendas/vendas-automation.service.ts`, disparo do bot (~4384, o
`queueOutboundForCompany({ sourceModule: 'vendas_prospeccao_bot', ... })`). Passar
`senderUserId = campaign.createdByUserId` para o envio resolver o chip do dono da campanha (não o
"mais recente"). Foi por faltar isso que o bot usou o chip DA GABRIELE às 13:14:25. Fail-closed se
esse usuário não tiver chip conectado (não cair pra terceiro).
**Só a região ~4384; NÃO tocar o normalizador ~451 (é do Worker 01, já aplicado).**

### A6 — backfill dos 145 órfãos (GERAR SQL, NÃO RODAR)
Gerar `docs/PLANEJAMENTOS/PR20072026-CHIP/backfill-orfas.sql` (idempotente, empresa 5) que:
- Para conversa com lead `assignedUserId` conhecido → setar `whatsappConnectionSessionId` para a
  sessão `active` desse usuário (quando existir).
- Sem dono resolvível → **deixar null** (será adotada no próximo envio via A2).
- Comentado, com `SELECT` de pré-conferência antes do `UPDATE`. **NÃO executar em prod** — entregar
  pro dono revisar. O orquestrador (Opus/Fable) roda depois do "go".

## Aceite
- Envio manual sem identidade resolvida **falha fechado** (erro claro), nunca usa chip de terceiro.
- Envio manual com viewer conectado sai pelo chip do viewer e **carimba a conversa**.
- Campanha do bot sai pelo chip de `createdByUserId`.
- Testes: estender `webwhats-bridge.service.test.ts` (passo 4b não escolhe chip aleatório no modo
  strict) e o teste de `vendas-conversation` / `inbox sendMessage` (identidade propaga e carimba).
- `cd backend && npm run typecheck` verde. Testes verdes.

## Arquivos
- `backend/src/messaging/webwhats-bridge.service.ts`
- `backend/src/inbox/inbox.service.ts` (`sendMessage`)
- `backend/src/messaging/conversations.service.ts` (`queueOutboundForCompany` create)
- `backend/src/vendas/vendas-conversation.service.ts`
- `backend/src/vendas/vendas-automation.service.ts` (SÓ região ~4384)
- `docs/PLANEJAMENTOS/PR20072026-CHIP/backfill-orfas.sql` (novo, não executar)
- testes correspondentes
