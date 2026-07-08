# HBX Owner — Sprint 1: Ressuscitar o Ops Control (e nunca mais morrer calado)

> Corrige D1 (raiz da dor: configs da VPS sumidas) e prepara D4.
> Escopo: `scripts/start-all.ps1`, `hbx-owner/local-agent/start-owner.ps1`,
> `hbx-owner/local-agent/server.js`. Zero mudança em produção/VPS.

## Problema
O painel inteiro da coluna VPS (configs/integrações, pressão, motores, banco, cockpit) depende do
container `hbx-ops-control` (:3099). Ele levou SIGTERM em 04/07 e ficou Exited(1); nada o religa:
- `restart: unless-stopped` não ressuscita container parado manualmente;
- `npm run up` sobe backend/front/Owner mas ignora o ops-control;
- o launcher `ops-control/open-hbx-ops-control.ps1` é manual E exige elevação de admin.

## Passo 0 — religar hoje (manual, 30s)
```powershell
docker compose --env-file .env.ops-control -f docker-compose.ops.yml up -d --build
```
`--build` obrigatório: a imagem atual é de 30/06 e o código mudou 02/07 (D4).
Conferir: `curl http://127.0.0.1:3099` responde e o painel pinta os badges "VPS ✓/✗".

## Passo 1 — `start-owner.ps1` garante o ops-control
Antes de subir o agent (e no caminho "já está no ar" também):
1. Se `.env.ops-control` não existe → warning claro e segue (painel degrada com aviso, como hoje).
2. Testar :3099 (`Invoke-RestMethod` com timeout 2s, qualquer status HTTP = vivo).
3. Morto → `docker compose --env-file <raiz>\.env.ops-control -f <raiz>\docker-compose.ops.yml up -d`
   (SEM `--build` no caminho quente — build entra no S3 com detecção de drift; SEM exigir admin:
   docker já funciona sem elevação nesta máquina, o `RunAs` do launcher antigo era atrito desnecessário).
4. Esperar a porta (padrão `Wait-PortListener` que o start-all já tem) por até ~20s; não subiu →
   warning e segue (não derruba o up por causa do cockpit).

Com isso o `npm run up` passa a cobrir o ops-control de graça (ele já chama o start-owner).

## Passo 2 — auto-heal no agent (padrão `ensureEnginesUp`, COM disjuntor)
O agent roda nativo com docker total e já mantém a frota de motores de pé. Mesma receita:
- Detector: `opsRequest` falhou com `ECONNREFUSED` → checar `docker ps -a --filter name=hbx-ops-control`.
- Container existe parado → `docker start hbx-ops-control` (start simples preserva env da criação;
  compose up é só para container inexistente — aí logar instrução, não tentar compose do agent).
- **Disjuntor obrigatório**: máx 1 tentativa a cada 5 min, teto de 3 seguidas sem sucesso → para e
  expõe `opsAutoHeal: { state: "desisti", lastError }` no `/health`. Nunca loop livre (âncora 18/06:
  a correção é sempre o FREIO).
- Registrar cada tentativa no log do agent.

## Fora de escopo (S2/S3)
Pílula honesta, mensagens de erro, botão manual no painel, rebuild por drift, caches.

## Critérios de aceite
- [ ] `npm run up` numa máquina com ops-control parado termina com :3099 ouvindo.
- [ ] `docker stop hbx-ops-control` com o agent no ar → em ≤5 min o container volta sozinho (1 log de heal).
- [ ] 3 falhas seguidas de heal → agent PARA de tentar e expõe o estado no `/health` (sem loop).
- [ ] `npm run up` SEM `.env.ops-control` → sobe normal com warning; nada quebra.
- [ ] `node --check` verde em `server.js`; testes existentes do agent (`npm test` em local-agent) verdes.
