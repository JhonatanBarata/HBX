# Radar - Relatorio operacional pos-refatoracao

Range auditado: `e42be56..c1f1e38`

Data: 2026-05-31

## Smoke operacional

Arquivo de smoke criado:

- `backend/src/webscraping/radar-operational-smoke.test.ts`

Comando executado:

```bash
node --test dist/webscraping/radar-operational-smoke.test.js
```

Resultado: 8/8 testes passaram.

## Confirmacoes

### 20 cards PJ com HBX

Validado por smoke sintetico com 20 cards `targetType=pj`, `source=hbx_engine`, todos qualificados pelo `RadarQualityGateService` e marcados como `deliveryStatus=delivered` pelo `RadarDeliveryOrchestratorService`.

Status: aprovado.

### Social pending/error nao bloqueia delivery

Validado com `socialStatus=pending` no estado entregue e falha posterior em `stage=social`.

Resultado esperado confirmado:

- `deliveryStatus` permanece `delivered`;
- `leadStatus` permanece `qualified`;
- issue social fica `blocksDelivery=false`;
- post-delivery fica retryable.

Status: aprovado.

### Website crawl nao bloqueia delivery

Validado com `HBX_RADAR_WEBSITE_CRAWL_LIGHT_ENABLED=true` e provider falhando por exception.

Resultado esperado confirmado:

- source `website_crawl_light`;
- `status=partial_error`;
- `retryable=true`;
- `issue.blocksDelivery=false`.

Status: aprovado.

### CNPJ/local/vertical falham como optional

Validado com as flags ligadas e providers de CNPJ, diretorio local e vertical falhando por exception.

Resultado esperado confirmado:

- `cnpj_public`, `local_directory` e `vertical_source` retornam `partial_error`;
- todas ficam `retryable=true`;
- todas ficam `blocksDelivery=false`.

Status: aprovado.

### Vendas recebe card

Validado pelo estado entregue do `RadarDeliveryOrchestratorService`.

Resultado esperado confirmado:

- `vendasLeadId` persistido no patch;
- `deliveryStatus=delivered`;
- `postDeliveryUpdate.status=scheduled`.

Status: aprovado.

### Post-delivery update nao duplica evento

Foi aplicada deduplicacao no `RadarPostDeliveryVendasUpdateService` antes de gravar timeline em Vendas.

Regra:

- antes de `createMany`, o service consulta eventos existentes do mesmo `leadId`, `sourceType=radar_enrichment` e `eventType`;
- evento ja existente nao e criado novamente.

Smoke validou duas execucoes consecutivas do mesmo update sem crescimento duplicado de timeline.

Status: aprovado.

### WhatsApp confirmed continua vindo do WebWhats ou de status ja confirmado

Foi aplicada trava no `RadarResultMergerService`.

Regra:

- `website_crawl_light` nao promove `whatsappStatus` para `confirmed`;
- fonte nao confiavel que tentar enviar `confirmed` e rebaixada para `unverified`;
- `webwhats_check`, `whatsapp_check`, `webwhats`, `radar_database` e `company_history` podem preservar/promover `confirmed`;
- se o lead ja estava `confirmed`, fonte posterior nao remove a confirmacao.

Smoke validou:

- `website_crawl_light` com `confirmed` vira `unverified`;
- `webwhats_check` com `confirmed` permanece `confirmed`;
- `radar_database` ja confirmado permanece `confirmed` mesmo com crawl posterior.

Status: aprovado.

### importedCount nao foi alterado por enriquecimento

Validado por smoke estatico nos services de enriquecimento e post-delivery:

- `radar-post-delivery-update.service.ts`;
- `radar-post-delivery-vendas-update.service.ts`;
- `radar-enrichment-job-pipeline.service.ts`.

Resultado esperado confirmado: enriquecimento/post-delivery nao alteram `importedCount`.

Status: aprovado.

## Regressao executada

Comandos executados no backend:

```bash
npm run build
node --test dist/webscraping/radar-operational-smoke.test.js
node --test dist/webscraping/radar-search-engine.test.js
node --test dist/webscraping/radar-delivery-orchestrator.test.js dist/webscraping/radar-post-delivery-vendas-update.test.js dist/webscraping/radar-enrichment-job-pipeline.test.js
node --test dist/webscraping/radar-diagnostics.test.js dist/webscraping/radar-social-engine.test.js dist/webscraping/radar-lead-enrichment.test.js dist/webscraping/radar-opportunity-signal.test.js
```

Resultados:

- build: aprovado;
- smoke operacional: 8/8;
- search engine: 52/52;
- delivery/post-delivery/enrichment pipeline: 12/12;
- diagnostics/social/enrichment/opportunity: 22/22.

## Conclusao operacional

O Radar pos-refatoracao manteve a regra principal: lead qualificado continua entregavel mesmo com falhas opcionais.

Pontos consolidados:

- fonte opcional nao bloqueia delivery;
- social pending/error nao bloqueia delivery;
- website crawl nao bloqueia delivery;
- CNPJ/local/vertical falham de forma retryable e nao bloqueante;
- Vendas recebe card entregue;
- post-delivery update nao duplica evento de timeline;
- `whatsappStatus=confirmed` nao nasce de website crawl;
- enriquecimento nao altera `importedCount`.
