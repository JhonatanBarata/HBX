# BLOCO 00 — Bootstrap da fila Codex do HBX Master

Leia AGENTS.md primeiro.

Objetivo:
criar o mecanismo mínimo para o HBX usar uma fila .md de tarefas do Codex, uma por vez, sem o Codex se perder.

Criar os arquivos:

- docs/HBX_MASTER_CODEX_QUEUE.md
- scripts/codex/hbx-codex-queue.js
- scripts/codex/README.md

Alterar package.json adicionando scripts:

```json
{
  "codex:status": "node ./scripts/codex/hbx-codex-queue.js status",
  "codex:next": "node ./scripts/codex/hbx-codex-queue.js next",
  "codex:show": "node ./scripts/codex/hbx-codex-queue.js show",
  "codex:skip": "node ./scripts/codex/hbx-codex-queue.js skip"
}
```

Comportamento do script:

Ler docs/HBX_MASTER_CODEX_QUEUE.md.
Procurar o primeiro bloco com título começando por:

    ## [ ]

Extrair o conteúdo desse bloco até o próximo título de bloco da fila, ou seja, uma linha começando por `## [`.
Salvar o prompt extraído em:
.codex/hbx-next-task.md
Marcar o bloco como:

    ## [~]

Rodar:
codex exec --cd . --sandbox workspace-write - < .codex/hbx-next-task.md
Quando o Codex terminar sem erro, marcar o bloco como:

    ## [R]

onde R significa “revisar”.
Não marcar como concluído automaticamente.
Não fazer commit.
Não fazer push.
Não fazer deploy.
Não usar danger-full-access.
Não executar npm run publish, npm run new, npm run force ou migrations.
Se o Codex falhar, marcar como:

    ## [!]

e registrar o log em:
.codex/logs/<task-id>.log

Formato esperado da fila:

    ## [ ] HBX-MASTER-001 — Título da tarefa

Prompt completo aqui.

O comando status deve mostrar:

pendentes
rodando
revisão
bloqueadas
concluídas

O comando show deve mostrar a próxima tarefa sem executar.

O comando skip deve marcar a próxima tarefa pendente como [>] pulada.

Criar docs/HBX_MASTER_CODEX_QUEUE.md com os blocos HBX-MASTER-001 até HBX-MASTER-028, preservando IDs e títulos.

Validação:

node ./scripts/codex/hbx-codex-queue.js status
node ./scripts/codex/hbx-codex-queue.js show

Regras:

diff pequeno
sem dependência nova
sem deploy
sem migrations
sem secrets
manter PT-BR

Entrega:

resumo dos arquivos criados
comandos testados
como usar npm run codex:next
