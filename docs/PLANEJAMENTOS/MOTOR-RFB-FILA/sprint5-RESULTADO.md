# MOTOR-RFB-FILA — Sprint 5 · RESULTADO (02/07/2026)

> Executado no worktree `claude/laughing-sinoussi-dc9696` (Claude Fable 5). Typecheck estrito verde,
> 8/8 testes novos verdes, 18/18 testes existentes dos arquivos tocados verdes.
> **Decisão de GPU = do dono** — aqui vão os números.

## 1) GATE G3 — os 2 testes grátis (RESULTADO: GPU DESNECESSÁRIA pra extração)

Setup: Ollama local `:11434`, CPU-only (Ryzen 5 5500, 32GB). 12 leads BONS anotados (formatos
reais: rodapé, wa.me, dono explícito, legado sem 9, mailto, 0800, ofuscado) + **50 leads RUINS**
(isca de alucinação: CNPJ/CEP/preço/data/protocolo/NF-e/coordenada, zero contato real).
Prompt DEDICADO de extração idêntico pros 2 modelos, `think:false`, `temperature:0`,
`num_predict:300`, `num_ctx:8192`. Scripts: scratchpad `g3-fixtures.js`/`g3-run.js` (JSONL + resumo).

| Métrica | qwen3:30b-a3b-instruct (MoE ~3B ativo) | qwen2.5:7b (denso) + prompt dedicado |
|---|---|---|
| Set bom (12) — completo | **11/12** | 9/12 |
| — o que perdeu | só G10: **desofuscou** email "(arroba)" → útil, mas não-literal → gate segura (por desenho) | nome do dono 1×; 0800 1× (gate rejeitaria de qualquer forma); mesmo G10 |
| Leads ruins (50) — **contato INVENTADO** | **0/50** | **0/50** |
| Leads ruins — lixo literal extraído | 0/50 | 0/50 |
| Vazamento no gate (simulado) | 0 | 0 |
| Tempo/lead (bom · ruim, quente) | **7,6s · 4,7s** | 22,8s · 7,9s |

**Leituras que mudam decisão:**
1. **O medo "9/9 = 8 certos + 1 inventado" NÃO se confirmou**: 0 fabricação em 100 execuções de
   lead-ruim (50×2 modelos) com prompt que proíbe inventar + `temperature:0` + `format:json`.
2. **O 30B MoE roda em CPU a ~5-8s/lead** — 8× abaixo da régua "≥1min/lead = descartado".
   **Não há compra de GPU que se justifique pela extração.** (RTX 3060 12GB nem roda o 30B inteiro.)
3. O denso 7B é 2-3× mais LENTO que o 30B MoE em CPU (confirma ARCSCRAPING: velocidade = parâmetros
   ATIVOS). Prompt dedicado fechou boa parte do gap de qualidade do 7B (9/12 vs 11/12), mas não há
   motivo pra usá-lo na extração local: o 30B é melhor E mais rápido.
4. **Achado operacional crítico (medido)**: o 30B com `num_ctx` default (262k) aloca **45,7GB** de
   KV-cache → swap infinito na máquina de 32GB (requisição de 5min sem resposta). `num_ctx:8192`
   → 19GB, resposta em segundos. **Cap de `num_ctx` é obrigatório em TODA chamada ao 30B.**
5. Cold-load do 30B ≈ 3min (18,5GB do disco) > timeout default de 90s → primeira chamada de lote
   frio falha e retenta (degrade correto, 0 gravado). Quando a fila (sprint 4) chegar: warm-up
   ping antes do lote ou timeout maior no 1º item.
- Caveat honesto: fixtures sintéticas (~200-400 chars). Página real é maior/mais suja — o teto de
  fonte (`HBX_AI_EXTRACTION_MAX_SOURCE_CHARS`, default 6000) e o gate cobrem, mas vale medir no
  primeiro lote real da fila.

**Recomendação registrada: não comprar GPU pra extração; roteamento fixo mantido (extração → 30B
LOCAL batch; saneamento/ICP/mensagem → 7B na VPS). Decisão final = dono.**

## 2) Gate anti-alucinação (OBRIGATÓRIO no caminho de gravação) — NO AR (working tree)

`backend/src/webscraping/radar/persistence/lead-contact-gate.ts` — funções puras, 2 camadas:
- **Formato (sempre)**: telefone = DDD válido (plano Anatel) + regra-do-9 (11 díg. → 3º dígito 9;
  10 díg. → fixo 2-5; legado 10-díg. celular normaliza pro nono dígito ANTES) + blocklist
  (assinante repetido/sequência — inclusive a cauda pós-9: mata "(11) 98765-4321", O placeholder
  clássico de template BR). E-mail = sintaxe + blocklist de domínio (example/teste/sentry/wixpress…)
  + ruído de asset (`logo@2x.png`).
- **Proveniência (obrigatória no caminho LLM)**: telefone/e-mail têm que existir LITERALMENTE na
  fonte crawleada (dígitos tolerantes a separador e ao nono-dígito legado; sequências vizinhas NÃO
  se emendam); **nome do dono só sai se estiver escrito na fonte** (sem acento/caixa).
- Contato reprovado **NÃO grava** e nunca derruba o fluxo de quem descobriu.

## 3) LeadContact = caminho de escrita em TODOS os pontos de descoberta

Serviço único: `radar/persistence/lead-contact-write.service.ts` (gate embutido, `source` +
`confidence` OBRIGATÓRIOS, idempotente, best-effort, NUNCA fonte do presenter — presenter e
`detalhes-negocio.tsx` intocados).

| Ponto | Onde soldou | source | confidence |
|---|---|---|---|
| Chegada no pool (busca + L2 síncrono) | `radar-core-delivery.mixin.ts#persistRadarLeadPoolBatch` (fire-and-forget pós-save) | engine (`hbx`/`hbx_mass_data`/…) | email/social = do enrichment; phone 75 |
| L4/sócio (dataset + BrasilAPI) | `radar-cnpj-l4-enrichment.service.ts#enrichRow` (cobre backfill E fire-and-forget) | `cnpj_l4` | 85 (registro oficial) |
| Fábrica de e-mail (Local Lab) | `webscraping.service.ts#applyDiscoveredContactsForMaster` | `website_crawl` | email 70 · phone c/ WhatsApp confirmado 85, senão 50 · social 60 |
| Sociais do dono (backfill b2) | `webscraping.service.ts#cnpjBackfillForMaster` | `owner_social` | 55 (candidato) |
| Lead Harvest import (VPS oficial) | `lead-harvest-import.service.ts#persistAcceptedItemsToRadar` | `lead_harvest_import` | confidence do batch |
| **Extração 30B pós-gate** | `ai-contact-extraction.service.ts` + `POST /modules/owner/radar/ai-extract-contacts` | `ai_extraction` | 60 |

- Extração 30B: **default OFF** (`HBX_AI_EXTRACTION_ENABLED`), lote capado em 50, dono aprovado →
  `metadataJson.aiOwnerName` (separado do `ownerName` oficial do L4). "Extração como missão da
  fila" **depende do sprint 4 (executado na branch irmã `claude/confident-ramanujan-d836bc`, não
  aterrissou neste worktree)** — o motor+gate+endpoint estão prontos pra soldar na fila quando as
  branches convergirem.
- Envs novos (todas com default): `HBX_AI_EXTRACTION_ENABLED` (off), `_MODEL`
  (qwen3:30b-a3b-instruct-2507-q4_K_M), `_TIMEOUT_MS` (90000), `_NUM_CTX` (8192), `_MAX_TOKENS`
  (300), `_MAX_SOURCE_CHARS` (6000). Base URL = a MESMA `HBX_LLM_CLASSIFIER_URL` (`:11434` nunca
  exposto cru em outro lugar).

## 4) ACEITE — evidências

| Critério | Evidência |
|---|---|
| 50 leads ruins → 0 contato inventado gravado | (a) benchmark: 0 invenção em 50×2; (b) teste `lead-contact-gate.test.ts`: 50 candidatos adversariais → 0 aprovado, 0 create (mock prisma); (c) **prova viva**: serviços compilados + Postgres local + 30B real → fonte-ruim 0 gravado, fonte-boa 2 gravados c/ source/confidence + dono literal (lead descartável, removido) |
| Export "não reivindicados" devolve linhas reais | Cadeia completa validada ao vivo: cockpit :3107 → agent → backend → LeadContact = **9 linhas reais** (`claimedByCompanyId IS NULL`). A promessa do PR1 já estava soldada de ponta a ponta (botão `btn-export-unclaimed` + proxy + rota + service c/ filtro default unclaimed) — faltava só provar com dados. |
| Auditoria: nenhum contato só no blob | Rota nova `GET /modules/owner/radar/contacts/audit`. Local ANTES: 51 leads c/ contato, só 9 cobertos. `backfill-lead-contacts.js` ESTENDIDO (lia só metadataJson → agora também COLUNAS email/phone/social, `source='columns_backfill'`) e rodado: **51/51 cobertos** (+63 linhas). Novos contatos fluem pelos 6 pontos da tabela acima. |
| Typecheck estrito + testes | `tsc` verde; 8/8 novos; 18/18 existentes dos arquivos tocados; smoke geral 179/182 — **as 3 falhas são PRÉ-EXISTENTES no master** (cnpj_public ×2 + strategy deep ×1, confirmado via `git stash`; já rastreadas pelo chip task_efd2ea09 da sessão do Sprint 3). |

## 5) Desmonte oportunista do RadarCore (regra do escoteiro)

- **Feito**: o trecho de persistência de contato saiu do monólito (`webscraping.service.ts` método
  privado morto) pra serviço NestJS com contrato explícito (`LeadContactWriteService`); o delivery
  mixin consome via getter lazy (mesmo padrão do `getCnpjL4Enrichment`).
- **Alvo 1 (mass-data)**: NÃO tocado — condição era "se o sprint 4 já reescreveu o pump"; sprint 4
  não aterrissou neste worktree. **Alvo 2 (distribution/pickLeadsForEnrichment)**: NÃO tocado —
  gaps de preferência do vendedor não entraram no escopo tocado deste sprint. Nunca big-bang.

## 6) Pendências / próximo

1. **Convergência com sprint 4** (branch `claude/confident-ramanujan-d836bc`): soldar
   `AiContactExtractionService` como missão da fila (fonte = crawl L2 da missão); warm-up do 30B
   no início do lote.
2. **VPS no publish**: rodar `node scripts/backfill-lead-contacts.js` (agora cobre colunas) e
   conferir `GET /modules/owner/radar/contacts/audit`.
3. 3 testes pré-existentes quebrados no master (chip task_efd2ea09, sessão do Sprint 3).
4. L5/WhatsApp intocado: validação de WhatsApp continua SÓ pela rotina do app — o gate NÃO fala
   com Webwhats; confiança 85 no apply-contacts vem do check em lote já existente.
