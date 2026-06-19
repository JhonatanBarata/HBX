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
> Achado em 19/06: a corrente "preferência → enriquecimento → push → distribuição"
> NÃO está soldada. O dono precisa disso redondo ANTES de confiar no 24/7 com clientes.
- **Enriquecimento cego → preference-aware.** `pickLeadsForEnrichment`
  ([night-factory.service.ts:821](../../backend/src/night-factory/night-factory.service.ts))
  hoje pega menor `opportunityScore`, ignora preferência. Fechar: enriquecer primeiro o
  que casa com preferência de vendedor ativo + demanda (estoque/encomenda).
- **Auto-distribution grosseira → por-vendedor.** Hoje exige UM state/city/segment global
  ([radar-core-distribution.mixin.ts:564](../../backend/src/webscraping/radar/05-delivery/radar-core-distribution.mixin.ts)).
  Fechar: distribuir por preferência de cada vendedor, respeitando cota do plano.
- **Push on-match.** Traçar e garantir o gatilho: card novo que casa com preferência →
  push pro vendedor (respeitando `brainPushMuted`).
- **On-demand nunca esquece.** Solicitação do cliente SEMPRE ativa o motor (prioridade 1).
- **Guarantee gate:** o 24/7 só é "garantido" quando 5b passa num teste E2E:
  preferência setada → VPS raspa/enriquece o segmento certo → push chega → card distribuído.

---

## Blocos pros workers (ao "aplique com o orquestrador")
- **B1 (frontend):** Frente 1 — limpar /master. Independente.
- **B2 (backend):** Frente 2 — rename master→owner + cortar superfície de Custo + testes.
- **B3 (owner panel):** Frentes 3+4 — portar Motor Radar + Night Factory pro :3107. Depende de B2 (paths novos).
- **B4 (arquitetura):** Frente 5 — policy VPS fixo + elastic. Depende da negociação dos knobs.

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
