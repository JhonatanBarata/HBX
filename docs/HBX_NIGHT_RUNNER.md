# HBX Night Runner Smart

Runner local para executar uma fila de tarefas de madrugada no VSCode/Codex.

Ele nao altera feature de produto, nao faz refactor grande, nao cria comandos e nao usa scripts que nao existam no `package.json` do pacote indicado pelo comando.

## Dois arquivos

Use estes dois arquivos juntos:

- `docs/CODEX_NIGHT_QUEUE.md`: o que o Codex deve implementar, em linguagem normal, com checklist.
- `hbx-night.plan.json`: comandos reais de validacao, freio e reparo limitado.

O `hbx-night.plan.json` nao e o planejamento de produto. Ele e a esteira tecnica que roda depois das tarefas.

## Como rodar

No VSCode:

1. Abra `Terminal > Run Task...`.
2. Escolha `HBX: Night Runner Smart`.

No terminal:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\hbx-night-smart.ps1
```

## Plano

O runner le `hbx-night.plan.json`.

Cada tarefa deve ter:

```json
{
  "id": "frontend-lint",
  "label": "Frontend lint",
  "command": "npm --prefix frontend run lint",
  "dependsOn": [],
  "allowRepair": true,
  "maxRepairAttempts": 1,
  "continueOnFail": true,
  "blocks": ["frontend-build"]
}
```

O campo `command` precisa ser um comando simples de pacote, como:

- `npm run test:e2e`
- `npm --prefix backend run prisma:validate`
- `npm --prefix frontend run lint`
- `npm --prefix Webwhats run typecheck`

O script precisa existir no `package.json` do pacote indicado por `--prefix`. Comandos compostos com `&&`, `;` ou pipe sao bloqueados.

## Dependencias

Status que liberam dependentes:

- `PASSED`
- `FIXED`

Qualquer outro status em uma dependencia gera `SKIPPED_DEPENDENCY`.

Tarefas independentes continuam mesmo quando Prisma, typecheck, lint ou tests falham. Para isso, docs/auditoria nao devem depender de build quando existir script real para elas.

Build, tests e typecheck devem declarar dependencias criticas com `dependsOn` ou `blocks`.

## Auto-reparo

Quando uma tarefa falha:

1. O log completo fica em `logs/hbx-night/<run-id>/`.
2. Um prompt e gerado em `docs/CODEX_FIX_PROMPTS/<task-id>.md`.
3. Se `allowRepair` for `true`, `maxRepairAttempts` for maior que zero e `codex` estiver no PATH, o runner chama:

```powershell
codex exec --sandbox workspace-write <prompt>
```

O runner nunca chama `danger-full-access`.

Antes de cada tentativa de reparo, ele salva:

- `git-status-before-repair-<task-id>-attempt-<n>.txt`
- `before-repair-<task-id>-attempt-<n>.patch`
- `before-repair.patch`

Depois de cada tentativa, ele salva:

- `git-status-after-repair-<task-id>-attempt-<n>.txt`
- `after-repair-<task-id>-attempt-<n>.patch`
- `after-repair.patch`
- `changed-files-after-repair-<task-id>-attempt-<n>.txt`
- `changed-files-after-repair.txt`

Se Codex CLI nao estiver disponivel, o runner apenas gera os prompts e continua o plano sem auto-reparo.

## Relatorio

Ao final, `docs/WEBWHATS_NIGHT_REPORT.md` e atualizado com:

- horario de inicio e fim;
- tarefas `PASSED`;
- tarefas `FIXED`;
- tarefas `FAILED`;
- tarefas `SKIPPED`;
- comandos executados;
- arquivos alterados;
- arquivos sensiveis detectados;
- proximo passo recomendado.

Arquivos `.env`, secrets, production config, schema e migrations nao sao bloqueados automaticamente, mas sao destacados no relatorio quando aparecerem no `git status`.

## Observacoes do plano atual

Nao foi adicionada tarefa `docs-audit` ou `webwhats-audit` porque nao ha script real com esse nome nos `package.json` atuais.

O script `Webwhats:test` foi evitado no plano inicial porque usa modo watch e pode nao encerrar durante a madrugada.
