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
