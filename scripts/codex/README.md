# HBX Codex Queue

Runner local para executar a fila `docs/HBX_MASTER_CODEX_QUEUE.md` uma tarefa por vez.

## Comandos

```powershell
npm run codex:status
npm run codex:show
npm run codex:next
npm run codex:skip
```

## Marcadores

- `[ ]` pendente
- `[~]` rodando
- `[R]` pronto para revisao manual
- `[x]` concluido manualmente
- `[!]` bloqueado ou com erro
- `[>]` pulado por decisao manual

## Fluxo

1. `codex:status` mostra a contagem por marcador e a proxima tarefa.
2. `codex:show` mostra a proxima tarefa sem executar.
3. `codex:next` salva a tarefa em `.codex/hbx-next-task.md`, marca como `[~]`, roda `codex exec --cd . --sandbox workspace-write -` e depois marca como `[R]` ou `[!]`.
4. `codex:skip` marca a proxima tarefa pendente como `[>]`.

## Regras

- Nao faz commit.
- Nao faz push.
- Nao faz deploy.
- Nao usa `danger-full-access`.
- Nao executa `npm run publish`, `npm run new`, `npm run force` ou migrations.
- Logs ficam em `.codex/logs/<task-id>.log`.
