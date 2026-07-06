# 04 — Cofre de créditos: auditoria de vazamento + confirmação + teto/dia + flags

## Objetivo
Fechar o meio-termo entre o Biz hostil ("estourou, cobra sem perguntar") e o HBX liberal
(scrapeable): **contagem grátis, prévia mascarada, débito só no puxar COM confirmação
explícita, teto de velocidade, alarme de scraper** — e o caminho pra ligar as flags de
enforcement que já estão em prod OFF.

## Por quê ($)
A base RFB 28M enriquecida é O ativo. Liberal demais = alguém pagina a vitrine e leva o
estoque de graça. Hostil demais = churn (cobrança surpresa é o que enche Reclame Aqui dos
concorrentes). Confirmação explícita é vantagem competitiva de confiança, não fraqueza.

## Estado atual (verificado/memória)
- Mascaramento da vitrine **já é server-side**:
  [radar-core-presentation.mixin.ts](../../backend/src/webscraping/radar/06-presentation/radar-core-presentation.mixin.ts)
  — `buildRadarLeadPublic(..., maskContact)` zera `phone/phoneDigits/email` (l.2442),
  `maskRadarSmartFieldsForList` (l.2014), flag `vitrine` (l.2968).
- Débito Q1 ao puxar: cota da EMPRESA, idempotente `radar:<id>` (conferido em prod 05/07).
- Carteira S1-S6 + S3-p2 recarga MP + R1 gate + R2 kill-switch + S4 teto vendedor
  **publicados 05/07 (`df1bc298`) com flags de enforcement OFF**. RBAC S8 em prod.
- Working tree TEM trabalho ativo desta frente (cutover vitrine 06-07:
  `credits-public.controller.ts`, `credits-storefront.ts`, docs `CUTOVER-06-07-VITRINE*.md`)
  — **ler esses docs primeiro; este plano complementa, não colide**.

## Desenho

### Etapa 1 — Auditoria de vazamento (antes de qualquer flag)
Provar por teste que **contato só sai no payload DEPOIS do débito**, em TODO endpoint que
devolve lead/empresa:
- vitrine/prateleira (mask ok — cobrir com teste de regressão);
- detalhe `:id` (o aside/página mostram contato? só pós-débito?);
- endpoints do núcleo (Contas/Contatos), busca de empresas, relatórios, export se houver;
- WebSocket/eventos se algum push carregar lead.
Qualquer buraco = correção imediata (mask server-side no presenter, mesmo padrão do mixin).
Entregável: teste de integração "scraper simulado" que pagina a vitrine e afere que nunca
recebe telefone/e-mail sem débito.

#### RESULTADO DA AUDITORIA (Opus, 06/07) — 3 furos CONFIRMADOS no código
Causa-raiz: a máscara de contato está presa à flag `vitrine`, mas a visibilidade de
contato deveria ser gated por **POSSE do lead** (`ownerCompanyId === companyId` = a empresa
já puxou). O portão atual (`canUseRadarSmartLeadFields`) é só de PLANO ("HBX Lead Plus ou
superior", `webscraping.service.test.ts:2338`) — libera SE a empresa paga plano, não SE
puxou o lead. `buildRadarLeadPublic` só zera contato quando recebe `maskContact:true`
([mixin:2442]) e várias chamadas não passam a flag:

1. **PIOR — `GET /webscraping/radar/leads/:id`** (`getRadarLeadForUser`, [mixin:3012-3051]):
   `findUnique` por id, **sem checagem de posse** (diferente do enrich [mixin:3611-3614] que
   valida `ownerCompanyId`), **sem `maskContact`**. Devolve contato CHEIO de QUALQUER lead
   do pool, inclusive os que a vitrine mostra mascarados. Alvo por-id → scraper lê a lista
   mascarada só pra pegar os ids, depois bate no detalhe por id = contato cheio, débito ZERO.
2. **`GET /webscraping/radar/leads` sem `scope=vitrine`** (`listRadarLeadsForUser`,
   [mixin:2966-2968]): `availableOnly=false` inclui leads `ownerCompanyId:null` (não-puxados,
   [mixin:1490-1499]) e `maskContact:vitrine=false` → contato cru dos disponíveis.
3. **`GET /webscraping/radar/database`** (`listRadarDatabaseForUser`, [mixin:3818-3834]):
   sem `availableOnly`, sem `maskContact` → mesmos não-puxados, contato cru.

Também sem máscara (checar se são pós-débito/master-only, provavelmente OK): delivery
[mixin:842/1544/1647] (pull = pós-débito), master-database [mixin:438/525] (RBAC master).
Pull-preview [delivery:1940] usa `maskContact:true` (correto).

**Fix robusto de UMA regra (independe do modelo): mascarar contato sempre que
`ownershipEnabled && ownerCompanyId !== companyId`** (empresa não puxou este lead), centralizado
em `buildRadarLeadPublic` (o `ownerCompanyId` já está disponível ali, [mixin:2215]):
`const mask = options.maskContact === true || (ownershipEnabled && ownerCompanyId && ownerCompanyId !== companyId);`
Fecha os 3 furos num ponto, torna contato estritamente pull-gated, preserva o fluxo
"puxou → possui → vê contato". **É mudança de contrato de visibilidade/crédito = frente
financeira = Opus edita direto + revisão de diff, e SÓ após o dono confirmar o modelo
(decisão registrada abaixo). NÃO aplicar enquanto o cutover 06-07 estiver no tree sem
coordenar (merge 3-way).**

#### DECISÃO DO DONO (06/07): **Pull-gated + rate generoso** → FIX APLICADO (Opus, local, NÃO publicado)
Regra central em `buildRadarLeadPublic` ([mixin] ~2212): `maskContact = options.maskContact ||
(ownershipEnabled && !ownedByViewer)`, onde `ownedByViewer = ownerCompanyId===viewerCompanyId
|| (!ownerCompanyId && companyState)` (o 2º ramo revela LEGADO puxado antes da coluna de posse —
claim/pull/evento hoje gravam ownerCompanyId junto do state, então legado é o único caso). Callsites
que passaram `viewerCompanyId + ownershipEnabled`: detalhe `getRadarLeadForUser`, lista
`listRadarLeadsForUser` (mantido `maskContact:vitrine` como fallback sem-posse), `listRadarDatabaseForUser`.
Master-database e delivery (pós-débito) intocados. Opt-in: quem não passa `ownershipEnabled` não muda
(retrocompat — teste 2315 e todos os diretos seguem verdes). **typecheck limpo + suíte webscraping 137/137
(136 pass, 1 skip pré-existente), incl. novo teste "CONTATO PULL-GATED".**

**PRÉ-PUBLICAÇÃO (gate obrigatório antes do `npm run publish`):**
1. **Backfill de posse** — conferir na VPS se há RadarLeadPool com companyState de posse mas
   `ownerCompanyId` null (legado). O ramo `companyState` já cobre a exibição, mas o correto é
   backfillar `ownerCompanyId` a partir do state pra manter a coluna como fonte única. Idempotente.
2. Boot ok pós-deploy (`docker ps` Up + logs — "build verde ≠ boot ok").

**ACHADO SECUNDÁRIO (menor, entra na Etapa 3/4 do débito):** `radar/leads/:id/event`
(`addRadarLeadEventForUser`, [delivery:3040-3078]) grava `ownerCompanyId` (reivindica) em QUALQUER
evento, mas só DEBITA em `eventType==='contacted'` ([delivery:3041]). Evento não-'contacted'
(ex.: 'no_answer') claima + revela contato SEM débito → bypass estreito (1 lead por vez, auditável,
marca posse — bem menos raspável que o furo do detalhe). Decidir na Etapa 3/4: evento-claim deve
debitar, ou só 'contacted' reivindica.

### Etapa 2 — UX de cobrança honesta (front)
- Puxada em lote: modal central (`.hbx-veil`) "**Puxar 24 leads = 24 créditos** — saldo
  atual X" com confirmar/cancelar. Puxada unitária: custo visível no próprio botão
  ("Puxar · 1 crédito"), sem modal.
- Saldo insuficiente: NUNCA cobrança parcial silenciosa — mostrar "seu saldo cobre 12 de
  24; puxar 12 / recarregar" (recarga MP já existe).
- **LEI DO VENDEDOR**: vendedor vê CRÉDITOS (unidade), jamais R$; admin vê valores.

### Etapa 3 — Teto de velocidade + alarme
- Teto diário de puxadas por EMPRESA (config no backend, default sugerido = 10×
  `SHELF_LIMIT` = 240/dia; master override por empresa). Recusa com mensagem clara e
  `MasterAlert` quando bate.
- Alarme de padrão scraper no cockpit master: mesma empresa paginando o mesmo filtro em
  sequência (>N páginas em M minutos) ou contagens em rajada → alerta, não bloqueio
  automático (kill-switch R2 fica na mão do dono).
- Rate limit por sessão/IP nos endpoints de vitrine/count (throttler do Nest), generoso
  pra uso humano, apertado pra robô (ex.: 60 req/min).

### Etapa 4 — Ligar flags (decisão do dono, staged)
1. Levantar nomes exatos e efeito de cada flag OFF (ler `backend/src/credits/` +
   `PLANO.md` da frente CREDITOS) e listar pro dono.
2. Ordem sugerida: R1 gate primeiro → observar 24h de MasterAlert/logs → S4 teto vendedor
   → demais enforcement. Local antes (npm run up), prod à noite.
3. VPS: flags via env → **mudar env_file = RECREATE do container** (regra INFRA), conferir
   boot (`docker ps` Up + logs — "build verde ≠ boot ok").

## Passos
1. Ler docs do cutover 06-07 + `credits/` atual (working tree incluso).
2. Etapa 1 (auditoria + testes). 3. Etapa 2 (front). 4. Etapa 3 (teto+alarme+throttle).
5. Etapa 4 (lista de flags pro dono; ligar só com o "go" dele).

## Riscos / guardrails
- **Não colidir com o cutover em andamento** — merge 3-way por arquivo, nunca reverter o
  que não criou.
- Idempotência do débito (`radar:<id>`) preservada — teto/confirm não podem gerar débito
  duplo em retry.
- Reconciliação de migrations no boot segurou o publish de 05/07 SEM 502 — manter o padrão.
- Falso-positivo de scraper (admin trabalhando rápido): alarme informa, não pune.

## Checks / DoD
- Teste "scraper simulado" verde; testes de mask por endpoint.
- Chrome: lote com confirmação, unitário sem, saldo insuficiente com oferta parcial,
  vendedor sem R$.
- Teto estoura → mensagem clara + MasterAlert registrado; cockpit mostra alarme.
- Documento pro dono: flags existentes, efeito, ordem de ligada.
