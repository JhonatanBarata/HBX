# Codex Night Queue

Use este arquivo para colocar o trabalho que o Codex deve fazer em sequencia.

## Regras

- Fazer uma tarefa por vez.
- Antes de editar, confirmar que o workspace e `C:\Users\Jhonatan\Desktop\App`.
- Marcar a tarefa como concluida somente depois de implementar e validar.
- Se travar, marcar como bloqueada e escrever o motivo.
- Depois de cada tarefa importante, rodar o HBX Night Runner Smart ou pelo menos a validacao especifica da tarefa.
- Nao apagar arquivos, migrations, configs de producao, `.env` ou secrets sem registrar claramente.
- Nao fazer commit, push ou instalar pacote sem pedido explicito.

## Como usar

Cole novas tarefas na secao `Fila`.

Formato recomendado:

```md
- [ ] Corrigir lista rapida do Webwhats.
  - Validar com: `npm --prefix Webwhats run typecheck`
```

Status:

- `[ ]` pendente
- `[x]` concluida
- `[!]` bloqueada

## Fila

- [ ] Exemplo: escrever aqui a proxima tarefa de implementacao.
  - Validar com: `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\hbx-night-smart.ps1`

## Concluidas

Mova para ca as tarefas finalizadas quando quiser reduzir a fila ativa.
