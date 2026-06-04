# Webwhats + Atendimento - Auditoria de performance e UX

## Escopo da camada

Esta camada registra o mapa operacional atual antes de qualquer mudanca funcional. O foco e a experiencia tipo WhatsApp no Atendimento: lista de chats, bootstrap da inbox, mensagens, paginacao, cache, presenca e pontos provaveis de latencia.

Nao houve alteracao de codigo funcional nesta camada.

## Fluxo atual

1. O frontend do Atendimento chama `GET /inbox/bootstrap?take=20` ao abrir a tela autenticada.
2. O backend resolve a sessao WhatsApp/Webwhats da empresa, dispara sync de indice em background quando a sessao atual e Webwhats, lista conversas persistidas e carrega a primeira conversa com mensagens.
3. O sync de indice do backend chama o Webwhats em `POST /chat/findChats/:instanceName`, espelha chats em `CompanyConversation` e usa contatos do Webwhats como apoio.
4. A conversa aberta usa endpoints do backend para carregar detalhes e mensagens recentes. O backend pode acionar sync da janela recente no Webwhats em background.
5. Eventos de inbox chegam por SSE em `GET /inbox/events`; quando o stream falha, o frontend entra em polling.

## Rotas Webwhats de chat usadas pelo HBX

- `POST /chat/findChats/:instanceName`
  - Origem: `Webwhats/src/api/routes/chat.router.ts`.
  - Passa por `ChatRouter.findChats`, valida `Query<Contact>` e chama `ChatController.fetchChats`.
  - Usada pelo HBX em `WebwhatsBridgeService.fetchChats` para `syncRecentChats` e para achar o chat correspondente ao sincronizar uma conversa.
  - Payload atual do HBX: `{ take: limit }`, limitado no backend a 1..120.

- `POST /chat/findContacts/:instanceName`
  - Usada por `WebwhatsBridgeService.fetchContacts` e cacheada em `getCachedContacts`.
  - Apoia nomes, fotos e resolucao de JID/telefone.

- `POST /chat/findMessages/:instanceName`
  - Usada por `WebwhatsBridgeService.fetchMessagesPage`.
  - Payload usa `where.key.remoteJid` ou `where.key.remoteJidAlt`, `offset` como limite e `page`.
  - Alimenta sync de mensagens da conversa.

- `POST /chat/getBase64FromMediaMessage/:instanceName`
  - Usada apenas durante download/hidratacao de midia recebida.
  - Deve continuar fora da lista de chats para evitar payload pesado.

- `POST /chat/fetchProfilePictureUrl/:instanceName`
  - Usada para avatar quando a conversa ainda nao tem `whatsappAvatarUrl` em metadata.

- `POST /chat/sendPresence/:instanceName`
  - Existe para enviar indicador de digitacao/gravacao pelo Webwhats.
  - Nao fornece snapshot consultavel de presenca do contato.

## Rotas HBX Inbox usadas pelo frontend

- `GET /inbox/bootstrap?take=...`
  - Bootstrap inicial da tela de Atendimento.
  - Hoje retorna lista de conversas e `selectedConversation` completa quando ha primeira conversa.

- `GET /inbox/events`
  - Stream SSE para eventos de mensagem, status, conversa e automacao.
  - O frontend usa refresh de lista/mensagens quando recebe evento.

- `GET /inbox/conversations?take=...&skip=...&queue=...`
  - Lista paginada/resumida de conversas por fila.

- `GET /inbox/conversations/:id`
  - Detalhe da conversa aberta com ate 20 mensagens recentes.

- `GET /inbox/conversations/:id/messages?limit=...&before=...`
  - Paginacao de mensagens. O frontend ja usa `before` ao subir no topo.

- `POST /inbox/conversations/start`
  - Cria conversa manual.

- `POST /inbox/conversations/:id/message`
  - Envio de mensagem de texto.

- `POST /inbox/conversations/:id/media`
  - Upload de midia para envio.

- `PATCH /inbox/conversations/:id/read`
  - Marca conversa como lida.

- `GET/PATCH /inbox/conversations/:id/status-card`
  - Card operacional do cliente/conversa.

- `PATCH /inbox/conversations/:id/status`
  - Atualiza status da conversa.

- `PATCH /inbox/conversations/:id/queue`
  - Move conversa entre filas operacionais.

- `PATCH /inbox/conversations/:id/block` e `PATCH /inbox/conversations/:id/unblock`
  - Bloqueio/desbloqueio operacional.

- `PATCH /inbox/conversations/bulk-bot`
  - Ativa/desativa bot em lote.

- `POST /inbox/conversations/:conversationId/messages/:messageId/reaction`
  - Reacao em mensagem.

- `POST /inbox/conversations/:conversationId/messages/:messageId/retry`
  - Retry de mensagem enviada.

Nao existe rota HBX de presenca por conversa no estado atual.

## Analise dos pontos solicitados

### Webwhats ChatController.fetchChats

`ChatController.fetchChats` apenas delega para `waMonitor.waInstances[instanceName].fetchChats(query)`. O controller nao normaliza `take`, `skip`, `limit`, `cursor` ou `search`; qualquer protecao precisa existir antes no router/schema ou dentro do service da instancia.

Risco atual: a tipagem `Query<T>` em `repository.service.ts` declara `where`, `sort`, `page` e `offset`, mas nao declara `take` nem `skip`, embora `fetchChats` use esses campos.

### Webwhats ChatRouter.findChats

`ChatRouter.findChats` esta em `POST /chat/findChats/:instanceName`. Ele valida a entrada com `contactValidateSchema`, instancia `Query<Contact>` e chama `ChatController.fetchChats`.

Risco atual: a rota aceita o contrato legado, mas a validacao/tipagem nao expressa os campos usados pelo HBX (`take` e, futuramente, `skip/cursor`). A proxima camada deve normalizar paginacao sem quebrar `page/offset`.

### ChannelStartupService.fetchChats

`ChannelStartupService.fetchChats` monta SQL raw com:

- `DISTINCT ON ("Message"."key"->>'remoteJid')`;
- filtro por `Message.instanceId`;
- filtro opcional por `remoteJid`;
- filtro opcional por range de `messageTimestamp`;
- ordenacao interna por `remoteJid` e `messageTimestamp DESC`;
- ordenacao final por `updatedAt DESC NULLS LAST`;
- `LIMIT` por `query.take` e `OFFSET` por `query.skip`.

Gargalos:

- A lista nasce da tabela `Message`, nao de `Chat`; em bases grandes, o banco precisa varrer/agrupar mensagens para descobrir a ultima conversa por JID.
- O eixo principal e a expressao JSONB `Message.key->>'remoteJid'`, sem indice dedicado no schema atual.
- `Message` possui indice simples em `instanceId`, mas nao um indice composto para `instanceId + messageTimestamp DESC`.
- A query retorna a ultima mensagem completa o suficiente para reconstruir `lastMessage`, incluindo `message`, `contextInfo`, `source`, `sessionId` e `status`.
- `cleanMessageData` remove `base64` e reduz campos de midia, mas ainda deixa um objeto de mensagem na lista.
- A query define dois campos com alias `"pushName"`: um `CASE` e depois `"Chat"."name" as "pushName"`. Isso pode sobrescrever nome ou gerar comportamento ambiguo no mapeamento.
- A paginacao usa `LIMIT/OFFSET`, que fica mais caro conforme o skip cresce.

### backend WebwhatsBridgeService.syncRecentChats

`syncRecentChats(companyId, opts)`:

- resolve a sessao Webwhats atual;
- se nao houver sessao, retorna `0` ou falha quando `failOnError` esta ativo;
- aplica throttle de 15s por empresa via `listSyncAt`;
- executa em paralelo `fetchChats(companyId, limit)` e `getCachedContacts(companyId)`;
- indexa contatos por JID;
- percorre chats um a um;
- filtra chat nao sincronizavel e mensagens abaixo do reset floor;
- faz upsert sequencial em `upsertConversationFromChat`;
- registra log apenas com total sincronizado.

Pontos de latencia:

- A chamada atual para lista ainda usa `POST /chat/findChats/:tenantKey` com payload pesado.
- Mesmo com fetch paralelo de chats/contatos, o upsert das conversas e sequencial.
- `syncConversationMessagesDetailed` tambem chama `fetchChats(companyId, 120)` para resolver o chat correspondente antes de puxar mensagens.
- Em detalhe de conversa, mensagens e avatar podem ser buscados em paralelo, mas cada mensagem sincronizada passa por upsert.

### backend InboxService.getBootstrap

`getBootstrap(user, take)`:

- resolve empresa e escopo da sessao WhatsApp;
- consulta health do provider e monta `whatsappSession`;
- se a sessao nao e acessivel, retorna lista vazia e aviso;
- quando a sessao e atual, chama `triggerBackgroundInboxIndexSync(companyId, { take })`;
- lista conversas persistidas com `listPersistedConversationSummariesForCompany`;
- pega a primeira conversa da lista;
- dispara `triggerBackgroundInboxConversationSync` para ela;
- carrega a conversa completa com `getPersistedConversationByIdForCompany(..., messagesLimit: 20)`;
- retorna `{ conversations, selectedConversation, providerWarning, whatsappSession, whatsappSessionCleanup }`.

Pontos de latencia:

- O bootstrap inicial faz lista + detalhe da primeira conversa no mesmo request.
- O default do backend para lista e ate 200 conversas quando `take` nao vem normalizado pelo frontend.
- A listagem chama SQL raw para ordenar conversas por ultima mensagem real e depois faz busca das linhas com a ultima mensagem.
- O mapeamento da lista carrega identidade/SharedProfile, aplica regras de roteamento e pode reparar `lastMessageAt` obsoleto.
- A conversa selecionada carrega 20 mensagens e `rawPayload`/`variablesJson`, o que pode pesar quando ha midia ou payload historico.

### frontend atendimento page.client.tsx

Estado atual relevante:

- `INBOX_CONVERSATION_LIST_LIMIT = 20`.
- `INBOX_RECENT_MESSAGES_LIMIT = 20`.
- `bootstrapInbox` chama `/inbox/bootstrap?take=20` com timeout de 25s.
- Durante bootstrap, o frontend seta `loadingList` e `loadingConversation` ao mesmo tempo.
- O payload esperado inclui lista e `selectedConversation`; o frontend mescla resumo + detalhe e ja define conversa selecionada.
- `loadConversations` busca `/inbox/conversations` com `take`, `skip` e `queue`.
- `loadConversation` busca `/inbox/conversations/:id`.
- `loadOlderMessages` usa `/inbox/conversations/:id/messages?limit=20&before=...` e preserva scroll apos prepend.
- SSE em `/inbox/events` agenda refresh da lista e da conversa aberta. Se o stream falha rapidamente duas vezes, o fallback faz polling de mensagens a cada 5s e lista a cada 15s.
- Diagnostico de sessao WhatsApp ja e atualizado a cada 15s quando a aba de mensagens esta ativa.

Gargalo de UX:

- O primeiro paint depende do bootstrap retornar lista e conversa selecionada.
- A tela nao tem modo light de bootstrap; o backend sempre tenta trazer `selectedConversation` quando existe primeira conversa.
- Nao ha chamada de presenca do contato aberto.

## Queries pesadas

- Webwhats `ChannelStartupService.fetchChats`:
  - SQL raw em `Message`;
  - `DISTINCT ON (key->>'remoteJid')`;
  - join com `Contact` e `Chat`;
  - order por timestamp e `updatedAt`;
  - payload inclui ultima mensagem.

- Backend `InboxService.listConversationIdsByLastRealMessage`:
  - SQL raw em `Conversation` + `Message`;
  - `MAX(m.timestamp)` por conversa;
  - `GROUP BY c.id, c.createdAt`;
  - `ORDER BY MAX(m.timestamp) DESC NULLS LAST`.

- Backend `InboxService.findConversationRowsByOrderedIds`:
  - busca linhas por ids ordenados;
  - carrega ultima mensagem real com `rawPayload` e `variablesJson`.

- Backend `InboxService.listOperationalConversationIdsByMetadata`:
  - filtros `contains` sobre `metadata` textual/JSON serializado e varios `OR`;
  - usado para conversas operacionais que precisam aparecer mesmo fora da ordenacao comum.

- Backend `InboxService.getPersistedConversationByIdForCompany`:
  - carrega detalhe com ate 20 mensagens;
  - inclui `rawPayload` e `variablesJson`;
  - pode disparar hidratacao/sync de midia em background.

- Backend `InboxService.listConversationMessages`:
  - pagina mensagens por `timestamp < before`, ordena por `timestamp DESC, id DESC` e retorna metadata resolvida.

## Indices e estrutura atual

No schema PostgreSQL do Webwhats:

- `Chat`:
  - `@@unique([instanceId, remoteJid])`;
  - `@@index([instanceId])`;
  - `@@index([remoteJid])`.

- `Contact`:
  - `@@unique([remoteJid, instanceId])`;
  - `@@index([remoteJid])`;
  - `@@index([instanceId])`.

- `Message`:
  - `@@index([instanceId])`.

Ausencias relevantes para a lista de chats:

- indice composto em `Message(instanceId, messageTimestamp DESC)`;
- indice de expressao PostgreSQL para `("key"->>'remoteJid')`;
- indice combinado que favoreca `instanceId + remoteJid extraido + messageTimestamp DESC`.

## Cache existente

- `WebwhatsBridgeService.listSyncAt`
  - throttle de 15s por empresa em `syncRecentChats`.

- `WebwhatsBridgeService.detailSyncAt`
  - throttle de 7s por empresa/conversa em `syncConversationMessagesDetailed`.

- `WebwhatsBridgeService.contactCache` e `contactSyncAt`
  - cache de contatos por empresa por 5 minutos.

- `InboxService.backgroundInboxSyncAt`
  - index sync em background: minimo 30s por empresa;
  - sync completo da conversa em background: minimo 45s por empresa/conversa;
  - sync da janela recente: minimo 8s por empresa/conversa.

- Frontend Atendimento:
  - cache em memoria de detalhes de conversa via `conversationDetailCacheRef`;
  - `selectedConversationRef` e `conversationsRef` evitam perda de estado entre refreshes;
  - polling inteligente como fallback do SSE.

Nao existe cache especifico para presenca de contato.

## Ausencia de presenca/online

O Webwhats/Baileys ja recebe `presence.update`, mas o codigo atual apenas repassa o payload para webhook (`Events.PRESENCE_UPDATE`). Tambem existem metodos para enviar presenca propria (`sendPresence`/`setPresence`), usados para digitacao/gravacao de mensagens enviadas.

Nao existe hoje:

- store em memoria por `remoteJid`;
- TTL de presenca;
- endpoint Webwhats para consultar snapshot de presenca;
- metodo no `WebwhatsBridgeService` para buscar presenca;
- endpoint HBX `/inbox/conversations/:id/presence`;
- UI do Atendimento mostrando `online`, `digitando...`, `gravando audio...` ou `visto por ultimo`.

Impacto: o Atendimento nao consegue exibir status real do contato aberto, mesmo quando o provider emite eventos de presenca.

## Plano de testes para as proximas camadas

- Webwhats:
  - `npm run typecheck`;
  - `npm run build`;
  - teste unitario de `normalizePagination`;
  - teste do payload leve da lista sem JSON completo de mensagem;
  - teste do store de presenca com TTL;
  - teste de endpoint de presenca retornando `unknown` sem evento.

- Backend:
  - `npm run build`;
  - teste de fallback do bridge quando endpoint fast nao existir;
  - teste de cache curto da lista fast;
  - teste de bootstrap light sem `selectedConversation` completa;
  - teste de endpoint de presenca retornando `unknown` sem Webwhats.

- Frontend:
  - `npm run build`;
  - smoke de bootstrap light renderizando lista antes do detalhe;
  - smoke de troca rapida de conversa cancelando fetch anterior;
  - smoke de mensagens antigas preservando scroll;
  - smoke de presenca online/digitando por mock.

- E2E:
  - Playwright mockando API;
  - validar abertura da tela;
  - validar skeleton/lista;
  - validar clique em conversa;
  - validar carregamento de mensagens;
  - validar status online/digitando quando mockado.

## Recomendacao de ordem tecnica

1. Normalizar tipagem/paginacao da query do Webwhats antes de adicionar endpoint novo.
2. Criar endpoint fast com payload estritamente resumido e sem `message` JSON completo.
3. Adicionar indices compativeis com a query fast.
4. Implementar presenca como snapshot tolerante a ausencia de evento.
5. Fazer o HBX consumir endpoint fast com fallback para o legado.
6. Separar bootstrap light da conversa selecionada para reduzir tempo de primeiro carregamento.
