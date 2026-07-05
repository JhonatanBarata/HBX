# 02 — Responder citando chega no WhatsApp do cliente (plumbing do `quoted`)

## Diagnóstico
O cano está construído nas 2 pontas e falta o MEIO:
- Frontend JÁ manda `quotedMessageId` + `quotedContent` (atendimento/page.client.tsx:1189-1216).
- Backend JÁ recebe (dto `send-conversation-message.dto.ts:10,14`) e guarda em `variables`
  pra exibir na NOSSA tela (`inbox.service.ts:8025-8046`).
- Motor (fork Evolution) JÁ aceita `quoted` em TODAS as rotas de envio
  (`Webwhats/src/validate/message.schema.ts:41,79,109,...` — `{ key: {...}, message: {...} }`).
- **A bridge NUNCA repassa**: `grep -i quoted backend/src/messaging/webwhats-bridge.service.ts` = 0.
  Resultado: no celular do CLIENTE a resposta chega sem citação.

## Fazer

### 1. Resolver a mensagem original (inbox.service, fluxo de envio ~7988+)
No fluxo que envia mensagem de conversa (texto E mídia), quando vier `quotedMessageId`:
- Buscar a `Message` original: por `conversationId` + `providerMessageId` que termina com o
  keyId (formato = `buildProviderMessageId(tenantKey, keyId)` — ver helper na bridge; o
  frontend manda `meta.providerKeyId || providerMessageId || id`, então tratar os 3 formatos:
  keyId cru, providerMessageId completo, id numérico da Message).
- Da original, parsear `rawPayload` (WAMessage completo) → extrair `key` (`remoteJid`,
  `fromMe`, `id`, `participant?`) e `message` (payload).
- Montar `quoted = { key, message }`. Fallback se não achar a original: 
  `{ key: { remoteJid, fromMe: false, id: quotedMessageId }, message: { conversation: quotedContent || ' ' } }`
  (o schema do motor exige key.id; conferir campos obrigatórios no schema antes).

### 2. Plumbing na bridge
`webwhats-bridge.service.ts` — `sendText` (:918) e `sendMedia` (:946): aceitar
`quoted?: { key: ...; message: ... }` opcional e incluir no payload POST pro motor
(mesmo nível de `number`/`text`, como o schema do motor espera). NÃO mexer em
`sendWhatsAppAudio`/`sendInteractive`/`sendReaction` (fora de escopo).

### 3. Ligar as pontas
No caminho de envio do inbox (texto e mídia), passar o `quoted` resolvido pra chamada da
bridge. O eco/persistência local de `quotedMessageId`/`quotedPreview` que já existe fica
como está (é o que renderiza a citação na nossa UI).

## Aceite
- `cd backend && npx tsc --noEmit` limpo.
- Teste unitário NOVO pra resolução do quoted (acha original por keyId / por providerMessageId /
  fallback sem original) — pode viver no teste do inbox.service ou arquivo próprio.
- Suítes dos arquivos tocados verdes. NÃO testar envio live (não disparar WhatsApp real).

## Regras duras
- DIRETO na master, sem branch/worktree. NÃO commitar (orquestrador commita).
- ATENÇÃO: outro worker mexeu ANTES nestes MESMOS arquivos (bridge + inbox.service) na parte
  de avatar — puxar o estado atual do disco antes de editar; não reverter nada que encontrar.
- NÃO tocar: `backend/src/nucleo/*`, `backend/src/products/*`, `frontend/**`, `Webwhats/**`
  (motor é SÓ leitura pra conferir schema).
- Escopo de escrita: `webwhats-bridge.service.ts`, `inbox.service.ts`, testes.
- PT-BR nos comentários. Ao concluir: DELETAR este .md e reportar arquivos + resumo.
