# GATEWAY-WA — Sprint 5: Fonte única da conversa + bridge fatiada

## PRÉ-REQUISITO DURO
Sprint 2 (outbox) rodando em produção **≥ 2 semanas sem perda de evento**. Motivo verificado:
o sync por polling é hoje a rede de segurança que backfilla o que o webhook perde. Matar o
polling antes da outbox provada = criar buraco real de dados. Este sprint NÃO começa sem o
dono confirmar que a outbox está estável.

## Por quê ($)
Mensagem mora em dois lugares (`webwhats_prod` + Postgres do app) sincronizados por
webhook + polling com throttles e caches em RAM — duas fontes de verdade defendidas a mão,
e a bridge de 4.294 linhas é onde todo bug novo de WhatsApp nasce. Com a outbox entregando
TUDO por evento, o polling vira custo puro (chamadas ao motor a cada abertura de conversa,
código de reconciliação de nomes/jids duplicado). Fonte única por domínio: motor = conexão
e transporte; app = conversa (CRM).

## Entrega
1. **Matar o sync por polling de rotina**: `syncRecentChats`, `syncConversationMessagesDetailed`
   no caminho quente, throttles (`listSyncAt`, `detailSyncAt`, `contactSyncAt`) e caches de
   lista (`chatListCache`) saem do fluxo normal. Entrada de dado = SÓ por evento (outbox).
2. **Manter fetch pontual** como ferramenta explícita: backfill manual (botão admin
   "ressincronizar conversa"), download de mídia sob demanda, foto de perfil com TTL.
   Fetch vira exceção auditável, não rotina.
3. **Fatiar a bridge** (mesmo módulo NestJS, sem mudança de comportamento — refactor mecânico):
   - `WebwhatsSessionResolver` — resolver sessão/tenantKey (selector, per-user, ponteiro).
   - `WebwhatsSender` — sendText/media/audio/buttons/list/reaction/read/block/archive.
   - `WebwhatsInboundIngestor` — ingest de evento → upsert conversa/mensagem → relay bot.
   - `WebwhatsMediaStore` — download/cache de mídia e avatar.
   Testes existentes (`webwhats-bridge.service.test.ts`) continuam passando (adaptar imports).
4. **Avaliar (decisão com o dono, NÃO executar sozinho)**: desligar `SAVE_DATA` de mensagens
   no motor (hoje forçado `true` em `env.config.ts:464-469`) para o `webwhats_prod` guardar só
   creds + estado. Só depois de meses de outbox estável — é a última rede de segurança de
   histórico. Registrar a decisão, não antecipá-la.

## Fora de escopo
- Mudar schema de `CompanyConversation`/`CompanyMessage`.
- Tocar em conexão/reconexão/disjuntor.
- Item 4 executado — este sprint só REGISTRA a avaliação.

## Critérios de aceite
- Fluxo normal (mensagem entra, bot responde, vendedor conversa, mídia abre) sem NENHUMA
  chamada de sync de rotina ao motor (verificar por log/contador).
- Botão de backfill manual funciona e é auditado.
- Bridge fatiada: nenhum arquivo > ~1.200 linhas, testes verdes, zero mudança de comportamento.
- Métrica antes/depois: chamadas/hora ao motor no caminho de leitura (deve despencar).

## Riscos
- Casos raros que o webhook nunca cobriu (mensagem editada? status exótico?) apareciam via
  polling — mapear pelos tipos tratados no ingest antes de desligar; se achar gap, evento novo
  na outbox PRIMEIRO, desligar polling DEPOIS.
