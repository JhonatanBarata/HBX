# RESULTADO CHIP D1 — Fix TLS do client HTTP do local-agent (06/07/2026)

**Status: CONCLUÍDO. Bug confirmado, corrigido, validado AO VIVO.** A ponte 30B→VPS
(`lib/ponte-worker.js`, CHIP E1) estava bloqueada em produção porque o client HTTP cru do
local-agent (`hbx-owner/local-agent/server.js`) ignorava o protocolo da URL alvo e sempre
falava HTTP puro na porta 80 — com `HBX_OWNER_BACKEND_URL=https://api.hbxsystem.com.br` isso
batia no nginx em HTTP:80, que devolvia `301` (redirect pra https), e o worker registrava
`lastError: "http_301"` sem nunca completar um lease de verdade. Nenhuma VPS foi tocada além do
lease natural do worker; WhatsApp não tocado; sem branch nova; commit local.

## 1. O bug

`hbx-owner/local-agent/server.js` importava só `http` (`require("http")`, linha 4) e usava
`http.request(...)` FIXO em todo lugar que fala com uma URL configurável por env — inclusive
`backendUrl` (`HBX_OWNER_BACKEND_URL`), que em produção é `https://api.hbxsystem.com.br`. O
`port` também era sempre `target.port || 80`, então mesmo quando alguém tentasse usar `https.request`
a porta-default estaria errada (443 vs 80).

Pontos que falavam com `backendUrl` (auditados via `grep http.request` no arquivo inteiro, 6
ocorrências no total):

| Função | Linha (antes) | Fala com | Ação |
|---|---|---|---|
| `localLabRequest` | 459 | `127.0.0.1:3098` (Local Lab) | **mantido** `http` puro — sempre localhost |
| `ollamaRequest` | 495 | `127.0.0.1:11434` (Ollama) | **mantido** `http` puro — sempre localhost |
| `backendRequestOnce` | 845 | `backendUrl` (pode ser `https://` em prod) | **CORRIGIDO** |
| `refreshBackendToken` | 890 | `backendUrl` (login do master) | **CORRIGIDO** |
| `streamUpstreamToClient` | 967 | genérica: `backendUrl` OU `opsUrl` (export-all/download) | **CORRIGIDO** |
| `opsRequest` | 1187 | `opsUrl` (Ops Control, default `127.0.0.1:3099`) | **mantido** `http` puro — alvo é local |

Diagnóstico prévio (fora deste chip) já tinha isolado a causa: `POST
https://api.hbxsystem.com.br/modules/owner/missions/lease` sem token respondia `401` limpo (rota
saudável); a mesma chamada em `http://` respondia `301`. Batia 1:1 com o `lastError: "http_301"`
visto no `/owner/ponte/status` antes do fix.

## 2. O fix

Adicionada `httpModuleForUrl(target)` em `hbx-owner/local-agent/lib/util.js` — função pura,
zero-dependência, sem estado de módulo (mesmo padrão das outras utils do arquivo):

```js
function httpModuleForUrl(target) {
  if (target && target.protocol === "https:") {
    return { mod: require("https"), defaultPort: 443 };
  }
  return { mod: require("http"), defaultPort: 80 };
}
```

Os 3 pontos que falam com `backendUrl` (`backendRequestOnce`, `refreshBackendToken`,
`streamUpstreamToClient`) passaram a chamar `const { mod: httpMod, defaultPort } =
httpModuleForUrl(target); httpMod.request({ ..., port: target.port || defaultPort, ... })` no
lugar do `http.request(..., port: target.port || 80, ...)` fixo. Timeout, headers, `maxBytes` e o
contrato de retorno (`{ ok, statusCode, data, raw }` / `{ ok, error }`) ficaram **byte-a-byte
iguais** — só a escolha do módulo/porta-default mudou. `localLabRequest`, `ollamaRequest` e
`opsRequest` foram deixados intocados (alvo é sempre `127.0.0.1`, nunca teria protocolo https).

## 3. Teste unitário (padrão da casa: `node:test`, sem framework externo, sem rede real)

Adicionados em `hbx-owner/local-agent/test/util.test.js` (mesmo arquivo/estilo das outras
funções puras de `lib/util.js`):

- `https://` → escolhe `require("https")` com `defaultPort=443`.
- `http://` → escolhe `require("http")` com `defaultPort=80`.
- `target` nulo/inválido → cai no default `http`/80 sem lançar (defensivo, cobre o caso de URL
  malformada upstream que os callers já tratam antes de chegar aqui).

```
node --test "test/*.test.js"
ℹ tests 50
ℹ pass 50
ℹ fail 0
```

Todos os 47 testes pré-existentes (`ponte-worker`, `engine-capacity`, `util`) continuam verdes —
nenhuma regressão.

## 4. Validação AO VIVO (a prova do D1)

**Antes do fix** (processo antigo, PID 19572, rodando código pré-fix), `GET
/owner/ponte/status`:
```json
"lastAction":"backoff_lease","lastError":"http_301"
```

Passos executados:
1. `node -c server.js` → sintaxe OK.
2. Matou o processo antigo do local-agent (`Stop-Process -Id 19572 -Force`) — confirmado morto.
3. Relançou exatamente com o comando prescrito:
   `$env:HBX_PONTE_WORKER_ENABLED='on'; $env:HBX_OWNER_BACKEND_URL='https://api.hbxsystem.com.br'; Start-Process powershell -WindowStyle Hidden -ArgumentList '-File','...\start-owner.ps1','-NoBrowser'`
4. Novo processo confirmado no ar (PID 12668, `node.exe server.js`).
5. Aguardado ~10s, consultado `GET http://127.0.0.1:3107/owner/ponte/status` (Bearer do
   `.owner-token`) duas vezes (com ~8s de intervalo) para confirmar estabilidade.

**Depois do fix** (PID 12668):
```json
{
  "ok": true,
  "ponte": {
    "enabled": true,
    "running": true,
    "circuitOpen": false,
    "circuitReason": null,
    "consecutiveFailures": 0,
    "maxConsecutiveFailures": 5,
    "warm": false,
    "model": "qwen3:30b-a3b-instruct-2507-q4_K_M",
    "workerId": "ponte-local-12668",
    "lastAction": "idle",
    "lastReason": "fila pausada (freio do dono)",
    "activity": { "activeUsers": 1, "windowMinutes": 5 },
    "lag": { "queuedDue": 0, "oldestQueuedAgeMs": 0 },
    "lastError": null,
    "currentMissionId": null,
    "startedAt": "2026-07-06T04:39:08.139Z",
    "totals": { "leased": 0, "completed": 0, "failed": 0, "coldLoads": 0, "unloads": 0 },
    "lastJobs": []
  }
}
```

**Veredito: `http_301` sumiu.** `lastError: null`, e o worker agora traz `activity`/`lag`
preenchidos (só existem se o `/lease` respondeu `200` de verdade pela VPS via HTTPS) —
antes do fix esses campos vinham `null` porque a chamada nunca completava. `lastAction: "idle"`
com `lastReason: "fila pausada (freio do dono)"` é um estado de NEGÓCIO válido (o dono tem o
freio da fila ligado nesta janela), não falha técnica — nenhum `http_401`/`http_301`/erro de
rede em nenhuma das duas consultas. Não havia missão real na fila pra observar
warm-exclusivo→cold; não havia necessidade de forçar nada (regra: não impedir nem forçar
produção autorizada, só observar).

Se a fila for despausada pelo dono numa próxima janela e aparecer missão real, o comportamento
esperado (não testado aqui por falta de fila) é: 1ª chamada de warm-check exclusivo (1-token,
`num_ctx=8192`) se o 30B estiver frio, cold-load ~2min, depois `work` processando a missão —
já coberto pelos testes de `ponte-worker.test.js` (`tick warm`/`tick work`).

## 5. Decisões tomadas sozinho (declaradas)

1. Corrigi `streamUpstreamToClient` além dos 2 pontos citados no escopo original
   (`backendRequestOnce`/`refreshBackendToken`) — ela é genérica e recebe `backendUrl` (pode ser
   `https://`) em 2 dos 3 call-sites (`export-all` e `cnpj-xray download`). Deixá-la só com
   `http.request` fixo teria o MESMO bug pra qualquer export via streaming em prod. Confirmado
   por grep dos call-sites antes de mexer.
2. Coloquei `httpModuleForUrl` em `lib/util.js` (não dentro do `server.js`) para poder testá-la
   isolada, sem mock de rede — mesmo padrão das outras funções puras já extraídas ali (Sprint 5).
3. Não toquei `opsRequest` nem `localLabRequest`/`ollamaRequest` — todos os 3 falam só com
   `127.0.0.1` (nunca configuráveis para host externo/https no código atual); tocar neles seria
   escopo além do bug real.
4. Não vi `http_401` em nenhum momento — não houve necessidade de registrar "credencial master
   local ≠ VPS" como pendência aberta desta rodada.
