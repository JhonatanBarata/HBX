# Auditoria e reconstrução do Motor de Busca do Radar Digital

Data: 2026-05-19
Repo: `JhonatanBarata/HBX`
Base auditada: `master` atual no GitHub. Observação: o ref curto `fdf422c` informado no chat não foi encontrado pela API do GitHub; a auditoria foi feita sobre o `master` acessível.

## Diagnóstico direto

O problema não é simplesmente “o motor não dá conta”. O desenho atual mistura quatro responsabilidades no mesmo fluxo:

1. gerar queries para achar contatos públicos;
2. persistir candidatos no Radar;
3. decidir qualidade/comercial/billable;
4. renderizar no front como se tudo fosse uma busca única e previsível.

Isso cria a sensação de “Google faria isso fácil”, porque o usuário pede uma busca humana simples, mas o HBX está tentando ao mesmo tempo coletar, limpar, enriquecer, proteger negativos, aplicar plano comercial, aplicar canal obrigatório e ainda autoenviar para Vendas em alguns fluxos mobile.

A reconstrução correta é separar arquitetura, contrato de backend e experiência de front.

## Regra-mãe do produto

O Radar Digital é o banco único de oportunidades do HBX. O fluxo obrigatório continua:

`Radar -> Vendas -> WhatsApp/contato permitido -> Retorno`

O motor é invisível para o cliente comum. O cliente pede: cidade, segmento, tipo e canais desejados. O sistema responde com cards úteis, status claro e motivo quando não achou.

Negativos, bloqueios, opt-out, recusas, descartes e inválidos são dados vitais. Eles nunca devem ser apagados automaticamente e nunca devem voltar como oportunidade limpa.

## Arquitetura nova do motor

### 1. SearchIntent

Criar um objeto interno único antes de qualquer busca:

```ts
type RadarSearchIntent = {
  city: string;
  state: string;
  segment: string;
  targetType: 'pj' | 'pf' | 'agenda_pf';
  quantity: number;
  radiusKm: number;
  requiredChannels: RadarChannel[];
  preferredChannels: RadarChannel[];
  channelMatchMode: 'prefer' | 'any_required' | 'all_required';
  qualityMode: 'list' | 'lead_plus';
  salesProfile?: LeadQualityV2SalesProfile | null;
};
```

Não deixar o front construir semântica escondida. O front monta intenção; o backend decide execução.

### 2. QueryPlanner

Extrair a geração de queries de `webscraping.service.ts` para um planner testável:

`backend/src/webscraping/radar-search-query-planner.ts`

Contrato:

```ts
export function buildRadarSearchPlan(intent: RadarSearchIntent): RadarSearchPlan
```

O plano deve retornar:

```ts
type RadarSearchPlan = {
  intent: RadarSearchIntent;
  tasks: Array<{
    query: string;
    city: string;
    state: string;
    segment: string;
    sourceHints: Array<'maps' | 'site' | 'phone' | 'whatsapp' | 'directory'>;
    strictness: 'exact' | 'expanded' | 'fallback';
  }>;
  diagnostics: {
    selectedSegments: string[];
    selectedCities: Array<{ city: string; state: string; distanceKm?: number | null }>;
    warnings: string[];
  };
};
```

Regras do planner:

- PJ nunca pode gerar query genérica sem nicho.
- Rede social pedida não vira fonte primária da primeira busca. Instagram/Facebook são canais de enriquecimento/validação, não substitutos da busca principal.
- Categoria ampla deve ser explodida em segmentos comerciais reais.
- Query deve ser humana e parecida com o que alguém digitaria no Google: `{segmento} {cidade} {UF} telefone`, `{segmento} {cidade} {UF} whatsapp`, `{segmento} {cidade} {UF} site`, `{segmento} {cidade} {UF} maps`.
- Não usar “empresa” como nicho quando o usuário pediu segmento específico.
- Limite de 5 segmentos selecionados continua correto, mas cada segmento deve manter identidade própria no `searchScope`.

### 3. CandidateNormalizer

Criar camada separada:

`backend/src/webscraping/radar-candidate-normalizer.ts`

Responsável por transformar qualquer retorno do motor em candidato canônico:

```ts
type RadarCandidate = {
  placeId: string;
  name: string;
  phone: string;
  phoneDigits: string;
  city?: string | null;
  state?: string | null;
  segment?: string | null;
  website?: string | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  email?: string | null;
  sourceUrl?: string | null;
  sourceEngine?: string | null;
  rawEvidence: Record<string, any>;
};
```

Regras:

- normalizar telefone uma vez;
- dedupe principal por `phoneDigits` quando houver;
- fallback de dedupe por `name + city + website/sourceUrl` quando não houver telefone;
- nunca descartar candidato real só por não ter telefone se ele tem canal público social/site/e-mail útil;
- nunca aprovar título de diretório, notícia, ranking, guia genérico ou HTML entity antiga como empresa real.

### 4. QualityDecision

Extrair a decisão de entrega para:

`backend/src/webscraping/radar-quality-decision.ts`

Contrato:

```ts
type RadarQualityDecision = {
  decision: 'deliver' | 'review' | 'skip' | 'protect';
  status: 'approved' | 'weak_contact' | 'segment_mismatch' | 'generic_directory' | 'invalid' | 'duplicate' | 'protected';
  billable: boolean;
  debitEligible: boolean;
  visibilityTier: 'list_basic' | 'enrichment_pending' | 'lead_plus_qualified' | 'review_backup' | 'blocked';
  reason: string;
  scores: {
    segmentMatch: number;
    contactQuality: number;
    commercial: number;
    finalRank: number;
  };
};
```

Regras comerciais:

- HBX List entrega card real básico mesmo com inteligência fraca.
- Lead+ pode entregar candidato fraco como `review_backup`, mas sem débito se não estiver qualificado.
- Crédito só conta quando card útil é entregue/importado com sucesso conforme regra comercial.
- Duplicado, negativo, opt-out, bloqueado, sem aderência, diretório genérico e erro de enriquecimento não contam como gasto.
- Protegido sempre vence qualquer score.

### 5. RadarRepository

Separar persistência de decisão:

`backend/src/webscraping/radar-lead-repository.ts`

Responsável por:

- buscar negativos/protegidos por telefone, leadId, nome/cidade quando necessário;
- upsert de `RadarLeadPool`;
- gravar histórico/evento;
- nunca reabrir negativo automaticamente;
- manter `enrichmentJson`, `metadataJson`, `quality`, `qualityV2` e `sourceEngines` coerentes.

### 6. SearchRun Orchestrator

`WebscrapingService` deve virar orquestrador, não depósito de regra.

Fluxo desejado:

```txt
Controller DTO
 -> normalize intent
 -> QueryPlanner
 -> EnginePool executes task
 -> CandidateNormalizer
 -> QualityDecision
 -> RadarRepository upsert/history
 -> SearchRun response with diagnostics
 -> Front renders progress/cards/reasons
```

## Backend: alterações obrigatórias

### Arquivos principais

- `backend/src/webscraping/webscraping.service.ts`
- `backend/src/webscraping/webscraping.controller.ts`
- `backend/src/webscraping/webscraping.service.test.ts`
- criar `backend/src/webscraping/radar-search-query-planner.ts`
- criar `backend/src/webscraping/radar-candidate-normalizer.ts`
- criar `backend/src/webscraping/radar-quality-decision.ts`
- criar `backend/src/webscraping/radar-lead-repository.ts`

### Contrato dos endpoints

Preservar endpoints existentes:

- `GET /webscraping/radar/leads`
- `POST /webscraping/radar/pull`
- `POST /webscraping/radar/search-runs`
- `GET /webscraping/radar/search-runs/:id`
- `POST /webscraping/radar/search-runs/:id/cancel`
- `POST /webscraping/radar/leads/mark-sent-to-vendas`
- `POST /webscraping/radar/:id/negative`

O backend nunca deve devolver 500 cru para o Radar. Deve devolver resposta client-safe com `code`, `message`, `retryable`, `meta`.

### Campos de resposta obrigatórios para o front

Todo search-run deve retornar:

```ts
meta: {
  requestedQuantity: number;
  deliveredCount: number;
  rawFoundCount: number;
  approvedCount: number;
  rejectedCount: number;
  skippedCount: number;
  duplicateCount: number;
  protectedCount: number;
  queryTaskCount: number;
  currentQuery?: string | null;
  searchScope?: {
    currentCity?: string | null;
    currentState?: string | null;
    currentSegment?: string | null;
    taskIndex?: number | null;
    taskCount?: number | null;
    selectedSegments?: string[];
  } | null;
  qualitySummary: {
    found: number;
    approved: number;
    rejected: number;
    discarded: number;
    label: string;
  };
}
```

## Front: reconstrução de experiência

Arquivo principal:

`frontend/src/app/radar-digital/page.client.tsx`

### Regra de UX

O usuário não quer saber de “motor HBX/Google”. Ele quer resultado.

Desktop pode mostrar cockpit e diagnóstico. Mobile deve ser simples:

1. O que você vende / segmento
2. Cidade / região
3. Canais desejados
4. Buscar cards
5. Ver resultado com motivo
6. Enviar conscientemente para Vendas

### Remover comportamento perigoso

Remover autoimport mobile oculto. O estado `mobileAutoImportPending` não deve enviar automaticamente para Vendas depois da busca. O usuário deve ver cards e tocar em `Enviar para Vendas`.

Motivo: o Radar é banco e triagem; Vendas é ação. Misturar os dois cria sensação de sistema descontrolado e pode gastar crédito/importar lixo sem consentimento claro.

### Mensagens claras

Quando não encontrar:

- “O motor buscou X fontes, encontrou Y candidatos, aprovou Z. Os demais foram barrados por diretório genérico, segmento errado, negativo ou canal obrigatório ausente.”

Quando achar pouco:

- “Achei poucos cards úteis. Posso ampliar para cidades próximas ou usar segmento mais amplo.”

Quando o filtro social cortar tudo:

- “Instagram/Facebook obrigatório cortou os cards encontrados. Remova o canal obrigatório ou rode enriquecimento.”

### Tela de cards

Cada card deve mostrar:

- nome;
- cidade/segmento;
- canais encontrados;
- motivo da oportunidade;
- score simples;
- status: disponível, em vendas, negativo, protegido;
- ações: enviar para Vendas, enriquecer, descartar, negativo.

Premium continua com coroa/teaser, mas sem esconder card básico do HBX List.

## Testes obrigatórios

Adicionar/garantir testes para:

1. QueryPlanner PJ não gera query sem nicho.
2. QueryPlanner explode categoria ampla em segmentos reais.
3. QueryPlanner não usa Instagram/Facebook como query primária.
4. CandidateNormalizer rejeita diretório genérico e ranking.
5. CandidateNormalizer aceita card real com social/site mesmo sem telefone.
6. QualityDecision protege opt-out/negative/blocked acima de qualquer score.
7. QualityDecision List entrega card básico real sem exigir enriquecimento premium.
8. QualityDecision Lead+ entrega backup sem débito quando fraco.
9. RadarRepository nunca reabre negativo automaticamente.
10. SearchRun retorna diagnóstico `rawFound/approved/rejected/skipped/duplicate/protected`.
11. Front não autoimporta no mobile.
12. Front mostra mensagem acionável quando filtro obrigatório corta tudo.

## Critério de aceite

A reconstrução só está aprovada se:

- pesquisar `pizzarias Rio Claro SP` retorna cards reais ou explica com contadores por que não retornou;
- pesquisar `oficinas Campinas SP` não retorna ranking, guia, notícia nem resultado genérico;
- filtro Instagram obrigatório não transforma busca em “pesquisar Instagram no Google”; ele filtra/enriquece depois;
- card negativo/opt-out nunca reaparece como disponível;
- HBX List recebe card básico útil;
- Lead+ recebe inteligência extra quando houver, mas não bloqueia toda entrega por falta de enriquecimento;
- mobile não manda para Vendas sozinho;
- `/webscraping/radar/leads` não depende de `engine` para listar estoque;
- falha de motor aparece como mensagem client-safe, não 500 cru;
- os testes documentam a regra para ninguém quebrar depois.

## Ordem de execução recomendada

1. Criar `radar-search-query-planner.ts` e migrar `buildHbxBatchQueryVariants`, `buildHbxBatchQueryTasks`, `buildHbxBatchQueries` para ele.
2. Criar testes unitários do planner.
3. Criar `radar-candidate-normalizer.ts` e mover higiene/dedupe primário.
4. Criar `radar-quality-decision.ts` e mover classificação comercial.
5. Criar `radar-lead-repository.ts` ou pelo menos encapsular protected statuses/upsert.
6. Simplificar `WebscrapingService` para orquestrar.
7. Ajustar `page.client.tsx` para remover autoimport e exibir diagnóstico real.
8. Rodar testes backend e build front.

## Fronteira do que NÃO fazer agora

- Não apagar negativos.
- Não recriar containers da VPS por causa deste ajuste.
- Não transformar Google em dependência obrigatória se o HBX engine já estiver coletando.
- Não esconder falha com mensagem genérica sem contadores.
- Não fazer WhatsApp cold blast como promessa de produto.
- Não refatorar módulos fora do fluxo Radar -> Vendas nesta tarefa.
