# 01 — Avatar estável no /atendimento (fotos de perfil que não quebram)

## Diagnóstico (medido em prod 05/07)
163 conversas Webwhats: 45 com avatar local estável (`/uploads/avatars/...`), **44 com URL crua
`pps.whatsapp.net` (assinada, EXPIRA → foto quebra sozinha)**, 74 sem avatar (fetch null:
privacidade ou rate-limit). Mídia de mensagem NÃO é o problema (127/128 em 30d, 0 falha em 72h).

## Causas no código (3 fixes)

### Fix 1 — Caminho da LISTA de conversas serve URL crua sem cache
`backend/src/messaging/webwhats-bridge.service.ts:632-635` — monta `avatarUrl` com
`chat.profilePicUrl || contact.profilePicUrl` CRU. O cache local
(`cacheProfilePictureLocally`, linha ~2798) só roda no sync por-conversa (linha ~516).
**Fazer:** no caminho da lista, tentar servir do cache. Cuidado com o custo: é hot path com
N chats. Estratégia: se o arquivo do hash já existe em disco → usa local (barato, síncrono);
se não existe → devolve a crua MAS dispara download em background com limite de concorrência
(ex.: p-limit 3 ou fila simples) pra convergir pro local nas próximas leituras. NÃO bloquear
a resposta da lista em N downloads.

### Fix 2 — URL crua morta SOBRESCREVE avatar local bom (regressão silenciosa)
`backend/src/inbox/inbox.service.ts:3082` — `...(snapshot.avatarUrl ? { whatsappAvatarUrl: snapshot.avatarUrl } : {})`
espalha incondicionalmente. Se o snapshot vier com pps cru (cache falhou no bridge:516
`cache ?? rawAvatarUrl`) ele CLOBBERA um `/uploads/avatars/...` que funcionava.
**Fazer:** na fusão do metadata, regra: avatar novo que NÃO é `/uploads/` só substitui um
existente `/uploads/` se o download/cache dele tiver funcionado (ou seja: preferir manter o
local existente a gravar cru por cima). Cru só entra se não houver NADA local antes.
Atenção: aplicar a mesma regra em qualquer outro ponto que grave `whatsappAvatarUrl`
(grep no inbox.service; há outro ponto ~linha 7696 no refresh — esse já grava local, ok).

### Fix 3 — Backfill one-shot pros 44 quebrados (+ 74 sem foto, best-effort)
Criar `backend/scripts/backfill-avatars.js` — **node puro, sem Nest DI** (roda via
`docker exec hbx-backend node scripts/backfill-avatars.js` na VPS):
1. Conecta no Postgres via `process.env.DATABASE_URL` (usar `pg` ou o `@prisma/client` já
   buildado do backend — o que for mais simples no container).
2. Seleciona `Conversation` com `sourceTenantKey IS NOT NULL` e `metadata` contendo
   `whatsappAvatarUrl` com `pps.whatsapp.net` (prioridade) e, com flag `--incluir-sem-foto`,
   também as sem avatar.
3. Pra cada uma: POST no motor `/chat/fetchProfilePictureUrl/{tenantKey}` (mesma rota/env
   que a bridge usa — copiar resolução de URL interna e apikey dos MESMOS envs que
   `webwhats-bridge.service.ts#readConfig` lê; conferir os nomes reais no código/config).
   **Espaçar 2s + jitter entre chamadas** (rate-limit; é fetch de perfil, comportamento
   normal de cliente, mas sem rajada). Timeout curto, erro → pula, não derruba o loop.
4. URL retornada → baixa os bytes e grava em `/app/public/uploads/avatars/{sha1(pathname)}{ext}`
   (MESMO esquema de nome do `cacheProfilePictureLocally` pra deduplicar) → atualiza o
   metadata JSON da conversa com o caminho local. Fetch null → não mexe (mantém o que tem).
5. Log resumo no fim: total varrido / consertado / null / erro. Idempotente (rodar 2x não duplica).

## Aceite
- `cd backend && npx tsc --noEmit` limpo.
- Testes tocados verdes: rodar a suíte dos arquivos alterados (`inbox.service.test.ts` já
  existe — rodar; adicionar caso de teste pro Fix 2: local existente não é sobrescrito por cru).
- Script roda local em dry-run (`--dry-run` imprime o que faria sem escrever) contra o banco local se disponível; senão, validação por leitura de código + teste unitário da função de decisão.

## Regras duras
- Trabalhar DIRETO na master, sem branch/worktree. NÃO commitar (o orquestrador commita).
- NÃO tocar em arquivos sujos do dono: `backend/src/nucleo/*`, `backend/src/products/*`,
  `frontend/**` inteiro (outro worker cuida), `package.json`/`lock`.
- Escopo de escrita: `backend/src/messaging/webwhats-bridge.service.ts`,
  `backend/src/inbox/inbox.service.ts` (+ seu .test), `backend/scripts/backfill-avatars.js`.
- Comentários/mensagens em PT-BR, estilo do arquivo (os comentários existentes do avatar são
  o modelo). Ao concluir: DELETAR este .md e reportar lista de arquivos alterados + resumo.
