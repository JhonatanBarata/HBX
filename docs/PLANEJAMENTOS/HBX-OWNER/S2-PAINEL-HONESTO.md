# HBX Owner — Sprint 2: painel honesto (a verdade sobre a ponte VPS)

> Corrige D2, D3, D6-parcial. Depende do S1 (auto-heal existe; aqui o painel passa a MOSTRAR).
> Escopo: `hbx-owner/local-agent/server.js`, `web/app.js`, `web/index.html`. Zero mudança na VPS.

## Problema
Com o Ops Control morto o painel dizia **"ops ✓" verde** e culpava a VPS ("VPS pode estar sob
carga"), com a razão real escondida em tooltip. O dono não tinha COMO saber que era um container
local parado — ficou 3 dias sem configs da VPS sem um aviso sequer.

## Passo 1 — vivacidade real na pílula (D2)
- `/health` ganha `opsAlive` (GET curto ao :3099, timeout 1.5s, cache 10s pra não custar nada no
  polling) além do `opsConfigured` atual.
- `web/app.js` `pingStatus()`: verde "ops ✓" só com `opsAlive`; token ok + morto → pílula VERMELHA
  "ops caído"; sem token → cinza "config ops" (como hoje).

## Passo 2 — erro certo pra causa certa (D3)
`opsRequest` já sabe distinguir; hoje tudo desagua em texto genérico. Padronizar `reason` em 4 causas
e propagar até a UI:
| causa | detecção | mensagem no painel |
|---|---|---|
| `ops_token_ausente` | sem `HBX_OWNER_OPS_TOKEN` | "Configure o Ops Control (token)" |
| `ops_caido` | `ECONNREFUSED`/`ENOTFOUND` no :3099 | "Ops Control parado NESTA máquina — religando…/religar" |
| `ssh_falhou` | ops respondeu com `ssh_nao_configurado`/erro SSH | "Ops no ar, SSH pra VPS falhou" |
| `vps_lenta` | timeout | "VPS demorou a responder (pode estar sob carga)" |
Ajustar `readVpsSystem` (server.js:1361) — "VPS pode estar sob carga" SÓ no caso timeout.

## Passo 3 — badges e status com CTA (D3 + D6-parcial)
- `loadVpsBadges()`: razão VISÍVEL no grid (linha curta acima dos badges, não só `title`), com o
  texto do Passo 2.
- Causa `ops_caido` → mostrar botão **"Religar Ops Control"** no painel: `POST /owner/ops/restart`
  no agent → `docker start hbx-ops-control` (reusa o heal do S1, allowlist já cobre docker start;
  respeita o mesmo disjuntor). Feedback âmbar "religando…" até `opsAlive` confirmar (mesmo padrão
  intenção/deadline dos botões-interruptor existentes).
- Botão "Salvar na VPS" re-habilita após sucesso confirmado (hoje fica morto até F5).

## Critérios de aceite
- [ ] `docker stop hbx-ops-control` → pílula vira "ops caído" vermelha em ≤15s; badges mostram a
      causa em texto visível; botão "Religar" aparece e FUNCIONA (volta "ops ✓" sem F5).
- [ ] Sem token → mensagens de config (cinza), sem botão religar.
- [ ] Timeout real da VPS (simulável derrubando SSH no ops) → mensagem fala de SSH/VPS, nunca "configure".
- [ ] Nenhuma mensagem genérica "VPS pode estar sob carga" pra ECONNREFUSED.
- [ ] `node --check` verde nos dois arquivos; testes do agent verdes.
