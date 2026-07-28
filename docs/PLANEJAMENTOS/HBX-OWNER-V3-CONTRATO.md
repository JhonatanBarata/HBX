# HBX OWNER V3 — CONTRATO CONGELADO (28/07/2026)

Fonte única de verdade da frente. Fixado pelo orquestrador ANTES dos workers começarem.
**Quem divergir daqui quebra outro worker.** Divergência só com aval do orquestrador.

## 0. Quem entrega o quê

| Etapa | Dono | Arquivos EXCLUSIVOS |
|---|---|---|
| E1 | worker backend | `backend/src/webscraping/radar/fabrica/*` |
| E2a | worker ponte | `hbx-owner/local-agent/lib/ponte-worker.js` + test |
| E2b | worker agent | `hbx-owner/local-agent/server.js` + `test/owner-v3.test.js` |
| E3 | worker front | `hbx-owner/local-agent/web/v3/*` (diretório NOVO) |
| E4 | worker boot | `install-startup.ps1`, `start-owner-supervised.ps1` |

Ninguém edita arquivo de outro. Ninguém comita.

## 1. NestJS — interruptor de energia (E1)

```
GET  /modules/owner/fabrica/energia
  → { supported, enabled, forcedOn, key:"main", unavailableReason: string|null }
POST /modules/owner/fabrica/energia  { on: boolean }
  → { ok, enabled, changed, reason: string|null }
```
Auth: `JwtAuthGuard + MasterGuard` (igual aos irmãos `status`/`start`/`stop`).
Erro operacional NUNCA vira 500 — vem 200 com `ok:false` + `reason`.
`finishRun(reason)` grava `lastError = reason` (exceto `budget_atingido`, que não apaga erro de lead).

## 2. Ponte 30B (E2a)

```
ponteWorker.readResident() → { ok, resident, ramMb: number|null, error: string|null }
ponteWorker.unload(reason, { force=false, timeoutMs=60000 })
  → { ok, resident, ramMb, forced, reason: string|null, elapsedMs }
```
O nome exportado continua `unload` (é como o `server.js:3679` já chama); o que muda é
que ele aceita `opts` e devolve OBJETO no lugar do boolean mentiroso.
`state.warm` só vira `false` com `resident === false` provado pelo `/api/ps`.
Ollama mudo → `reason:'ollama_sem_resposta'`, e **não** se afirma que descarregou.

## 3. Boot (E4)

`hbx-owner/local-agent/state/boot.json` (estado atual, reescrito a cada boot):
```json
{ "at":"ISO", "windows":true, "agent":true, "ollama":true, "painel":false, "reason":"health_timeout" }
```
`ollama` pode ser `null` (não sei). Painel abre em `http://127.0.0.1:3107/v3`.

## 4. Agent V3 — o ÚNICO endpoint de verdade (E2b)

```
GET  /owner/v3/overview                                   → payload abaixo
POST /owner/v3/switch/scraping        { env:'vps'|'local', on }
POST /owner/v3/switch/ia              { on }
POST /owner/v3/switch/enriquecimento  { on }
POST /owner/v3/fabrica/run            { env, budget }
GET  /owner/v3/events?token=...       SSE, evento "overview" com o MESMO payload
```
Auth: Bearer token local (igual ao resto do agent); SSE aceita `?token=`.
**Lei nº3:** todo switch RELÊ o estado real antes de responder. Nunca ecoar a intenção.
Toda resposta de switch devolve `{ ok, reason, state }` onde `state` é o ramo
correspondente de `overview.switches` já relido.

### Payload de `/owner/v3/overview` (fixture literal — o front coda contra isto)

```json
{
  "ok": true,
  "generatedAt": "2026-07-28T18:40:00.000Z",
  "boot": { "windows": true, "agent": true, "ollama": true, "painel": true, "reason": null },
  "switches": {
    "scraping": {
      "vps":   { "on": true,  "known": true, "reason": null,
                 "running": true, "budget": 1000, "processed": 412,
                 "contactsWritten": 561, "lastError": null, "rfbBaseCount": 28000000 },
      "local": { "on": false, "known": true, "reason": "parar_tudo_global",
                 "running": false, "budget": 0, "processed": 0,
                 "contactsWritten": 0, "lastError": "parar_tudo_global", "rfbBaseCount": 28000000 }
    },
    "ia": { "on": true, "warm": true, "busy": false, "model": "qwen3:30b-a3b-instruct",
            "ramMb": 19260, "reason": null },
    "enriquecimento": { "on": true, "reason": null, "dependsOn": "ia",
                        "queuedDue": 1873, "oldestAgeMin": 42, "ratePerHour": 310 }
  },
  "engines": { "total": 20, "on": 20 },
  "problems": [
    { "id": "scraping_local_off", "severity": "warn",
      "text": "Scraping deste PC está desligado no disjuntor — nada roda até religar.",
      "action": { "label": "Religar", "method": "POST",
                  "path": "/owner/v3/switch/scraping", "body": { "env": "local", "on": true } } }
  ],
  "feed": [ { "at": "2026-07-28T18:39:12.000Z", "text": "corrida VPS: 412/1000 leads" } ]
}
```

Regras de preenchimento:
- `known:false` = o agent NÃO conseguiu ler o ambiente (backend mudo). O front pinta
  "não sei" (cinza), **nunca** desligado. `reason` explica.
- Todo estado parado carrega `reason` legível. Silêncio é proibido (lei nº2).
- `problems[]` é calculado NO AGENT; o front só pinta. `action` pode ser `null`
  (só instrução). `severity`: `"warn"` | `"error"`.

### IDs de problema canônicos (o front pode ter ícone por id)
`scraping_vps_off` · `scraping_local_off` · `fila_parada` (>6h) · `ia_residente`
(30B na RAM após desligar; ação = `switch/ia {on:false, force:true}`) · `ollama_off` ·
`tunel_caido` · `backend_sem_resposta` · `energia_desconhecida`

### Cascata (lei do estado impossível)
- `switch/enriquecimento {on:true}` → liga a IA antes; responde
  `state.cascade = { ia: "ligada" | "ja_ligada" | "falhou" }`.
- `switch/ia {on:false}` → desliga o enriquecimento junto;
  `state.cascade = { enriquecimento: "desligado" | "ja_desligado" }`.
- `switch/ia {on:false, force:true}` = "Forçar descarga" da faixa de problemas.

### Alvo por ambiente (`env`)
- `local` → backend local via `backendRequest` (`HBX_OWNER_BACKEND_URL`, default `http://127.0.0.1:3000`).
- `vps` → produção via ops-control (`opsUrl`/`opsToken`, `HBX_OWNER_OPS_URL` default `http://127.0.0.1:3099`),
  mesmo padrão dos proxies `/owner/vps/*` que já existem no `server.js`.
- Sem `opsToken` → `known:false`, `reason:'ops_token_ausente'`. Nunca inventar `on:false`.

## 5. Front (E3)

Servido em `/v3` (o `server.js` mapeia `/v3` e `/v3/` → `web/v3/index.html`).
Token injetado pelo placeholder `%%HBX_OWNER_TOKEN%%` no HTML (padrão já existente).
**1 timer** (poll 5s) + SSE; SSE morto → o poll sustenta sozinho.
Meta: `web/v3/app.js` ≤ 600 linhas. 3 interruptores, o resto é gaveta.
Visual: portar `docs/mockups/hbx-owner-v3.html` (aprovado pelo dono).
As 5 Leis do design system do `frontend/` **não valem aqui** — este painel é do
agent local, CSS próprio, `check-pele.mjs` não olha esta pasta.

## 6. Fora de escopo
Chips/WhatsApp, governor/elástica do VPS, regras de cobrança. Fábrica segue R$0 (Lei nº1).
