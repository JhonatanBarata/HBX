# F0 — Demolição da fábrica de DESCOBERTA antiga (regra do escoteiro)

> Worker Opus. Leia ANTES: `docs/PLANEJAMENTOS/ARVORE-MESTRA/PLANO-FECHAMENTO.md` (F0),
> `docs/Rules/MOTOR.md`. Decisão do dono 02/07: a fábrica atual foi construída pra um ideal
> que mudou — morre AGORA. A fábrica nova (enriquecimento, F2) nasce sobre a fila S4, que FICA.

## Missão
Remover FISICAMENTE a fábrica de descoberta autônoma. Nenhum caminho de campanha autônoma
compila depois de você. A VPS não muda de comportamento (autônomo já está OFF por flag).

## Alvos de remoção (inventário-âncora — confirme cada um antes de cortar)
- Modo `night_factory`: `radar-source-planner.service.ts` (byStrategy) + `radar-search-strategy.service.ts`.
- `backend/src/webscraping/radar/01-search/mass-data/radar-core-mass-data.mixin.ts`.
- `backend/src/webscraping/radar/01-search/radar-core-campaign-planner.mixin.ts`.
- `backend/src/webscraping/radar/01-search/radar-core-factory-admin.mixin.ts` (+ `.abandon.test.ts`).
- Composição: `radar-core-mixins.ts` / `radar-core-method-imports.ts` / `radar-webscraping-core.service.ts`
  — remover o fio dos mixins mortos.
- Endpoints/rotas de campanha autônoma no controller/service do webscraping (mapear por uso dos mixins).
- :3107 (`hbx-owner/local-agent/`): botões e handlers `btn-factory`, `btn-ft-*` (purge/refresh/next)
  no `index.html`/`app.js` + rotas de fábrica correspondentes no `server.js`.
- Referências a `HBX_FACTORY_AUTONOMOUS_DISABLED` (flag fica sem função → some do código; NÃO mexer
  no `.env` da VPS — o orquestrador limpa depois).

## O que FICA (não ouse tocar)
- **Fila de missões S4 inteira** (`radar/missions/`, `RadarMission`, `RadarCoverage`, rotas
  `/modules/owner/missions/*`, elástica por LAG) — é a fundação da fábrica nova.
- Fontes `reprocess_missing_social`/`reprocess_old_cards` (viram missão no F2, não são fábrica).
- Tabelas `RadarFactoryCursor`/`RadarFactoryWorkLog` no schema (órfãs até faxina; NÃO tocar
  `backend/prisma/schema.prisma`). Histórico nunca se apaga.
- Governor/SourceBudget, quarentena W2, zap-gate/freio W4, cutover W1 (planner ordem rfb→web).
- Regra de decisão: peça compartilhada entre fábrica antiga e fila S4 → **FICA** e você lista no
  relatório. Na dúvida, mantém.

## Regras duras
- NÃO tocar `backend/prisma/schema.prisma`, `Webwhats/`, `frontend/` (o frontend do produto não
  tem fábrica), nem `radar/missions/`.
- Mixins do core são ENTRELAÇADOS: mapeie imports/chamadas de cada alvo ANTES do primeiro corte.
- Testes que morrem junto com o código morto: deletar. Testes vivos que referenciam o morto: ajustar.
- Meta de contagem: mixins do core 12 → menos; relate antes/depois.
- Validação: `cd backend && npm run build` + `node --test dist/webscraping/*.test.js` e suítes do
  radar tocadas. As 4 falhas pré-existentes de `webscraping.service.test` (governor Places estático
  + mock radarCoverage) são conhecidas — compare com baseline via `git stash` se precisar provar.
- Commit na branch do worktree. Relatório: arquivos deletados/alterados, contagem de mixins,
  o que ficou de propósito, testes.
