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
- Comentario de teste sugerindo validacao do lote integrado.
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

## Integracao com HBX Master

- O worker cria PR; o HBX Master valida o resultado aplicado.
- PRs podem ser mergeados em paralelo pelo dono.
- Depois do merge manual, o checkout atual vira a fonte da verdade para QA local.
- O Local Agent deve rodar `npm run up` nesse checkout consolidado.
- O teste visual acontece em `http://localhost:3001`.
- Baixar PR isolado fica como caminho opcional para diagnostico, nao como etapa obrigatoria.

## Tipos

- HBX-SAFE
- HBX-HOLD
- HBX-RFC
- HBX-TEST

## Prompt padrao

Corrigir apenas o bug descrito, manter escopo pequeno, rodar teste relevante e devolver resumo objetivo.

## Comentario de teste padrao

Depois que o dono mergear este PR no lote atual:

1. Abrir HBX Master.
2. Rodar `git fetch origin` pelo painel Git.
3. Subir `npm run up` pelo painel Testes.
4. Abrir `http://localhost:3001`.
5. Reproduzir o ticket do cliente.
6. Rodar os testes sugeridos pelo diff.
