# Plano 16072026 — Sprint 0 — contrato e baseline

Status: **contrato técnico fechado; decisões do Gate C aguardando Jhonatan**  
Data: **16/07/2026**  
Produção alterada: **não**  
Migration criada/aplicada: **não**

## 1. Resultado da Sprint 0

O fluxo atual foi inventariado e o contrato seguro do novo estágio foi delimitado. A implementação não pode reaproveitar `enrich_lead`/`xray_note` nem o `MissionResultApplyService`, porque esses caminhos devolvem o resultado ao backend e não concluem Radar, contatos, Vendas, auditoria e missão numa única transação.

O baseline sanitizado e os 14 sentinelas de Xangri-lá estão em `Plano 16072026 - Sprint 0 - baseline-sanitizado.json`.

## 2. Baseline verificado

Captura: **16/07/2026 19:35 BRT**.

- `master` de referência: `23dfb1e6`.
- backup anterior à execução: `8110f855`.
- VPS: backend, webscraping, scraper e PostgreSQL rodando.
- fila: 384 missões `enrich_search_item`, todas concluídas; nenhum estágio destinado ao localhost.
- flags: fila ligada, 4B desligado, modelo configurado como `qwen3:4b-instruct`.
- Xangri-lá: 14 cards, todos entregues em Vendas e cada um com um vínculo tenant-safe.
- Xangri-lá: 3 com site, 10 com e-mail, 14 com telefone e zero com `aiSaneamento`, `aiNote` ou `ponte_30b`.
- local: Local Lab e Ollama ativos; nenhum modelo residente; 30B frio.
- Owner: porta ativa, mas a leitura de status excedeu oito segundos no momento da captura.

Nenhum nome, contato, CNPJ, credencial ou ID bruto foi salvo no snapshot.

## 3. Choke points atuais

### Persistência e busca

1. `saveSearchRunResults` grava `WebscrapingSearchRunItem`.
2. `syncRadarSearchRunItemsToPool` materializa itens no `RadarLeadPool`.
3. `persistRadarLeadPoolBatch` concentra o create/update do pool.
4. A materialização ainda depende do caminho que monta a resposta da busca; o reconciliador novo deve cobrir busca concluída sem leitura posterior.
5. Os IDs do pós-save atual são de `WebscrapingSearchRunItem`; o novo estágio só pode nascer depois que existir um `RadarLeadPool.id` real.

### Puxada, débito e entrega

1. `pullRadarLeadsToVendasForUser` seleciona o card.
2. `importRadarLeadToVendasForUser` reserva o crédito antes da gravação.
3. O vínculo correto é `RadarLeadCompanyState(companyId, radarLeadId) -> vendasLeadId`.
4. `sourceHistoryId = radar:<radarLeadId>` é compatibilidade, não autorização.
5. O writer local não pode usar telefone como fallback para localizar Vendas.

### Fragilidades congeladas no baseline

- A consolidação final da entrega suprime erro em parte da transação atual.
- O 4B pós-entrega usa memória/`setTimeout` e perde trabalho em restart.
- O fallback do 4B ainda é `qwen2.5:7b` no serviço, apesar da env de produção apontar para 4B.
- O status da ponte soma contatos históricos do lead, não o delta da missão.
- O worker atual pausa por usuário ativo, abre circuito permanente e exige reset manual.
- O Local Lab persiste arquivos, mas não recarrega jobs no startup.

Esses itens não serão copiados para o fluxo novo.

## 4. Contrato da missão

Stage exclusivo:

```text
local_deep_enrich_v1
```

Consumidor exclusivo: **worker local do Owner**.

O VPS nunca pode consumir esse stage. O worker local nunca pode receber `enrich_search_item`. Todo lease público deve exigir lista explícita de stages; lista vazia não significa “todos”.

### Colunas materiais obrigatórias em `RadarMission`

- `companyId Int?`
- `radarLeadId String?`
- `requestedByUserId Int?`
- `runId String?`
- `workVersion Int?`
- `consumerKind String`
- `startedAt DateTime?`
- `lastPhase String?`
- `receiptJson Json?`

Permanecem: prioridade, tentativas, `nextAttemptAt`, lease, worker, heartbeat, erro, resultado e timestamps.

Índice idempotente do stage local:

```text
unique(stage, radarLeadId, workVersion)
```

Reemitir a mesma versão retorna a mesma missão e nunca rearma uma missão terminal. Retry usa a mesma missão; novo trabalho exige nova `workVersion`.

### Versão de trabalho

`workVersion` muda somente quando dados relevantes para o crawl mudarem. A primeira implementação deverá derivá-la de um hash estável de:

- identidade canônica do lead;
- site/fontes conhecidas;
- cidade/UF;
- versão do contrato/prompt.

Status comercial, crédito, responsável, notas privadas e contadores não participam do hash.

## 5. Contrato de commit

Função versionada:

```text
hbx_commit_local_enrichment_v1(jsonb)
```

### Entrada

```json
{
  "contractVersion": "local_deep_enrich_v1",
  "mission": {
    "id": "mission-id",
    "leaseId": "lease-id",
    "workerId": "worker-id",
    "radarLeadId": "radar-lead-id",
    "companyId": 123,
    "workVersion": 1,
    "correlationId": "correlation-id",
    "requestHash": "sha256"
  },
  "evidence": [
    {
      "id": "evidence-1",
      "sourceUrl": "https://exemplo.test/contato",
      "pageType": "contact",
      "capturedAt": "2026-07-16T22:00:00.000Z",
      "contentHash": "sha256",
      "excerpt": "trecho curto e literal"
    }
  ],
  "delta": {
    "contacts": [],
    "people": [],
    "radarPatch": {},
    "vendasPatch": {},
    "metadataBlock": {}
  },
  "noNewData": false
}
```

Todo contato, pessoa e promoção de campo deve apontar para um `evidence.id`. HTML bruto não entra no contrato.

### Recibo

```json
{
  "missionId": "mission-id",
  "idempotentReplay": false,
  "radarLeadId": "radar-lead-id",
  "companyId": 123,
  "createdContactIds": [],
  "createdPersonIds": [],
  "radarFieldsUpdated": [],
  "vendasLeadIds": [],
  "vendasFieldsUpdated": [],
  "noNewData": true,
  "committedAt": "2026-07-16T22:00:00.000Z"
}
```

Sem descoberta também gera recibo e conclui a missão.

## 6. Precedência por campo

### Permitido automaticamente

| Destino | Regra |
|---|---|
| `LeadContact` | append/upsert normalizado, evidência literal obrigatória e `missionId` rastreável |
| `LeadPerson` | dono/sócio/cargo somente quando literal; canais continuam em `LeadContact` |
| Radar `email` | preencher apenas vazio, com e-mail literal e domínio compatível |
| Radar `website` | preencher apenas vazio, após evidência de site oficial |
| Radar `address` | preencher apenas vazio e com evidência literal da mesma empresa |
| Radar `instagramUrl`/`facebookUrl` | preencher apenas vazio e com vínculo claro à empresa |
| Radar status de e-mail/social/site | atualizar somente junto da promoção correspondente; nunca rebaixar confirmação |
| Radar `rating`/`reviews` | somente valor maior e com fonte identificada |
| Vendas `email`/`website`/`address` | preencher apenas vazio e somente pelo vínculo `RadarLeadCompanyState` correto |
| Vendas `rating`/`reviews` | somente valor maior |
| Metadata | merge apenas no bloco `localDeepEnrich`; preservar todos os irmãos |
| Timeline | um evento idempotente por missão, com resumo exato do delta |

### Proibido

- nome, CNPJ, `placeId` ou identidade canônica;
- cidade, UF ou segmento canônicos;
- ownership, campanha, aquisição paga ou vínculo de tenant;
- crédito, pagamento, plano, entitlement, usuário ou configuração comercial;
- status do Radar/Vendas, pipeline, resultado, responsável ou agenda;
- negativos, reclamações, contadores e histórico;
- notas manuais, comissão e dados de venda;
- apagar dados ou substituir JSON completo;
- sobrescrever valor não vazio;
- localizar Vendas por telefone;
- aceitar evidência ausente, inválida ou de outra empresa.

Telefone novo entra primeiro em `LeadContact`. Promoção para telefone principal está no Gate C.

## 7. Tenant e Vendas

`RadarLeadPool.companyId` e `ownerCompanyId` não bastam como autorização.

A função deve:

1. travar e validar a missão;
2. travar o Radar lead indicado;
3. resolver `RadarLeadCompanyState` no banco;
4. exigir `vendasLead.companyId = radarLeadCompanyState.companyId`;
5. atualizar somente Vendas com aquisição válida e `vendasLeadId` explícito;
6. abortar tudo se qualquer tenant divergir.

O worker nunca escolhe quais empresas recebem a atualização; ele só envia a missão e o delta.

## 8. Transação única

A função executa, nesta ordem:

1. `lock_timeout` e `statement_timeout` curtos;
2. `FOR UPDATE` da missão e do Radar lead;
3. valida stage, contrato, versão, lease, worker, expiração e hash;
4. detecta replay e retorna o recibo existente;
5. valida evidências e allowlist estrutural;
6. insere contatos/pessoas com dedupe;
7. aplica campos permitidos no Radar;
8. aplica campos permitidos em Vendas pelo vínculo tenant-safe;
9. grava timeline e auditoria append-only;
10. grava recibo e marca missão `completed`;
11. retorna o recibo após o commit.

Hash igual retorna o mesmo recibo. Hash diferente para a mesma missão aborta. Qualquer erro desfaz tudo.

## 9. Auditoria e reversão

Nova auditoria append-only deve guardar:

- missão, lead, empresa e worker;
- versão/hash de request e resultado;
- before mínimo por campo;
- delta efetivo;
- contatos/pessoas criados;
- Vendas afetadas;
- hashes/URLs de evidência;
- início, commit e duração;
- recibo integral.

Reversão só remove o que a missão criou e só restaura campo cujo valor atual ainda é exatamente o escrito pela missão. Edição posterior é preservada.

## 10. Papel técnico e canal

- PostgreSQL nunca expõe `5432` publicamente.
- O canal usa túnel privado.
- O usuário do Windows recebe apenas `CONNECT`, `USAGE` no schema privado e `EXECUTE` na função.
- Nenhum DML direto em tabelas.
- Função `SECURITY DEFINER`, owner sem login, `search_path` fixo e `PUBLIC` revogado.
- Segredo não entra em repo, log, payload, painel ou linha de comando exibida.
- O worker confirma banco/contrato/ambiente antes de leasear.

## 11. Emissão e reconciliador

- Emitir depois que o `RadarLeadPool.id` existir.
- A emissão é uma escrita curta, sem HTTP para o PC.
- Falha de enqueue nunca falha busca, débito ou entrega.
- O reconciliador busca leads elegíveis sem missão da versão atual e usa o mesmo unique para não duplicar.
- Card recém-puxado ganha prioridade maior, sem criar uma segunda missão para a mesma versão.
- O stage local ignora pausa da fábrica e atividade de usuário; mantém concorrência local 1, pacing, limites de recurso e backoff técnico.

## 12. 4B e 30B

### 4B VPS

- missão durável própria, assíncrona e independente do PC;
- modelo obrigatório `qwen3:4b-instruct`;
- metadata própria com modelo, prompt/contrato, início, fim, duração, tentativa e erro;
- nunca segura nem remove card;
- não sobrescreve o bloco 30B.

### 30B local

- recebe evidências do Local Lab;
- produz um delta estruturado;
- não repete saneamento rápido do 4B;
- usa o bloco `localDeepEnrich` e o recibo transacional.

## 13. Journal e recuperação local

Fases persistidas por gravação atômica:

```text
leased -> crawling -> inference_30b -> ready_to_commit -> committed
```

Persistir missão, workVersion, hashes, lease, job do Lab, fase e recibo. Crash antes do commit reexecuta com segurança; crash depois do commit faz replay e recebe o mesmo recibo. Circuito técnico usa `openUntil` e probe half-open automático, nunca reset manual.

## 14. Dataset sentinela sintético

Além dos 14 hashes reais, os testes usarão sentinelas sintéticos:

1. site oficial com telefone/e-mail novos;
2. sem site e sem novidade;
3. social-only;
4. diretório de terceiro;
5. CNPJ divergente;
6. contato duplicado;
7. campo manual já preenchido;
8. vínculo Vendas do mesmo tenant;
9. tentativa de tenant cruzado;
10. lease expirada;
11. replay idêntico;
12. replay com hash divergente;
13. falha no meio da transação;
14. resultado tardio depois da entrega.

## 15. Decisões do Gate C

| Decisão | Recomendação técnica |
|---|---|
| Alcance do enriquecimento | Global no Radar para evidência pública; propagação para Vendas somente após aquisição tenant-safe |
| Telefone principal | Promover apenas se vazio, WhatsApp confirmado e sem conflito de unicidade; caso contrário, só `LeadContact` |
| CNPJ encontrado localmente | Guardar apenas como evidência de conferência; nunca promover para identidade canônica |
| Metadata 30B | Novo bloco `localDeepEnrich`; manter `aiNote` legado intacto até o cutover |
| `contactSnapshotJson` | Atualizar apenas como snapshot compatível; não torná-lo fonte de verdade |
| Retenção/reversão | Sem purge durante canário; definir prazo antes da liberação integral e restringir reversão a System Master |
| Credencial Windows | Papel dedicado via túnel, segredo no gerenciador seguro do Windows e rotação operacional definida |

Nenhuma migration, writer ou acesso direto ao banco será criado antes da aprovação destas decisões.

## 16. Gates de teste

- índice físico de `LeadContact` confirmado;
- papel restrito incapaz de DML/DDL/DELETE;
- tenant divergente causa rollback total;
- lease errada/expirada é recusada;
- replay idêntico retorna o mesmo recibo;
- replay com hash diferente falha;
- concorrência não duplica missão/contato;
- falha em cada etapa deixa zero gravação parcial;
- metadata preserva irmãos;
- campo manual/não vazio permanece;
- resultado vazio conclui com recibo;
- PC desligado não altera busca, débito ou entrega;
- VPS consome só `enrich_search_item`;
- local consome só `local_deep_enrich_v1`;
- reinícios de Owner, Lab, Ollama, SSH e banco recuperam automaticamente;
- tudo primeiro em PostgreSQL descartável, nunca em produção.
