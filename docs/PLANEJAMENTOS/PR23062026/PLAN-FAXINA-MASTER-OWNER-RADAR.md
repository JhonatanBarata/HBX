# PLANO — Faxina Master × Owner + Scraping VPS fixo

> Assunto único: separar **Master (SaaS/cliente HBX)** de **Owner (radar/infra)**,
> consolidar todo o radar no **HBX Owner :3107**, e definir uma **regra VPS
> autônoma definitiva** editável só pelo :3107. Negociado com o dono em 2026-06-19.

## STATUS (19/06 — orquestrador)
- **F1 ✅** /master limpo (Motor Radar + Night Factory removidos, arquivos apagados, build ok).
  Farelo: trash de radar-cards ficou na janela Sistema (entrelaçada na lixeira geral; ver F-pendentes).
- **F2 ✅** backend `master/webscraping`→`owner/radar`, `master/night-factory`→`owner/night-factory`,
  Custo master cortado (serviço intacto), ops-control atualizado, testes ok, build ok.
- **F3 ✅** :3107 ganhou Auditoria, controles por-motor, guia de cards, limpeza-antes-de-enviar,
  Distribuição, Campanhas.
- **F4 ✅** :3107 ganhou Night Factory completa (status, controle, config, relatórios).
- **Verificação:** grep repo-wide de paths antigos = ZERO. lint+build front ok; prisma+build back ok; node --check :3107 ok.
- **PENDENTE:** (a) trash de radar-cards no :3107 (endpoint exclusões ainda é `/modules/master/exclusoes` —
  não renomeado; decidir se renomeia ou consome como está). (b) **F5/5b** aguarda os 2 knobs (rotação fixa
  cidades/segmentos + cota por plano). **Nada live foi tocado.**
- **20/06 (Opus — auditoria de código):** estado real do 5b verificado e CORRIGIDO (ver Frente 5b reescrita).
  A distribuição já é por-vendedor (território/cota/limite/modos/worker pump); os gaps reais são mais
  estreitos que o diagnóstico de 19/06: (a) enriquecimento cego e (b) segmento global na distribuição.
  Push on-match e on-demand ainda a traçar. Nada live.

## Princípio da faxina
- **Master (`:3001/master`)** = só problema de cliente HBX / admin SaaS.
- **Owner (`:3107`)** = radar, cards, turbo, motores, night factory, scraping VPS.
- **localhost** = o que o dono mexe na mão (pelo :3107).
- **VPS** = roda sozinho por uma regra fixa; só se edita pelo :3107; tão redondo
  que não precisa edição.

## Decisões fechadas (dono, 19/06)
1. Lar do radar = **HBX Owner :3107** (o PC). Tira 100% do radar do app SaaS.
2. Backend `/modules/master/webscraping/*` → **renomear `/modules/owner/radar/*`**
   (guard continua master/owner).
3. Porto pro :3107: **Auditoria**, **Controles por-motor**, **Distribuição automática**,
   **Campanhas (mass-data)**. **Custo de enriquecimento = CORTADO** (só a superfície
   master + painel; `EnrichmentCostService` continua, é compartilhado).
4. **Night Factory = injeção COMPLETA no :3107** (status, ligar/desligar, relatório
   diário, top-oportunidades, segmentos/cidades, recovery, config).
5. Extras pedidos: **guia com os cards atuais** no :3107 + **limpeza no próprio radar
   ANTES de enviar** pro Vendas.
6. Nova frente: **Scraping VPS fixo** (autônomo, elastic funcionando) — ver Frente 5.

---

## FRENTE 1 — Limpar o `/master` (frontend Next)
Remover do painel de janelas (`frontend/src/app/(app)/master/page.client.tsx`):
- Array `JANELAS`: tirar `motor` e `night`.
- Imports + branches de render de `JanelaMotor` e `JanelaNightFactory`.
- Apagar arquivos `janela-motor.tsx` e `janela-night-factory.tsx` (sem legado).
- `janela-sistema.tsx`: remover o pedaço `exclusoes/radar-cards` (é radar; vai junto
  pro :3107 ou some — ver Frente 3). O resto da Sistema (system-modules,
  global-integrations, vendas-complaints) **fica**.
- CSS/classes que só essas janelas usavam (varrer `hbx-theme/screens.css`).
- **Fica no Master:** Empresas, Self-Checkout, Integrações, E-mails, Tickets,
  Pagamentos, Sistema (sem radar-cards).

## FRENTE 2 — Renomear backend master→owner + cortar Custo
- `backend/src/webscraping/webscraping.controller.ts`: o `@Controller('modules/master/webscraping')`
  (linha ~1246) vira `@Controller('modules/owner/radar')`. O `@Controller('webscraping')`
  por-empresa (linha 940) **não muda**.
- Remover o endpoint master de Custo (`@Get('enrichment-cost/summary')` linha ~1270)
  + qualquer rota só-master de custo. **NÃO** apagar `enrichment-cost/` (módulo
  compartilhado, usado pelo controller por-empresa linha 985 e pela contabilização).
- Atualizar consumidores do path renomeado:
  - `hbx-owner/local-agent/server.js` (linhas ~853, 997-998, 1067, 1094, 1127).
  - `ops-control/server.js` (factory-status, factory/force-next, turbo-noturno/force-now,
    elastic/cancel-forced).
  - `backend/src/webscraping/webscraping-controller-master-routes.test.ts` (expectativas).
- Night Factory backend (`/modules/master/night-factory/*`) → renomear `/modules/owner/night-factory/*`
  também (coerência) e atualizar consumidores.

## FRENTE 3 — :3107 absorve o Motor Radar
Painel HBX Owner (`hbx-owner/local-agent/web/app.js` + `server.js`) ganha:
- **Auditoria**: cards no banco / hoje / 10min / enviados ao Vendas / negativados /
  motores online (os números do print).
- **Controles por-motor**: pausar 30m / drenar / parar individual (hoje só tem frota+fábrica).
- **Distribuição automática**: ver/editar config + rodar agora (`radar-auto-distribution`).
- **Campanhas (mass-data)**: criar/pausar/retomar/cancelar.
- **Guia de cards atuais**: lista navegável dos cards no banco.
- **Limpeza no radar antes de enviar**: ação de revisar/limpar cards (negativar/remover
  lixo) **antes** da distribuição pro Vendas.
- Já existe no :3107: cockpit ao vivo, leads (banco local×VPS), exportar, fábrica, turbo.

## FRENTE 4 — :3107 absorve a Night Factory (completa)
Portar todo o `night-factory` pro painel: status + ligar/desligar + config (janela,
maxConcurrency, maxLeadsPerNight, allowRecoveryRevival) + relatório diário +
top-oportunidades + segmentos + cidades + recovery. Duas colunas (localhost × VPS),
igual ao resto do Owner.

## FRENTE 5 — Scraping VPS fixo (PROPOSTA — a negociar)
> Objetivo: o VPS se vira sozinho. Uma **policy única** (fonte de verdade no DB),
> editável **só** pelo :3107, com defaults sãos que não precisam edição. Acaba com os
> 5 sistemas desalinhados e com o `permitidos=0` que mata a fábrica.

**Regra definitiva (decidida 19/06):**
- **Fonte única** `vps_radar_policy` (DB), endpoint owner-gated, editor só no :3107.
- **24/7 — nunca parado.** Fila por PRIORIDADE (alta→baixa):
  1. **Cliente solicitou** (Radar Digital, tempo real) — sempre fura na frente.
  2. **Estoque mínimo** por cidade/segmento (banco nunca seca).
  3. **Encomenda do Vendas**.
  4. **Rotação fixa** de cidades/segmentos (preenche o ócio).
- **Elastic com preempção dinâmica (SEM reserva fixa):** governor ligado no VPS,
  20 motores. **Apertou** (fila de cliente / memória) → pausa pesquisa de fundo e
  libera motor pro cliente. **Livrou** → joga tudo na produção. Matar o `permitidos=0`:
  a fábrica usa o que o cliente não está usando, dinamicamente.
- **localhost**: tudo manual pelo :3107; **VPS**: policy roda sozinha, sem edição.

### 5b — Fiação da corrente autônoma (AUDITAR + SOLDAR — pré-requisito do 24/7)
> Achado 19/06: a corrente "preferência → enriquecimento → push → distribuição" não está soldada.
> **Auditoria de código 20/06 (Opus) corrigiu o diagnóstico:** a distribuição está MUITO mais pronta
> do que o 19/06 dizia. Estado real (file:line) abaixo — o gap verdadeiro é mais estreito.

**ESTADO ATUAL VERIFICADO (20/06):**
- **Enriquecimento — CEGO, confirmado.** `pickLeadsForEnrichment`
  (`backend/src/night-factory/night-factory.service.ts:821`) ordena `opportunityScore: 'asc'` (+ lastSeenAt /
  createdAt) e pega `batchSize`. ZERO filtro de preferência de vendedor ou de demanda (estoque/encomenda):
  enriquece o PIOR lead primeiro. → **gap real, aberto.**
- **Distribuição — JÁ por-vendedor** (bem mais que "regra global única" do 19/06). `radar-core-distribution.mixin.ts`:
  modelo `RadarAutoDistributionRule` (scopes `company` e `tenant_distribution`), worker pump a cada ~2min
  (`processActiveRadarAutoDistributions`:1009), **território por-vendedor** (cidades, `parseRadarTerritories`),
  **modos do vendedor** (priority/normal/learning :231), **limite diário por-vendedor** (`RadarDistributionDailyUsage`),
  **cota de cards ativos do plano** (`commercialUsageLimits.getSellerActiveCardQuotaSnapshot`), estoque-alvo por
  vendedor. Vendedor já carrega `preferredSegmentsJson` (fonte única: `users/preferred-segments.util.ts`).
- **MAS o segmento ainda é GLOBAL.** A regra exige UM `preferredState`+`preferredCity`+`segment` por empresa
  pra ativar (`:564`) e roteia por território (cidade), não pelo segmento preferido de cada vendedor. O
  `preferredSegmentsJson` é lido/exibido no painel tenant (`:1652`, `segmentMode:'free'`) mas NÃO escolhe o
  segmento que cada vendedor recebe. → **gap real: roteamento por-segmento-do-vendedor.**
- **Push on-match — a CONFIRMAR.** Existe HBX Pulse (`backend/src/pulse/hbx-pulse.service.ts`): motor de nudge
  preference-aware (cards parados, retornos vencidos, sem 1º contato) com cadência (WARMUP/MIN_GAP/DAILY_CAP/quiet).
  É digest do pipeline do vendedor — NÃO confirmei gatilho "card novo casa preferência → push imediato". Traçar.
- **On-demand (cliente solicitou = prioridade 1) — a CONFIRMAR.** Não auditado nesta passada; traçar se a
  solicitação do cliente sempre dispara o motor na frente da fila.

**SOLDAR (ordem de dependência):**
1. **Enriquecimento preference-aware** (`night-factory.service.ts:821`): antes do `opportunityScore asc`,
   priorizar leads que casam com `preferredSegmentsJson` de vendedor ATIVO + demanda (estoque baixo/encomenda);
   manter o `asc` só como desempate do ócio.
2. **Distribuição por-segmento-do-vendedor**: a regra passa a aceitar segmento por-vendedor (do
   `preferredSegmentsJson`), não só o global de `:564`. Reusar território/cota/limite que já existem.
3. **Push on-match**: confirmar/instrumentar o gatilho card-novo-casa-preferência → Pulse/push, respeitando
   o mute do Pulse (confirmar campo `brainPushMuted`) e a cadência existente.
4. **On-demand nunca esquece**: garantir que a solicitação do cliente fura a fila (prioridade 1) e ativa o motor.
5. **Guarantee gate (E2E):** preferência setada → VPS raspa/enriquece o segmento certo → push chega → card
   distribuído ao vendedor certo. **24/7 só é "garantido" quando esse teste passa.**

**Não-óbvio:** o diagnóstico de 19/06 ("auto-distribution é regra global única, não por-vendedor") estava
DESATUALIZADO — o grosso do por-vendedor já existe. O trabalho real é só (a) enriquecimento cego e (b) segmento
global → por-vendedor, mais traçar push/on-demand. Escopo menor do que parecia.

---

## Blocos pros workers (ao "aplique com o orquestrador")
- **B1 (frontend):** Frente 1 — limpar /master. Independente.
- **B2 (backend):** Frente 2 — rename master→owner + cortar superfície de Custo + testes.
- **B3 (owner panel):** Frentes 3+4 — portar Motor Radar + Night Factory pro :3107. Depende de B2 (paths novos).
- **B4 (arquitetura):** Frente 5 — policy VPS fixo + elastic. Depende da negociação dos knobs.
- **B5 (corrente autônoma):** Frente 5b — (1) enriquecimento preference-aware + (2) distribuição
  por-segmento-do-vendedor + (3/4) traçar push on-match e on-demand + (5) E2E. Backend; NADA live.

## Riscos / reverter
- Rename de endpoint quebra consumidor esquecido → grep `modules/master/webscraping`
  e `modules/master/night-factory` tem que zerar fora de B2.
- Cortar Custo: NÃO tocar `EnrichmentCostService` (quebra enriquecimento).
- Frente 5 mexe em produção (VPS) — só CÓDIGO/policy aqui; **ativar no VPS é ação live**
  (guardrail) e exige ordem explícita.
- Reverter: cada bloco é commit isolado; `git revert <bloco>`.

## Checks
- Frontend: `cd frontend && npm run lint && npm run build`.
- Backend: `cd backend && npm run prisma:validate && npm run build`.
- Grep de fechamento: nenhum `modules/master/webscraping` vivo fora de B2.
