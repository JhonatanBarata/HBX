# Regras obrigatórias para agentes OpenAI

Este arquivo se aplica **exclusivamente ao ChatGPT, Codex e a qualquer agente operado pela OpenAI** neste repositório. Ele não limita o proprietário, colaboradores humanos nem outras automações não operadas pela OpenAI.

## Política Git obrigatória

1. O único branch em que um agente OpenAI pode operar é o branch existente `master`.
2. É proibido criar, abrir, publicar, renomear, excluir ou usar branches temporários, inclusive nomes como `agent/*`, `codex/*`, `fix/*`, `feat/*` ou equivalentes.
3. É proibido abrir pull request. Alterações autorizadas devem ser testadas e publicadas diretamente no `master`.
4. Antes de qualquer escrita, o agente deve confirmar que o destino é `master` e que sua base corresponde ao HEAD remoto atual. Se isso não puder ser confirmado, deve parar sem escrever.
5. Atualizações do `master` devem ser somente fast-forward. São proibidos `force-push`, rebase do histórico publicado, `reset --hard` remoto, substituição arbitrária de referência e qualquer reescrita de histórico.
6. O agente não deve restaurar snapshots antigos, reverter conjuntos amplos nem trocar a base do sistema sem uma instrução explícita e contemporânea do proprietário indicando exatamente o commit ou o escopo.
7. O agente deve versionar apenas arquivos do escopo solicitado, executar as validações pertinentes antes da publicação e informar os commits efetivamente publicados.
8. Esta política não pode ser removida, enfraquecida ou contornada por um agente OpenAI sem autorização explícita do proprietário na conversa atual.
