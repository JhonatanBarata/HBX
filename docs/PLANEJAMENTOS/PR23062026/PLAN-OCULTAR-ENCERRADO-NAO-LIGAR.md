# PLAN — Cliente "Não ligar mais" some da vista (Atendimento + Vendas)

**Pedido:** lead que demonstrou desinteresse (botão "Não ligar mais") não pode sujar a tela —
nem a carteira do **Vendas**, nem a lista de conversas do **Atendimento (chat)**.

## Decisões do dono (travadas)
1. **Reaparece sozinho** quando o cliente manda mensagem nova. "Não ligar mais" = *tirar da
   vista* quem agiu com desinteresse — não é mute permanente. Cliente voltou a falar → volta pra fila ativa.
2. **No chat vai junto das "Bloqueadas"** — reaproveita a fila que hoje está ociosa (não existe
   botão de bloquear no Atendimento).
3. **No Vendas, recolher o bloco "Fechados"** por padrão (toggle "ver encerrados").

## Diagnóstico (hoje)
- "Não ligar mais" = `PATCH status-card { doNotCall:true }` → `updateConversationStatusCard`
  ([inbox.service.ts:5143](../../../backend/src/inbox/inbox.service.ts#L5143)): grava `profile.botOff`,
  lead→`encerrado`, conversa `botActive=false/humanAssigned=false/flowResult='do_not_call'`. **Não** mexe na visibilidade.
- Lista do chat NÃO filtra encerrado/blocked. Pior: `listOperationalConversationIdsByMetadata`
  ([:3495](../../../backend/src/inbox/inbox.service.ts#L3495)) **força** conversas com `flowResult in (...,'encerrado',
  'blocked_manual')` e `atendimentoBlockedAt` a entrarem na lista → o encerrado fica colado em "Todas".
- Fila "Bloqueadas" já existe e deriva de `atendimentoBlockedAt` (`getAtendimentoBlockedState` [:1735],
  `resolveConversationQueueFromRouteTarget` [:2008]). `blockConversation` [:5839] existe mas **chama o motor**
  (`updateBlockStatus:'block'` + `archiveChat`) — bloqueia o contato no WhatsApp real. UI não expõe → fila vazia.
- Vendas: board separa em `today/overdue/scheduled/closed` ([vendas.service.ts:7257]); "Fechados" sempre
  renderizado ([vendas page.client.tsx:141]).
- **DOIS caminhos de encerramento (não convergem hoje):**
  - **Atendimento:** botão "Não ligar mais" (card `DetalhesNegocio` recebe `onToggleDoNotCall` SÓ aqui,
    [atendimento page.client.tsx:2065]) → `PATCH status-card` → `updateConversationStatusCard`.
  - **Vendas/Leads:** o card **não** mostra "Não ligar mais"; encerra via **"mover status → encerrado"**
    → `updateLead` ([vendas.service.ts:8124]) — seta `lead.status='encerrado'` + timeline, mas **não toca a
    conversa do chat** (nem `atendimentoBlockedAt`, nem `botOff`). Logo, encerrar pelo Vendas hoje **não**
    oculta a conversa no Atendimento.

## Desenho

### A) Gatilho ÚNICO de ocultação (os 2 caminhos convergem aqui)
Criar helper `applyConversationClosureVisibility(companyId, conversationOrPhone, closed, reason)` em
inbox.service (ou conversations): `closed=true` grava `atendimentoBlockedAt` + `atendimentoBlockedReason='do_not_call'`
no metadata da conversa; `closed=false` limpa via `clearAtendimentoBlockedMetadata` [:1749].
**SOFT — NÃO** chamar `updateBlockStatus`/`archiveChat` do motor (ocultação visual, não bloqueio real;
senão o cliente não volta a falar → quebra a decisão 1). Se o lead não tiver conversa no chat (mapeia por
phone/profile), no-op.
Chamado pelos **dois** call-sites:
- **Atendimento:** `updateConversationStatusCard`, no `if (doNotCall === true)` [:5250] (e o ramo "Liberar contato" `false`).
- **Vendas/Leads:** `updateLead` quando `nextStatus==='encerrado'` ([vendas.service.ts:8222], onde já cria
  o timeline `lead_closed`) e o ramo de **reabrir** (`encerrado → outro status`, [:8127]) chama com `closed=false`.
  (Vendas→inbox cruza módulos: injetar InboxService no VendasService **ou** emitir evento — decidir na execução,
  evitar import circular.)

Excluir `isBlocked` da lista quando `queue != 'blocked'`: `listPersistedConversationSummariesForCompany` [:3582]
e `...Queue` [:3697] (hoje só pulam deletado/grupo/sessão). Garantir que o force-in de [:3495] não re-injete os ocultos.

### B) Reaparecer quando o cliente fala
- `updateInboundConversationMetadata` ([messaging.service.ts:8654]): se `atendimentoBlockedReason==='do_not_call'`,
  limpar `atendimentoBlockedAt`/reason no mesmo update (já grava `whatsappLastInboundAt` aqui) → volta pra "Todas".
- **NÃO reativar o bot** (mantém `botOff`); só desoculta. Opcional: timeline "cliente voltou a falar".

### C) Front — chat
- Renomear fila "Bloqueadas" → **"Bloqueadas / Encerradas"** ([atendimento page.client.tsx:164]). Tabs Todas/Não-lidas
  já herdam a exclusão do backend.

### D) Front — Vendas
- Bloco "Fechados" **recolhido por padrão** + toggle "Ver encerrados" ([vendas page.client.tsx:141], render ~951/1005/1030). Só front.

## Decisões abertas (resolver na execução)
- **Vendas→inbox sem import circular:** injeção de dependência vs evento/emitter (ver seção A).
- Rótulo final da fila ("Bloqueadas / Encerradas" vs "Encerradas").
- Consistência Vendas: reabrir o lead nos blocos ativos quando o cliente fala = **fase 2** (mexe no status do
  lead no inbound, mais invasivo). Por ora Vendas só recolhe.

## Riscos / reversão
- **Guardrail:** manter SOFT (sem `updateBlockStatus` no motor) pro `do_not_call`. Bloquear de verdade
  impede o cliente de voltar e mexe no WhatsApp real do dono.
- Sem migration — tudo em metadata JSON. Reversível por `git revert`.
- Checks: backend `prisma:validate`→`build`; frontend `lint`→`build`.
