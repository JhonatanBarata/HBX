# HBX Owner — Defeitos que ficaram + plano em sprints (onda PONTE-VPS)

> Diagnóstico 07/07/2026 (ao vivo, localhost). Onda NOVA — não confundir com os sprints S1–S5
> do ARQ9 (executados 03/07). Dor reportada: **o painel não exibe as configs
> da VPS** (badges "VPS —" nas Chaves de API/Integrações e coluna VPS inteira vazia).
> Nenhum defeito está no código das configs em si — a CADEIA que alimenta a coluna VPS morreu
> e o painel não conta a verdade sobre isso.

## A cadeia (onde quebra)

```
Painel (:3107) → local-agent → Ops Control (:3099, container) → SSH → VPS (docker exec printenv)
                                     ↑ MORTO desde 04/07
```

## Defeitos encontrados (evidência ao vivo)

| # | Defeito | Evidência |
|---|---|---|
| D1 | **Ops Control morto e ninguém religa** — `hbx-ops-control` levou SIGTERM 04/07 16:40Z (Exited 1); `restart: unless-stopped` não ressuscita container parado; `npm run up` sobe o Owner mas NÃO sobe o ops-control; o launcher oficial (`ops-control/open-hbx-ops-control.ps1`) é manual e exige admin | `docker ps -a` → Exited(1) 3 days ago; porta 3099 sem listener; `scripts/start-all.ps1` só chama `start-owner.ps1` |
| D2 | **Pílula "ops ✓" mente** — `/health` devolve `opsConfigured: Boolean(opsToken)` (só presença de token) e o front pinta verde com o Ops Control morto | `hbx-owner/local-agent/server.js:2766`; `web/app.js:59`; testado: health diz `opsConfigured:true` com :3099 morto |
| D3 | **Diagnóstico enganoso** — ECONNREFUSED local vira "VPS pode estar sob carga"; badges mostram "VPS —" com a razão escondida no tooltip | `server.js:1361`; `web/app.js:1688`; testado: `/owner/vps/system` → `connect ECONNREFUSED 127.0.0.1:3099` + mensagem culpando a VPS |
| D4 | **Imagem docker do ops-control DEFASADA do código** — imagem buildada 30/06 00:12Z; `ops-control/server.js` mudou 02/07 (OWNERV2, rota `/api/radar/vps/export-all`). Religar sem `--build` = Exportar-tudo da VPS quebrado (404) e drift silencioso pra sempre | `docker image inspect` Created=2026-06-30 vs commit `215e55fb` 02/07; owner chama a rota em `server.js:2132` |
| D5 | **SSH desperdiçado + badges eternos** — o snapshot SSE (30s) chama `readVpsIntegrationsPresence()` SEM cache (SSH + `docker exec printenv` ×15 chaves na VPS por tick), mas `paintSnapshot` NÃO consome `integrations` — badge só atualiza com clique manual. O comentário do snapshot (`server.js:1832`) afirma que "tudo passa pelos MESMOS caches" — mente | `server.js:1852,1906-1913` (sem cache); `web/app.js:2620-2636` (não pinta integrations); `renderIntegrations()` roda 1× no load (`app.js:2555`) |
| D6 | **Pós-injeção de chave às cegas** — depois de "Salvar na VPS" (recria o backend lá), espera 22s FIXOS e relê 1×; recreate mais lento → badge volta "VPS —"; botão não re-habilita no sucesso | `web/app.js:1708` |
| D7 | `readVpsEngineCapacity()` também sem cache no tick de 30s (HTTP no backend da VPS via ops) | `server.js:1106-1115,1850` |
| D8 | `start-owner.ps1` com agent já no ar só abre o navegador — tokens rotacionados não entram até matar o processo (menor) | `start-owner.ps1:74-84` |

## Religar AGORA (1 comando, resolve a dor de hoje)

```powershell
docker compose --env-file .env.ops-control -f docker-compose.ops.yml up -d --build
```

(`--build` é obrigatório por causa do D4; `.env.ops-control` existe e está completo — verificado.)

## Sprints

| Sprint | Entrega | Depende de |
|---|---|---|
| [S1](S1-RESSUSCITAR-OPS.md) | Ops Control religado + nunca mais morre silencioso (up integrado + auto-heal com disjuntor) | — |
| [S2](S2-PAINEL-HONESTO.md) | Painel conta a verdade: pílula de vivacidade real, erros que apontam a causa certa, botão "Religar Ops" | S1 |
| [S3](S3-DRIFT-E-DIETA.md) | Anti-drift de imagem + dieta de SSH (caches) + badges vivos via snapshot + pós-injeção com poll | S1 |

Guardrail geral: o Owner segue as leis de `docs/Rules/INFRA.md` — nunca deploy/publish/migrations,
shell só allowlist, ações destrutivas com confirmação. Nada aqui toca chip/WhatsApp.
