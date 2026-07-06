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
