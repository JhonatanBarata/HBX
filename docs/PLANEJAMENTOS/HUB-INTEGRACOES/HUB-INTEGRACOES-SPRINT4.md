# HUB-INTEGRACOES — SPRINT 4: Credencial de verdade (envelope v3 + broker)

> Arquitetura nº12 — Hub de Integrações. Depende da tarefa 0 (homologação). Sem contrato real
> confirmado, o broker é arquitetura de brochura.

## Objetivo

O envelope atual só conhece `token`/`appKey` fixos — não tem onde guardar expiração nem refresh.
As APIs reais desses providers trocam/expiram token. Esta sprint cria o cofre e o porteiro: envelope
v3 tipado + broker que renova sozinho, com rotação de chave de cifra.

## Fatos verificados

- Envelope v2 fixo em `token`/`appKey` (`backend/src/integrations/integration-credentials.util.ts`);
  sem `expiresAt`, `refreshToken`, tipo de credencial.
- Contrato AUVO/TagPlus é ASSUMIDO — o próprio código admite
  (`backend/src/integrations/integration-provider.types.ts:67-70`: "contrato assumido explicito...
  sem documentacao oficial versionada no repo"). Endpoints e authMode vêm de env
  (`auvo.runtime.ts`, `tagplus.runtime.ts`).
- Cifra: AES-256-GCM com chave única `sha256(INTEGRATION_SECRET_KEY)`, formato `v1.iv.tag.data`
  (`backend/src/integrations/integration-secrets.service.ts`) — sem rotação.
- Segredo é decriptado em TODA listagem só para montar summary
  (`integration-connections.service.ts:87-112` `serializeConnection`) — superfície desnecessária.

## Tarefas

0. **HOMOLOGAÇÃO PRIMEIRO (gate):** validar contrato real das APIs AUVO e TagPlus com doc oficial /
   conta sandbox: auth de verdade, expiração, refresh, paginação, rate limit. Registrar em
   `docs/Rules/` ou no runtime como contrato CONFIRMADO. Regra da casa: checar fato antes de afirmar.
   **Se a homologação mostrar que token não expira (API key estática), o broker encolhe — não
   construir refresh para quem não precisa.**
1. **Envelope v3:** `{ version: 3, type: 'apiKey' | 'oauth2' | 'basic', credentials: {...},
   oauth: { accessToken, refreshToken, expiresAt, scopes } | null, config: {...} }`. Parse
   retrocompatível com v2/v1 (o `parseIntegrationCredentialEnvelope` já engole formatos antigos —
   manter essa tolerância).
2. **`CredentialBroker.getAccessToken(connectionId)`:** cache em memória por conexão; refresh quando
   `expiresAt - margem`; single-flight (1 refresh concorrente); persiste token novo no envelope.
   Adapters param de decriptar direto (`buildCredentials` some dos sync services) — só falam com o
   broker.
3. **Rotação de chave de cifra:** formato `v2.keyId.iv.tag.data`; env `INTEGRATION_SECRET_KEYS`
   (mapa keyId→chave) com `INTEGRATION_SECRET_ACTIVE_KEY`; decrypt aceita v1 (chave legada) e v2;
   re-encrypt lazy no próximo write.
4. **Cortar decrypt da listagem:** `secretConfigured`/`credentialSummary` derivados de colunas
   próprias (`secretPreview` já existe; adicionar flags no write) — listar conexões não decripta nada.

## Critérios de aceite

- Testes broker: expiry → refresh; concorrência → 1 refresh; falha de refresh → erro claro sem loop.
- Envelope v2 gravado antes da sprint continua lendo (teste com ciphertext antigo real).
- Rotação: segredo cifrado com chave velha decripta; write novo sai com keyId ativo.
- Nenhum token em log (grep-gate nos testes).
- `cd backend && npx tsc --noEmit` verde.

## Guardrails

- Tarefa 0 é gate: sem homologação, sprint não começa.
- Migração de formato de ciphertext é expand/contract — nunca re-encrypt em massa num deploy só.
