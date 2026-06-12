# HBX Owner

Cockpit local do dono = painel web servido pelo `local-agent` (Node, sem SQLite).

## Como rodar

```powershell
npm run up
npm run owner:app
```

`owner:app` sobe o agent e abre `http://127.0.0.1:3107` no navegador. O token local
e lido de `HBX_OWNER_LOCAL_TOKEN` ou gerado e persistido em
`hbx-owner/local-agent/.owner-token` (gitignored).

Para a aba Caça (Banco de Leads + Exportar) falar com o backend, defina antes de subir:

```powershell
$env:HBX_OWNER_BACKEND_URL="http://127.0.0.1:3000"
$env:HBX_OWNER_BACKEND_TOKEN="<jwt-do-dono>"
```

## Abas

- **Hoje** — ponto e foco (estado em `local-agent/state/today.json`, sem banco).
- **Tickets** — fila `.md` de `docs/PLANEJAMENTOS` (fonte unica, versionada).
- **Caca** — Banco de Leads, Local Lab e Exportar local -> VPS.
- **Codigo** — git status, branch, arquivos mudados.
- **Execucao** — comandos da allowlist e ultimas execucoes.
- **Config** — saude do agent.

> O app desktop tkinter legado (`hbx-owner/windows-app/`, com SQLite) foi descontinuado.

## Teste de lote integrado

Quando o Codex Cloud criar PRs para tickets, o HBX Owner trabalha assim:

1. O dono revisa e mergeia manualmente os PRs que quer aplicar em paralelo.
2. O checkout atual passa a ser o lote de QA.
3. O Local Agent roda `npm run up` nessa mesma pasta.
4. O dono abre `http://localhost:3001` e testa o ticket no sistema real.
5. O painel local de Testes roda frontend, backend, Webwhats ou E2E conforme o diff.

Baixar PR isolado continua disponivel para diagnostico, mas nao e o caminho principal.

## Bridges

- Ops Control separado em `ops-control` (`127.0.0.1:3099`).
- Local Lab (`hbx-local-lab`, `127.0.0.1:3098`) controlado pela aba Caca.
- Deploy/publish continuam bloqueados pelo Owner.

## O que nunca fazer

- Nao liberar feature paga sem backend autorizar.
- Nao expor secrets.
- Nao rodar shell livre.
- Nao executar deploy, publish, new, force ou migrations nesta fase.
- Nao apagar historico negativo do Radar.

## Comandos principais

```powershell
npm run owner:agent
npm run owner:agent:health
npm run owner:app
npm run owner:self-check
npm run up
npm run down
npm run verify:prod
```
