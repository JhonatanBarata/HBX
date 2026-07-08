# HBX Owner — Sprint 3: anti-drift de imagem + dieta de SSH

> Corrige D4, D5, D7 e o resto do D6. Depende do S1.
> Escopo: `ops-control/` (Dockerfile/health), `hbx-owner/local-agent/server.js`, `web/app.js`,
> `scripts/start-all.ps1` ou `start-owner.ps1`. Zero mudança na VPS.

## Problema
1. **Drift (D4)**: a imagem do ops-control era de 30/06 com código de 02/07 no disco — o container
   rodou 2 dias SEM as rotas do OWNERV2 (`/api/radar/vps/export-all` → 404 silencioso no
   Exportar-tudo) e ninguém percebeu. Não existe nenhum mecanismo que perceba.
2. **Dieta (D5/D7)**: com SSE vivo, a cada 30s o snapshot dispara `env-presence` (SSH +
   `docker exec printenv` ×15 chaves NA VPS) e `engines/status` (HTTP no backend da VPS) SEM cache —
   e o front nem consome o resultado das integrações. SSH de produção queimado à toa, 2×/min.
3. **Pós-injeção (D6)**: sleep fixo de 22s após recriar o backend da VPS → leitura no meio do boot.

## Passo 1 — build info + detecção de drift (D4)
- `ops-control/Dockerfile`: gravar no build `BUILD_GIT_HASH` (ARG passado pelo compose:
  `git rev-parse --short HEAD` no invocador) + `BUILD_AT` → expor em `GET /` (rota raiz já é pública
  de health? senão criar `GET /api/build-info` atrás do token).
- Agent: 1×/boot (e no heal), comparar `build-info.gitHash` com o hash do working tree local para
  `ops-control/` (`git log -1 --format=%h -- ops-control/`). Divergiu → warning no snapshot
  (`vps.system.warnings`) e badge âmbar na pílula ops: "ops desatualizado — rebuild".
- `start-owner.ps1` (caminho do S1): se drift detectado, subir com `--build` (build tem cache de
  camadas do docker; custa segundos quando nada mudou).

## Passo 2 — caches que o comentário já prometia (D5/D7)
O comentário do snapshot (server.js:1832-1836) afirma que "integrações-VPS passam pelos MESMOS
caches" — hoje é mentira. Tornar verdade:
- `readVpsIntegrationsPresence()`: cache 120s (padrão `vpsLeadsCache`); botão ⟳ das integrações
  fura com `force=1`.
- `readVpsEngineCapacity()`: cache 60s, mesma receita.
- Resultado: tick de 30s do SSE passa a custar no MÁXIMO 1 SSH (host-snapshot, cache 30s) na média.

## Passo 3 — front consome o que já paga (D5)
- `paintSnapshot()` passa a pintar `local.integrations` + `vps.integrations` (refatorar
  `renderIntegrations`/`loadVpsBadges` pra aceitar dados prontos, mesmo contrato pre* dos outros
  cards). Badge "VPS …" morre sozinho quando o snapshot chega — sem clique.

## Passo 4 — pós-injeção com poll (D6)
- Trocar `setTimeout(loadVpsBadges, 22000)` por poll: a cada 5s (até 90s) chamar
  `/owner/integrations/vps?force=1`; parar quando a chave aparecer `present` (ou estourar o prazo e
  mostrar "não confirmei — recarregue"). Botão re-habilita ao confirmar.

## Critérios de aceite
- [ ] Editar comentário em `ops-control/server.js` + religar SEM build → painel avisa drift; com
      `--build` o aviso some.
- [ ] Com SSE vivo e painel aberto 5 min: nº de execuções de `env-presence` no ops ≤ 3 (era 10).
- [ ] Badges VPS atualizam sozinhos ao religar o ops (sem clique/F5).
- [ ] Injetar chave nova → badge vira "VPS ✓" sozinho quando o backend da VPS termina de subir.
- [ ] Comentário do snapshot atualizado pra descrever o comportamento REAL.
- [ ] `node --check` verde; testes do agent verdes; `scripts/validate-email-lab-rollout.js` verde
      (ele checa rotas do ops-control).
