# HBX Codex PR Worker Spec

## Entrada

- Ticket `BUG_SAFE`.
- Arquivos anexos.
- Rota afetada.
- Usuario ou empresa.
- Logs do Ops Control, quando existirem.

## Saida

- GitHub issue.
- Tarefa Codex.
- Branch.
- PR.
- Comentario de teste.
- Registro no Morning Desk.

## Regras

- 1 bug = 1 PR.
- PR pequeno.
- Maximo 5 arquivos por padrao.
- Sem auth.
- Sem billing.
- Sem planos.
- Sem migrations.
- Sem secrets.
- Sem deploy.
- Sem merge automatico.

## Tipos

- HBX-SAFE
- HBX-HOLD
- HBX-RFC
- HBX-TEST

## Prompt padrao

Corrigir apenas o bug descrito, manter escopo pequeno, rodar teste relevante e devolver resumo objetivo.
