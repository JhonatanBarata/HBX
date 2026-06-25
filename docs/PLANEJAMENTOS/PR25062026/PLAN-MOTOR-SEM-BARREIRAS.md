# Motor sem barreiras — Elasticidade é o único freio

## Regra do dono (24/06, literal)
**Ativo = roda. Desativo = para. A Elasticidade (governor) é o ÚNICO freio — escala sozinha pra ninguém sofrer.**
Toda barreira extra (janela de noite, teto fixo, fábrica capada) é DELETADA. Teto local = 20 (igual VPS).

## Barreiras e fonte
1. **Teto 3 / Fábrica 1 motor** — container backend rodava com env velho (foi `restart`, não `recreate`). `.env` raiz já = 20/20/20, governor on. → **FEITO via ops**: `docker compose up -d --force-recreate backend` + frota regenerada p/ 20.
2. **Janela "só de noite"** — default no CÓDIGO:
   - `backend/src/webscraping/radar/01-search/radar-core-campaign-planner.mixin.ts:180` → `nightOnly` default `true`.
   - `backend/.../radar-core-factory-admin.mixin.ts:279` → janela default 22h (`HBX_FACTORY_START_HOUR`).
   - **Apply (worker):** default `nightOnly=false` + janela 0–23 / `stopOutsideWindow=false`. Campanha ativa local: setar `nightOnly=false` em runtime p/ rodar de dia já.
3. **Parada de emergência** — estado no banco. → **FEITO**: `factory/start` (emergencyStop=false, enabled=true).

## RISCO a sinalizar antes do merge
O item 2 é código compartilhado: mudar o default de `nightOnly`/janela **muda a VPS também** (passa a raspar 24/7). Confirmar com o dono se vale na VPS ou se o default-livre é só pra ambiente local (via env por ambiente).

## Reverter
- Ops: `docker compose up -d --force-recreate backend` com `.env` antigo; frota: `npm run engines:down`.
- Fábrica: `POST /modules/owner/radar/factory/stop`.
- Código: `git revert` do bloco do item 2.

---

## Unificação 25/06 — ELÁSTICA PURA (uma mão só, sem número)
Decisão do dono: o painel VPS tinha DOIS controladores brigando — a **faixa manual `DE..ATÉ`** (`docker start/stop` cru) e o **governor**. Some a faixa. Sobra a **elástica como única mão**, **sem dial humano**: nº de motores = demanda × pressão de RAM, limitado pelo físico (nº de URLs).

### Contrato (fixo entre as 3 camadas)
- **Backend** (`/modules/owner/radar/`, JWT master): `POST elastic/enable`, `POST elastic/disable`, `POST elastic/stop-all`. `GET /webscraping/engines/status` ganha `elasticEnabled`, `running`, `physicalMax`, `memoryPressurePercent`, `memoryHeadroomEngines`.
- **Ops Control**: `POST /api/opscontrol/elastic/{enable|disable|stop-all}` `{scope}` → proxia backend. Aposenta `start-range`/`stop-range` como controle.
- **Owner**: `/owner/ops/elastic/{enable|disable|stop-all}` → ops-control. Painel: remove `DE..ATÉ` + 3 botões de faixa; põe Ligar/Desligar elástica + Parar tudo + linha "rodando N (trava na RAM X%)"; chip Elasticidade VPS fala a verdade.

### Cérebro (worker A — `hbx-engine-pool.service.ts`)
Teto deixa de ser `HBX_ENGINE_COUNT` humano → vira `resolveMemoryHeadroomEngineCount()` (limiares soft 82/hard 85/panic 88 que já existem). `desired = clamp(warm, min(demanda, headroomRAM, físico))`. Histerese (sobe < soft, desce ≥ hard) + cooldown 120s pra não flapar. Panic → cai pro warm. `elasticEnabled` runtime; `stop-all` = parada DURÁVEL (`status=stopped + manualPaused`) que o governor não re-promove.

### RISCO
- Sem dial, pior caso = 20 containers pressionam RAM antes do governor reagir → backoff panic agressivo (corta pro warm direto).
- `HBX_ENGINE_URLS` (limite físico) some no `docker compose recreate` → manter no `.env` raiz.
- Chip VPS depende do token/JWT do VPS chegar no Owner (frente "painel = verdade").

### Reverter
`git revert` por camada (3 codebases isolados: `backend/`, `ops-control/`, `hbx-owner/`); nada deployado até o dono mandar.
